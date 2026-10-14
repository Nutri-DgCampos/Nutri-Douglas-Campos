import OpenAI from "openai";
import { lerArquivo, resolverCaminho, tipoDoArquivo } from "./arquivos";
import { obterPool } from "./banco";

// Análise de exame de sangue por IA, para uso exclusivo do nutricionista.

const INSTRUCOES = `
Você apoia um nutricionista na leitura de um exame de sangue enviado por um paciente.

Leia o exame anexado e:
1. Liste somente os parâmetros com valor fora da faixa de referência informada no próprio laudo.
   Para cada um, informe: nome do exame, valor do paciente, faixa de referência e se está acima ou abaixo.
2. Para cada alteração, escreva em uma ou duas frases os motivos possíveis mais comuns,
   com destaque para os que têm relação com alimentação, suplementação, hidratação,
   atividade física e estilo de vida.
3. Termine com um parágrafo curto de pontos de atenção para o acompanhamento nutricional.

Regras:
- Use apenas os valores e as faixas de referência que estão no laudo; não invente valores.
- Se algum valor ou faixa estiver ilegível, diga isso em vez de supor.
- Se nenhum parâmetro estiver fora da referência, diga isso claramente.
- Use linguagem prudente ("pode estar relacionado", "pode indicar"); não faça diagnóstico.
- Não compare com exames anteriores.
- Escreva em português do Brasil, em texto simples, sem Markdown (sem asteriscos ou hashtags).
`.trim();

async function atualizar(id: string, campos: Record<string, unknown>) {
  const nomes = Object.keys(campos);

  await obterPool().query(
    `update public.blood_exams
        set ${nomes.map((nome, indice) => `${nome} = $${indice + 2}`).join(", ")}
      where id = $1`,
    [id, ...nomes.map((nome) => campos[nome])]
  );
}

export async function analisarExame(id: string) {
  const resultado = await obterPool().query<{ storage_path: string; file_name: string }>(
    "select storage_path, file_name from public.blood_exams where id = $1",
    [id]
  );

  const exame = resultado.rows[0];

  if (!exame) {
    return;
  }

  await atualizar(id, { analysis_status: "processando", analysis_error: null });

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("A chave da OpenAI não está configurada no servidor.");
    }

    const destino = resolverCaminho("exames", exame.storage_path);
    const tipo = tipoDoArquivo("exames", exame.storage_path);

    if (!destino || !tipo) {
      throw new Error("Arquivo do exame inválido.");
    }

    const base64 = (await lerArquivo(destino)).toString("base64");

    const anexo =
      tipo === "application/pdf"
        ? ({
            type: "input_file",
            filename: exame.file_name,
            file_data: `data:application/pdf;base64,${base64}`,
          } as const)
        : ({
            type: "input_image",
            detail: "high",
            image_url: `data:${tipo};base64,${base64}`,
          } as const);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resposta = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: INSTRUCOES }, anexo],
        },
      ],
    });

    const texto = resposta.output_text.trim();

    if (!texto) {
      throw new Error("A IA não devolveu nenhuma análise.");
    }

    await atualizar(id, {
      analysis_status: "concluida",
      analysis_text: texto,
      analyzed_at: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("Erro ao analisar exame:", id, erro);

    await atualizar(id, {
      analysis_status: "falhou",
      analysis_error: (erro instanceof Error ? erro.message : String(erro)).slice(0, 500),
    });
  }
}

import ExcelJS from "exceljs";
import mammoth from "mammoth";
import OpenAI from "openai";
import { DIAS, GRUPOS, OUTROS_GRUPOS, planoValido } from "@/lib/treino";
import { lerArquivo, resolverCaminho, tipoDoArquivo } from "./arquivos";
import { obterPool } from "./banco";
import { registrarUsoDaIa } from "./ia";

// Leitura do treino enviado pelo paciente: a IA lê o arquivo (inclusive foto
// ou PDF escaneado), organiza por dia da semana e estima o gasto calórico.

const INSTRUCOES = `
Você organiza o treino de musculação que um paciente de nutrição recebeu do educador físico.

Leia o treino anexado (pode ser foto, PDF escaneado, planilha ou texto) e devolva os dados estruturados.

Dias da semana:
- Se o treino indica os dias (segunda, terça...), use esses dias.
- Se usa "Treino A/B/C", "1º dia, 2º dia" ou similar, distribua na semana:
  2 treinos: seg, qui · 3: seg, qua, sex · 4: seg, ter, qui, sex · 5: seg a sex · 6: seg a sab · 7: seg a dom.
- titulo: nome curto do treino do dia (ex.: "Treino A - Peito e tríceps").

Exercícios (na ordem em que aparecem):
- nome: nome do exercício, com a primeira letra maiúscula (não tudo em maiúsculas).
- grupo: o grupo muscular principal trabalhado. Use "Cardio" para esteira, bicicleta, escada,
  corrida e aquecimentos aeróbicos, e "Outro" para alongamento, mobilidade e o que não for musculação.
- series e repeticoes: números inteiros. Faixa ("8 a 12") vira a média arredondada (10).
  Sem informação, use null.
- descanso_segundos: em segundos ("1 min" = 60). Sem informação, null.
- carga_kg: só se o treino informar a carga; senão null.
- observacao: instruções do treino para aquele exercício (ajuste de banco, cadência, tempo de esteira),
  em letras normais, ou null.

Gasto calórico:
- kcal_estimadas: estimativa do gasto de cada sessão completa (incluindo o cardio do dia),
  considerando o volume, os intervalos e o peso do paciente quando informado. Número inteiro.

comentario: duas ou três frases simples sobre o treino (divisão, frequência e intensidade), sem Markdown.

Regras: não invente exercícios; se algo estiver ilegível, ignore e mencione no comentario.
Escreva em português do Brasil.
`.trim();

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["dias", "comentario"],
  properties: {
    comentario: { type: "string" },
    dias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dia", "titulo", "kcal_estimadas", "exercicios"],
        properties: {
          dia: { type: "string", enum: DIAS.map((dia) => dia.chave) },
          titulo: { type: "string" },
          kcal_estimadas: { type: ["integer", "null"] },
          exercicios: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["nome", "grupo", "series", "repeticoes", "descanso_segundos", "carga_kg", "observacao"],
              properties: {
                nome: { type: "string" },
                grupo: { type: "string", enum: [...GRUPOS, ...OUTROS_GRUPOS] },
                series: { type: ["integer", "null"] },
                repeticoes: { type: ["integer", "null"] },
                descanso_segundos: { type: ["integer", "null"] },
                carga_kg: { type: ["number", "null"] },
                observacao: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

async function atualizar(id: string, campos: Record<string, unknown>) {
  const nomes = Object.keys(campos);

  await obterPool().query(
    `update public.treinos
        set ${nomes.map((nome, indice) => `${nome} = $${indice + 2}`).join(", ")}
      where id = $1`,
    [id, ...nomes.map((nome) => campos[nome])]
  );
}

async function textoDaPlanilha(conteudo: Buffer) {
  const planilha = new ExcelJS.Workbook();
  await planilha.xlsx.load(conteudo as unknown as ArrayBuffer);

  const linhas: string[] = [];

  planilha.eachSheet((aba) => {
    linhas.push(`# ${aba.name}`);

    aba.eachRow((linha) => {
      const celulas = (linha.values as unknown[])
        .slice(1)
        .map((valor) => {
          if (valor === null || valor === undefined) return "";
          if (typeof valor === "object" && "text" in valor) return String(valor.text);
          if (typeof valor === "object" && "result" in valor) return String(valor.result);
          if (typeof valor === "object" && "richText" in valor) {
            return (valor.richText as { text: string }[]).map((parte) => parte.text).join("");
          }
          return String(valor);
        });

      if (celulas.some((celula) => celula.trim() !== "")) {
        linhas.push(celulas.join(" | "));
      }
    });
  });

  return linhas.join("\n");
}

// Converte o envio em conteúdo para a IA: arquivo (PDF ou imagem) ou texto.
async function conteudoDoTreino(treino: {
  file_name: string | null;
  storage_path: string | null;
  texto_enviado: string | null;
}) {
  if (!treino.storage_path) {
    return { type: "input_text", text: `Treino:\n${treino.texto_enviado ?? ""}` } as const;
  }

  const destino = resolverCaminho("treinos", treino.storage_path);
  const tipo = tipoDoArquivo("treinos", treino.storage_path);

  if (!destino || !tipo) {
    throw new Error("Arquivo do treino inválido.");
  }

  const conteudo = await lerArquivo(destino);

  if (tipo === "application/pdf") {
    return {
      type: "input_file",
      filename: treino.file_name ?? "treino.pdf",
      file_data: `data:application/pdf;base64,${conteudo.toString("base64")}`,
    } as const;
  }

  if (tipo.startsWith("image/")) {
    return {
      type: "input_image",
      detail: "high",
      image_url: `data:${tipo};base64,${conteudo.toString("base64")}`,
    } as const;
  }

  let texto: string;

  if (tipo === "text/plain") {
    texto = conteudo.toString("utf8");
  } else if (tipo.includes("wordprocessingml")) {
    texto = (await mammoth.extractRawText({ buffer: conteudo })).value;
  } else {
    texto = await textoDaPlanilha(conteudo);
  }

  if (!texto.trim()) {
    throw new Error("Não foi encontrado texto no arquivo enviado.");
  }

  return { type: "input_text", text: `Treino:\n${texto.slice(0, 60_000)}` } as const;
}

async function pesoDoPaciente(pacienteId: string) {
  const resultado = await obterPool().query<{ peso: string | null }>(
    `select coalesce(
        (select r.weight from public.patient_reports r
          where r.patient_id = p.id and r.weight is not null
          order by r.created_at desc limit 1),
        p.initial_weight) as peso
       from public.patients p
      where p.id = $1`,
    [pacienteId]
  );

  const peso = Number(resultado.rows[0]?.peso);
  return Number.isFinite(peso) && peso > 0 ? peso : null;
}

export async function analisarTreino(id: string) {
  const resultado = await obterPool().query<{
    patient_id: string;
    file_name: string | null;
    storage_path: string | null;
    texto_enviado: string | null;
  }>(
    "select patient_id, file_name, storage_path, texto_enviado from public.treinos where id = $1",
    [id]
  );

  const treino = resultado.rows[0];

  if (!treino) {
    return;
  }

  await atualizar(id, { status: "processando", erro: null });

  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("A chave da OpenAI não está configurada no servidor.");
    }

    const conteudo = await conteudoDoTreino(treino);
    const peso = await pesoDoPaciente(treino.patient_id);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resposta = await openai.responses.create({
      model: "gpt-5.4-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `${INSTRUCOES}\n\nPeso do paciente: ${peso ? `${peso} kg` : "não informado"}.`,
            },
            conteudo,
          ],
        },
      ],
      text: {
        format: { type: "json_schema", name: "treino", strict: true, schema: ESQUEMA },
      },
    });

    void registrarUsoDaIa({ recurso: "treino", modelo: "gpt-5.4-mini", uso: resposta.usage, pacienteId: treino.patient_id });
    const dados = JSON.parse(resposta.output_text);
    const plano = { dias: dados.dias };

    if (!planoValido(plano) || plano.dias.length === 0) {
      throw new Error("Não foi possível identificar os exercícios do treino.");
    }

    // Um dia por chave, na ordem da semana.
    const ordem = DIAS.map((dia) => dia.chave as string);
    const dias = plano.dias
      .filter((dia, indice) => plano.dias.findIndex((outro) => outro.dia === dia.dia) === indice)
      .sort((a, b) => ordem.indexOf(a.dia) - ordem.indexOf(b.dia));

    await atualizar(id, {
      status: "concluido",
      plano: JSON.stringify({ dias }),
      comentario_ia: typeof dados.comentario === "string" ? dados.comentario.trim() : null,
      analisado_em: new Date().toISOString(),
    });
  } catch (erro) {
    console.error("Erro ao analisar treino:", id, erro);

    await atualizar(id, {
      status: "falhou",
      erro: (erro instanceof Error ? erro.message : String(erro)).slice(0, 500),
    });
  }
}

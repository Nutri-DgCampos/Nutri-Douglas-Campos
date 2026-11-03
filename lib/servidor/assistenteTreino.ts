import { DIAS, GRUPOS, OUTROS_GRUPOS, type PlanoDeTreino } from "@/lib/treino";
import { validarPlanoDoEditor } from "@/lib/treinoEditor";
import { obterPool } from "./banco";
import { clienteDaIa, iaSimulada, modeloDoAssistente, registrarUsoDaIa, situacaoDoLimite } from "./ia";
import { academiaDoAluno } from "./treinoBiblioteca";
import type { ProfissionalDeTreino } from "./treinoAcesso";
import { lerPrograma } from "./treinoPrescricoes";

// Auxílio da IA no editor de musculação (T4a). Gera ou ajusta o rascunho a
// pedido do profissional; nunca publica. O resultado volta para a tela, que
// mostra os avisos e só aplica no rascunho quando o profissional aceita.
//
// A IA recebe só dados do Treino: objetivo e título do programa, idade e
// sexo, academia e equipamentos, a biblioteca e o rascunho atual. Nada da
// Nutrição. A anamnese do treino entra quando existir (etapa T6).

const INSTRUCOES = `
Você ajuda um profissional de educação física a montar um treino de musculação no editor do sistema.

Atenda ao pedido do profissional usando os dados fornecidos. Se o pedido for montar do zero, monte o programa completo; se for um ajuste, devolva o programa inteiro já ajustado.

Regras:
- Use preferencialmente exercícios da biblioteca (nome exatamente como na lista). Respeite os equipamentos da academia do aluno quando informados.
- Cada sessão tem um dia da semana diferente (seg, ter, qua, qui, sex, sab, dom) e um título curto (ex.: "Treino A - Membros inferiores").
- series: número inteiro. Repetições: repeticoes = menor valor e repeticoes_max = maior valor quando for faixa (ex.: 8 a 12); senão repeticoes_max = null.
- descanso_segundos em segundos. carga_kg = null (o profissional define a carga com o aluno).
- grupo: o grupo muscular principal.
- observacao: orientação curta de execução para o aluno, ou null.
- Não faça diagnóstico e não prescreva tratamento. Não invente dados do aluno.
- avisos: liste os dados que faltaram para um treino mais seguro (ex.: lesões, experiência, disponibilidade) e qualquer cuidado que o profissional deva conferir antes de enviar. Lista vazia se não houver.
- titulo: título do programa.
Escreva em português do Brasil.
`.trim();

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["titulo", "dias", "avisos"],
  properties: {
    titulo: { type: "string" },
    avisos: { type: "array", items: { type: "string" } },
    dias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["dia", "titulo", "exercicios"],
        properties: {
          dia: { type: "string", enum: DIAS.map((d) => d.chave) },
          titulo: { type: "string" },
          exercicios: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["nome", "grupo", "series", "repeticoes", "repeticoes_max", "descanso_segundos", "observacao"],
              properties: {
                nome: { type: "string" },
                grupo: { type: "string", enum: [...GRUPOS, ...OUTROS_GRUPOS] },
                series: { type: ["integer", "null"] },
                repeticoes: { type: ["integer", "null"] },
                repeticoes_max: { type: ["integer", "null"] },
                descanso_segundos: { type: ["integer", "null"] },
                observacao: { type: ["string", "null"] },
              },
            },
          },
        },
      },
    },
  },
} as const;

export type SugestaoDaIa = { titulo: string; plano: PlanoDeTreino; avisos: string[] };

function idade(nascimento: string | null) {
  if (!nascimento) return null;
  const n = new Date(nascimento);
  const hoje = new Date();
  let anos = hoje.getFullYear() - n.getFullYear();
  if (hoje < new Date(hoje.getFullYear(), n.getMonth(), n.getDate())) anos--;
  return anos >= 0 && anos < 120 ? anos : null;
}

// Liga cada exercício sugerido ao item da biblioteca de mesmo nome.
async function ligarABiblioteca(plano: PlanoDeTreino) {
  const nomes = [...new Set(plano.dias.flatMap((d) => d.exercicios.map((e) => e.nome)))];
  if (!nomes.length) return plano;
  const r = await obterPool().query<{ id: string; chave: string; video_url: string | null }>(
    `select id, chave, video_url from public.treino_exercicios
      where arquivado_em is null and chave = any(select public.normalizar_texto(n) from unnest($1::text[]) n)`,
    [nomes]
  );
  const porChave = new Map(r.rows.map((l) => [l.chave, l]));
  const chaves = await obterPool().query<{ nome: string; chave: string }>(
    "select n as nome, public.normalizar_texto(n) as chave from unnest($1::text[]) n",
    [nomes]
  );
  const chaveDe = new Map(chaves.rows.map((l) => [l.nome, l.chave]));
  return {
    dias: plano.dias.map((d) => ({
      ...d,
      exercicios: d.exercicios.map((e) => {
        const item = porChave.get(chaveDe.get(e.nome) ?? "");
        return item ? { ...e, exercicio_id: item.id, video_url: e.video_url ?? item.video_url } : e;
      }),
    })),
  };
}

export async function sugerirTreino(
  profissional: ProfissionalDeTreino,
  programaId: string,
  pedido: string
): Promise<{ ok: true; sugestao: SugestaoDaIa } | { ok: false; erro: string; status: number }> {
  const programa = await lerPrograma(profissional, programaId);
  if (!programa) return { ok: false, erro: "Treino não encontrado.", status: 404 };
  const limite = await situacaoDoLimite();
  if (limite.restantes <= 0) return { ok: false, erro: "Limite diário de pedidos à IA atingido. Tente amanhã.", status: 429 };

  const [aluno, academia, biblioteca] = await Promise.all([
    obterPool().query<{ birth_date: string | null; sex: string | null }>("select birth_date::text, sex from public.patients where id = $1", [programa.patient_id]),
    academiaDoAluno(programa.patient_id),
    obterPool().query<{ nome: string; grupo: string; equipamentos: string[] }>(
      "select nome, grupo, equipamentos from public.treino_exercicios where arquivado_em is null order by grupo, nome limit 400"
    ),
  ]);
  const dados = aluno.rows[0];
  const registro = { usuarioId: profissional.usuarioId, pacienteId: programa.patient_id };

  let bruto: { titulo: string; dias: unknown[]; avisos: string[] };
  if (iaSimulada()) {
    await registrarUsoDaIa({ recurso: "assistente_treino", modelo: "simulada", ...registro });
    if (process.env.IA_SIMULADA_FALHA === "1") return { ok: false, erro: "Não foi possível falar com a IA agora. Tente de novo.", status: 502 };
    bruto = {
      titulo: programa.titulo || "Treino sugerido",
      avisos: ["Sugestão simulada (testes). Confira lesões e experiência do aluno antes de enviar."],
      dias: [
        {
          dia: "seg",
          titulo: "Treino A - Membros inferiores",
          exercicios: [
            { nome: "Agachamento livre", grupo: "Quadríceps", series: 4, repeticoes: 8, repeticoes_max: 12, descanso_segundos: 90, observacao: null },
            { nome: "Mesa flexora", grupo: "Isquiotibiais", series: 3, repeticoes: 10, repeticoes_max: 15, descanso_segundos: 60, observacao: null },
          ],
        },
        {
          dia: "qua",
          titulo: "Treino B - Membros superiores",
          exercicios: [
            { nome: "Supino reto com halteres", grupo: "Peito", series: 4, repeticoes: 8, repeticoes_max: 12, descanso_segundos: 90, observacao: null },
            { nome: "Puxada frontal", grupo: "Costas", series: 4, repeticoes: 8, repeticoes_max: 12, descanso_segundos: 90, observacao: null },
          ],
        },
      ],
    };
  } else {
    const modelo = modeloDoAssistente();
    const contexto = [
      `Pedido do profissional: ${pedido}`,
      `Título atual: ${programa.titulo || "(sem título)"}`,
      `Objetivo do treino: ${programa.objetivo || "não informado"}`,
      `Aluno: ${idade(dados?.birth_date ?? null) ?? "idade não informada"} anos; sexo: ${dados?.sex ?? "não informado"}.`,
      `Academia: ${academia ? `${academia.nome}${academia.domestica ? " (em casa)" : ""}; equipamentos: ${academia.equipamentos.join(", ") || "nenhum cadastrado"}` : "não informada"}.`,
      `Biblioteca (nome | grupo | equipamentos):\n${biblioteca.rows.map((b) => `${b.nome} | ${b.grupo} | ${b.equipamentos.join(", ") || "peso corporal"}`).join("\n")}`,
      `Rascunho atual (JSON): ${JSON.stringify(programa.plano)}`,
    ].join("\n\n");
    try {
      const resposta = await clienteDaIa().responses.create(
        {
          model: modelo,
          input: [{ role: "user", content: [{ type: "input_text", text: `${INSTRUCOES}\n\n${contexto}` }] }],
          text: { format: { type: "json_schema", name: "treino", strict: true, schema: ESQUEMA as unknown as Record<string, unknown> } },
        },
        { timeout: 100_000, maxRetries: 0 }
      );
      await registrarUsoDaIa({ recurso: "assistente_treino", modelo, uso: resposta.usage, ...registro });
      bruto = JSON.parse(resposta.output_text);
    } catch (erro) {
      console.error("Erro no auxílio da IA do treino:", erro);
      await registrarUsoDaIa({ recurso: "assistente_treino", modelo, sucesso: false, ...registro });
      return { ok: false, erro: "Não foi possível falar com a IA agora. Tente de novo.", status: 502 };
    }
  }

  const limpo = validarPlanoDoEditor({ dias: bruto.dias });
  if ("erro" in limpo) return { ok: false, erro: "A IA devolveu um treino inválido. Tente de novo.", status: 502 };
  return {
    ok: true,
    sugestao: {
      titulo: String(bruto.titulo ?? "").slice(0, 120),
      plano: await ligarABiblioteca(limpo.plano),
      avisos: (bruto.avisos ?? []).filter((a) => typeof a === "string").slice(0, 10),
    },
  };
}

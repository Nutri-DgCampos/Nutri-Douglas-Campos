import { DIAS } from "@/lib/treino";
import { FASES, TIPOS, validarPlanoEndurance, type ModalidadeEndurance, type PlanoEndurance } from "@/lib/treinoEndurance";
import { obterPool } from "./banco";
import { clienteDaIa, iaSimulada, modeloDoAssistente, registrarUsoDaIa, situacaoDoLimite } from "./ia";
import type { ProfissionalDeTreino } from "./treinoAcesso";
import type { ConteudoParaIa } from "./treinos";
import { zonasDoAluno } from "./treinoZonas";

// IA nos editores de corrida e ciclismo (T4c): sugere a planilha (Auxílio
// da IA) ou organiza um treino importado. Sempre volta para revisão; nada é
// gravado nem enviado ao aluno. TSS e calorias: a IA não calcula (R3, C1).

const NOME: Record<ModalidadeEndurance, string> = { corrida: "corrida de rua", ciclismo: "ciclismo" };

function instrucoes(modalidade: ModalidadeEndurance) {
  return `
Você ajuda um profissional de educação física a montar uma planilha de ${NOME[modalidade]} no editor do sistema.

Regras:
- A planilha tem semanas; cada semana tem sessões com dia (${DIAS.map((d) => d.chave).join(", ")}), tipo, descrição curta e os alvos.
- tipo: um destes: ${TIPOS[modalidade].join(", ")}.
- distancia_km e duracao_min: números planejados (ou null se não se aplicar).
- zona: rótulo curto como "Z2 - Aeróbia" quando houver; use as zonas do aluno quando informadas, sem inventar valores de FC${modalidade === "ciclismo" ? " ou potência" : " ou ritmo"}.
${modalidade === "corrida" ? "- ritmo_alvo (min/km, ex.: 5:30–5:50) e fc_alvo só se os dados do aluno permitirem; senão null." : "- potencia_alvo e fc_alvo só se os dados do aluno permitirem; senão null. altimetria_m só se o pedido indicar o percurso."}
- tss: sempre null (o sistema não calcula TSS).
- Não faça diagnóstico, não prescreva tratamento e não invente dados do aluno.
- avisos: dados que faltaram (ex.: zonas, histórico, provas, disponibilidade) e cuidados que o profissional deve conferir.
- fase: uma destas: ${FASES.join(", ")}.
Escreva em português do Brasil.`.trim();
}

function esquema(modalidade: ModalidadeEndurance) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["titulo", "fase", "avisos", "semanas"],
    properties: {
      titulo: { type: "string" },
      fase: { type: "string", enum: FASES },
      avisos: { type: "array", items: { type: "string" } },
      semanas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sessoes"],
          properties: {
            sessoes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["dia", "tipo", "descricao", "distancia_km", "duracao_min", "zona", "ritmo_alvo", "fc_alvo", "potencia_alvo", "altimetria_m", "observacao"],
                properties: {
                  dia: { type: "string", enum: DIAS.map((d) => d.chave) },
                  tipo: { type: "string", enum: TIPOS[modalidade] },
                  descricao: { type: "string" },
                  distancia_km: { type: ["number", "null"] },
                  duracao_min: { type: ["number", "null"] },
                  zona: { type: ["string", "null"] },
                  ritmo_alvo: { type: ["string", "null"] },
                  fc_alvo: { type: ["string", "null"] },
                  potencia_alvo: { type: ["string", "null"] },
                  altimetria_m: { type: ["number", "null"] },
                  observacao: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
  } as const;
}

type Bruto = { titulo: string; fase: string; avisos: string[]; semanas: unknown[] };

function simulado(modalidade: ModalidadeEndurance): Bruto {
  const corrida = modalidade === "corrida";
  return {
    titulo: corrida ? "Ciclo base (sugestão simulada)" : "Ciclo de endurance (sugestão simulada)",
    fase: "Base",
    avisos: ["Sugestão simulada (testes). Confira as zonas e a disponibilidade do aluno antes de enviar."],
    semanas: [
      {
        sessoes: [
          { dia: "ter", tipo: corrida ? "Fácil" : "Endurance", descricao: corrida ? "Corrida leve contínua" : "Pedal contínuo leve", distancia_km: corrida ? 6 : 40, duracao_min: corrida ? 40 : 90, zona: "Z2", ritmo_alvo: null, fc_alvo: null, potencia_alvo: null, altimetria_m: null, observacao: null },
          { dia: "sab", tipo: "Longo", descricao: corrida ? "Longo em ritmo confortável" : "Longo em Z2", distancia_km: corrida ? 12 : 80, duracao_min: corrida ? 75 : 180, zona: "Z2", ritmo_alvo: null, fc_alvo: null, potencia_alvo: null, altimetria_m: null, observacao: null },
        ],
      },
    ],
  };
}

async function pedir(modalidade: ModalidadeEndurance, conteudo: ConteudoParaIa[], registro: { usuarioId: string; pacienteId: string }, recurso: "assistente_treino" | "importacao_treino") {
  if (iaSimulada()) {
    await registrarUsoDaIa({ recurso, modelo: "simulada", ...registro });
    if (process.env.IA_SIMULADA_FALHA === "1") throw new Error("Falha simulada da IA.");
    return simulado(modalidade);
  }
  const modelo = modeloDoAssistente();
  try {
    const resposta = await clienteDaIa().responses.create(
      {
        model: modelo,
        input: [{ role: "user", content: [{ type: "input_text", text: instrucoes(modalidade) }, ...conteudo] }],
        text: { format: { type: "json_schema", name: "planilha", strict: true, schema: esquema(modalidade) as unknown as Record<string, unknown> } },
      },
      { timeout: 110_000, maxRetries: 0 }
    );
    await registrarUsoDaIa({ recurso, modelo, uso: resposta.usage, ...registro });
    return JSON.parse(resposta.output_text) as Bruto;
  } catch (erro) {
    await registrarUsoDaIa({ recurso, modelo, sucesso: false, ...registro });
    throw erro;
  }
}

function limpar(bruto: Bruto, modalidade: ModalidadeEndurance, inicio: string | null) {
  const v = validarPlanoEndurance({ ciclo: { fase: bruto.fase, inicio }, semanas: bruto.semanas.slice(0, 16) }, modalidade);
  if ("erro" in v) return null;
  // TSS planejado nunca vem da IA.
  v.plano.semanas.forEach((w) => w.sessoes.forEach((s) => (s.tss = null)));
  return v.plano;
}

export type SugestaoEndurance = { titulo: string; plano: PlanoEndurance; avisos: string[] };

export async function sugerirEndurance(
  profissional: ProfissionalDeTreino,
  programa: { patient_id: string; titulo: string; objetivo: string; plano: PlanoEndurance },
  modalidade: ModalidadeEndurance,
  pedido: string
): Promise<{ ok: true; sugestao: SugestaoEndurance } | { ok: false; erro: string; status: number }> {
  const limite = await situacaoDoLimite();
  if (limite.restantes <= 0) return { ok: false, erro: "Limite diário de pedidos à IA atingido. Tente amanhã.", status: 429 };
  const [aluno, zonas] = await Promise.all([
    obterPool().query<{ birth_date: string | null; sex: string | null }>("select birth_date::text, sex from public.patients where id = $1", [programa.patient_id]),
    zonasDoAluno(programa.patient_id, modalidade),
  ]);
  const contexto = [
    `Pedido do profissional: ${pedido}`,
    `Título atual: ${programa.titulo || "(sem título)"}; objetivo: ${programa.objetivo || "não informado"}.`,
    `Aluno: nascimento ${aluno.rows[0]?.birth_date ?? "não informado"}; sexo ${aluno.rows[0]?.sex ?? "não informado"}.`,
    `Zonas do aluno (JSON): ${JSON.stringify({ fc: zonas.fc, ritmo: zonas.ritmo, ftp: zonas.ftp, potencia: zonas.potencia })}`,
    `Planilha atual (JSON): ${JSON.stringify(programa.plano)}`,
  ].join("\n\n");
  let bruto: Bruto;
  try {
    bruto = await pedir(modalidade, [{ type: "input_text", text: contexto }], { usuarioId: profissional.usuarioId, pacienteId: programa.patient_id }, "assistente_treino");
  } catch (erro) {
    console.error("Erro no auxílio da IA (corrida/ciclismo):", erro);
    return { ok: false, erro: "Não foi possível falar com a IA agora. Tente de novo.", status: 502 };
  }
  const plano = limpar(bruto, modalidade, programa.plano.ciclo.inicio);
  if (!plano) return { ok: false, erro: "A IA devolveu uma planilha inválida. Tente de novo.", status: 502 };
  return { ok: true, sugestao: { titulo: String(bruto.titulo ?? "").slice(0, 120), plano, avisos: (bruto.avisos ?? []).slice(0, 10) } };
}

// Importar no editor de corrida ou ciclismo: organiza para revisão.
export async function lerEnduranceNoEditor(modalidade: ModalidadeEndurance, conteudo: ConteudoParaIa, inicio: string | null, registro: { usuarioId: string; pacienteId: string }) {
  const bruto = await pedir(
    modalidade,
    [{ type: "input_text", text: "Organize a planilha abaixo exatamente como está, sem inventar sessões ou alvos ausentes (use null). avisos: o que estava ilegível ou ambíguo." }, conteudo],
    registro,
    "importacao_treino"
  );
  const plano = limpar(bruto, modalidade, inicio);
  return plano ? { plano, comentario: bruto.avisos?.join(" ") || null } : null;
}

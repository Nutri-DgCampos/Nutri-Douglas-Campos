// Anamnese e recordatório alimentar (Módulo de Nutrição, Fase 5).
//
// - Modelo de anamnese: sequência única de perguntas, sem seções. Tipos:
//   campo curto, campo longo, múltipla escolha (uma ou várias respostas) e
//   texto livre (um campo único, grande). Cada pergunta pode ser obrigatória.
// - Ficha: cópia das perguntas da versão do modelo usada + respostas. Mudar o
//   modelo depois não altera fichas já criadas.
// - Recordatório: refeições, horários e alimentos/quantidades em texto livre,
//   sem cálculo nutricional.

import { documentoVazio, novaRefeicao, novoItem, type DocumentoDieta } from "./dieta.ts";

export const TIPOS_DE_PERGUNTA = {
  curto: "Campo curto",
  longo: "Campo longo",
  multipla: "Campo múltipla escolha",
  texto_livre: "Texto livre (campo único)",
} as const;

export type TipoDePergunta = keyof typeof TIPOS_DE_PERGUNTA;

export type OpcaoDePergunta = { id: string; texto: string };

export type Pergunta = {
  id: string;
  texto: string;
  tipo: TipoDePergunta;
  obrigatoria: boolean;
  // Só na múltipla escolha: alternativas e se aceita mais de uma.
  opcoes: OpcaoDePergunta[];
  variasRespostas: boolean;
};

// Resposta: texto (curto, longo, texto livre) ou ids das alternativas.
export type Resposta = string | string[];
export type Respostas = Record<string, Resposta>;

export type ItemRecordatorio = { id: string; alimento: string; quantidade: string };
export type RefeicaoRecordatorio = { id: string; nome: string; horario: string | null; itens: ItemRecordatorio[]; observacao: string };
export type Recordatorio = { refeicoes: RefeicaoRecordatorio[]; observacoes: string };

export const LIMITES_ANAMNESE = {
  perguntas: 200,
  opcoes: 40,
  texto: 300,
  resposta: 5000,
  observacoes: 20000,
  refeicoes: 20,
  itens: 60,
} as const;

function novoId() {
  return globalThis.crypto.randomUUID();
}

export function novaPergunta(tipo: TipoDePergunta = "curto"): Pergunta {
  return {
    id: novoId(),
    texto: "",
    tipo,
    obrigatoria: false,
    opcoes: tipo === "multipla" ? [novaOpcao(), novaOpcao()] : [],
    variasRespostas: false,
  };
}

export function novaOpcao(texto = ""): OpcaoDePergunta {
  return { id: novoId(), texto };
}

export function novoItemRecordatorio(): ItemRecordatorio {
  return { id: novoId(), alimento: "", quantidade: "" };
}

export function novaRefeicaoRecordatorio(nome = "", horario: string | null = null): RefeicaoRecordatorio {
  return { id: novoId(), nome, horario, itens: [novoItemRecordatorio()], observacao: "" };
}

export function recordatorioVazio(): Recordatorio {
  return {
    refeicoes: [
      novaRefeicaoRecordatorio("Café da manhã"),
      novaRefeicaoRecordatorio("Almoço"),
      novaRefeicaoRecordatorio("Lanche da tarde"),
      novaRefeicaoRecordatorio("Jantar"),
    ],
    observacoes: "",
  };
}

// Exemplo fixo mostrado ao paciente, identificado como MODELO. Não é salvo
// nem enviado como resposta.
export const EXEMPLO_RECORDATORIO: { nome: string; horario: string; itens: [string, string][]; observacao: string } = {
  nome: "Café da manhã",
  horario: "07:00",
  itens: [
    ["Pão francês", "1 unidade"],
    ["Manteiga", "1 ponta de faca"],
    ["Café com leite", "1 xícara (200 mL)"],
    ["Mamão", "1 fatia média"],
  ],
  observacao: "Às vezes troco o pão por tapioca.",
};

// ---------------------------------------------------------------------------
// Validação (a API nunca confia no navegador)

class Invalido extends Error {}
const falhar = (mensagem: string): never => {
  throw new Invalido(mensagem);
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function objeto(valor: unknown, onde: string): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) falhar(`${onde}: formato inválido.`);
  return valor as Record<string, unknown>;
}

function lista(valor: unknown, limite: number, onde: string): unknown[] {
  if (!Array.isArray(valor)) falhar(`${onde}: formato inválido.`);
  const itens = valor as unknown[];
  if (itens.length > limite) falhar(`${onde}: no máximo ${limite}.`);
  return itens;
}

function texto(valor: unknown, limite: number, onde: string) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor !== "string") falhar(`${onde}: texto inválido.`);
  const t = valor as string;
  if (t.length > limite) falhar(`${onde}: no máximo ${limite} caracteres.`);
  return t;
}

function id(valor: unknown, onde: string) {
  if (typeof valor !== "string" || !UUID.test(valor)) falhar(`${onde}: identificador inválido.`);
  return valor as string;
}

function resultado<T>(funcao: () => T): { valor: T } | { erro: string } {
  try {
    return { valor: funcao() };
  } catch (erro) {
    if (erro instanceof Invalido) return { erro: erro.message };
    throw erro;
  }
}

export function validarPerguntas(valor: unknown) {
  return resultado(() => {
    const perguntas = lista(valor, LIMITES_ANAMNESE.perguntas, "Perguntas").map((p, n): Pergunta => {
      const onde = `Pergunta ${n + 1}`;
      const o = objeto(p, onde);
      const tipo = o.tipo as TipoDePergunta;
      if (!(tipo in TIPOS_DE_PERGUNTA)) falhar(`${onde}: tipo inválido.`);
      const opcoes =
        tipo === "multipla"
          ? lista(o.opcoes ?? [], LIMITES_ANAMNESE.opcoes, `${onde}, alternativas`).map((x, m) => {
              const op = objeto(x, `${onde}, alternativa ${m + 1}`);
              return { id: id(op.id, `${onde}, alternativa ${m + 1}`), texto: texto(op.texto, LIMITES_ANAMNESE.texto, `${onde}, alternativa ${m + 1}`) };
            })
          : [];
      return {
        id: id(o.id, onde),
        texto: texto(o.texto, LIMITES_ANAMNESE.texto, onde),
        tipo,
        obrigatoria: o.obrigatoria === true,
        opcoes,
        variasRespostas: tipo === "multipla" && o.variasRespostas === true,
      };
    });
    if (new Set(perguntas.map((p) => p.id)).size !== perguntas.length) falhar("Perguntas repetidas.");
    return perguntas;
  });
}

// O que impede o modelo de ser usado numa consulta (pergunta sem texto,
// múltipla escolha sem alternativas).
export function pendenciasDoModelo(nome: string, perguntas: Pergunta[]) {
  const pendencias: string[] = [];
  if (!nome.trim()) pendencias.push("Informe o nome do modelo.");
  if (perguntas.length === 0) pendencias.push("Inclua ao menos uma pergunta.");
  perguntas.forEach((p, n) => {
    if (!p.texto.trim() && p.tipo !== "texto_livre") pendencias.push(`Pergunta ${n + 1}: escreva a pergunta.`);
    if (p.tipo === "multipla" && p.opcoes.filter((o) => o.texto.trim()).length < 2) {
      pendencias.push(`Pergunta ${n + 1}: inclua ao menos duas alternativas.`);
    }
  });
  return pendencias;
}

// Perguntas como vão para a ficha: sem alternativas vazias.
export function perguntasParaFicha(perguntas: Pergunta[]): Pergunta[] {
  return perguntas.map((p) => ({ ...p, opcoes: p.opcoes.filter((o) => o.texto.trim()) }));
}

// Respostas válidas para as perguntas da ficha (descarta o que não pertence).
export function validarRespostas(valor: unknown, perguntas: Pergunta[]) {
  return resultado(() => {
    const entrada = valor === null || valor === undefined ? {} : objeto(valor, "Respostas");
    const respostas: Respostas = {};
    for (const p of perguntas) {
      const r = entrada[p.id];
      if (r === undefined || r === null) continue;
      if (p.tipo === "multipla") {
        const ids = (Array.isArray(r) ? r : [r]).filter((x): x is string => typeof x === "string");
        const validos = ids.filter((x) => p.opcoes.some((o) => o.id === x));
        if (validos.length) respostas[p.id] = p.variasRespostas ? [...new Set(validos)] : [validos[0]];
      } else {
        const t = texto(r, LIMITES_ANAMNESE.resposta, p.texto || "Resposta");
        if (t.length) respostas[p.id] = t;
      }
    }
    return respostas;
  });
}

export function respostaPreenchida(r: Resposta | undefined) {
  if (r === undefined) return false;
  return Array.isArray(r) ? r.length > 0 : r.trim().length > 0;
}

// Obrigatórias sem resposta (conferidas no "Enviar respostas").
export function obrigatoriasEmBranco(perguntas: Pergunta[], respostas: Respostas) {
  return perguntas.filter((p) => p.obrigatoria && !respostaPreenchida(respostas[p.id]));
}

export function textoDaResposta(p: Pergunta, r: Resposta | undefined) {
  if (!respostaPreenchida(r)) return "";
  if (p.tipo === "multipla") {
    const ids = Array.isArray(r) ? r : [r as string];
    return p.opcoes
      .filter((o) => ids.includes(o.id))
      .map((o) => o.texto)
      .join("; ");
  }
  return String(r);
}

export function validarRecordatorio(valor: unknown) {
  return resultado((): Recordatorio => {
    const o = objeto(valor, "Recordatório");
    const refeicoes = lista(o.refeicoes ?? [], LIMITES_ANAMNESE.refeicoes, "Refeições").map((r, n): RefeicaoRecordatorio => {
      const onde = `Refeição ${n + 1}`;
      const ref = objeto(r, onde);
      const horario = texto(ref.horario, 5, onde);
      if (horario && !/^([01]\d|2[0-3]):[0-5]\d$/.test(horario)) falhar(`${onde}: horário inválido.`);
      return {
        id: id(ref.id, onde),
        nome: texto(ref.nome, LIMITES_ANAMNESE.texto, onde),
        horario: horario || null,
        observacao: texto(ref.observacao, LIMITES_ANAMNESE.resposta, onde),
        itens: lista(ref.itens ?? [], LIMITES_ANAMNESE.itens, `${onde}, alimentos`).map((i, m) => {
          const it = objeto(i, `${onde}, alimento ${m + 1}`);
          return {
            id: id(it.id, `${onde}, alimento ${m + 1}`),
            alimento: texto(it.alimento, LIMITES_ANAMNESE.texto, `${onde}, alimento ${m + 1}`),
            quantidade: texto(it.quantidade, LIMITES_ANAMNESE.texto, `${onde}, alimento ${m + 1}`),
          };
        }),
      };
    });
    return { refeicoes, observacoes: texto(o.observacoes, LIMITES_ANAMNESE.observacoes, "Observações") };
  });
}

// Recordatório com algum alimento informado.
export function recordatorioTemConteudo(r: Recordatorio) {
  return r.refeicoes.some((ref) => ref.itens.some((i) => i.alimento.trim()));
}

// O que impede o paciente de enviar o recordatório.
export function pendenciasDoRecordatorio(r: Recordatorio) {
  const pendencias: string[] = [];
  if (!recordatorioTemConteudo(r)) pendencias.push("Informe ao menos um alimento.");
  r.refeicoes.forEach((ref, n) => {
    if (ref.itens.some((i) => i.alimento.trim()) && !ref.nome.trim()) pendencias.push(`Refeição ${n + 1}: informe o nome da refeição.`);
  });
  return pendencias;
}

// Situação do formulário vista pelo nutricionista.
export type SituacaoDoFormulario = "rascunho" | "enviado" | "em_preenchimento" | "respondido" | "concluido";

export const SITUACOES_DO_FORMULARIO: Record<SituacaoDoFormulario, { rotulo: string; cor: "info" | "warning" | "success" | "secondary" | "danger" }> = {
  rascunho: { rotulo: "No consultório", cor: "secondary" },
  enviado: { rotulo: "Enviado ao paciente — aguardando preenchimento", cor: "info" },
  em_preenchimento: { rotulo: "Paciente preenchendo", cor: "warning" },
  respondido: { rotulo: "Respondido pelo paciente", cor: "success" },
  concluido: { rotulo: "Concluído", cor: "success" },
};

export function situacaoDoFormulario(f: {
  status: string;
  enviado_em: string | null;
  paciente_editou_em: string | null;
  respondido_em: string | null;
}): SituacaoDoFormulario {
  if (f.status === "concluido") return "concluido";
  if (f.respondido_em) return "respondido";
  if (f.enviado_em) return f.paciente_editou_em ? "em_preenchimento" : "enviado";
  return "rascunho";
}

// Recordatório → dieta (Importar → Recordatório do paciente): refeições,
// horários e alimentos em cinza, com o texto do paciente, fora dos cálculos
// até o nutricionista escolher o alimento na base. Observações do paciente
// não vão para a prescrição (ficam no recordatório).
export function documentoDoRecordatorio(r: Recordatorio, titulo = "Nova dieta (recordatório)"): DocumentoDieta {
  const documento = documentoVazio(titulo);
  for (const ref of r.refeicoes) {
    const itens = ref.itens.filter((i) => i.alimento.trim());
    if (!itens.length) continue;
    const refeicao = novaRefeicao(ref.nome.trim());
    refeicao.horario = ref.horario;
    refeicao.opcoes[0].itens = itens.map((i) => ({
      ...novoItem(),
      referencia: true,
      informado: [i.alimento.trim(), i.quantidade.trim()].filter(Boolean).join(" — ").slice(0, 700),
    }));
    documento.refeicoes.push(refeicao);
  }
  return documento;
}

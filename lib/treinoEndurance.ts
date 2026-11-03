import { DIAS, type ChaveDia } from "./treino.ts";

// Editores de corrida e ciclismo (T4c, VIS-04 e VIS-05). Usado no navegador
// e no servidor.
//
// - Plano = ciclo (fase e início) com semanas; cada semana tem sessões
//   (mais de uma por dia é permitido). Dia sem sessão = descanso.
// - Tudo é informado pelo profissional: distância, tempo, zona, alvos e, no
//   ciclismo, TSS e altimetria planejados. Totais são somas das linhas; sem
//   dado, "Não disponível" (nunca número inventado).
// - Zonas de potência: 7 zonas de Coggan, em % do FTP (resposta R2,
//   Allen e Coggan, Training and Racing with a Power Meter). FC e ritmo: o
//   profissional informa (E1).

export type ModalidadeEndurance = "corrida" | "ciclismo";

export const TIPOS: Record<ModalidadeEndurance, string[]> = {
  corrida: ["Caminhada-corrida", "Fácil", "Regenerativo", "Intervalado", "Fartlek", "Tempo / limiar", "Longo", "Subida", "Customizado"],
  ciclismo: ["Recuperativo", "Endurance", "Intervalado", "Subida", "Tempo", "Sweet spot", "VO2máx.", "Longo", "Customizado"],
};

export const FASES = ["Base", "Construção", "Específico", "Polimento", "Recuperação / deload"];

export const TERRENOS: Record<ModalidadeEndurance, string[]> = {
  corrida: ["Asfalto", "Pista", "Esteira", "Trilha", "Misto"],
  ciclismo: ["Estrada", "MTB", "Indoor", "Misto"],
};

export const MAX_SEMANAS = 16;
export const MAX_SESSOES_SEMANA = 14;

export type BlocoDaSessao = {
  tipo: "aquecimento" | "bloco" | "recuperacao" | "desaquecimento";
  descricao: string;
  repeticoes: number | null;
  duracao_min: number | null;
  distancia_km: number | null;
  intensidade: string | null;
};

export type SessaoEndurance = {
  dia: ChaveDia;
  tipo: string;
  descricao: string;
  distancia_km: number | null;
  duracao_min: number | null;
  zona: string | null;
  ritmo_alvo: string | null; // corrida, min/km (ex.: 5:30–5:50)
  fc_alvo: string | null; // ex.: 140–155 ou ≤ 140
  potencia_alvo: string | null; // ciclismo, ex.: 180–200 W
  tss: number | null; // ciclismo, informado pelo profissional
  altimetria_m: number | null;
  terreno: string | null;
  percurso: string | null;
  rpe_alvo: number | null;
  blocos: BlocoDaSessao[];
  observacao: string | null;
  // Opção (P1): alternativa à sessão; o profissional decide se o aluno vê.
  alternativa: { descricao: string; visivel: boolean } | null;
  notas: string | null; // privadas do profissional
};

export type SemanaEndurance = { sessoes: SessaoEndurance[] };

export type PlanoEndurance = {
  ciclo: { fase: string | null; inicio: string | null }; // inicio = domingo da semana 1
  semanas: SemanaEndurance[];
};

const CHAVES = DIAS.map((d) => d.chave as string);
const DATA = /^\d{4}-\d{2}-\d{2}$/;

class Invalido extends Error {}

function texto(valor: unknown, limite: number) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") throw new Invalido("Texto inválido.");
  const t = valor.trim();
  if (t.length > limite) throw new Invalido(`Texto com mais de ${limite} caracteres.`);
  return t || null;
}

function numero(valor: unknown, maximo: number, rotulo: string, decimais = 1) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > maximo) throw new Invalido(`${rotulo}: valor inválido.`);
  const f = 10 ** decimais;
  return Math.round(valor * f) / f;
}

function bloco(valor: unknown): BlocoDaSessao {
  const b = (valor ?? {}) as Record<string, unknown>;
  const tipo = ["aquecimento", "bloco", "recuperacao", "desaquecimento"].includes(String(b.tipo)) ? (b.tipo as BlocoDaSessao["tipo"]) : "bloco";
  return {
    tipo,
    descricao: texto(b.descricao, 200) ?? "",
    repeticoes: numero(b.repeticoes, 100, "Repetições do bloco", 0),
    duracao_min: numero(b.duracao_min, 1440, "Duração do bloco"),
    distancia_km: numero(b.distancia_km, 500, "Distância do bloco", 2),
    intensidade: texto(b.intensidade, 60),
  };
}

function sessao(valor: unknown, modalidade: ModalidadeEndurance): SessaoEndurance {
  const s = (valor ?? {}) as Record<string, unknown>;
  if (typeof s.dia !== "string" || !CHAVES.includes(s.dia)) throw new Invalido("Dia da sessão inválido.");
  const blocos = Array.isArray(s.blocos) ? s.blocos : [];
  if (blocos.length > 20) throw new Invalido("No máximo 20 blocos por sessão.");
  const a = s.alternativa as Record<string, unknown> | null | undefined;
  const alternativa = a ? texto(a.descricao, 300) : null;
  const ciclismo = modalidade === "ciclismo";
  return {
    dia: s.dia as ChaveDia,
    tipo: texto(s.tipo, 40) ?? "Customizado",
    descricao: texto(s.descricao, 300) ?? "",
    distancia_km: numero(s.distancia_km, 500, "Distância", 2),
    duracao_min: numero(s.duracao_min, 1440, "Tempo"),
    zona: texto(s.zona, 40),
    ritmo_alvo: ciclismo ? null : texto(s.ritmo_alvo, 30),
    fc_alvo: texto(s.fc_alvo, 30),
    potencia_alvo: ciclismo ? texto(s.potencia_alvo, 30) : null,
    tss: ciclismo ? numero(s.tss, 2000, "TSS") : null,
    altimetria_m: numero(s.altimetria_m, 20000, "Altimetria", 0),
    terreno: texto(s.terreno, 40),
    percurso: texto(s.percurso, 300),
    rpe_alvo: numero(s.rpe_alvo, 10, "RPE alvo"),
    blocos: blocos.map(bloco),
    observacao: texto(s.observacao, 1000),
    alternativa: alternativa ? { descricao: alternativa, visivel: a?.visivel !== false } : null,
    notas: texto(s.notas, 1000),
  };
}

export function validarPlanoEndurance(valor: unknown, modalidade: ModalidadeEndurance): { plano: PlanoEndurance } | { erro: string } {
  try {
    const p = (valor ?? {}) as Record<string, unknown>;
    const c = (p.ciclo ?? {}) as Record<string, unknown>;
    const inicio = texto(c.inicio, 10);
    if (inicio !== null && (!DATA.test(inicio) || new Date(`${inicio}T12:00:00Z`).getUTCDay() !== 0)) throw new Invalido("O ciclo começa num domingo.");
    if (!Array.isArray(p.semanas) || p.semanas.length > MAX_SEMANAS) throw new Invalido(`O ciclo tem de 1 a ${MAX_SEMANAS} semanas.`);
    const semanas = p.semanas.map((w) => {
      const lista = Array.isArray((w as SemanaEndurance)?.sessoes) ? (w as SemanaEndurance).sessoes : [];
      if (lista.length > MAX_SESSOES_SEMANA) throw new Invalido(`No máximo ${MAX_SESSOES_SEMANA} sessões por semana.`);
      return { sessoes: lista.map((s) => sessao(s, modalidade)) };
    });
    return { plano: { ciclo: { fase: texto(c.fase, 60), inicio }, semanas } };
  } catch (erro) {
    if (erro instanceof Invalido) return { erro: erro.message };
    throw erro;
  }
}

export function planoEnduranceVazio(inicio: string | null = null): PlanoEndurance {
  return { ciclo: { fase: "Base", inicio }, semanas: [{ sessoes: [] }] };
}

export function novaSessaoEndurance(modalidade: ModalidadeEndurance, dia: ChaveDia = "seg"): SessaoEndurance {
  return {
    dia,
    tipo: modalidade === "corrida" ? "Fácil" : "Endurance",
    descricao: "",
    distancia_km: null,
    duracao_min: null,
    zona: null,
    ritmo_alvo: null,
    fc_alvo: null,
    potencia_alvo: null,
    tss: null,
    altimetria_m: null,
    terreno: null,
    percurso: null,
    rpe_alvo: null,
    blocos: [],
    observacao: null,
    alternativa: null,
    notas: null,
  };
}

// Ordem de exibição: domingo a sábado (semana oficial do relatório).
const ORDEM: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
export function ordenarSessoesDaSemana(sessoes: SessaoEndurance[]) {
  return sessoes.map((s, i) => ({ s, i })).sort((a, b) => ORDEM[a.s.dia] - ORDEM[b.s.dia] || a.i - b.i);
}

export function problemasParaEnvioEndurance(programa: { titulo: string; plano: PlanoEndurance }): string[] {
  const p: string[] = [];
  if (!programa.titulo.trim()) p.push("Informe o título da planilha.");
  if (!programa.plano.ciclo.inicio) p.push("Informe a data de início do ciclo (um domingo).");
  if (!programa.plano.semanas.some((w) => w.sessoes.length)) p.push("Inclua pelo menos uma sessão.");
  programa.plano.semanas.forEach((w, i) =>
    w.sessoes.forEach((s) => {
      if (!s.descricao.trim()) p.push(`Semana ${i + 1}, ${DIAS.find((d) => d.chave === s.dia)?.nome}: descreva a sessão.`);
      else if (s.distancia_km === null && s.duracao_min === null) p.push(`Semana ${i + 1}, ${DIAS.find((d) => d.chave === s.dia)?.nome}: informe a distância ou o tempo.`);
    })
  );
  return p;
}

export type TotaisDaSemana = {
  distancia_km: number | null;
  duracao_min: number | null;
  tss: number | null;
  tssParcial: boolean;
  altimetria_m: number | null;
  sessoes: number;
};

// Somas das linhas. Sem nenhum dado: null ("Não disponível"). TSS só soma o
// que foi informado e avisa quando falta em alguma sessão.
export function totaisDaSemana(semana: SemanaEndurance): TotaisDaSemana {
  const soma = (campo: "distancia_km" | "duracao_min" | "tss" | "altimetria_m") => {
    const valores = semana.sessoes.map((s) => s[campo]).filter((v): v is number => v !== null);
    return valores.length ? Math.round(valores.reduce((t, v) => t + v, 0) * 100) / 100 : null;
  };
  const comTss = semana.sessoes.filter((s) => s.tss !== null).length;
  return {
    distancia_km: soma("distancia_km"),
    duracao_min: soma("duracao_min"),
    tss: soma("tss"),
    tssParcial: comTss > 0 && comTss < semana.sessoes.length,
    altimetria_m: soma("altimetria_m"),
    sessoes: semana.sessoes.length,
  };
}

export function textoDosMinutos(minutos: number | null) {
  if (minutos === null) return "—";
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
}

// "Ajustar volume" (P3): distância e tempo de uma semana (ou de todas) por
// porcentagem, no rascunho. Altimetria e TSS não mudam (dependem do percurso
// e da intensidade).
export function ajustarVolume(plano: PlanoEndurance, percentual: number, semana: number | null): PlanoEndurance {
  const fator = 1 + percentual / 100;
  const arred = (v: number | null, casas: number) => (v === null ? null : Math.round(v * fator * 10 ** casas) / 10 ** casas);
  return {
    ...plano,
    semanas: plano.semanas.map((w, i) =>
      semana !== null && i !== semana
        ? w
        : { sessoes: w.sessoes.map((s) => ({ ...s, distancia_km: arred(s.distancia_km, 1), duracao_min: arred(s.duracao_min, 0) })) }
    ),
  };
}

// Zonas de potência de Coggan (R2), em % do FTP. Zona 7: acima de 150%.
export const ZONAS_COGGAN: { zona: string; nome: string; de: number | null; ate: number | null }[] = [
  { zona: "Z1", nome: "Recuperação ativa", de: null, ate: 55 },
  { zona: "Z2", nome: "Resistência", de: 56, ate: 75 },
  { zona: "Z3", nome: "Ritmo (tempo)", de: 76, ate: 90 },
  { zona: "Z4", nome: "Limiar", de: 91, ate: 105 },
  { zona: "Z5", nome: "VO2 máx.", de: 106, ate: 120 },
  { zona: "Z6", nome: "Capacidade anaeróbia", de: 121, ate: 150 },
  { zona: "Z7", nome: "Potência neuromuscular", de: 151, ate: null },
];

export type FaixaDeZona = { zona: string; nome: string; min: number | null; max: number | null };

export function zonasDePotencia(ftp: number): FaixaDeZona[] {
  return ZONAS_COGGAN.map((z) => ({
    zona: z.zona,
    nome: z.nome,
    min: z.de === null ? null : Math.round((ftp * z.de) / 100),
    max: z.ate === null ? null : Math.round((ftp * z.ate) / 100),
  }));
}

export type ZonasDoAluno = {
  fc: FaixaDeZona[]; // informadas pelo profissional (E1)
  ritmo: { zona: string; nome: string; de: string | null; ate: string | null }[]; // corrida, min/km
  ftp: number | null; // ciclismo
  potencia: FaixaDeZona[]; // ciclismo; padrão Coggan pelo FTP, editável à mão
};

export function validarZonas(valor: unknown, modalidade: ModalidadeEndurance): { zonas: ZonasDoAluno } | { erro: string } {
  try {
    const z = (valor ?? {}) as Record<string, unknown>;
    const faixa = (f: unknown): FaixaDeZona => {
      const x = (f ?? {}) as Record<string, unknown>;
      const min = numero(x.min, 3000, "Zona", 0);
      const max = numero(x.max, 3000, "Zona", 0);
      if (min !== null && max !== null && max < min) throw new Invalido("Em cada zona, o máximo não pode ser menor que o mínimo.");
      return { zona: texto(x.zona, 10) ?? "", nome: texto(x.nome, 40) ?? "", min, max };
    };
    const lista = (v: unknown) => (Array.isArray(v) ? v.slice(0, 10) : []);
    const ritmoValido = (r: unknown) => {
      const t = texto(r, 10);
      if (t !== null && !/^\d{1,2}:[0-5]\d$/.test(t)) throw new Invalido("Ritmo no formato min:seg (ex.: 5:30).");
      return t;
    };
    const ftp = modalidade === "ciclismo" ? numero(z.ftp, 1000, "FTP", 0) : null;
    return {
      zonas: {
        fc: lista(z.fc).map(faixa),
        ritmo:
          modalidade === "corrida"
            ? lista(z.ritmo).map((r) => {
                const x = (r ?? {}) as Record<string, unknown>;
                return { zona: texto(x.zona, 10) ?? "", nome: texto(x.nome, 40) ?? "", de: ritmoValido(x.de), ate: ritmoValido(x.ate) };
              })
            : [],
        ftp,
        potencia: modalidade === "ciclismo" ? lista(z.potencia).map(faixa) : [],
      },
    };
  } catch (erro) {
    if (erro instanceof Invalido) return { erro: erro.message };
    throw erro;
  }
}

// Semana do ciclo em que a data cai (0 = primeira), ou null fora do ciclo.
export function semanaDoCiclo(plano: PlanoEndurance, dataISO: string) {
  if (!plano.ciclo.inicio) return null;
  const dias = Math.floor((Date.parse(`${dataISO}T12:00:00Z`) - Date.parse(`${plano.ciclo.inicio}T12:00:00Z`)) / 86_400_000);
  if (dias < 0) return null;
  const semana = Math.floor(dias / 7);
  return semana < plano.semanas.length ? semana : null;
}

// Referência de uma sessão prescrita na atividade do aluno: semana × 100 + índice.
export const referenciaDaSessao = (semana: number, indice: number) => semana * 100 + indice;
export const sessaoDaReferencia = (referencia: number) => ({ semana: Math.floor(referencia / 100), indice: referencia % 100 });

// O que o aluno recebe: sem notas privadas e sem a Opção oculta.
export function planoEnduranceParaAluno(plano: PlanoEndurance): PlanoEndurance {
  return {
    ...plano,
    semanas: plano.semanas.map((w) => ({
      sessoes: w.sessoes.map((s) => ({ ...s, notas: null, alternativa: s.alternativa?.visivel ? s.alternativa : null })),
    })),
  };
}

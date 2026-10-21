// Avaliação física: documento (o que o nutricionista preenche), validação e
// o cálculo completo dos resultados. O documento é gravado no rascunho
// (salvamento automático); ao finalizar, os resultados ficam congelados.

import {
  ATIVIDADES,
  CAMPOS_BIOIMPEDANCIA,
  CATEGORIAS_DRI,
  DOBRAS,
  PERIMETRIA,
  PROTOCOLOS_TMB,
  avatarMaisProximo,
  calcularDobras,
  calcularGetDri,
  calcularGetNaf,
  calcularTmb,
  classificarGordura,
  composicao,
  gastoDaAtividade,
  referenciaDeGordura,
  type AtividadeRegistrada,
  type Calculo,
  type CampoBio,
  type CategoriaDri,
  type ClasseGordura,
  type DadosDobras,
  type Dobra,
  type Etnia,
  type Maturacao,
  type MetodoGet,
  type Pessoa,
  type ProtocoloDobras,
  type ProtocoloTmb,
  type Regiao,
  type ResultadoDobras,
  type Sexo,
  type VersaoSlaughter,
} from "./avaliacao.ts";

export const VERSAO_AVALIACAO = 1;

export type ManualTmb = { valor: number | null; metodo: string; observacao: string };

export type AvaliacaoDoc = {
  esquema: number;
  peso: number | null;
  alturaCm: number | null;
  tmb: { protocolo: ProtocoloTmb | "manual" | null; manual: ManualTmb };
  gasto: { metodo: MetodoGet | null; categoria: CategoriaDri | null; naf: number | null };
  atividades: AtividadeRegistrada[];
  dobras: DadosDobras;
  perimetria: Partial<Record<Regiao, number | null>>;
  bioimpedancia: {
    valores: Partial<Record<CampoBio, number | null>>;
    aguaUnidade: string;
    gorduraVisceralEscala: string;
    massaVisceralUnidade: string;
    // Campo → origem do valor (digitado ou lido do PDF e conferido).
    origem: Partial<Record<CampoBio, "manual" | "pdf">>;
    pdf: { caminho: string; nome: string } | null;
  };
  // Método cujo % de gordura é o resultado da avaliação (nunca combinados).
  composicao: "dobras" | "bioimpedancia" | null;
  observacoes: string;
};

export function avaliacaoVazia(peso: number | null, alturaCm: number | null): AvaliacaoDoc {
  return {
    esquema: VERSAO_AVALIACAO,
    peso,
    alturaCm,
    tmb: { protocolo: null, manual: { valor: null, metodo: "", observacao: "" } },
    gasto: { metodo: null, categoria: null, naf: null },
    atividades: [],
    dobras: { protocolo: null, versaoSlaughter: "ts", maturacao: null, etnia: null, valores: {} },
    perimetria: {},
    bioimpedancia: { valores: {}, aguaUnidade: "L", gorduraVisceralEscala: "", massaVisceralUnidade: "kg", origem: {}, pdf: null },
    composicao: null,
    observacoes: "",
  };
}

// ---------------------------------------------------------------------------
// Validação (API)

class Invalido extends Error {}
const falhar = (m: string): never => {
  throw new Invalido(m);
};

function numero(valor: unknown, maximo: number, onde: string) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > maximo) falhar(`${onde}: valor inválido.`);
  return valor as number;
}

function texto(valor: unknown, limite: number, onde: string) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor !== "string" || valor.length > limite) falhar(`${onde}: texto inválido.`);
  return valor as string;
}

function umDe<T extends string>(valor: unknown, opcoes: readonly T[], onde: string): T | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (!opcoes.includes(valor as T)) falhar(`${onde}: opção inválida.`);
  return valor as T;
}

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validarAvaliacao(valor: unknown): { documento: AvaliacaoDoc } | { erro: string } {
  try {
    const d = objeto(valor);
    const tmb = objeto(d.tmb);
    const manual = objeto(tmb.manual);
    const gasto = objeto(d.gasto);
    const dobras = objeto(d.dobras);
    const bio = objeto(d.bioimpedancia);
    const pdf = bio.pdf ? objeto(bio.pdf) : null;

    const atividades = Array.isArray(d.atividades) ? d.atividades : [];
    if (atividades.length > 30) falhar("Atividades: no máximo 30.");

    const valoresDobras: Partial<Record<Dobra, number | null>> = {};
    for (const chave of Object.keys(DOBRAS) as Dobra[]) {
      valoresDobras[chave] = numero(objeto(dobras.valores)[chave], 200, `Dobra ${DOBRAS[chave]}`);
    }
    const perimetria: Partial<Record<Regiao, number | null>> = {};
    for (const chave of Object.keys(PERIMETRIA) as Regiao[]) {
      perimetria[chave] = numero(objeto(d.perimetria)[chave], 400, `Perimetria ${PERIMETRIA[chave]}`);
    }
    const valoresBio: Partial<Record<CampoBio, number | null>> = {};
    const origem: Partial<Record<CampoBio, "manual" | "pdf">> = {};
    for (const chave of Object.keys(CAMPOS_BIOIMPEDANCIA) as CampoBio[]) {
      valoresBio[chave] = numero(objeto(bio.valores)[chave], 1000, CAMPOS_BIOIMPEDANCIA[chave].nome);
      const o = objeto(bio.origem)[chave];
      if (o === "manual" || o === "pdf") origem[chave] = o;
    }

    const documento: AvaliacaoDoc = {
      esquema: VERSAO_AVALIACAO,
      peso: numero(d.peso, 500, "Peso"),
      alturaCm: numero(d.alturaCm, 260, "Altura"),
      tmb: {
        protocolo: umDe(tmb.protocolo, [...(Object.keys(PROTOCOLOS_TMB) as ProtocoloTmb[]), "manual"] as const, "Protocolo da TMB"),
        manual: {
          valor: numero(manual.valor, 20000, "TMB manual"),
          metodo: texto(manual.metodo, 200, "Método da TMB manual"),
          observacao: texto(manual.observacao, 2000, "Observação da TMB manual"),
        },
      },
      gasto: {
        metodo: umDe(gasto.metodo, ["dri_2023", "tmb_naf"] as const, "Método do GET"),
        categoria: umDe(gasto.categoria, Object.keys(CATEGORIAS_DRI) as CategoriaDri[], "Categoria de atividade"),
        naf: numero(gasto.naf, 5, "NAF"),
      },
      atividades: atividades.map((x, n) => {
        const r = objeto(x);
        if (typeof r.id !== "string" || !UUID.test(r.id)) falhar(`Atividade ${n + 1}: identificador inválido.`);
        if (!ATIVIDADES.some((at) => at.id === r.atividadeId)) falhar(`Atividade ${n + 1}: atividade inválida.`);
        return {
          id: r.id as string,
          atividadeId: r.atividadeId as string,
          minutos: numero(r.minutos, 1440, `Atividade ${n + 1}`),
          vezesPorSemana: numero(r.vezesPorSemana, 21, `Atividade ${n + 1}`),
        };
      }),
      dobras: {
        protocolo: umDe(dobras.protocolo, ["jp7", "jp3", "faulkner", "slaughter", "petroski"] as const, "Protocolo de dobras") as ProtocoloDobras | null,
        versaoSlaughter: (umDe(dobras.versaoSlaughter, ["ts", "tc"] as const, "Versão de Slaughter") ?? "ts") as VersaoSlaughter,
        maturacao: umDe(dobras.maturacao, ["pre", "pubere", "pos"] as const, "Maturação") as Maturacao | null,
        etnia: umDe(dobras.etnia, ["branca", "negra"] as const, "Etnia") as Etnia | null,
        valores: valoresDobras,
      },
      perimetria,
      bioimpedancia: {
        valores: valoresBio,
        aguaUnidade: texto(bio.aguaUnidade, 20, "Unidade da água corporal") || "L",
        gorduraVisceralEscala: texto(bio.gorduraVisceralEscala, 60, "Escala da gordura visceral"),
        massaVisceralUnidade: texto(bio.massaVisceralUnidade, 20, "Unidade da massa visceral") || "kg",
        origem,
        pdf: pdf ? { caminho: texto(pdf.caminho, 500, "PDF"), nome: texto(pdf.nome, 300, "PDF") } : null,
      },
      composicao: umDe(d.composicao, ["dobras", "bioimpedancia"] as const, "Método da composição"),
      observacoes: texto(d.observacoes, 10000, "Observações"),
    };
    return { documento };
  } catch (erro) {
    if (erro instanceof Invalido) return { erro: erro.message };
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Resultados

export type ResultadoAvaliacao = {
  idade: number | null;
  sexo: Sexo | null;
  peso: number | null;
  alturaCm: number | null;
  imc: number | null;
  dobras: ResultadoDobras;
  bioimpedancia: { percentual: number | null; massaGorda: number | null; massaLivre: number | null };
  // Resultado escolhido (método identificado).
  percentualGordura: number | null;
  massaGorda: number | null;
  massaLivre: number | null;
  metodoComposicao: "dobras" | "bioimpedancia" | null;
  referencia: { faixaEtaria: string; adequadoDe: number; adequadoAte: number; sobrepesoAte: number } | null;
  classe: ClasseGordura | null;
  avatar: { indice: number; valor: number; foraDaEscala: boolean } | null;
  tmb: Calculo & { protocolo: string | null; manual: boolean };
  get: Calculo & { metodo: MetodoGet | null };
  mets: {
    atividades: (ReturnType<typeof gastoDaAtividade> & { id: string })[];
    semanal: number;
    semanalLiquido: number;
    mediaDiaria: number;
    mediaDiariaLiquida: number;
  };
  // Só na categoria Inativo das DRIs, com as atividades por METs (decisão M-02).
  getMaisMets: number | null;
};

function bioComposicao(doc: AvaliacaoDoc) {
  const v = doc.bioimpedancia.valores;
  const percentual = v.percentual_gordura ?? null;
  const calculada = composicao(percentual, doc.peso);
  // Massa informada pelo equipamento vale mais que a calculada pelo peso.
  return {
    percentual,
    massaGorda: v.massa_gordura ?? calculada.massaGorda,
    massaLivre: v.massa_livre_gordura ?? calculada.massaLivre,
  };
}

export function calcularAvaliacao(doc: AvaliacaoDoc, paciente: { sexo: Sexo | null; idade: number | null }): ResultadoAvaliacao {
  const pessoa: Pessoa = { sexo: paciente.sexo, idade: paciente.idade, peso: doc.peso, alturaCm: doc.alturaCm };
  const dobras = calcularDobras(doc.dobras, pessoa);
  const bio = bioComposicao(doc);

  // Método da composição: o escolhido; sem escolha, o único disponível.
  const metodo =
    doc.composicao ?? (dobras.percentual !== null ? "dobras" : bio.percentual !== null ? "bioimpedancia" : null);
  const escolhido =
    metodo === "dobras"
      ? { percentual: dobras.percentual, ...composicao(dobras.percentual, doc.peso) }
      : metodo === "bioimpedancia"
        ? bio
        : { percentual: null, massaGorda: null, massaLivre: null };

  const tmbBase: Calculo =
    doc.tmb.protocolo === "manual"
      ? doc.tmb.manual.valor
        ? { valor: doc.tmb.manual.valor, falta: [], avisos: [] }
        : { valor: null, falta: ["valor da TMB informada"], avisos: [] }
      : doc.tmb.protocolo
        ? calcularTmb(doc.tmb.protocolo, pessoa, escolhido.massaLivre)
        : { valor: null, falta: ["protocolo da TMB"], avisos: [] };

  const get: Calculo =
    doc.gasto.metodo === "dri_2023"
      ? doc.gasto.categoria
        ? calcularGetDri(doc.gasto.categoria, pessoa)
        : { valor: null, falta: ["categoria de atividade"], avisos: [] }
      : doc.gasto.metodo === "tmb_naf"
        ? calcularGetNaf(tmbBase.valor, doc.gasto.naf)
        : { valor: null, falta: ["método do gasto energético total"], avisos: [] };

  const atividades = doc.atividades
    .map((r) => {
      const g = gastoDaAtividade(r, doc.peso, paciente.idade);
      return g ? { ...g, id: r.id } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const semanal = atividades.reduce((t, x) => t + x.semanal, 0);
  const semanalLiquido = atividades.reduce((t, x) => t + x.semanalLiquido, 0);

  const somaMets = doc.gasto.metodo === "dri_2023" && doc.gasto.categoria === "inativo" && get.valor !== null && atividades.length > 0;

  return {
    idade: paciente.idade,
    sexo: paciente.sexo,
    peso: doc.peso,
    alturaCm: doc.alturaCm,
    imc: doc.peso && doc.alturaCm ? doc.peso / (doc.alturaCm / 100) ** 2 : null,
    dobras,
    bioimpedancia: bio,
    percentualGordura: escolhido.percentual,
    massaGorda: escolhido.massaGorda,
    massaLivre: escolhido.massaLivre,
    metodoComposicao: escolhido.percentual !== null ? metodo : null,
    referencia: referenciaDeGordura(paciente.sexo, paciente.idade),
    classe: classificarGordura(escolhido.percentual, paciente.sexo, paciente.idade),
    avatar: avatarMaisProximo(escolhido.percentual, paciente.sexo),
    tmb: { ...tmbBase, protocolo: doc.tmb.protocolo, manual: doc.tmb.protocolo === "manual" },
    get: { ...get, metodo: doc.gasto.metodo },
    mets: { atividades, semanal, semanalLiquido, mediaDiaria: semanal / 7, mediaDiariaLiquida: semanalLiquido / 7 },
    getMaisMets: somaMets ? (get.valor as number) + semanalLiquido / 7 : null,
  };
}

// Dieta do editor: estrutura do documento, validação e cálculos.
//
// O documento é o mesmo no rascunho automático, na última versão salva e na
// versão enviada ao paciente (que ainda congela a composição dos alimentos).
// Todas as telas (editor, painel, PDF, área do paciente) calculam por aqui.
//
// Regras aprovadas:
// - Os totais da refeição e da dieta usam só a opção de referência de cada
//   refeição; opções alternativas e substituições nunca entram na soma.
// - Quantidade efetiva = ajuste manual em g/mL, ou nº de medidas × medida.
// - Dado ausente não vira zero: o total fica parcial e é sinalizado.
// - Energia é a registrada na base; 4/4/9 só para o percentual energético.
// - kcal não proteica / g de nitrogênio com fator 6,25 (M-06).

import { totalDoNutriente, type Composicao, type Item as ItemDeCalculo, type Total } from "./calculo.ts";

export const VERSAO_DO_ESQUEMA = 1;

export type Unidade = "g" | "ml";

// Cópia da medida caseira no momento da escolha: a dieta não muda sozinha
// se o cadastro da medida for alterado depois.
export type MedidaUsada = {
  id: string;
  singular: string;
  plural: string;
  quantidade: number; // g ou mL de uma medida
};

export type SubstituicaoDaLinha = {
  id: string;
  alimentoId: string;
  nome: string;
  unidade: Unidade;
  medida: MedidaUsada | null;
  numeroMedidas: number | null;
  // Quantidade efetiva do substituto (g ou mL), definida pelo nutricionista.
  quantidade: number | null;
};

export type ItemDaDieta = {
  id: string;
  alimentoId: string | null;
  nomeOriginal: string | null; // nome na base, para referência
  nomeExibido: string | null; // nome na prescrição (pode ser personalizado)
  unidade: Unidade | null;
  medida: MedidaUsada | null;
  numeroMedidas: number | null;
  // Ajuste manual em g/mL. Nulo = vale a quantidade calculada pela medida.
  quantidadeAjustada: number | null;
  substituicoes: SubstituicaoDaLinha[];
  // Item trazido por "Importar rotina", ainda não confirmado: aparece em
  // cinza e fica fora dos cálculos, do PDF e da área do paciente.
  referencia?: boolean;
};

export type Opcao = { id: string; itens: ItemDaDieta[] };

export type Refeicao = {
  id: string;
  nome: string;
  horario: string | null; // "HH:MM"
  observacao: string | null;
  opcaoReferencia: string;
  opcoes: Opcao[];
};

// modeloId: observação copiada de um modelo (evita incluir o mesmo duas vezes).
export type ObservacaoDaDieta = { id: string; titulo: string; texto: string; modeloId?: string | null };

export type PesoDeReferencia = {
  valor: number | null;
  origem: string | null; // descrição exibida (ex.: "Relatório semanal")
  data: string | null; // AAAA-MM-DD
};

export type DocumentoDieta = {
  esquema: number;
  titulo: string;
  objetivo: string;
  refeicoes: Refeicao[];
  observacoes: ObservacaoDaDieta[];
  hidratacao: { mlPorKg: number | null; observacoes: string };
  pesoReferencia: PesoDeReferencia;
  // Vitaminas e minerais acompanhados no painel (seleção do nutricionista).
  nutrientesAcompanhados: string[];
};

// ---------------------------------------------------------------------------
// Criação

function novoId() {
  return globalThis.crypto.randomUUID();
}

export function novoItem(): ItemDaDieta {
  return {
    id: novoId(),
    alimentoId: null,
    nomeOriginal: null,
    nomeExibido: null,
    unidade: null,
    medida: null,
    numeroMedidas: null,
    quantidadeAjustada: null,
    substituicoes: [],
    referencia: false,
  };
}

export function novaOpcao(): Opcao {
  return { id: novoId(), itens: [] };
}

export function novaRefeicao(nome = ""): Refeicao {
  const opcao = novaOpcao();
  return { id: novoId(), nome, horario: null, observacao: null, opcaoReferencia: opcao.id, opcoes: [opcao] };
}

export function documentoVazio(titulo = "Nova dieta", objetivo = ""): DocumentoDieta {
  return {
    esquema: VERSAO_DO_ESQUEMA,
    titulo,
    objetivo,
    refeicoes: [],
    observacoes: [],
    hidratacao: { mlPorKg: null, observacoes: "" },
    pesoReferencia: { valor: null, origem: null, data: null },
    nutrientesAcompanhados: [],
  };
}

// ---------------------------------------------------------------------------
// Validação do documento recebido pela API (nunca confiar no navegador)

const LIMITES = {
  texto: 200,
  textoLongo: 10_000,
  refeicoes: 30,
  opcoes: 10,
  itens: 60,
  substituicoes: 30,
  observacoes: 50,
  nutrientes: 80,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;

class ErroDeValidacao extends Error {}

function falhar(mensagem: string): never {
  throw new ErroDeValidacao(mensagem);
}

function objeto(valor: unknown, onde: string): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) falhar(`${onde}: formato inválido.`);
  return valor as Record<string, unknown>;
}

function lista(valor: unknown, limite: number, onde: string): unknown[] {
  if (!Array.isArray(valor)) falhar(`${onde}: formato inválido.`);
  if (valor.length > limite) falhar(`${onde}: no máximo ${limite}.`);
  return valor;
}

function id(valor: unknown, onde: string) {
  if (typeof valor !== "string" || !UUID.test(valor)) falhar(`${onde}: identificador inválido.`);
  return valor;
}

function idOuNulo(valor: unknown, onde: string) {
  return valor === null || valor === undefined ? null : id(valor, onde);
}

function texto(valor: unknown, limite: number, onde: string) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor !== "string") falhar(`${onde}: texto inválido.`);
  if (valor.length > limite) falhar(`${onde}: texto muito longo.`);
  return valor;
}

function textoOuNulo(valor: unknown, limite: number, onde: string) {
  const resultado = texto(valor, limite, onde);
  return valor === null || valor === undefined ? null : resultado;
}

// Número positivo (ou nulo). Zero e negativos não são quantidades válidas.
function positivoOuNulo(valor: unknown, maximo: number, onde: string) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0 || valor > maximo) {
    falhar(`${onde}: número inválido.`);
  }
  return valor;
}

function unidadeOuNula(valor: unknown, onde: string): Unidade | null {
  if (valor === null || valor === undefined) return null;
  if (valor !== "g" && valor !== "ml") falhar(`${onde}: unidade inválida.`);
  return valor;
}

function medidaOuNula(valor: unknown, onde: string): MedidaUsada | null {
  if (valor === null || valor === undefined) return null;
  const m = objeto(valor, onde);
  const singular = texto(m.singular, LIMITES.texto, onde).trim();
  const plural = texto(m.plural, LIMITES.texto, onde).trim();
  if (!singular || !plural) falhar(`${onde}: nome da medida vazio.`);
  return {
    id: id(m.id, onde),
    singular,
    plural,
    quantidade: positivoOuNulo(m.quantidade, 100_000, onde) ?? falhar(`${onde}: equivalência da medida inválida.`),
  };
}

function validarSubstituicao(valor: unknown, onde: string): SubstituicaoDaLinha {
  const s = objeto(valor, onde);
  return {
    id: id(s.id, onde),
    alimentoId: id(s.alimentoId, onde),
    nome: texto(s.nome, LIMITES.texto, onde),
    unidade: unidadeOuNula(s.unidade, onde) ?? "g",
    medida: medidaOuNula(s.medida, onde),
    numeroMedidas: positivoOuNulo(s.numeroMedidas, 10_000, onde),
    quantidade: positivoOuNulo(s.quantidade, 100_000, onde),
  };
}

function validarItem(valor: unknown, onde: string): ItemDaDieta {
  const i = objeto(valor, onde);
  return {
    id: id(i.id, onde),
    alimentoId: idOuNulo(i.alimentoId, onde),
    nomeOriginal: textoOuNulo(i.nomeOriginal, LIMITES.texto, onde),
    nomeExibido: textoOuNulo(i.nomeExibido, LIMITES.texto, onde),
    unidade: unidadeOuNula(i.unidade, onde),
    medida: medidaOuNula(i.medida, onde),
    numeroMedidas: positivoOuNulo(i.numeroMedidas, 10_000, onde),
    quantidadeAjustada: positivoOuNulo(i.quantidadeAjustada, 100_000, onde),
    substituicoes: lista(i.substituicoes ?? [], LIMITES.substituicoes, `${onde}, substituições`).map((s, n) =>
      validarSubstituicao(s, `${onde}, substituição ${n + 1}`)
    ),
    referencia: i.referencia === true,
  };
}

export function validarRefeicaoAvulsa(valor: unknown): { refeicao: Refeicao } | { erro: string } {
  try {
    return { refeicao: validarRefeicao(valor, "Refeição") };
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) return { erro: erro.message };
    throw erro;
  }
}

function validarRefeicao(valor: unknown, onde: string): Refeicao {
  const r = objeto(valor, onde);
  const opcoes = lista(r.opcoes, LIMITES.opcoes, `${onde}, opções`).map((o, n) => {
    const opcao = objeto(o, `${onde}, opção ${n + 1}`);
    return {
      id: id(opcao.id, `${onde}, opção ${n + 1}`),
      itens: lista(opcao.itens, LIMITES.itens, `${onde}, alimentos`).map((item, k) =>
        validarItem(item, `${onde}, alimento ${k + 1}`)
      ),
    };
  });

  if (opcoes.length === 0) falhar(`${onde}: a refeição precisa de pelo menos uma opção.`);

  const horario = textoOuNulo(r.horario, 5, onde);
  if (horario && !HORARIO.test(horario)) falhar(`${onde}: horário inválido.`);

  const referencia = id(r.opcaoReferencia, onde);

  return {
    id: id(r.id, onde),
    nome: texto(r.nome, LIMITES.texto, onde),
    horario: horario || null,
    observacao: textoOuNulo(r.observacao, LIMITES.textoLongo, onde),
    opcaoReferencia: opcoes.some((opcao) => opcao.id === referencia) ? referencia : opcoes[0].id,
    opcoes,
  };
}

export function validarDocumento(valor: unknown): { documento: DocumentoDieta } | { erro: string } {
  try {
    const d = objeto(valor, "Dieta");
    const hidratacao = objeto(d.hidratacao ?? {}, "Hidratação");
    const peso = objeto(d.pesoReferencia ?? {}, "Peso de referência");

    const nutrientes = lista(d.nutrientesAcompanhados ?? [], LIMITES.nutrientes, "Nutrientes acompanhados").map((n) => {
      if (typeof n !== "string" || !/^[a-z0-9_]{1,40}$/.test(n)) falhar("Nutriente acompanhado inválido.");
      return n;
    });

    const dataPeso = textoOuNulo(peso.data, 10, "Peso de referência");
    if (dataPeso && !/^\d{4}-\d{2}-\d{2}$/.test(dataPeso)) falhar("Peso de referência: data inválida.");

    const documento: DocumentoDieta = {
      esquema: VERSAO_DO_ESQUEMA,
      titulo: texto(d.titulo, LIMITES.texto, "Título"),
      objetivo: texto(d.objetivo, LIMITES.texto, "Objetivo"),
      refeicoes: lista(d.refeicoes, LIMITES.refeicoes, "Refeições").map((r, n) =>
        validarRefeicao(r, `Refeição ${n + 1}`)
      ),
      observacoes: lista(d.observacoes ?? [], LIMITES.observacoes, "Observações").map((o, n) => {
        const obs = objeto(o, `Observação ${n + 1}`);
        return {
          id: id(obs.id, `Observação ${n + 1}`),
          titulo: texto(obs.titulo, LIMITES.texto, `Observação ${n + 1}`),
          texto: texto(obs.texto, LIMITES.textoLongo, `Observação ${n + 1}`),
          modeloId: idOuNulo(obs.modeloId, `Observação ${n + 1}`),
        };
      }),
      hidratacao: {
        mlPorKg: positivoOuNulo(hidratacao.mlPorKg, 500, "Hidratação"),
        observacoes: texto(hidratacao.observacoes, LIMITES.textoLongo, "Hidratação"),
      },
      pesoReferencia: {
        valor: positivoOuNulo(peso.valor, 500, "Peso de referência"),
        origem: textoOuNulo(peso.origem, LIMITES.texto, "Peso de referência"),
        data: dataPeso || null,
      },
      nutrientesAcompanhados: [...new Set(nutrientes)],
    };

    return { documento };
  } catch (erro) {
    if (erro instanceof ErroDeValidacao) return { erro: erro.message };
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Quantidades

export type QuantidadeDoItem = {
  calculada: number | null; // nº de medidas × medida
  efetiva: number | null; // usada nos cálculos
  ajustada: boolean; // efetiva veio de ajuste manual diferente da calculada
};

export function quantidadeDoItem(item: Pick<ItemDaDieta, "medida" | "numeroMedidas" | "quantidadeAjustada">): QuantidadeDoItem {
  const calculada =
    item.medida && item.numeroMedidas && item.numeroMedidas > 0 ? item.numeroMedidas * item.medida.quantidade : null;
  const efetiva = item.quantidadeAjustada ?? calculada;

  return {
    calculada,
    efetiva,
    ajustada: item.quantidadeAjustada !== null && (calculada === null || Math.abs(item.quantidadeAjustada - calculada) > 1e-9),
  };
}

// Linha que participa dos cálculos: tem alimento e quantidade efetiva e não
// é só referência da rotina anterior.
export function itemCalculavel(item: ItemDaDieta) {
  return !item.referencia && Boolean(item.alimentoId) && (quantidadeDoItem(item).efetiva ?? 0) > 0;
}

// Linha que vai para o paciente (PDF e área do paciente).
export function itemPrescrito(item: ItemDaDieta) {
  return Boolean(item.alimentoId) && !item.referencia;
}

// ---------------------------------------------------------------------------
// Totais

export type Composicoes = Record<string, Composicao>;
export type Totais = Record<string, Total>;

function itensDeCalculo(itens: ItemDaDieta[], composicoes: Composicoes): ItemDeCalculo[] {
  return itens.filter(itemCalculavel).map((item) => ({
    composicao: composicoes[item.alimentoId as string] ?? {},
    quantidade: quantidadeDoItem(item).efetiva as number,
  }));
}

export function totaisDosItens(itens: ItemDaDieta[], composicoes: Composicoes, nutrientes: string[]): Totais {
  const paraCalculo = itensDeCalculo(itens, composicoes);
  return Object.fromEntries(nutrientes.map((n) => [n, totalDoNutriente(paraCalculo, n)]));
}

export function opcaoDeReferencia(refeicao: Refeicao) {
  return refeicao.opcoes.find((opcao) => opcao.id === refeicao.opcaoReferencia) ?? refeicao.opcoes[0];
}

// Itens que entram nos totais da dieta: só as opções de referência.
export function itensDeReferencia(documento: DocumentoDieta) {
  return documento.refeicoes.flatMap((refeicao) => opcaoDeReferencia(refeicao)?.itens ?? []);
}

export function totaisDaDieta(documento: DocumentoDieta, composicoes: Composicoes, nutrientes: string[]): Totais {
  return totaisDosItens(itensDeReferencia(documento), composicoes, nutrientes);
}

// ---------------------------------------------------------------------------
// Indicadores do painel nutricional

export const FATORES_ATWATER = { carboidratos: 4, proteinas: 4, lipidios: 9 } as const;
export const FATOR_NITROGENIO = 6.25;
export const NUTRIENTES_DO_PAINEL = ["kcal", "carboidratos", "proteinas", "lipidios", "fibras", "fibras_soluveis", "fibras_insoluveis"];

export type Indicador = { valor: number | null; completo: boolean };

export type Indicadores = {
  kcal: Indicador;
  macros: Record<keyof typeof FATORES_ATWATER, { gramas: Indicador; percentual: Indicador; porKg: Indicador }>;
  kcalPorKg: Indicador;
  kcalNaoProteicaPorGN: Indicador;
  fibras: Indicador;
  fibrasSoluveis: Indicador;
  fibrasInsoluveis: Indicador;
};

function indicador(total: Total | undefined): Indicador {
  return { valor: total?.valor ?? null, completo: Boolean(total?.completo) };
}

// Conta com dois indicadores: só tem valor se ambos têm; completo se ambos
// estão completos.
function combinar(a: Indicador, b: Indicador, conta: (x: number, y: number) => number | null): Indicador {
  if (a.valor === null || b.valor === null) return { valor: null, completo: false };
  return { valor: conta(a.valor, b.valor), completo: a.completo && b.completo };
}

export function indicadoresDoPainel(totais: Totais, pesoKg: number | null): Indicadores {
  const kcal = indicador(totais.kcal);
  const peso: Indicador = { valor: pesoKg && pesoKg > 0 ? pesoKg : null, completo: true };
  const porKg = (valor: Indicador) => combinar(valor, peso, (x, y) => x / y);

  const macro = (nome: keyof typeof FATORES_ATWATER) => {
    const gramas = indicador(totais[nome]);
    return {
      gramas,
      // % energético: g × fator ÷ kcal total. Sem kcal válida, sem percentual.
      percentual: combinar(gramas, kcal, (g, k) => (k > 0 ? ((g * FATORES_ATWATER[nome]) / k) * 100 : null)),
      porKg: porKg(gramas),
    };
  };

  const proteinas = indicador(totais.proteinas);

  return {
    kcal,
    macros: { carboidratos: macro("carboidratos"), proteinas: macro("proteinas"), lipidios: macro("lipidios") },
    kcalPorKg: porKg(kcal),
    kcalNaoProteicaPorGN: combinar(kcal, proteinas, (k, p) =>
      p > 0 ? (k - p * FATORES_ATWATER.proteinas) / (p / FATOR_NITROGENIO) : null
    ),
    fibras: indicador(totais.fibras),
    fibrasSoluveis: indicador(totais.fibras_soluveis),
    fibrasInsoluveis: indicador(totais.fibras_insoluveis),
  };
}

// Volume diário de água = mL/kg × peso de referência.
export function hidratacaoDiaria(mlPorKg: number | null, pesoKg: number | null) {
  if (!mlPorKg || !pesoKg || mlPorKg <= 0 || pesoKg <= 0) return null;
  return mlPorKg * pesoKg;
}

// ---------------------------------------------------------------------------
// Textos para a prescrição (PDF e área do paciente)

export function formatarNumero(valor: number, casas = 1) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

export function nomeNaPrescricao(item: Pick<ItemDaDieta, "nomeExibido" | "nomeOriginal">) {
  return (item.nomeExibido?.trim() || item.nomeOriginal?.trim() || "").trim();
}

function textoDaMedida(numero: number, medida: MedidaUsada) {
  return `${formatarNumero(numero, 2)} ${numero > 1 ? medida.plural : medida.singular}`;
}

// "2 colheres de sopa (50 g)"; com ajuste manual, a medida vira aproximada:
// "110 g (aprox. 2 colheres de servir)". Sem medida: "120 g".
export function textoDaQuantidade(item: {
  medida: MedidaUsada | null;
  numeroMedidas: number | null;
  quantidadeAjustada?: number | null;
  quantidade?: number | null;
  unidade: Unidade | null;
}) {
  const unidade = item.unidade === "ml" ? "mL" : "g";
  const q = "quantidade" in item && item.quantidade !== undefined
    ? { efetiva: item.quantidade, calculada: item.medida && item.numeroMedidas ? item.numeroMedidas * item.medida.quantidade : null }
    : quantidadeDoItem({ medida: item.medida, numeroMedidas: item.numeroMedidas, quantidadeAjustada: item.quantidadeAjustada ?? null });

  if (q.efetiva === null || q.efetiva === undefined) return "";

  const peso = `${formatarNumero(q.efetiva)} ${unidade}`;

  if (!item.medida || !item.numeroMedidas) return peso;

  const medida = textoDaMedida(item.numeroMedidas, item.medida);
  const exata = q.calculada !== null && Math.abs(q.calculada - q.efetiva) < 1e-9;

  return exata ? `${medida} (${peso})` : `${peso} (aprox. ${medida})`;
}

// ---------------------------------------------------------------------------
// Pendências que impedem o envio ao paciente

export function pendenciasDoEnvio(documento: DocumentoDieta): string[] {
  const pendencias: string[] = [];

  if (!documento.titulo.trim()) pendencias.push("A dieta está sem título.");
  if (documento.refeicoes.length === 0) pendencias.push("A dieta não tem refeições.");

  documento.refeicoes.forEach((refeicao, r) => {
    const nome = refeicao.nome.trim() || `Refeição ${r + 1}`;
    if (!refeicao.nome.trim()) pendencias.push(`Refeição ${r + 1} está sem nome.`);

    refeicao.opcoes.forEach((opcao, o) => {
      const onde = refeicao.opcoes.length > 1 ? `${nome}, opção ${o + 1}` : nome;
      const prescritos = opcao.itens.filter((item) => !item.referencia);
      if (prescritos.length === 0) {
        pendencias.push(
          opcao.itens.length
            ? `${onde}: só há itens da rotina anterior (em cinza). Confirme ou inclua alimentos.`
            : `${onde}: nenhum alimento.`
        );
      }

      prescritos.forEach((item, i) => {
        if (!item.alimentoId) pendencias.push(`${onde}: a linha ${i + 1} está sem alimento.`);
        else if (!((quantidadeDoItem(item).efetiva ?? 0) > 0)) {
          pendencias.push(`${onde}: ${nomeNaPrescricao(item)} está sem quantidade.`);
        }

        item.substituicoes.forEach((s) => {
          if (!(s.quantidade && s.quantidade > 0)) {
            pendencias.push(`${onde}: a substituição ${s.nome} de ${nomeNaPrescricao(item)} está sem quantidade.`);
          }
        });
      });
    });
  });

  documento.observacoes.forEach((observacao, n) => {
    if (!observacao.texto.trim()) pendencias.push(`A observação ${n + 1} da dieta está vazia.`);
  });

  return pendencias;
}

// Alimentos usados (linhas e substituições), para carregar a composição.
export function alimentosDoDocumento(documento: DocumentoDieta) {
  const ids = new Set<string>();
  for (const refeicao of documento.refeicoes) {
    for (const opcao of refeicao.opcoes) {
      for (const item of opcao.itens) {
        if (item.alimentoId) ids.add(item.alimentoId);
        for (const s of item.substituicoes) ids.add(s.alimentoId);
      }
    }
  }
  return [...ids];
}

// ---------------------------------------------------------------------------
// Cópias (importar, duplicar, colar, modelos)
//
// Toda cópia ganha identificadores novos: nada fica ligado à origem.

function copiarItem(item: ItemDaDieta, comoReferencia: boolean): ItemDaDieta {
  return {
    ...structuredClone(item),
    id: novoId(),
    referencia: comoReferencia || Boolean(item.referencia),
    substituicoes: item.substituicoes.map((s) => ({ ...structuredClone(s), id: novoId() })),
  };
}

export function copiarOpcao(opcao: Opcao, comoReferencia = false): Opcao {
  return { id: novoId(), itens: opcao.itens.map((item) => copiarItem(item, comoReferencia)) };
}

export function copiarRefeicao(refeicao: Refeicao, comoReferencia = false): Refeicao {
  const opcoes = refeicao.opcoes.map((opcao) => copiarOpcao(opcao, comoReferencia));
  const indiceReferencia = Math.max(0, refeicao.opcoes.findIndex((o) => o.id === refeicao.opcaoReferencia));
  return {
    id: novoId(),
    nome: refeicao.nome,
    horario: refeicao.horario,
    observacao: refeicao.observacao,
    opcaoReferencia: opcoes[indiceReferencia].id,
    opcoes,
  };
}

// Cópia de uma dieta (ou modelo) para outra dieta. "rotina": itens em cinza
// e sem observações (as da dieta anterior não valem automaticamente).
export function copiarDocumento(origem: DocumentoDieta, modo: "copia" | "rotina" = "copia"): DocumentoDieta {
  const rotina = modo === "rotina";
  return {
    ...documentoVazio(origem.titulo, origem.objetivo),
    refeicoes: origem.refeicoes.map((r) => {
      const copia = copiarRefeicao(r, rotina);
      if (rotina) copia.observacao = null;
      return copia;
    }),
    observacoes: rotina ? [] : origem.observacoes.map((o) => ({ ...o, id: novoId() })),
    hidratacao: rotina ? { mlPorKg: null, observacoes: "" } : { ...origem.hidratacao },
    nutrientesAcompanhados: [...origem.nutrientesAcompanhados],
  };
}

// Conteúdo de um modelo de dieta: sem dados do paciente (peso de referência).
export function documentoParaModelo(documento: DocumentoDieta): DocumentoDieta {
  return { ...copiarDocumento(documento), pesoReferencia: { valor: null, origem: null, data: null } };
}

export function documentoTemConteudo(documento: DocumentoDieta) {
  return (
    documento.refeicoes.length > 0 ||
    documento.observacoes.length > 0 ||
    documento.hidratacao.mlPorKg !== null ||
    documento.hidratacao.observacoes.trim() !== ""
  );
}

export function refeicaoTemConteudo(refeicao: Refeicao) {
  return refeicao.opcoes.some((o) => o.itens.length > 0) || Boolean(refeicao.observacao?.trim());
}

// Colar refeição / importar modelo de refeição numa refeição de destino.
// "substituir": troca alimentos, opções e observação; "opcao": acrescenta as
// opções da origem como novas opções. Nome e horário do destino ficam, salvo
// pedido explícito.
export function aplicarRefeicao(
  destino: Refeicao,
  origem: Refeicao,
  modo: "substituir" | "opcao",
  opcoes: { usarNomeEHorario?: boolean; incorporarObservacao?: boolean } = {}
): Refeicao {
  const copia = copiarRefeicao(origem);
  let resultado: Refeicao;

  if (modo === "substituir") {
    resultado = { ...copia, id: destino.id, nome: destino.nome, horario: destino.horario };
  } else if (destino.opcoes.every((o) => o.itens.length === 0)) {
    // Destino sem alimentos: a opção vazia dele não fica sobrando.
    resultado = { ...destino, opcoes: copia.opcoes, opcaoReferencia: copia.opcaoReferencia };
  } else {
    resultado = { ...destino, opcoes: [...destino.opcoes, ...copia.opcoes] };
  }

  if (opcoes.usarNomeEHorario) {
    resultado.nome = origem.nome;
    resultado.horario = origem.horario;
  }

  if (modo === "opcao") {
    const daOrigem = origem.observacao?.trim();
    resultado.observacao =
      opcoes.incorporarObservacao && daOrigem
        ? [destino.observacao?.trim(), daOrigem].filter(Boolean).join("\n")
        : destino.observacao;
  }

  return resultado;
}

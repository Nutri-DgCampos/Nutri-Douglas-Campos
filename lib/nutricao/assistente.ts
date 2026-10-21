// Auxílio da IA no editor de dietas (Fase 7): pedido, proposta, comparação
// e aplicação das mudanças escolhidas pelo nutricionista.
//
// Regras (roteiro "Auxílio da inteligência artificial", acordos ND-221 a
// ND-225 e validação da Fase 7):
// - A IA só propõe. Nada muda na dieta até "Aplicar alterações selecionadas".
// - A IA só escolhe alimentos da base, pelo código do catálogo enviado; código
//   desconhecido não vira alimento parecido: a linha fica sem alimento, com o
//   nome sugerido, para o nutricionista escolher.
// - Medida caseira só do cadastro do alimento; com medida, o peso vem da
//   medida (nunca do peso que a IA escreveu). Sem medida, vale o peso em g/mL.
// - Os valores nutricionais são sempre calculados pelo sistema; a IA não
//   informa totais.
// - Cada mudança (inclusão, exclusão, quantidade, refeição nova...) é
//   escolhida separadamente; a prévia usa só as escolhidas.

import { opcaoDeReferencia, quantidadeDoItem, type DocumentoDieta, type ItemDaDieta, type MedidaUsada, type Opcao, type Refeicao, type Unidade } from "./dieta.ts";

export const LIMITE_DIARIO_DA_IA = 200;
export const MAXIMO_DE_PARAMETROS = 4;
export const LIMITES_DO_PEDIDO = { pedido: 2000, texto: 500, contexto: 4000 };
const LIMITES_DA_SAIDA = { refeicoes: 12, opcoes: 3, itens: 30, mensagem: 2000, nome: 200, observacao: 1000 };
const HORARIO = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Pedido

export type CondicaoDoParametro = "min" | "max" | "alvo";
export type ParametroDeControle = { nutriente: string; condicao: CondicaoDoParametro; valor: number };

export type MetasDoPedido = {
  kcal: number | null;
  proteinas: number | null;
  carboidratos: number | null;
  lipidios: number | null;
  parametros: ParametroDeControle[];
};

export type PedidoDaIa = {
  alcance: "dieta" | "refeicao";
  refeicaoId: string | null;
  // Dieta do zero (ND-225): a IA ignora o conteúdo atual.
  doZero: boolean;
  pedido: string;
  metas: MetasDoPedido;
  numeroRefeicoes: number | null;
  horarios: string;
  objetivo: string;
  restricoes: string;
  preferencias: string;
  // Alergias, restrições e preferências da anamnese, revisadas pelo
  // nutricionista antes do envio (validação 7.4).
  contextoAnamnese: string;
};

export const CONDICOES: Record<CondicaoDoParametro, string> = { min: "no mínimo", max: "no máximo", alvo: "cerca de" };

export function pedidoVazio(): PedidoDaIa {
  return {
    alcance: "dieta",
    refeicaoId: null,
    doZero: false,
    pedido: "",
    metas: { kcal: null, proteinas: null, carboidratos: null, lipidios: null, parametros: [] },
    numeroRefeicoes: null,
    horarios: "",
    objetivo: "",
    restricoes: "",
    preferencias: "",
    contextoAnamnese: "",
  };
}

function textoLimitado(valor: unknown, limite: number, onde: string) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor !== "string") throw new Error(`${onde}: texto inválido.`);
  if (valor.length > limite) throw new Error(`${onde}: no máximo ${limite} caracteres.`);
  return valor.trim();
}

function numeroOuNulo(valor: unknown, maximo: number, onde: string) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0 || valor > maximo) throw new Error(`${onde}: número inválido.`);
  return valor;
}

export function validarPedido(valor: unknown, documento: DocumentoDieta): { pedido: PedidoDaIa } | { erro: string } {
  try {
    if (!valor || typeof valor !== "object") throw new Error("Pedido inválido.");
    const p = valor as Record<string, unknown>;
    const doZero = p.doZero === true;
    const alcance = doZero ? "dieta" : p.alcance === "refeicao" ? "refeicao" : "dieta";
    const refeicaoId = alcance === "refeicao" && typeof p.refeicaoId === "string" ? p.refeicaoId : null;
    if (alcance === "refeicao" && !documento.refeicoes.some((r) => r.id === refeicaoId)) {
      throw new Error("Escolha a refeição em que a IA vai trabalhar.");
    }

    const m = (p.metas ?? {}) as Record<string, unknown>;
    const parametros = Array.isArray(m.parametros) ? m.parametros : [];
    if (parametros.length > MAXIMO_DE_PARAMETROS) throw new Error(`No máximo ${MAXIMO_DE_PARAMETROS} parâmetros de controle.`);

    const pedido: PedidoDaIa = {
      alcance,
      refeicaoId,
      doZero,
      pedido: textoLimitado(p.pedido, LIMITES_DO_PEDIDO.pedido, "Pedido"),
      metas: {
        kcal: numeroOuNulo(m.kcal, 10_000, "Meta de calorias"),
        proteinas: numeroOuNulo(m.proteinas, 1_000, "Meta de proteínas"),
        carboidratos: numeroOuNulo(m.carboidratos, 2_000, "Meta de carboidratos"),
        lipidios: numeroOuNulo(m.lipidios, 1_000, "Meta de gorduras"),
        parametros: parametros.map((item, n) => {
          const parametro = (item ?? {}) as Record<string, unknown>;
          const onde = `Parâmetro ${n + 1}`;
          if (typeof parametro.nutriente !== "string" || !/^[a-z0-9_]{1,40}$/.test(parametro.nutriente)) throw new Error(`${onde}: nutriente inválido.`);
          const condicao = parametro.condicao;
          if (condicao !== "min" && condicao !== "max" && condicao !== "alvo") throw new Error(`${onde}: condição inválida.`);
          const valorDoParametro = numeroOuNulo(parametro.valor, 1_000_000, onde);
          if (valorDoParametro === null) throw new Error(`${onde}: informe o valor.`);
          return { nutriente: parametro.nutriente, condicao, valor: valorDoParametro };
        }),
      },
      numeroRefeicoes: numeroOuNulo(p.numeroRefeicoes, LIMITES_DA_SAIDA.refeicoes, "Número de refeições"),
      horarios: textoLimitado(p.horarios, LIMITES_DO_PEDIDO.texto, "Horários"),
      objetivo: textoLimitado(p.objetivo, LIMITES_DO_PEDIDO.texto, "Objetivo"),
      restricoes: textoLimitado(p.restricoes, LIMITES_DO_PEDIDO.texto, "Restrições"),
      preferencias: textoLimitado(p.preferencias, LIMITES_DO_PEDIDO.texto, "Preferências"),
      contextoAnamnese: textoLimitado(p.contextoAnamnese, LIMITES_DO_PEDIDO.contexto, "Contexto da anamnese"),
    };
    if (pedido.numeroRefeicoes !== null && !Number.isInteger(pedido.numeroRefeicoes)) throw new Error("Número de refeições inválido.");
    if (!pedido.pedido && !(doZero && pedido.metas.kcal)) {
      throw new Error(doZero ? "Informe a meta de calorias ou descreva o pedido." : "Escreva o que a IA deve fazer.");
    }
    return { pedido };
  } catch (erro) {
    return { erro: erro instanceof Error ? erro.message : "Pedido inválido." };
  }
}

// ---------------------------------------------------------------------------
// Resposta da IA → proposta

// O que vai no catálogo enviado à IA: códigos curtos no lugar dos ids.
export type AlimentoDoCatalogo = { id: string; nome: string; unidade: Unidade; medidas: Record<string, MedidaUsada> };
export type CatalogoDaIa = {
  alimentos: Record<string, AlimentoDoCatalogo>; // "a12" → alimento
  refeicoes: Record<string, string>; // "r1" → id da refeição da dieta aberta
};

export type PropostaDaIa = {
  id: string;
  criadaEm: string;
  pedido: PedidoDaIa;
  // Limitações, esclarecimentos e avisos escritos pela IA.
  mensagem: string;
  refeicoes: Refeicao[];
  // Pontos que o sistema encontrou ao conferir a resposta.
  pendencias: string[];
};

// Formato pedido à IA (saída estruturada). Os nomes ficam em português para
// a IA entender o papel de cada campo.
export const ESQUEMA_DA_SAIDA = {
  type: "object",
  additionalProperties: false,
  required: ["mensagem", "refeicoes"],
  properties: {
    mensagem: { type: "string" },
    refeicoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "nome", "horario", "observacao", "opcoes"],
        properties: {
          codigo: { type: ["string", "null"] },
          nome: { type: "string" },
          horario: { type: ["string", "null"] },
          observacao: { type: ["string", "null"] },
          opcoes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["itens"],
              properties: {
                itens: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["alimento", "descricao", "medida", "numeroMedidas", "quantidade"],
                    properties: {
                      alimento: { type: ["string", "null"] },
                      descricao: { type: "string" },
                      medida: { type: ["string", "null"] },
                      numeroMedidas: { type: ["number", "null"] },
                      quantidade: { type: ["number", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

type Bruto = Record<string, unknown>;

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor : [];
}

function textoDaIa(valor: unknown, limite: number) {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

function positivo(valor: unknown, maximo: number) {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 && valor <= maximo ? valor : null;
}

// Arredonda o peso sugerido sem casas inúteis (1 casa abaixo de 10 g).
function arredondarPeso(valor: number) {
  return valor < 10 ? Math.round(valor * 10) / 10 : Math.round(valor);
}

function arredondarMedidas(valor: number) {
  return Math.round(valor * 4) / 4; // até quartos de medida
}

export function montarProposta(
  saida: unknown,
  catalogo: CatalogoDaIa,
  pedido: PedidoDaIa,
  novoId: () => string = () => globalThis.crypto.randomUUID()
): { mensagem: string; refeicoes: Refeicao[]; pendencias: string[] } {
  const bruto = (saida && typeof saida === "object" ? saida : {}) as Bruto;
  const pendencias: string[] = [];
  const usadas = new Set<string>();
  let refeicoesBrutas = lista(bruto.refeicoes).slice(0, LIMITES_DA_SAIDA.refeicoes) as Bruto[];

  // Uma refeição: só a escolhida, com o id dela.
  if (pedido.alcance === "refeicao") {
    const codigoDoAlvo = Object.entries(catalogo.refeicoes).find(([, id]) => id === pedido.refeicaoId)?.[0];
    const escolhida = refeicoesBrutas.find((r) => r?.codigo === codigoDoAlvo) ?? refeicoesBrutas[0];
    if (refeicoesBrutas.length > 1) pendencias.push("A IA respondeu com mais de uma refeição; só a refeição escolhida foi considerada.");
    refeicoesBrutas = escolhida ? [{ ...escolhida, codigo: codigoDoAlvo ?? null }] : [];
  }

  const refeicoes: Refeicao[] = [];
  refeicoesBrutas.forEach((r, n) => {
    if (!r || typeof r !== "object") return;
    const nome = textoDaIa(r.nome, LIMITES_DA_SAIDA.nome) || `Refeição ${n + 1}`;

    // Refeição existente (pelo código) mantém o id; repetida ou do zero é nova.
    let id: string | null = null;
    const codigo = typeof r.codigo === "string" ? r.codigo : null;
    if (pedido.alcance === "refeicao") id = pedido.refeicaoId;
    else if (!pedido.doZero && codigo && catalogo.refeicoes[codigo] && !usadas.has(codigo)) id = catalogo.refeicoes[codigo];
    if (codigo) usadas.add(codigo);

    const opcoes: Opcao[] = [];
    for (const o of lista(r.opcoes).slice(0, LIMITES_DA_SAIDA.opcoes) as Bruto[]) {
      const itens: ItemDaDieta[] = [];
      for (const bruta of lista(o?.itens).slice(0, LIMITES_DA_SAIDA.itens) as Bruto[]) {
        const item = itemDaIa(bruta ?? {}, catalogo, novoId);
        if (!item) continue;
        if (!item.alimentoId) {
          pendencias.push(`${nome}: “${item.sugeridoIa}” não tem correspondência segura na base. Escolha o alimento na linha.`);
        } else if (!((quantidadeDoItem(item).efetiva ?? 0) > 0)) {
          pendencias.push(`${nome}: ${item.nomeOriginal} veio sem quantidade válida. Informe a quantidade.`);
        }
        itens.push(item);
      }
      if (itens.length) opcoes.push({ id: novoId(), itens });
    }
    if (opcoes.length === 0) {
      pendencias.push(`${nome}: a IA não indicou alimentos; a refeição foi ignorada.`);
      return;
    }

    const horario = typeof r.horario === "string" && HORARIO.test(r.horario.trim()) ? r.horario.trim() : null;
    refeicoes.push({
      id: id ?? novoId(),
      nome,
      horario,
      observacao: textoDaIa(r.observacao, LIMITES_DA_SAIDA.observacao) || null,
      opcaoReferencia: opcoes[0].id,
      opcoes,
      ia: true,
    });
  });

  return { mensagem: textoDaIa(bruto.mensagem, LIMITES_DA_SAIDA.mensagem), refeicoes, pendencias };
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Alimento do catálogo: pelo código ("a12", aceitando "A12" ou " a12 ") ou,
// se o código não bater, pelo nome IDÊNTICO ao da base (mesmo alimento, não
// semelhança: "Arroz cozido" não vira "Arroz, tipo 1, cozido").
function alimentoDoCatalogo(catalogo: CatalogoDaIa, codigo: string | null, descricao: string) {
  const limpo = codigo?.toLowerCase().replace(/\s+/g, "") ?? "";
  if (catalogo.alimentos[limpo]) return catalogo.alimentos[limpo];
  const nomes = [codigo ?? "", descricao].map(normalizar).filter(Boolean);
  return Object.values(catalogo.alimentos).find((a) => nomes.includes(normalizar(a.nome)));
}

function itemDaIa(bruta: Bruto, catalogo: CatalogoDaIa, novoId: () => string): ItemDaDieta | null {
  const codigo = typeof bruta.alimento === "string" ? bruta.alimento.trim() : null;
  const descricao = textoDaIa(bruta.descricao, LIMITES_DA_SAIDA.nome);
  const alimento = alimentoDoCatalogo(catalogo, codigo, descricao);
  const base: ItemDaDieta = {
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
    ia: true,
  };

  if (!alimento) {
    if (!descricao && !codigo) return null;
    return { ...base, sugeridoIa: descricao || codigo };
  }

  const medida = typeof bruta.medida === "string" ? alimento.medidas[bruta.medida.toLowerCase().replace(/\s+/g, "")] : undefined;
  const numeroMedidas = positivo(bruta.numeroMedidas, 50);
  const quantidade = positivo(bruta.quantidade, 3000);
  const comMedida = medida && numeroMedidas ? { medida: { ...medida }, numeroMedidas: arredondarMedidas(numeroMedidas) || 0.25 } : null;

  return {
    ...base,
    alimentoId: alimento.id,
    nomeOriginal: alimento.nome,
    unidade: alimento.unidade,
    medida: comMedida?.medida ?? null,
    numeroMedidas: comMedida?.numeroMedidas ?? null,
    quantidadeAjustada: comMedida ? null : quantidade !== null ? arredondarPeso(quantidade) : null,
  };
}

// ---------------------------------------------------------------------------
// Comparação: lista de mudanças da proposta em relação à dieta aberta

export type Mudanca =
  | { id: string; tipo: "refeicao_nova"; refeicao: Refeicao; depoisDe: string | null }
  | { id: string; tipo: "refeicao_removida"; refeicaoId: string }
  | { id: string; tipo: "dados_refeicao"; refeicaoId: string; nome: string | null; horario: string | null; observacao: string | null }
  | { id: string; tipo: "inclusao"; refeicaoId: string; item: ItemDaDieta }
  | { id: string; tipo: "exclusao"; refeicaoId: string; itemId: string }
  | { id: string; tipo: "quantidade"; refeicaoId: string; itemId: string; item: ItemDaDieta }
  | { id: string; tipo: "alternativas"; refeicaoId: string; opcoes: Opcao[] };

function mesmaQuantidade(a: ItemDaDieta, b: ItemDaDieta) {
  const qa = quantidadeDoItem(a).efetiva ?? 0;
  const qb = quantidadeDoItem(b).efetiva ?? 0;
  return (a.medida?.id ?? null) === (b.medida?.id ?? null) && (a.numeroMedidas ?? null) === (b.numeroMedidas ?? null) && Math.abs(qa - qb) < 0.05;
}

export function mudancasDaProposta(atual: DocumentoDieta, proposta: Pick<PropostaDaIa, "pedido" | "refeicoes">): Mudanca[] {
  const mudancas: Mudanca[] = [];
  const { pedido } = proposta;
  const alcance = pedido.alcance === "refeicao" ? atual.refeicoes.filter((r) => r.id === pedido.refeicaoId) : atual.refeicoes;
  const propostas = new Set(proposta.refeicoes.map((r) => r.id));
  let anterior: string | null = null;

  for (const nova of proposta.refeicoes) {
    const existente = atual.refeicoes.find((r) => r.id === nova.id);
    if (!existente) {
      mudancas.push({ id: `refeicao_nova:${nova.id}`, tipo: "refeicao_nova", refeicao: nova, depoisDe: anterior });
      anterior = nova.id;
      continue;
    }
    anterior = existente.id;

    // Nome, horário e observação: só o que a IA mudou de fato (vazio não apaga).
    const nome = nova.nome.trim() && nova.nome.trim() !== existente.nome.trim() ? nova.nome.trim() : null;
    const horario = nova.horario && nova.horario !== existente.horario ? nova.horario : null;
    const observacao = nova.observacao?.trim() && nova.observacao.trim() !== (existente.observacao ?? "").trim() ? nova.observacao.trim() : null;
    if (nome || horario || observacao) {
      mudancas.push({ id: `dados_refeicao:${existente.id}`, tipo: "dados_refeicao", refeicaoId: existente.id, nome, horario, observacao });
    }

    // Alimentos da opção principal, pareados pelo alimento da base, na ordem.
    const itensAtuais = opcaoDeReferencia(existente)?.itens ?? [];
    const itensNovos = opcaoDeReferencia(nova)?.itens ?? [];
    const pareados = new Set<string>();
    for (const item of itensNovos) {
      const par = item.alimentoId ? itensAtuais.find((i) => !pareados.has(i.id) && i.alimentoId === item.alimentoId) : undefined;
      if (!par) {
        mudancas.push({ id: `inclusao:${item.id}`, tipo: "inclusao", refeicaoId: existente.id, item });
        continue;
      }
      pareados.add(par.id);
      if (!mesmaQuantidade(par, item)) {
        mudancas.push({ id: `quantidade:${par.id}`, tipo: "quantidade", refeicaoId: existente.id, itemId: par.id, item });
      }
    }
    for (const item of itensAtuais) {
      if (!pareados.has(item.id)) mudancas.push({ id: `exclusao:${item.id}`, tipo: "exclusao", refeicaoId: existente.id, itemId: item.id });
    }

    const alternativas = nova.opcoes.filter((o) => o.id !== nova.opcaoReferencia && o.itens.length > 0);
    if (alternativas.length) {
      mudancas.push({ id: `alternativas:${existente.id}`, tipo: "alternativas", refeicaoId: existente.id, opcoes: alternativas });
    }
  }

  // Dieta inteira: refeição que não voltou na proposta é sugestão de remover.
  for (const refeicao of alcance) {
    if (!propostas.has(refeicao.id)) mudancas.push({ id: `refeicao_removida:${refeicao.id}`, tipo: "refeicao_removida", refeicaoId: refeicao.id });
  }

  return mudancas;
}

// Mudanças que trocam ou apagam o que já existe (pedem confirmação).
export function mudancaSubstitui(m: Mudanca) {
  return m.tipo === "exclusao" || m.tipo === "quantidade" || m.tipo === "refeicao_removida" || m.tipo === "dados_refeicao";
}

// Dieta como ficaria só com as mudanças escolhidas (a original não muda).
export function aplicarMudancas(atual: DocumentoDieta, mudancas: Mudanca[], escolhidas: Set<string>): DocumentoDieta {
  const doc = structuredClone(atual);
  const refeicao = (id: string) => doc.refeicoes.find((r) => r.id === id);
  const principal = (id: string) => {
    const r = refeicao(id);
    return r ? opcaoDeReferencia(r) : undefined;
  };

  for (const m of mudancas) {
    if (!escolhidas.has(m.id)) continue;
    switch (m.tipo) {
      case "dados_refeicao": {
        const r = refeicao(m.refeicaoId);
        if (!r) break;
        if (m.nome) r.nome = m.nome;
        if (m.horario) r.horario = m.horario;
        if (m.observacao) r.observacao = m.observacao;
        break;
      }
      case "quantidade": {
        const item = principal(m.refeicaoId)?.itens.find((i) => i.id === m.itemId);
        if (item) {
          Object.assign(item, {
            unidade: m.item.unidade,
            medida: m.item.medida ? { ...m.item.medida } : null,
            numeroMedidas: m.item.numeroMedidas,
            quantidadeAjustada: m.item.quantidadeAjustada,
            referencia: false,
            ia: true,
          });
        }
        break;
      }
      case "exclusao": {
        const opcao = principal(m.refeicaoId);
        if (opcao) opcao.itens = opcao.itens.filter((i) => i.id !== m.itemId);
        break;
      }
      case "inclusao":
        principal(m.refeicaoId)?.itens.push(structuredClone(m.item));
        break;
      case "alternativas":
        refeicao(m.refeicaoId)?.opcoes.push(...structuredClone(m.opcoes));
        break;
      case "refeicao_removida":
        doc.refeicoes = doc.refeicoes.filter((r) => r.id !== m.refeicaoId);
        break;
      case "refeicao_nova": {
        // Logo depois da refeição que a antecede na proposta (ou no início).
        const posicao = m.depoisDe ? doc.refeicoes.findIndex((r) => r.id === m.depoisDe) : -1;
        const nova = structuredClone(m.refeicao);
        if (m.depoisDe && posicao < 0) doc.refeicoes.push(nova);
        else doc.refeicoes.splice(posicao + 1, 0, nova);
        break;
      }
    }
  }
  return doc;
}

// Registro de que a dieta teve auxílio da IA (vai para a versão enviada).
export function marcarAuxilio(doc: DocumentoDieta, agora = new Date()): DocumentoDieta {
  return { ...doc, auxilioIa: { aplicacoes: (doc.auxilioIa?.aplicacoes ?? 0) + 1, ultimaEm: agora.toISOString() } };
}

export function temSeloDaIa(doc: DocumentoDieta) {
  return doc.refeicoes.some((r) => r.ia || r.opcoes.some((o) => o.itens.some((i) => i.ia)));
}

// Tira todos os selos "IA" (botão "Confirmar sugestões da IA").
export function confirmarSugestoes(doc: DocumentoDieta) {
  for (const r of doc.refeicoes) {
    delete r.ia;
    for (const o of r.opcoes) for (const i of o.itens) delete i.ia;
  }
}

export function idValido(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

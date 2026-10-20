import {
  documentoParaModelo,
  validarDocumento,
  validarRefeicaoAvulsa,
  type DocumentoDieta,
  type Refeicao,
} from "@/lib/nutricao/dieta";

// Biblioteca de modelos do Módulo de Nutrição (Fase 3).

export const TIPOS_DE_MODELO = ["observacao", "refeicao", "dieta"] as const;
export type TipoDeModelo = (typeof TIPOS_DE_MODELO)[number];

export type ConteudoObservacao = { titulo: string; texto: string };

export function tipoValido(valor: unknown): valor is TipoDeModelo {
  return typeof valor === "string" && (TIPOS_DE_MODELO as readonly string[]).includes(valor);
}

function semReferencia(refeicao: Refeicao): Refeicao {
  return {
    ...refeicao,
    opcoes: refeicao.opcoes.map((o) => ({ ...o, itens: o.itens.map((i) => ({ ...i, referencia: false })) })),
  };
}

// Valida e limpa o conteúdo de um modelo. Nada de dados do paciente: o peso
// de referência sai e itens "em cinza" viram itens normais.
export function validarConteudoDoModelo(
  tipo: TipoDeModelo,
  conteudo: unknown
): { conteudo: ConteudoObservacao | Refeicao | DocumentoDieta } | { erro: string } {
  if (tipo === "observacao") {
    const c = conteudo as Partial<ConteudoObservacao> | null;
    const titulo = typeof c?.titulo === "string" ? c.titulo.trim() : "";
    const texto = typeof c?.texto === "string" ? c.texto : "";
    if (!titulo || titulo.length > 200) return { erro: "Informe o título da observação." };
    if (!texto.trim()) return { erro: "Informe o texto da observação." };
    if (texto.length > 10_000) return { erro: "Texto da observação muito longo." };
    return { conteudo: { titulo, texto } };
  }

  if (tipo === "refeicao") {
    const resultado = validarRefeicaoAvulsa(conteudo);
    if ("erro" in resultado) return resultado;
    return { conteudo: semReferencia(resultado.refeicao) };
  }

  const resultado = validarDocumento(conteudo);
  if ("erro" in resultado) return resultado;
  const documento = documentoParaModelo(resultado.documento);
  return { conteudo: { ...documento, refeicoes: documento.refeicoes.map(semReferencia) } };
}

export function nomeValido(valor: unknown) {
  const nome = typeof valor === "string" ? valor.trim() : "";
  return nome && nome.length <= 200 ? nome : null;
}

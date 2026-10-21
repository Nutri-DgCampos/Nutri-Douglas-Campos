// Orientações nutricionais (Fase 6): conteúdo em blocos, desenhado igual na
// tela e no PDF. Negrito no parágrafo e na lista com **texto**.

export type BlocoOrientacao =
  | { id: string; tipo: "titulo"; texto: string }
  | { id: string; tipo: "paragrafo"; texto: string }
  | { id: string; tipo: "lista"; itens: string[] }
  | { id: string; tipo: "imagem"; caminho: string; largura: 25 | 50 | 75 | 100; legenda: string };

export type ConteudoOrientacao = {
  blocos: BlocoOrientacao[];
  // Imagem da assinatura no fim (não é assinatura digital certificada).
  assinatura: boolean;
  // Só no modelo: incluir em toda nova consulta.
  automatica?: boolean;
};

export const LARGURAS = [25, 50, 75, 100] as const;

const LIMITES = { blocos: 200, texto: 20000, itens: 100, item: 2000, legenda: 300 } as const;

export function novoBloco(tipo: BlocoOrientacao["tipo"], caminho = ""): BlocoOrientacao {
  const id = globalThis.crypto.randomUUID();
  if (tipo === "lista") return { id, tipo, itens: [""] };
  if (tipo === "imagem") return { id, tipo, caminho, largura: 75, legenda: "" };
  return { id, tipo, texto: "" };
}

export function conteudoVazio(): ConteudoOrientacao {
  return { blocos: [novoBloco("paragrafo")], assinatura: false, automatica: false };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CAMINHO = /^[A-Za-z0-9_-]{1,80}\/[A-Za-z0-9_-]{1,80}\.(png|jpg|jpeg|webp)$/;

export function validarOrientacao(valor: unknown): { valor: ConteudoOrientacao } | { erro: string } {
  const o = valor as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.blocos)) return { erro: "Conteúdo inválido." };
  if (o.blocos.length > LIMITES.blocos) return { erro: `No máximo ${LIMITES.blocos} blocos.` };
  const texto = (v: unknown, limite: number) => (typeof v === "string" ? v.slice(0, limite) : "");
  const blocos: BlocoOrientacao[] = [];
  for (const [n, b] of (o.blocos as Record<string, unknown>[]).entries()) {
    if (!b || typeof b.id !== "string" || !UUID.test(b.id)) return { erro: `Bloco ${n + 1}: formato inválido.` };
    if (b.tipo === "titulo" || b.tipo === "paragrafo") blocos.push({ id: b.id, tipo: b.tipo, texto: texto(b.texto, LIMITES.texto) });
    else if (b.tipo === "lista") {
      if (!Array.isArray(b.itens)) return { erro: `Bloco ${n + 1}: lista inválida.` };
      blocos.push({ id: b.id, tipo: "lista", itens: b.itens.slice(0, LIMITES.itens).map((i) => texto(i, LIMITES.item)) });
    } else if (b.tipo === "imagem") {
      if (typeof b.caminho !== "string" || !CAMINHO.test(b.caminho)) return { erro: `Bloco ${n + 1}: imagem inválida.` };
      const largura = LARGURAS.includes(b.largura as 25) ? (b.largura as 25 | 50 | 75 | 100) : 75;
      blocos.push({ id: b.id, tipo: "imagem", caminho: b.caminho, largura, legenda: texto(b.legenda, LIMITES.legenda) });
    } else return { erro: `Bloco ${n + 1}: tipo inválido.` };
  }
  return { valor: { blocos, assinatura: o.assinatura === true, automatica: o.automatica === true } };
}

// Partes de um texto com **negrito**.
export function partesComNegrito(texto: string): { texto: string; negrito: boolean }[] {
  const partes: { texto: string; negrito: boolean }[] = [];
  const regex = /\*\*([^*]+)\*\*/g;
  let ultimo = 0;
  for (const m of texto.matchAll(regex)) {
    if (m.index! > ultimo) partes.push({ texto: texto.slice(ultimo, m.index), negrito: false });
    partes.push({ texto: m[1], negrito: true });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), negrito: false });
  return partes;
}

// Ao copiar o modelo para a consulta: {paciente} e {data_consulta} viram os
// dados do atendimento (o nutricionista ainda pode editar).
export function preencherVariaveis(c: ConteudoOrientacao, valores: { paciente: string; dataConsulta: string }): ConteudoOrientacao {
  const trocar = (t: string) => t.replaceAll("{paciente}", valores.paciente).replaceAll("{data_consulta}", valores.dataConsulta);
  return {
    assinatura: c.assinatura,
    blocos: c.blocos.map((b) => {
      const id = globalThis.crypto.randomUUID();
      if (b.tipo === "lista") return { ...b, id, itens: b.itens.map(trocar) };
      if (b.tipo === "imagem") return { ...b, id, legenda: trocar(b.legenda) };
      return { ...b, id, texto: trocar(b.texto) };
    }),
  };
}

export function orientacaoTemConteudo(c: ConteudoOrientacao) {
  return c.blocos.some((b) =>
    b.tipo === "imagem" ? Boolean(b.caminho) : b.tipo === "lista" ? b.itens.some((i) => i.trim()) : b.texto.trim().length > 0
  );
}

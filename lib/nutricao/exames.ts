// Solicitação de exames (Módulo de Nutrição, Fase 6): lista de exames do
// modelo, copiada e ajustável para cada paciente. Sem cálculos.

export type ExameDaLista = { id: string; nome: string };

export const LIMITES_EXAMES = { exames: 150, nome: 200, observacoes: 5000 } as const;

export function novoExame(nome = ""): ExameDaLista {
  return { id: globalThis.crypto.randomUUID(), nome };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Lista válida (sem linhas vazias ao conferir o envio).
export function validarListaDeExames(valor: unknown): { valor: ExameDaLista[] } | { erro: string } {
  if (!Array.isArray(valor)) return { erro: "Lista de exames inválida." };
  if (valor.length > LIMITES_EXAMES.exames) return { erro: `No máximo ${LIMITES_EXAMES.exames} exames.` };
  const lista: ExameDaLista[] = [];
  for (const [n, item] of valor.entries()) {
    const e = item as Record<string, unknown> | null;
    if (!e || typeof e.id !== "string" || !UUID.test(e.id) || typeof e.nome !== "string") return { erro: `Exame ${n + 1}: formato inválido.` };
    if (e.nome.length > LIMITES_EXAMES.nome) return { erro: `Exame ${n + 1}: nome muito longo.` };
    lista.push({ id: e.id, nome: e.nome });
  }
  return { valor: lista };
}

export function examesPreenchidos(lista: ExameDaLista[]) {
  return lista.filter((e) => e.nome.trim());
}

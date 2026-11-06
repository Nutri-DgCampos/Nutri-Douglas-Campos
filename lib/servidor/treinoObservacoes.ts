import { obterPool } from "./banco";
import type { ProfissionalDeTreino } from "./treinoAcesso";

// Catálogo de observações do treino de cada profissional (SPEC complementar
// 06/11, item 2). Cada um vê, cria, altera e arquiva só as suas.

export class ObservacaoInvalida extends Error {}

export type ObservacaoDoCatalogo = { id: string; titulo: string; texto: string; atualizada_em: string };

function campos(dados: Record<string, unknown>) {
  const titulo = typeof dados.titulo === "string" ? dados.titulo.trim().replace(/\s+/g, " ") : "";
  const texto = typeof dados.texto === "string" ? dados.texto.trim() : "";
  if (!titulo) throw new ObservacaoInvalida("Dê um título à observação.");
  if (titulo.length > 120) throw new ObservacaoInvalida("Título com mais de 120 caracteres.");
  if (texto.length > 2000) throw new ObservacaoInvalida("Texto com mais de 2000 caracteres.");
  return { titulo, texto };
}

// Busca pelo título (sem acento e sem diferença de maiúsculas).
export async function listarObservacoes(profissional: ProfissionalDeTreino, busca = "") {
  const r = await obterPool().query<ObservacaoDoCatalogo>(
    `select id, titulo, texto, atualizada_em from public.treino_observacoes
      where profissional_id = $1 and arquivada_em is null
        and ($2 = '' or translate(lower(titulo), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
                        like '%' || translate(lower($2), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%')
      order by titulo
      limit 50`,
    [profissional.usuarioId, busca.trim().slice(0, 80)]
  );
  return r.rows;
}

export async function criarObservacao(profissional: ProfissionalDeTreino, dados: Record<string, unknown>) {
  const { titulo, texto } = campos(dados);
  const r = await obterPool().query<{ id: string }>(
    "insert into public.treino_observacoes (profissional_id, titulo, texto) values ($1, $2, $3) returning id",
    [profissional.usuarioId, titulo, texto]
  );
  return r.rows[0].id;
}

// false: não é observação deste profissional.
export async function alterarObservacao(profissional: ProfissionalDeTreino, id: string, dados: Record<string, unknown>) {
  const { titulo, texto } = campos(dados);
  const r = await obterPool().query(
    `update public.treino_observacoes set titulo = $3, texto = $4, atualizada_em = now()
      where id = $1 and profissional_id = $2 and arquivada_em is null`,
    [id, profissional.usuarioId, titulo, texto]
  );
  return (r.rowCount ?? 0) > 0;
}

// Remover do catálogo: arquiva (treinos que usaram guardam a própria cópia).
export async function arquivarObservacao(profissional: ProfissionalDeTreino, id: string) {
  const r = await obterPool().query(
    "update public.treino_observacoes set arquivada_em = now() where id = $1 and profissional_id = $2 and arquivada_em is null",
    [id, profissional.usuarioId]
  );
  return (r.rowCount ?? 0) > 0;
}

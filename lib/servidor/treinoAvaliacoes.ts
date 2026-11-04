import { hojeNoBrasil } from "@/lib/cronograma";
import { avaliacaoVazia, type AvaliacaoDoc } from "@/lib/nutricao/avaliacaoDocumento";
import { registrarAcao } from "./auditoria";
import { buscarAvaliacao } from "./avaliacoes";
import { obterPool } from "./banco";
import { podeAcompanharAluno, type ProfissionalDeTreino } from "./treinoAcesso";

// Avaliação física no Módulo de Treino (T6, respostas R7 e R7b).
//
// - Uma só história de avaliações por aluno, com os mesmos métodos da
//   Nutrição: o educador vê as do nutricionista e o nutricionista vê as do
//   educador (aluno compartilhado). Aluno próprio do educador: só ele.
// - Cada avaliação mostra a data e o autor; só o autor corrige, finaliza,
//   reabre ou exclui.
// - A do educador não tem consulta da Nutrição. O peso inicial vem da
//   última avaliação finalizada (nunca dos relatórios da Nutrição).

export type AvaliacaoNaLista = {
  id: string;
  data: string;
  status: "rascunho" | "finalizada";
  autor: string;
  minha: boolean;
  finalizada_em: string | null;
};

export async function avaliacoesDoAlunoNoTreino(profissional: ProfissionalDeTreino, patientId: string) {
  const r = await obterPool().query<AvaliacaoNaLista>(
    `select a.id, to_char(a.data, 'YYYY-MM-DD') as data, a.status, a.finalizada_em,
            coalesce(e.nome, 'Nutricionista') as autor, a.criada_por = $2 as minha
       from public.avaliacoes_fisicas a
       left join public.educadores_fisicos e on e.usuario_id = a.criada_por
      where a.patient_id = $1
        -- Rascunho de outro profissional ainda não é avaliação para ler.
        and (a.status = 'finalizada' or a.criada_por = $2)
      order by a.data desc, a.criada_em desc`,
    [patientId, profissional.usuarioId]
  );
  return r.rows;
}

export async function criarAvaliacaoDoTreino(profissional: ProfissionalDeTreino, patientId: string) {
  if (!(await podeAcompanharAluno(profissional, patientId))) return null;
  const pool = obterPool();
  const [ultima, aluno] = await Promise.all([
    pool.query<{ documento: AvaliacaoDoc }>(
      "select documento from public.avaliacoes_fisicas where patient_id = $1 and status = 'finalizada' order by data desc, criada_em desc limit 1",
      [patientId]
    ),
    pool.query<{ height_cm: string | null }>("select height_cm::text from public.patients where id = $1", [patientId]),
  ]);
  const altura = aluno.rows[0]?.height_cm;
  const documento = avaliacaoVazia(ultima.rows[0]?.documento.peso ?? null, altura === null || altura === undefined ? null : Number(altura));
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const criada = await cliente.query<{ id: string }>(
      "insert into public.avaliacoes_fisicas (patient_id, consulta_id, data, documento, criada_por) values ($1, null, $2, $3, $4) returning id",
      [patientId, hojeNoBrasil(), JSON.stringify(documento), profissional.usuarioId]
    );
    await registrarAcao(cliente, { pacienteId: patientId, tabela: "avaliacoes_fisicas", registroId: criada.rows[0].id, usuarioId: profissional.usuarioId }, "criacao", {
      modulo: "treino",
    });
    await cliente.query("commit");
    return criada.rows[0].id;
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}

// A avaliação que o profissional pode ver (acompanha o aluno; rascunho só o
// próprio) e se pode alterar (é o autor).
export async function avaliacaoParaProfissional(profissional: ProfissionalDeTreino, id: string) {
  const avaliacao = await buscarAvaliacao(id);
  if (!avaliacao || !(await podeAcompanharAluno(profissional, avaliacao.patient_id))) return null;
  const minha = avaliacao.criada_por === profissional.usuarioId;
  if (avaliacao.status === "rascunho" && !minha) return null;
  return { avaliacao, podeEditar: minha };
}

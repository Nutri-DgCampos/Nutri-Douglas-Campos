import type { PoolClient } from "pg";
import type { Sexo } from "@/lib/nutricao/avaliacao";
import { calcularAvaliacao, validarAvaliacao, type AvaliacaoDoc, type ResultadoAvaliacao } from "@/lib/nutricao/avaliacaoDocumento";
import { idadeEm } from "@/lib/nutricao/paciente";
import { registrarAcao, registrarAlteracoes } from "./auditoria";
import { obterPool } from "./banco";

// Avaliações físicas (Fase 4 da Nutrição; compartilhadas com o Treino desde
// a T6, respostas R7 e R7b).
//
// - Os métodos são os mesmos para o nutricionista e o educador físico.
// - Cada avaliação tem um autor (criada_por). Quem acompanha o aluno vê
//   todas; só o autor corrige, finaliza, reabre ou exclui a própria. A do
//   educador não tem consulta da Nutrição (consulta_id vazio).

export type LinhaAvaliacao = {
  id: string;
  patient_id: string;
  consulta_id: string | null;
  criada_por: string | null;
  data: string;
  status: "rascunho" | "finalizada";
  documento: AvaliacaoDoc;
  resultados: ResultadoAvaliacao | null;
  revisao: number;
  finalizada_em: string | null;
  criada_em: string;
};

const COLUNAS = `id, patient_id, consulta_id, criada_por, to_char(data, 'YYYY-MM-DD') as data, status, documento,
                 resultados, revisao, finalizada_em, criada_em`;

export async function buscarAvaliacao(id: string, cliente?: PoolClient, bloquear = false) {
  const resultado = await (cliente ?? obterPool()).query<LinhaAvaliacao>(
    `select ${COLUNAS} from public.avaliacoes_fisicas where id = $1 ${bloquear ? "for update" : ""}`,
    [id]
  );
  return resultado.rows[0] ?? null;
}

export async function pessoaDoPaciente(pacienteId: string) {
  const resultado = await obterPool().query<{
    name: string;
    birth_date: string | null;
    sex: Sexo | null;
    height_cm: string | null;
  }>(
    "select name, to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, height_cm::text from public.patients where id = $1",
    [pacienteId]
  );
  const p = resultado.rows[0];
  if (!p) return null;
  return { nome: p.name, nascimento: p.birth_date, sexo: p.sex, alturaCm: p.height_cm === null ? null : Number(p.height_cm) };
}

// Resultados de uma avaliação: congelados se finalizada; senão, calculados
// agora (preliminares).
export function resultadosDe(avaliacao: LinhaAvaliacao, pessoa: { sexo: Sexo | null; nascimento: string | null }) {
  if (avaliacao.status === "finalizada" && avaliacao.resultados) return avaliacao.resultados;
  return calcularAvaliacao(avaliacao.documento, { sexo: pessoa.sexo, idade: idadeEm(pessoa.nascimento, avaliacao.data) });
}

export type PontoDoHistorico = {
  id: string;
  data: string;
  status: string;
  peso: number | null;
  percentualGordura: number | null;
  massaGorda: number | null;
  massaLivre: number | null;
  metodo: "dobras" | "bioimpedancia" | null;
  perimetria: AvaliacaoDoc["perimetria"];
};

// Histórico até a avaliação indicada (nunca com avaliações posteriores):
// as finalizadas e a própria avaliação, mesmo em rascunho.
export async function historicoAte(avaliacao: LinhaAvaliacao, pessoa: { sexo: Sexo | null; nascimento: string | null }) {
  const resultado = await obterPool().query<LinhaAvaliacao>(
    `select ${COLUNAS} from public.avaliacoes_fisicas
      where patient_id = $1
        and (id = $2 or (status = 'finalizada' and (data < $3 or (data = $3 and criada_em <= $4))))
      order by data, criada_em`,
    [avaliacao.patient_id, avaliacao.id, avaliacao.data, avaliacao.criada_em]
  );

  return resultado.rows.map((linha): PontoDoHistorico => {
    const r = resultadosDe(linha, pessoa);
    return {
      id: linha.id,
      data: linha.data,
      status: linha.status,
      peso: linha.documento.peso,
      percentualGordura: r.percentualGordura,
      massaGorda: r.massaGorda,
      massaLivre: r.massaLivre,
      metodo: r.metodoComposicao,
      perimetria: linha.documento.perimetria ?? {},
    };
  });
}

// ---------------------------------------------------------------------------
// Autoria (R7b) e operações comuns à Nutrição e ao Treino

// A avaliação foi feita por um educador físico? (o nutricionista não altera)
export async function feitaPorEducador(avaliacao: Pick<LinhaAvaliacao, "criada_por">) {
  if (!avaliacao.criada_por) return false;
  const r = await obterPool().query("select 1 from public.educadores_fisicos where usuario_id = $1", [avaliacao.criada_por]);
  return (r.rowCount ?? 0) > 0;
}

export async function autorDaAvaliacao(criadaPor: string | null) {
  if (!criadaPor) return "Nutricionista";
  const r = await obterPool().query<{ nome: string }>("select nome from public.educadores_fisicos where usuario_id = $1", [criadaPor]);
  return r.rows[0]?.nome ?? "Nutricionista";
}

type Resposta = { status: number; corpo: Record<string, unknown> };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Salvamento automático do rascunho (e da data da avaliação).
export async function salvarRascunhoDaAvaliacao(id: string, dados: Record<string, unknown> | null): Promise<Resposta> {
  if (!Number.isInteger(dados?.revisao)) return { status: 400, corpo: { erro: "Revisão não informada." } };
  const data = typeof dados?.data === "string" && DATA.test(dados.data) ? dados.data : null;
  const validacao = validarAvaliacao(dados?.documento);
  if ("erro" in validacao) return { status: 400, corpo: { erro: validacao.erro } };

  const resultado = await obterPool().query<{ revisao: number; atualizada_em: string }>(
    `update public.avaliacoes_fisicas
        set documento = $2, data = coalesce($4::date, data), revisao = revisao + 1, atualizada_em = now()
      where id = $1 and revisao = $3 and status = 'rascunho'
      returning revisao, atualizada_em`,
    [id, JSON.stringify(validacao.documento), dados!.revisao, data]
  );
  if (!resultado.rows[0]) {
    const atual = await buscarAvaliacao(id);
    if (!atual) return { status: 404, corpo: { erro: "Avaliação não encontrada." } };
    if (atual.status !== "rascunho") return { status: 409, corpo: { erro: "A avaliação está finalizada. Reabra para corrigir." } };
    return { status: 409, corpo: { erro: "A avaliação foi alterada em outra janela. Recarregue para continuar." } };
  }
  return { status: 200, corpo: resultado.rows[0] };
}

// Finalizar (congela os resultados e atualiza a altura do cadastro) ou
// reabrir para correção (fica registrado).
export async function finalizarOuReabrirAvaliacao(id: string, dados: Record<string, unknown> | null, usuarioId: string): Promise<Resposta> {
  const acao = dados?.acao;
  if (acao !== "finalizar" && acao !== "reabrir") return { status: 400, corpo: { erro: "Ação inválida." } };

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const avaliacao = await buscarAvaliacao(id, cliente, true);
    if (!avaliacao) {
      await cliente.query("rollback");
      return { status: 404, corpo: { erro: "Avaliação não encontrada." } };
    }
    const registro = { pacienteId: avaliacao.patient_id, tabela: "avaliacoes_fisicas", registroId: id, usuarioId };

    if (acao === "reabrir") {
      if (avaliacao.status !== "finalizada") {
        await cliente.query("rollback");
        return { status: 409, corpo: { erro: "A avaliação já está em edição." } };
      }
      const r = await cliente.query<{ revisao: number }>(
        `update public.avaliacoes_fisicas
            set status = 'rascunho', resultados = null, finalizada_em = null, revisao = revisao + 1, atualizada_em = now()
          where id = $1 returning revisao`,
        [id]
      );
      await registrarAlteracoes(cliente, registro, { status: "finalizada" }, { status: "rascunho (reaberta para correção)" });
      await cliente.query("commit");
      return { status: 200, corpo: { revisao: r.rows[0].revisao } };
    }

    if (avaliacao.status === "finalizada") {
      await cliente.query("rollback");
      return { status: 409, corpo: { erro: "A avaliação já está finalizada." } };
    }
    if (dados?.revisao !== avaliacao.revisao) {
      await cliente.query("rollback");
      return { status: 409, corpo: { erro: "A avaliação foi alterada em outra janela. Recarregue antes de finalizar." } };
    }
    const validacao = validarAvaliacao(avaliacao.documento);
    if ("erro" in validacao) {
      await cliente.query("rollback");
      return { status: 400, corpo: { erro: validacao.erro } };
    }
    const doc = validacao.documento;
    if (!(doc.peso && doc.peso > 0)) {
      await cliente.query("rollback");
      return { status: 400, corpo: { erro: "Informe o peso antes de finalizar." } };
    }

    const pessoa = await pessoaDoPaciente(avaliacao.patient_id);
    const resultados = calcularAvaliacao(doc, { sexo: pessoa?.sexo ?? null, idade: idadeEm(pessoa?.nascimento, avaliacao.data) });
    const r = await cliente.query<{ revisao: number }>(
      `update public.avaliacoes_fisicas
          set status = 'finalizada', resultados = $2, finalizada_em = now(), revisao = revisao + 1, atualizada_em = now()
        where id = $1 returning revisao`,
      [id, JSON.stringify(resultados)]
    );

    // Altura nova vira a altura atual do cadastro, se esta é a avaliação
    // mais recente (corrigir uma avaliação antiga não muda o valor atual).
    if (doc.alturaCm && pessoa && pessoa.alturaCm !== doc.alturaCm) {
      const maisRecente = await cliente.query(
        `select 1 from public.avaliacoes_fisicas
          where patient_id = $1 and status = 'finalizada' and id <> $2 and data > $3 limit 1`,
        [avaliacao.patient_id, id, avaliacao.data]
      );
      if (!maisRecente.rowCount) {
        await cliente.query("update public.patients set height_cm = $2 where id = $1", [avaliacao.patient_id, doc.alturaCm]);
        await registrarAlteracoes(cliente, { ...registro, tabela: "patients", registroId: avaliacao.patient_id }, { height_cm: pessoa.alturaCm }, { height_cm: doc.alturaCm });
      }
    }

    await registrarAcao(cliente, registro, "finalizacao", { data: avaliacao.data, peso: doc.peso, altura: doc.alturaCm });
    await cliente.query("commit");
    return { status: 200, corpo: { revisao: r.rows[0].revisao } };
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro na avaliação física:", erro);
    return { status: 500, corpo: { erro: "Não foi possível concluir a ação." } };
  } finally {
    cliente.release();
  }
}

// Excluir: só rascunho (o banco também garante).
export async function excluirAvaliacao(id: string, usuarioId: string): Promise<Resposta> {
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const avaliacao = await buscarAvaliacao(id, cliente, true);
    if (!avaliacao) {
      await cliente.query("rollback");
      return { status: 404, corpo: { erro: "Avaliação não encontrada." } };
    }
    await cliente.query("delete from public.avaliacoes_fisicas where id = $1", [id]);
    await registrarAcao(cliente, { pacienteId: avaliacao.patient_id, tabela: "avaliacoes_fisicas", registroId: id, usuarioId }, "exclusao", { data: avaliacao.data });
    await cliente.query("commit");
    return { status: 200, corpo: { sucesso: true } };
  } catch (erro) {
    await cliente.query("rollback");
    if ((erro as { code?: string }).code === "P0001") return { status: 409, corpo: { erro: (erro as Error).message } };
    console.error("Erro ao excluir avaliação:", erro);
    return { status: 500, corpo: { erro: "Não foi possível excluir a avaliação." } };
  } finally {
    cliente.release();
  }
}
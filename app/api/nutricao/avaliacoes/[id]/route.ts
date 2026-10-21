import { NextResponse } from "next/server";
import { calcularAvaliacao, validarAvaliacao } from "@/lib/nutricao/avaliacaoDocumento";
import { idadeEm } from "@/lib/nutricao/paciente";
import { registrarAcao, registrarAlteracoes } from "@/lib/servidor/auditoria";
import { buscarAvaliacao, historicoAte, pessoaDoPaciente, resultadosDe } from "@/lib/servidor/avaliacoes";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Avaliação com resultados (preliminares, se em rascunho), histórico até a
// data dela e os PDFs já enviados.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const avaliacao = await buscarAvaliacao(id);
  if (!avaliacao) return recusar("Avaliação não encontrada.", 404);

  const pessoa = await pessoaDoPaciente(avaliacao.patient_id);
  if (!pessoa) return recusar("Paciente não encontrado.", 404);

  const [historico, envios, consulta] = await Promise.all([
    historicoAte(avaliacao, pessoa),
    obterPool().query(
      "select id, numero, file_name, storage_path, enviada_em from public.avaliacoes_envios where avaliacao_id = $1 order by numero desc",
      [id]
    ),
    obterPool().query<{ data: string }>("select to_char(data, 'YYYY-MM-DD') as data from public.consultas where id = $1", [
      avaliacao.consulta_id,
    ]),
  ]);

  return NextResponse.json({
    avaliacao,
    paciente: { nome: pessoa.nome, sexo: pessoa.sexo, idade: idadeEm(pessoa.nascimento, avaliacao.data), nascimento: pessoa.nascimento },
    consulta: consulta.rows[0] ?? null,
    resultados: resultadosDe(avaliacao, pessoa),
    historico,
    envios: envios.rows,
  });
}

// Salvamento automático do rascunho (e da data da avaliação).
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const dados = await request.json().catch(() => null);
  if (!Number.isInteger(dados?.revisao)) return recusar("Revisão não informada.", 400);
  const data = typeof dados?.data === "string" && DATA.test(dados.data) ? dados.data : null;

  const validacao = validarAvaliacao(dados?.documento);
  if ("erro" in validacao) return recusar(validacao.erro, 400);

  const resultado = await obterPool().query<{ revisao: number; atualizada_em: string }>(
    `update public.avaliacoes_fisicas
        set documento = $2, data = coalesce($4::date, data), revisao = revisao + 1, atualizada_em = now()
      where id = $1 and revisao = $3 and status = 'rascunho'
      returning revisao, atualizada_em`,
    [id, JSON.stringify(validacao.documento), dados.revisao, data]
  );

  if (!resultado.rows[0]) {
    const atual = await buscarAvaliacao(id);
    if (!atual) return recusar("Avaliação não encontrada.", 404);
    if (atual.status !== "rascunho") return recusar("A avaliação está finalizada. Reabra para corrigir.", 409);
    return recusar("A avaliação foi alterada em outra janela. Recarregue para continuar.", 409);
  }

  return NextResponse.json(resultado.rows[0]);
}

// Finalizar (congela os resultados e atualiza a altura do cadastro) ou
// reabrir para correção (fica registrado).
export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const dados = await request.json().catch(() => null);
  const acao = dados?.acao;
  if (acao !== "finalizar" && acao !== "reabrir") return recusar("Ação inválida.", 400);

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const avaliacao = await buscarAvaliacao(id, cliente, true);
    if (!avaliacao) {
      await cliente.query("rollback");
      return recusar("Avaliação não encontrada.", 404);
    }
    const registro = { pacienteId: avaliacao.patient_id, tabela: "avaliacoes_fisicas", registroId: id, usuarioId: contexto.usuarioId };

    if (acao === "reabrir") {
      if (avaliacao.status !== "finalizada") {
        await cliente.query("rollback");
        return recusar("A avaliação já está em edição.", 409);
      }
      const r = await cliente.query<{ revisao: number }>(
        `update public.avaliacoes_fisicas
            set status = 'rascunho', resultados = null, finalizada_em = null, revisao = revisao + 1, atualizada_em = now()
          where id = $1 returning revisao`,
        [id]
      );
      await registrarAlteracoes(cliente, registro, { status: "finalizada" }, { status: "rascunho (reaberta para correção)" });
      await cliente.query("commit");
      return NextResponse.json({ revisao: r.rows[0].revisao });
    }

    if (avaliacao.status === "finalizada") {
      await cliente.query("rollback");
      return recusar("A avaliação já está finalizada.", 409);
    }
    if (dados?.revisao !== avaliacao.revisao) {
      await cliente.query("rollback");
      return recusar("A avaliação foi alterada em outra janela. Recarregue antes de finalizar.", 409);
    }

    const validacao = validarAvaliacao(avaliacao.documento);
    if ("erro" in validacao) {
      await cliente.query("rollback");
      return recusar(validacao.erro, 400);
    }
    const doc = validacao.documento;
    if (!(doc.peso && doc.peso > 0)) {
      await cliente.query("rollback");
      return recusar("Informe o peso antes de finalizar.", 400);
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
        await registrarAlteracoes(
          cliente,
          { ...registro, tabela: "patients", registroId: avaliacao.patient_id },
          { height_cm: pessoa.alturaCm },
          { height_cm: doc.alturaCm }
        );
      }
    }

    await registrarAcao(cliente, registro, "finalizacao", { data: avaliacao.data, peso: doc.peso, altura: doc.alturaCm });
    await cliente.query("commit");
    return NextResponse.json({ revisao: r.rows[0].revisao });
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro na avaliação física:", erro);
    return recusar("Não foi possível concluir a ação.", 500);
  } finally {
    cliente.release();
  }
}

// Excluir: só rascunho (o banco também garante).
export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const avaliacao = await buscarAvaliacao(id, cliente, true);
    if (!avaliacao) {
      await cliente.query("rollback");
      return recusar("Avaliação não encontrada.", 404);
    }
    await cliente.query("delete from public.avaliacoes_fisicas where id = $1", [id]);
    await registrarAcao(
      cliente,
      { pacienteId: avaliacao.patient_id, tabela: "avaliacoes_fisicas", registroId: id, usuarioId: contexto.usuarioId },
      "exclusao",
      { data: avaliacao.data }
    );
    await cliente.query("commit");
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    await cliente.query("rollback");
    if ((erro as { code?: string }).code === "P0001") return recusar((erro as Error).message, 409);
    console.error("Erro ao excluir avaliação:", erro);
    return recusar("Não foi possível excluir a avaliação.", 500);
  } finally {
    cliente.release();
  }
}

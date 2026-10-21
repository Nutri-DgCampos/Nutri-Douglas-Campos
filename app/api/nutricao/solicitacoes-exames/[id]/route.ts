import { NextResponse } from "next/server";
import { LIMITES_EXAMES, validarListaDeExames } from "@/lib/nutricao/exames";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Solicitação inválida.", 400);
  const pool = obterPool();
  const s = await pool.query(
    `select s.*, p.name as paciente, to_char(c.data, 'YYYY-MM-DD') as consulta_data,
            (select json_agg(json_build_object('id', b.id, 'file_name', b.file_name, 'exam_name', b.exam_name) order by b.uploaded_at)
               from public.blood_exams b where b.solicitacao_id = s.id) as resultados,
            (select json_agg(json_build_object('id', d.id, 'enviado_em', d.enviado_em, 'storage_path', d.storage_path) order by d.enviado_em)
               from public.documentos_enviados d where d.tipo = 'solicitacao_exames' and d.referencia_id = s.id) as envios
       from public.solicitacoes_exames s
       join public.patients p on p.id = s.patient_id
       join public.consultas c on c.id = s.consulta_id
      where s.id = $1`,
    [id]
  );
  if (!s.rows[0]) return recusar("Solicitação não encontrada.", 404);
  return NextResponse.json({ solicitacao: s.rows[0] });
}

// Salvamento automático (só antes da emissão).
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Solicitação inválida.", 400);
  const dados = await request.json().catch(() => null);
  const exames = validarListaDeExames(dados?.exames);
  if ("erro" in exames) return recusar(exames.erro, 400);
  const titulo = typeof dados?.titulo === "string" ? dados.titulo.slice(0, 200) : "";
  const observacoes = typeof dados?.observacoes === "string" ? dados.observacoes.slice(0, LIMITES_EXAMES.observacoes) : "";
  const gravado = await obterPool().query<{ revisao: number }>(
    `update public.solicitacoes_exames
        set titulo = $2, exames = $3, observacoes = $4, revisao = revisao + 1, atualizada_em = now()
      where id = $1 and revisao = $5 and emitida_em is null returning revisao`,
    [id, titulo.trim() || "Solicitação de exames", JSON.stringify(exames.valor), observacoes, dados?.revisao]
  );
  if (!gravado.rows[0]) return recusar("A solicitação já foi emitida ou foi alterada em outra janela. Recarregue.", 409);
  return NextResponse.json(gravado.rows[0]);
}

// Excluir só antes da emissão.
export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Solicitação inválida.", 400);
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const s = await cliente.query<{ patient_id: string; titulo: string; emitida_em: string | null }>(
      "select patient_id, titulo, emitida_em from public.solicitacoes_exames where id = $1 for update",
      [id]
    );
    if (!s.rows[0]) {
      await cliente.query("rollback");
      return recusar("Solicitação não encontrada.", 404);
    }
    if (s.rows[0].emitida_em) {
      await cliente.query("rollback");
      return recusar("Solicitação emitida não pode ser excluída.", 409);
    }
    await cliente.query("delete from public.solicitacoes_exames where id = $1", [id]);
    await registrarAcao(
      cliente,
      { pacienteId: s.rows[0].patient_id, tabela: "solicitacoes_exames", registroId: id, usuarioId: contexto.usuarioId },
      "exclusao",
      { titulo: s.rows[0].titulo }
    );
    await cliente.query("commit");
    return NextResponse.json({ ok: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao excluir solicitação:", erro);
    return recusar("Não foi possível excluir.", 500);
  } finally {
    cliente.release();
  }
}

import { NextResponse } from "next/server";
import { validarOrientacao } from "@/lib/nutricao/orientacao";
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
  if (!UUID.test(id)) return recusar("Orientação inválida.", 400);
  const o = await obterPool().query(
    `select o.*, p.name as paciente, to_char(c.data, 'YYYY-MM-DD') as consulta_data,
            (select json_agg(json_build_object('id', d.id, 'enviado_em', d.enviado_em, 'storage_path', d.storage_path, 'file_name', d.file_name) order by d.enviado_em)
               from public.documentos_enviados d where d.tipo = 'orientacao' and d.referencia_id = o.id) as envios
       from public.orientacoes o join public.patients p on p.id = o.patient_id join public.consultas c on c.id = o.consulta_id
      where o.id = $1`,
    [id]
  );
  if (!o.rows[0]) return recusar("Orientação não encontrada.", 404);
  return NextResponse.json({ orientacao: o.rows[0] });
}

// Salvamento automático. Editar depois de enviar não muda o PDF enviado;
// para o paciente receber a versão nova, envie de novo.
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Orientação inválida.", 400);
  const dados = await request.json().catch(() => null);
  const conteudo = validarOrientacao(dados?.conteudo);
  if ("erro" in conteudo) return recusar(conteudo.erro, 400);
  const titulo = typeof dados?.titulo === "string" && dados.titulo.trim() ? dados.titulo.trim().slice(0, 200) : "Orientação";
  const gravado = await obterPool().query<{ revisao: number }>(
    `update public.orientacoes set titulo = $2, conteudo = $3, revisao = revisao + 1, atualizada_em = now()
      where id = $1 and revisao = $4 and arquivada_em is null returning revisao`,
    [id, titulo, JSON.stringify({ blocos: conteudo.valor.blocos, assinatura: conteudo.valor.assinatura }), dados?.revisao]
  );
  if (!gravado.rows[0]) return recusar("A orientação foi alterada em outra janela ou está arquivada. Recarregue.", 409);
  return NextResponse.json(gravado.rows[0]);
}

export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Orientação inválida.", 400);
  const acao = (await request.json().catch(() => null))?.acao;
  if (acao !== "arquivar" && acao !== "desarquivar") return recusar("Ação inválida.", 400);
  await obterPool().query(
    `update public.orientacoes set arquivada_em = ${acao === "arquivar" ? "now()" : "null"}, revisao = revisao + 1 where id = $1`,
    [id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Orientação inválida.", 400);
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const o = await cliente.query<{ patient_id: string; titulo: string }>("select patient_id, titulo from public.orientacoes where id = $1", [id]);
    if (!o.rows[0]) {
      await cliente.query("rollback");
      return recusar("Orientação não encontrada.", 404);
    }
    await cliente.query("delete from public.orientacoes where id = $1", [id]);
    await registrarAcao(
      cliente,
      { pacienteId: o.rows[0].patient_id, tabela: "orientacoes", registroId: id, usuarioId: contexto.usuarioId },
      "exclusao",
      { titulo: o.rows[0].titulo }
    );
    await cliente.query("commit");
    return NextResponse.json({ ok: true });
  } catch {
    await cliente.query("rollback").catch(() => undefined);
    return recusar("Orientação já enviada ao paciente: arquive em vez de excluir.", 409);
  } finally {
    cliente.release();
  }
}

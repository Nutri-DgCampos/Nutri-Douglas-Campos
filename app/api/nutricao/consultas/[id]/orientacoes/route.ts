import { NextResponse } from "next/server";
import { conteudoVazio } from "@/lib/nutricao/orientacao";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { copiarModeloParaConsulta } from "@/lib/servidor/orientacoes";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const pool = obterPool();
  const [orientacoes, modelos] = await Promise.all([
    pool.query(
      `select o.id, o.titulo, o.arquivada_em, o.criada_em,
              (select max(d.enviado_em) from public.documentos_enviados d where d.tipo = 'orientacao' and d.referencia_id = o.id) as enviada_em
         from public.orientacoes o where o.consulta_id = $1 order by o.criada_em`,
      [id]
    ),
    pool.query("select id, nome from public.modelos_orientacoes where arquivado_em is null order by nome"),
  ]);
  return NextResponse.json({ orientacoes: orientacoes.rows, modelos: modelos.rows });
}

// Nova orientação na consulta: cópia de um modelo ou em branco.
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const dados = await request.json().catch(() => null);
  const modeloId = dados?.modeloId && UUID.test(String(dados.modeloId)) ? String(dados.modeloId) : null;

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const consulta = await cliente.query<{ patient_id: string }>("select patient_id from public.consultas where id = $1", [id]);
    if (!consulta.rows[0]) {
      await cliente.query("rollback");
      return recusar("Consulta não encontrada.", 404);
    }
    const novoId = modeloId
      ? await copiarModeloParaConsulta(cliente, { modeloId, consultaId: id, usuarioId: contexto.usuarioId })
      : (
          await cliente.query<{ id: string }>(
            `insert into public.orientacoes (patient_id, consulta_id, titulo, conteudo, criada_por)
             values ($1, $2, 'Orientação', $3, $4) returning id`,
            [consulta.rows[0].patient_id, id, JSON.stringify(conteudoVazio()), contexto.usuarioId]
          )
        ).rows[0].id;
    if (!novoId) {
      await cliente.query("rollback");
      return recusar("Modelo não encontrado ou arquivado.", 404);
    }
    await registrarAcao(
      cliente,
      { pacienteId: consulta.rows[0].patient_id, tabela: "orientacoes", registroId: novoId, usuarioId: contexto.usuarioId },
      "criacao",
      { modelo_id: modeloId }
    );
    await cliente.query("commit");
    return NextResponse.json({ id: novoId }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao criar orientação:", erro);
    return recusar("Não foi possível criar a orientação.", 500);
  } finally {
    cliente.release();
  }
}

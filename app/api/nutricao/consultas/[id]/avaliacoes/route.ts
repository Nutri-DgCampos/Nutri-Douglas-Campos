import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { avaliacaoVazia } from "@/lib/nutricao/avaliacaoDocumento";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, pesoMaisRecente } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Avaliações físicas da consulta.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);

  const resultado = await obterPool().query(
    `select a.id, to_char(a.data, 'YYYY-MM-DD') as data, a.status, a.finalizada_em,
            (select count(*)::int from public.avaliacoes_envios e where e.avaliacao_id = a.id) as envios
       from public.avaliacoes_fisicas a
      where a.consulta_id = $1
      order by a.data, a.criada_em`,
    [id]
  );
  return NextResponse.json({ avaliacoes: resultado.rows });
}

// Nova avaliação: começa como rascunho, com o último peso válido do
// histórico e a altura atual do cadastro (o nutricionista pode alterar).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);

  const pool = obterPool();
  const consulta = await pool.query<{ patient_id: string; height_cm: string | null }>(
    `select c.patient_id, p.height_cm::text
       from public.consultas c join public.patients p on p.id = c.patient_id
      where c.id = $1`,
    [id]
  );
  if (!consulta.rows[0]) return recusar("Consulta não encontrada.", 404);

  const { patient_id: pacienteId, height_cm } = consulta.rows[0];
  const peso = await pesoMaisRecente(pacienteId);
  const documento = avaliacaoVazia(peso?.valor ?? null, height_cm === null ? null : Number(height_cm));

  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const criada = await cliente.query<{ id: string }>(
      `insert into public.avaliacoes_fisicas (patient_id, consulta_id, data, documento, criada_por)
       values ($1, $2, $3, $4, $5) returning id`,
      [pacienteId, id, hojeNoBrasil(), JSON.stringify(documento), contexto.usuarioId]
    );
    await registrarAcao(
      cliente,
      { pacienteId, tabela: "avaliacoes_fisicas", registroId: criada.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { consulta_id: id }
    );
    await cliente.query("commit");
    return NextResponse.json({ id: criada.rows[0].id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro ao criar avaliação física:", erro);
    return recusar("Não foi possível criar a avaliação.", 500);
  } finally {
    cliente.release();
  }
}

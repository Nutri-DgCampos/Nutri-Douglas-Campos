import { NextResponse } from "next/server";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Exames da consulta (vinculados), exames do paciente ainda sem consulta,
// solicitações de exames e modelos disponíveis.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);

  const pool = obterPool();
  const consulta = await pool.query<{ patient_id: string }>("select patient_id from public.consultas where id = $1", [id]);
  if (!consulta.rows[0]) return recusar("Consulta não encontrada.", 404);
  const pacienteId = consulta.rows[0].patient_id;

  const [exames, solicitacoes, modelos] = await Promise.all([
    pool.query(
      `select id, file_name, storage_path, uploaded_at, exam_name, to_char(exam_date, 'YYYY-MM-DD') as exam_date,
              consulta_id, solicitacao_id, analysis_status
         from public.blood_exams
        where patient_id = $1 and (consulta_id = $2 or consulta_id is null)
        order by uploaded_at desc`,
      [pacienteId, id]
    ),
    pool.query(
      `select id, titulo, jsonb_array_length(exames) as quantidade, emitida_em, criada_em
         from public.solicitacoes_exames where consulta_id = $1 order by criada_em`,
      [id]
    ),
    pool.query("select id, nome from public.modelos_exames where arquivado_em is null order by nome"),
  ]);
  return NextResponse.json({ exames: exames.rows, solicitacoes: solicitacoes.rows, modelos: modelos.rows });
}

// Nova solicitação de exames (a partir de um modelo ou em branco).
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const dados = await request.json().catch(() => null);
  const modeloId = dados?.modeloId && UUID.test(String(dados.modeloId)) ? String(dados.modeloId) : null;

  const pool = obterPool();
  const consulta = await pool.query<{ patient_id: string }>("select patient_id from public.consultas where id = $1", [id]);
  if (!consulta.rows[0]) return recusar("Consulta não encontrada.", 404);

  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    let titulo = "Solicitação de exames";
    let exames: unknown = [];
    if (modeloId) {
      const modelo = await cliente.query<{ nome: string; exames: { id: string; nome: string }[] }>(
        "select nome, exames from public.modelos_exames where id = $1 and arquivado_em is null",
        [modeloId]
      );
      if (!modelo.rows[0]) {
        await cliente.query("rollback");
        return recusar("Modelo não encontrado ou arquivado.", 404);
      }
      titulo = modelo.rows[0].nome;
      // Cópia com identificadores novos: alterar aqui não muda o modelo.
      exames = modelo.rows[0].exames.filter((e) => e.nome.trim()).map((e) => ({ id: crypto.randomUUID(), nome: e.nome }));
      await cliente.query("update public.modelos_exames set usos = usos + 1 where id = $1", [modeloId]);
    }
    const criada = await cliente.query<{ id: string }>(
      `insert into public.solicitacoes_exames (patient_id, consulta_id, modelo_id, titulo, exames, criada_por)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [consulta.rows[0].patient_id, id, modeloId, titulo, JSON.stringify(exames), contexto.usuarioId]
    );
    await registrarAcao(
      cliente,
      { pacienteId: consulta.rows[0].patient_id, tabela: "solicitacoes_exames", registroId: criada.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { titulo }
    );
    await cliente.query("commit");
    return NextResponse.json({ id: criada.rows[0].id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao criar solicitação de exames:", erro);
    return recusar("Não foi possível criar a solicitação.", 500);
  } finally {
    cliente.release();
  }
}

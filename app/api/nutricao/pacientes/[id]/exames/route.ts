import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Exames do paciente (histórico) e solicitações, para a ficha.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Paciente inválido.", 400);
  const pool = obterPool();
  const [exames, solicitacoes, consultas] = await Promise.all([
    pool.query(
      `select b.id, b.file_name, b.storage_path, b.uploaded_at, b.exam_name, to_char(b.exam_date, 'YYYY-MM-DD') as exam_date,
              b.consulta_id, to_char(c.data, 'YYYY-MM-DD') as consulta_data, b.solicitacao_id, b.analysis_status
         from public.blood_exams b left join public.consultas c on c.id = b.consulta_id
        where b.patient_id = $1 order by b.uploaded_at desc`,
      [id]
    ),
    pool.query(
      `select s.id, s.titulo, s.consulta_id, to_char(c.data, 'YYYY-MM-DD') as consulta_data, s.emitida_em
         from public.solicitacoes_exames s join public.consultas c on c.id = s.consulta_id
        where s.patient_id = $1 order by s.criada_em desc`,
      [id]
    ),
    pool.query("select id, to_char(data, 'YYYY-MM-DD') as data from public.consultas where patient_id = $1 order by data desc", [id]),
  ]);
  return NextResponse.json({ exames: exames.rows, solicitacoes: solicitacoes.rows, consultas: consultas.rows });
}

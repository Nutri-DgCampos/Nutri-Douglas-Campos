import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import type { LinhaFormulario } from "@/lib/servidor/formularios";
import { resumoDoFormulario } from "@/lib/servidor/formulariosNutricionista";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Todas as anamneses e recordatórios do paciente (histórico e importação).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Paciente inválido.", 400);

  const pool = obterPool();
  const consultaData = "(select to_char(c.data, 'YYYY-MM-DD') from public.consultas c where c.id = f.consulta_id) as consulta_data";
  const [anamneses, recordatorios] = await Promise.all([
    pool.query<LinhaFormulario & { consulta_data: string }>(
      `select f.*, ${consultaData} from public.anamneses f where f.patient_id = $1 order by f.criado_em desc`,
      [id]
    ),
    pool.query<LinhaFormulario & { consulta_data: string }>(
      `select f.*, ${consultaData} from public.recordatorios f where f.patient_id = $1 order by f.criado_em desc`,
      [id]
    ),
  ]);
  return NextResponse.json({
    anamneses: anamneses.rows.map((f) => ({ ...resumoDoFormulario(f), consulta_data: f.consulta_data })),
    recordatorios: recordatorios.rows.map((f) => ({ ...resumoDoFormulario(f), consulta_data: f.consulta_data, conteudo: f.conteudo })),
  });
}

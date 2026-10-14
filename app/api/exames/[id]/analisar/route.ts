import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { analisarExame } from "@/lib/servidor/exames";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Refaz a análise de um exame (por exemplo, depois de uma falha).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Exame inválido.", 400);
  }

  await analisarExame(id);

  const resultado = await obterPool().query(
    `select analysis_status, analysis_text, analysis_error, analyzed_at
       from public.blood_exams where id = $1`,
    [id]
  );

  if (resultado.rowCount === 0) {
    return recusar("Exame não encontrado.", 404);
  }

  return NextResponse.json(resultado.rows[0]);
}

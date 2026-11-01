import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { prescricaoVigente, registrosParaProfissional } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// Profissional: prescrição vigente, sessões registradas pelo aluno e
// histórico completo de cargas por exercício (o aluno vê só a anterior).
export async function GET(request: Request, { params }: { params: Promise<{ pacienteId: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { pacienteId } = await params;
  if (!UUID.test(pacienteId)) return recusar("Paciente inválido.", 400);
  const [prescricao, registros] = await Promise.all([prescricaoVigente(pacienteId), registrosParaProfissional(pacienteId)]);
  return NextResponse.json({ prescricao, ...registros });
}

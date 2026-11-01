import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { prescricaoVigente, registrosParaProfissional } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// Profissional: prescrição vigente, sessões registradas pelo aluno e
// histórico completo de cargas por exercício (o aluno vê só a anterior).
export async function GET(request: Request, { params }: { params: Promise<{ pacienteId: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { pacienteId } = await params;
  if (!UUID.test(pacienteId) || !(await podeAcompanharAluno(profissional, pacienteId))) return recusar("Aluno não encontrado.", 404);
  const [prescricao, registros] = await Promise.all([prescricaoVigente(pacienteId), registrosParaProfissional(pacienteId)]);
  return NextResponse.json({ prescricao, ...registros });
}

import { NextResponse } from "next/server";
import { hojeNoBrasil, somarDias } from "@/lib/cronograma";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { atividadesDoAluno, equipamentosDoAluno } from "@/lib/servidor/treinoAtividades";
import { prescricaoVigente, registrosParaProfissional } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// Profissional: prescrição vigente, sessões registradas pelo aluno,
// histórico completo de cargas por exercício (o aluno vê só a anterior) e,
// desde a T4b, corridas, pedais, tênis e bicicletas.
export async function GET(request: Request, { params }: { params: Promise<{ pacienteId: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { pacienteId } = await params;
  if (!UUID.test(pacienteId) || !(await podeAcompanharAluno(profissional, pacienteId))) return recusar("Aluno não encontrado.", 404);
  const [prescricao, registros, atividades, equipamentos] = await Promise.all([
    prescricaoVigente(pacienteId),
    registrosParaProfissional(pacienteId),
    atividadesDoAluno(pacienteId, somarDias(hojeNoBrasil(), -84)),
    equipamentosDoAluno(pacienteId),
  ]);
  return NextResponse.json({ prescricao, ...registros, atividades, equipamentos });
}

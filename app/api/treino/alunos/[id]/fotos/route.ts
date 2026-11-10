import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { fotosParaOTreino } from "@/lib/servidor/fotosDoAluno";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Fotos de evolução do aluno para o Comparativo de fotos do Treino: só o
// profissional que acompanha o aluno (vínculo conferido aqui).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  return NextResponse.json(await fotosParaOTreino(id));
}

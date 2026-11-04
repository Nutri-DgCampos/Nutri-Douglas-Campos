import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { avaliacoesDoAlunoNoTreino, criarAvaliacaoDoTreino } from "@/lib/servidor/treinoAvaliacoes";

export const runtime = "nodejs";

// Avaliações físicas do aluno, de todos os profissionais que o acompanham
// (R7): finalizadas de todos e os rascunhos do próprio profissional.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  return NextResponse.json({ avaliacoes: await avaliacoesDoAlunoNoTreino(profissional, id) });
}

// Nova avaliação feita pelo profissional do Treino (mesmos métodos da Nutrição).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Aluno não encontrado.", 404);
  try {
    const avaliacaoId = await criarAvaliacaoDoTreino(profissional, id);
    if (!avaliacaoId) return recusar("Aluno não encontrado.", 404);
    return NextResponse.json({ id: avaliacaoId }, { status: 201 });
  } catch (erro) {
    console.error("Erro ao criar avaliação física no Treino:", erro);
    return recusar("Não foi possível criar a avaliação.", 500);
  }
}

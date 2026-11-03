import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { DadoInvalido, academiaDoAluno, definirAcademiaDoAluno } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Academia do aluno (o profissional que o acompanha define; null tira).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Aluno não encontrado.", 404);
  const dados = (await request.json().catch(() => null)) ?? {};
  if (dados.academiaId !== null && !(typeof dados.academiaId === "string" && UUID.test(dados.academiaId))) return recusar("Academia inválida.", 400);
  try {
    if (!(await definirAcademiaDoAluno(profissional, id, dados.academiaId))) return recusar("Aluno não encontrado.", 404);
    return NextResponse.json({ academia: await academiaDoAluno(id) });
  } catch (erro) {
    if (erro instanceof DadoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao definir a academia do aluno:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

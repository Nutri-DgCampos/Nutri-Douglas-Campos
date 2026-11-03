import { NextResponse } from "next/server";
import { recusar } from "@/lib/servidor/http";
import { DadoInvalido, criarModelo, listarModelos } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Modelos de treino: os próprios e os compartilhados.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  return NextResponse.json({ modelos: await listarModelos(profissional) });
}

// "Salvar como modelo" (sem cargas nem observações do aluno).
export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    const id = await criarModelo(profissional, await request.json().catch(() => null));
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof DadoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao salvar modelo de treino:", erro);
    return recusar("Não foi possível salvar o modelo.", 500);
  }
}

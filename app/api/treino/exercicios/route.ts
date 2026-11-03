import { NextResponse } from "next/server";
import { recusar } from "@/lib/servidor/http";
import { DadoInvalido, criarExercicio, listarExercicios } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Biblioteca de exercícios (T4a): busca por nome ou grupo e cadastro.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const url = new URL(request.url);
  return NextResponse.json({
    exercicios: await listarExercicios(profissional, url.searchParams.get("q") ?? "", url.searchParams.get("arquivados") === "1"),
  });
}

export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    const id = await criarExercicio(profissional, await request.json().catch(() => null));
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof DadoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao cadastrar exercício:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

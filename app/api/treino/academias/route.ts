import { NextResponse } from "next/server";
import { recusar } from "@/lib/servidor/http";
import { DadoInvalido, criarAcademia, listarAcademias } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Academias e equipamentos (resposta C5).
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const arquivadas = new URL(request.url).searchParams.get("arquivadas") === "1";
  return NextResponse.json({ academias: await listarAcademias(profissional, arquivadas) });
}

export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    const id = await criarAcademia(profissional, await request.json().catch(() => null));
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof DadoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao cadastrar academia:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

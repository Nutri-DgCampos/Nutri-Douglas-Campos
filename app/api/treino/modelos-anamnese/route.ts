import { NextResponse } from "next/server";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { AnamneseInvalida, criarModelo, listarModelos } from "@/lib/servidor/treinoFormularios";

export const runtime = "nodejs";

// Modelos de anamnese do Treino: os do profissional e os compartilhados.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const arquivados = new URL(request.url).searchParams.get("arquivados") === "1";
  return NextResponse.json({ modelos: await listarModelos(profissional, arquivados) });
}

export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    return NextResponse.json(await criarModelo(profissional, (await request.json().catch(() => ({}))) ?? {}), { status: 201 });
  } catch (erro) {
    if (erro instanceof AnamneseInvalida) return recusar(erro.message, 400);
    console.error("Erro ao criar modelo de anamnese do Treino:", erro);
    return recusar("Não foi possível criar o modelo.", 500);
  }
}

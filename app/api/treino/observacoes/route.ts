import { NextResponse } from "next/server";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { criarObservacao, listarObservacoes, ObservacaoInvalida } from "@/lib/servidor/treinoObservacoes";

export const runtime = "nodejs";

// Catálogo de observações do treino do profissional conectado (?q= busca
// pelo título). SPEC complementar 06/11, item 2.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  return NextResponse.json({ observacoes: await listarObservacoes(profissional, new URL(request.url).searchParams.get("q") ?? "") });
}

export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    const id = await criarObservacao(profissional, (await request.json().catch(() => ({}))) ?? {});
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof ObservacaoInvalida) return recusar(erro.message, 400);
    console.error("Erro ao criar observação do treino:", erro);
    return recusar("Não foi possível salvar a observação.", 500);
  }
}

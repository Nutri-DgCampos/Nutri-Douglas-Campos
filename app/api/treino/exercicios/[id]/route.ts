import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { DadoInvalido, alterarExercicio } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Alterar, arquivar ou reativar um exercício da biblioteca (quem cadastrou;
// os da lista inicial, só o administrador).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Exercício não encontrado.", 404);
  try {
    const ok = await alterarExercicio(profissional, id, await request.json().catch(() => null));
    return ok ? NextResponse.json({ ok: true }) : recusar("Exercício não encontrado ou sem permissão para alterar.", 404);
  } catch (erro) {
    if (erro instanceof DadoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao alterar exercício:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

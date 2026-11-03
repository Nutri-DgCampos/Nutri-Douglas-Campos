import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { DadoInvalido, alterarAcademia } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Alterar, arquivar ou reativar uma academia (quem cadastrou ou o administrador).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Academia não encontrada.", 404);
  try {
    const ok = await alterarAcademia(profissional, id, await request.json().catch(() => null));
    return ok ? NextResponse.json({ ok: true }) : recusar("Academia não encontrada ou sem permissão para alterar.", 404);
  } catch (erro) {
    if (erro instanceof DadoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao alterar academia:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

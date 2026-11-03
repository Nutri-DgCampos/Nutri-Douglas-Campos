import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { arquivarModelo } from "@/lib/servidor/treinoBiblioteca";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Arquivar um modelo (quem criou ou o administrador). Programas criados a
// partir dele não mudam.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await arquivarModelo(profissional, id))) return recusar("Modelo não encontrado.", 404);
  return NextResponse.json({ ok: true });
}

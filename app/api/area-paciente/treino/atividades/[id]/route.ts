import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { excluirAtividade } from "@/lib/servidor/treinoAtividades";

export const runtime = "nodejs";

// Apagar uma atividade registrada por engano (desta semana ou da anterior).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  const { id } = await params;
  if (!UUID.test(id) || !(await excluirAtividade(pacienteId, id))) return recusar("Registro não encontrado ou de uma semana já fechada.", 404);
  return NextResponse.json({ ok: true });
}

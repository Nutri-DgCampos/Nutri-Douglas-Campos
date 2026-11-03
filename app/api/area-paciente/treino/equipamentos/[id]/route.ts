import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { AtividadeInvalida, alterarEquipamento, equipamentosDoAluno } from "@/lib/servidor/treinoAtividades";

export const runtime = "nodejs";

// Alterar, aposentar ou reativar um tênis ou bicicleta do aluno.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Equipamento não encontrado.", 404);
  try {
    if (!(await alterarEquipamento(pacienteId, id, await request.json().catch(() => null)))) return recusar("Equipamento não encontrado.", 404);
    return NextResponse.json({ equipamentos: await equipamentosDoAluno(pacienteId) });
  } catch (erro) {
    if (erro instanceof AtividadeInvalida) return recusar(erro.message, 400);
    console.error("Erro ao alterar equipamento:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { recusar } from "@/lib/servidor/http";
import { AtividadeInvalida, cadastrarEquipamento, equipamentosDoAluno } from "@/lib/servidor/treinoAtividades";

export const runtime = "nodejs";

// Tênis e bicicletas do aluno (cadastro livre, P4).
export async function POST(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  try {
    const id = await cadastrarEquipamento(pacienteId, await request.json().catch(() => null));
    return NextResponse.json({ id, equipamentos: await equipamentosDoAluno(pacienteId) }, { status: 201 });
  } catch (erro) {
    if (erro instanceof AtividadeInvalida) return recusar(erro.message, 400);
    console.error("Erro ao cadastrar equipamento:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { AtividadeInvalida, definirAlertaDoTenis, equipamentosDoAluno } from "@/lib/servidor/treinoAtividades";

export const runtime = "nodejs";

// Profissional que acompanha o aluno: limite de troca do tênis (R1).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; equipamentoId: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id, equipamentoId } = await params;
  if (!UUID.test(id) || !UUID.test(equipamentoId) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  try {
    const dados = (await request.json().catch(() => null)) ?? {};
    if (!(await definirAlertaDoTenis(id, equipamentoId, dados.alerta_km))) return recusar("Tênis não encontrado.", 404);
    return NextResponse.json({ equipamentos: await equipamentosDoAluno(id) });
  } catch (erro) {
    if (erro instanceof AtividadeInvalida) return recusar(erro.message, 400);
    console.error("Erro ao definir o limite do tênis:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

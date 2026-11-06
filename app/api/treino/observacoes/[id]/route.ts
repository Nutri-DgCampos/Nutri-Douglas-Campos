import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { alterarObservacao, arquivarObservacao, ObservacaoInvalida } from "@/lib/servidor/treinoObservacoes";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ id: string }> };

// Alterar uma observação do próprio catálogo (treinos já feitos não mudam).
export async function PATCH(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Observação não encontrada.", 404);
  try {
    const ok = await alterarObservacao(profissional, id, (await request.json().catch(() => ({}))) ?? {});
    return ok ? NextResponse.json({ sucesso: true }) : recusar("Observação não encontrada.", 404);
  } catch (erro) {
    if (erro instanceof ObservacaoInvalida) return recusar(erro.message, 400);
    console.error("Erro ao alterar observação do treino:", erro);
    return recusar("Não foi possível salvar a observação.", 500);
  }
}

// Remover do catálogo (arquiva; os treinos guardam a própria cópia).
export async function DELETE(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await arquivarObservacao(profissional, id))) return recusar("Observação não encontrada.", 404);
  return NextResponse.json({ sucesso: true });
}

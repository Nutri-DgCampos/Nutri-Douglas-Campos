import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { atualizarEducador, DadosInvalidos } from "@/lib/servidor/educadores";
import { recusar } from "@/lib/servidor/http";
import { exigirAdminDoTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Alterar dados, ativar/desativar ou redefinir a senha (provisória).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await exigirAdminDoTreino(request);
  if (admin instanceof NextResponse) return admin;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Educador inválido.", 400);
  try {
    const ok = await atualizarEducador(id, (await request.json().catch(() => ({}))) ?? {});
    return ok ? NextResponse.json({ sucesso: true }) : recusar("Educador físico não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    console.error("Erro ao alterar educador físico:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

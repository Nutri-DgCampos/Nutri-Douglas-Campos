import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { alterarPlano, ContratoInvalido } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

// Alterar, arquivar ou reativar um plano do próprio profissional. Contratos
// já feitos guardam a cópia do plano e não mudam.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Plano não encontrado.", 404);
  try {
    const ok = await alterarPlano(profissional.usuarioId, id, (await request.json().catch(() => ({}))) ?? {});
    return ok ? NextResponse.json({ sucesso: true }) : recusar("Plano não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof ContratoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao alterar plano do Treino:", erro);
    return recusar("Não foi possível salvar o plano.", 500);
  }
}

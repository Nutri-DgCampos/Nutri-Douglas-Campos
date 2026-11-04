import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { alterarContrato, ContratoInvalido } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

// Confirmar o pagamento (comprovante ou dinheiro), desfazer a confirmação ou
// cancelar. Só o profissional do contrato (G2).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Contrato não encontrado.", 404);
  try {
    const dados = (await request.json().catch(() => ({}))) ?? {};
    const ok = await alterarContrato(profissional, id, dados.acao);
    return ok ? NextResponse.json({ sucesso: true }) : recusar("Contrato não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof ContratoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao alterar contrato do Treino:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { PedidoRecusado, decidirPedido } from "@/lib/servidor/pedidosVinculo";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Aprovar ou recusar (só quem cadastrou o aluno; para paciente da clínica, o
// nutricionista). Para os demais, o pedido "não existe".
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Pedido não encontrado.", 404);
  try {
    const decisao = await decidirPedido(profissional, id, (await request.json().catch(() => ({})))?.acao);
    return decisao ? NextResponse.json({ decisao }) : recusar("Pedido não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof PedidoRecusado) return recusar(erro.message, 409);
    console.error("Erro ao decidir pedido de vínculo:", erro);
    return recusar("Não foi possível concluir.", 500);
  }
}

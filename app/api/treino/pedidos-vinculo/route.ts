import { NextResponse } from "next/server";
import { recusar } from "@/lib/servidor/http";
import { PedidoRecusado, pedidosDoProfissional, solicitarVinculo } from "@/lib/servidor/pedidosVinculo";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Pedidos de vínculo: os que o profissional decide e os que ele fez.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  return NextResponse.json(await pedidosDoProfissional(profissional));
}

// Pedir vínculo com o aluno de um e-mail que já tem cadastro.
export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    const id = await solicitarVinculo(profissional, (await request.json().catch(() => ({}))) ?? {});
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof PedidoRecusado) return recusar(erro.message, 409);
    console.error("Erro ao pedir vínculo:", erro);
    return recusar("Não foi possível enviar o pedido.", 500);
  }
}

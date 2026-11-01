import { NextResponse } from "next/server";
import { avisosDoUsuario } from "@/lib/servidor/avisos";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Sino: últimos avisos do profissional conectado e quantos estão sem ler.
// Consultar a lista não marca nada como lido.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  return NextResponse.json(await avisosDoUsuario(profissional.usuarioId), { headers: { "Cache-Control": "no-store" } });
}

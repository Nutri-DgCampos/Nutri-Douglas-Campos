import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { encerrarSessao } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  await encerrarSessao();

  return NextResponse.json({ sucesso: true });
}

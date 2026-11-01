import { NextResponse } from "next/server";
import { marcarDesconfortoVisto } from "@/lib/servidor/desconfortos";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Profissional marca um relato de desconforto como visto.
export async function PATCH(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const dados = (await request.json().catch(() => ({}))) ?? {};
  if (typeof dados.id !== "string" || !UUID.test(dados.id)) return recusar("Relato inválido.", 400);
  const ok = await marcarDesconfortoVisto(profissional, dados.id);
  return ok ? NextResponse.json({ sucesso: true }) : recusar("Relato não encontrado ou já visto.", 404);
}

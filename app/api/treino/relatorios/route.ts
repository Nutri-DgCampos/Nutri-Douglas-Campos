import { NextResponse } from "next/server";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { painelDeRelatorios } from "@/lib/servidor/treinoRelatorios";

export const runtime = "nodejs";

// Relatórios semanais do profissional conectado: pendentes de devolutiva
// (com atraso a partir de 2 do mesmo aluno) e lista de atenção. Só os dele
// (B7 e B8), inclusive para o administrador.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  return NextResponse.json(await painelDeRelatorios(profissional));
}

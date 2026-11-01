import { NextResponse } from "next/server";
import { desconfortosNaoVistos } from "@/lib/servidor/desconfortos";
import { alunosDoProfissional, exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Início do Módulo de Treino: alunos do profissional (admin: todos) e os
// relatos de desconforto ainda não vistos.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const [alunos, desconfortos] = await Promise.all([alunosDoProfissional(profissional), desconfortosNaoVistos(profissional)]);
  return NextResponse.json({ admin: profissional.admin, alunos, desconfortos });
}

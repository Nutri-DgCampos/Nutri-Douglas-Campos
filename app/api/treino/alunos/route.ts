import { NextResponse } from "next/server";
import { criarAlunoProprio } from "@/lib/servidor/alunosProprios";
import { desconfortosNaoVistos } from "@/lib/servidor/desconfortos";
import { DadosInvalidos } from "@/lib/servidor/educadores";
import { recusar } from "@/lib/servidor/http";
import { alunosDoProfissional, exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { EmailJaCadastrado } from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

// Início do Módulo de Treino: alunos do profissional (admin: todos) e os
// relatos de desconforto ainda não vistos.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const [alunos, desconfortos] = await Promise.all([alunosDoProfissional(profissional), desconfortosNaoVistos(profissional)]);
  return NextResponse.json({ admin: profissional.admin, alunos, desconfortos });
}

// Aluno próprio do educador físico (T7b). O administrador cadastra os
// pacientes da clínica pela Nutrição.
export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  if (profissional.admin) return recusar("O administrador cadastra pacientes pela Nutrição.", 403);
  try {
    const id = await criarAlunoProprio(profissional, (await request.json().catch(() => ({}))) ?? {});
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    if (erro instanceof EmailJaCadastrado) return recusar("Este e-mail já é usado por outro acesso.", 409);
    console.error("Erro ao cadastrar aluno próprio:", erro);
    return recusar("Não foi possível cadastrar o aluno.", 500);
  }
}

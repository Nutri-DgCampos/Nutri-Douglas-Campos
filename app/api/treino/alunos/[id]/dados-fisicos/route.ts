import { NextResponse } from "next/server";
import { alterarDadosFisicos, lerDadosFisicos } from "@/lib/servidor/dadosFisicosDoAluno";
import { UUID } from "@/lib/servidor/dietas";
import { DadosInvalidos } from "@/lib/servidor/educadores";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ id: string }> };

// Nascimento, sexo e altura do cadastro comum, para o profissional que
// acompanha o aluno (vínculo conferido aqui, no servidor).
export async function GET(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  return NextResponse.json({ dados: await lerDadosFisicos(id) });
}

export async function PUT(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  try {
    return NextResponse.json({ dados: await alterarDadosFisicos(id, (await request.json().catch(() => ({}))) ?? {}) });
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    console.error("Erro ao salvar dados físicos do aluno:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

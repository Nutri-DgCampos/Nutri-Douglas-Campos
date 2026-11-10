import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { AnamneseInvalida, anamnesesDoAluno, criarAnamnese, listarModelos } from "@/lib/servidor/treinoFormularios";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ id: string }> };

// Anamneses do aluno na ficha do Treino: as do profissional e as
// preenchidas dos outros vinculados; modelos disponíveis; e a anamnese
// simples antiga dele, se houver (privada, só leitura).
export async function GET(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  const [anamneses, modelos, antiga] = await Promise.all([
    anamnesesDoAluno(profissional, id),
    listarModelos(profissional),
    obterPool().query<{ respostas: Record<string, string>; atualizada_em: string }>(
      "select respostas, atualizada_em from public.treino_anamneses where patient_id = $1 and profissional_id = $2",
      [id, profissional.usuarioId]
    ),
  ]);
  return NextResponse.json({ anamneses, modelos, antiga: antiga.rows[0] ?? null });
}

export async function POST(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  try {
    const anamneseId = await criarAnamnese(profissional, id, (await request.json().catch(() => ({})))?.modeloId);
    return NextResponse.json({ id: anamneseId }, { status: 201 });
  } catch (erro) {
    if (erro instanceof AnamneseInvalida) return recusar(erro.message, 400);
    console.error("Erro ao criar anamnese do Treino:", erro);
    return recusar("Não foi possível criar a anamnese.", 500);
  }
}

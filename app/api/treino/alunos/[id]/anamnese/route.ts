import { NextResponse } from "next/server";
import type { RespostasDaAnamnese } from "@/lib/treinoAnamnese";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ id: string }> };

// Anamnese do profissional conectado para este aluno (R6). Privada: cada
// profissional lê e grava só a própria (F2); nem o administrador lê a do
// educador.
export async function GET(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  const r = await obterPool().query<{ respostas: RespostasDaAnamnese; revisao: number; atualizada_em: string }>(
    "select respostas, revisao, atualizada_em from public.treino_anamneses where patient_id = $1 and profissional_id = $2",
    [id, profissional.usuarioId]
  );
  return NextResponse.json({ anamnese: r.rows[0] ?? { respostas: {}, revisao: 0, atualizada_em: null } });
}

// A anamnese simples foi substituída pela anamnese com modelos e link (SPEC
// 06/11; decisão do cliente em 10/11): as respostas antigas ficam guardadas,
// privadas e só para leitura.
export async function PUT() {
  return recusar("A anamnese simples foi substituída pela anamnese com modelos e link. As respostas antigas ficam só para leitura.", 410);
}

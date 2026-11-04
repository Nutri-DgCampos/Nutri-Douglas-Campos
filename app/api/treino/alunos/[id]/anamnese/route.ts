import { NextResponse } from "next/server";
import { validarRespostas, type RespostasDaAnamnese } from "@/lib/treinoAnamnese";
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

// Gravar com controle de revisão (uma gravação antiga não apaga a mais nova).
export async function PUT(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  const dados = (await request.json().catch(() => null)) ?? {};
  const v = validarRespostas(dados.respostas);
  if ("erro" in v) return recusar(v.erro, 400);
  if (!Number.isInteger(dados.revisao)) return recusar("Revisão não informada.", 400);
  const r = await obterPool().query<{ revisao: number; atualizada_em: string }>(
    `insert into public.treino_anamneses (patient_id, profissional_id, respostas, revisao)
     select $1, $2, $3, 1 where $4 = 0
     on conflict (patient_id, profissional_id) do update
       set respostas = excluded.respostas, revisao = treino_anamneses.revisao + 1, atualizada_em = now()
       where treino_anamneses.revisao = $4
     returning revisao, atualizada_em`,
    [id, profissional.usuarioId, JSON.stringify(v.respostas), dados.revisao]
  );
  if (!r.rows[0]) {
    // Revisão 0 com linha existente, ou revisão antiga: tenta como atualização.
    const atualizada = await obterPool().query<{ revisao: number; atualizada_em: string }>(
      `update public.treino_anamneses set respostas = $3, revisao = revisao + 1, atualizada_em = now()
        where patient_id = $1 and profissional_id = $2 and revisao = $4 returning revisao, atualizada_em`,
      [id, profissional.usuarioId, JSON.stringify(v.respostas), dados.revisao]
    );
    if (!atualizada.rows[0]) return recusar("A anamnese foi alterada em outra janela. Recarregue antes de continuar.", 409);
    return NextResponse.json(atualizada.rows[0]);
  }
  return NextResponse.json(r.rows[0]);
}

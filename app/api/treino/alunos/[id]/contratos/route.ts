import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { ContratoInvalido, contratosParaProfissional, criarContrato } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

// Plano e pagamento do aluno na ficha: os contratos do profissional
// conectado, os pedidos de renovação feitos a ele e a situação do aluno.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  return NextResponse.json(await contratosParaProfissional(profissional, id));
}

// Novo contrato a partir de um plano do profissional (cópia de nome, preço e
// duração); recebido em dinheiro, já nasce confirmado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  try {
    await criarContrato(profissional, id, (await request.json().catch(() => ({}))) ?? {});
    return NextResponse.json(await contratosParaProfissional(profissional, id));
  } catch (erro) {
    if (erro instanceof ContratoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao criar contrato do Treino:", erro);
    return recusar("Não foi possível salvar o contrato.", 500);
  }
}

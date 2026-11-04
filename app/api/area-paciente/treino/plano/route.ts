import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { recusar } from "@/lib/servidor/http";
import { ContratoInvalido, pedirRenovacao, planoDoAluno } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

// Plano do Treino do aluno: contratos, situação, planos para renovar e
// pedidos pendentes (R9).
export async function GET(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  return NextResponse.json(await planoDoAluno(pacienteId));
}

// Pedido de renovação: avisa o profissional; não libera nada sozinho.
export async function POST(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  try {
    await pedirRenovacao(pacienteId, (await request.json().catch(() => ({}))) ?? {});
    return NextResponse.json(await planoDoAluno(pacienteId));
  } catch (erro) {
    if (erro instanceof ContratoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao pedir renovação do Treino:", erro);
    return recusar("Não foi possível enviar o pedido.", 500);
  }
}

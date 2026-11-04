import { NextResponse } from "next/server";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { ContratoInvalido, criarPlano, definirTolerancia, planosDoProfissional, toleranciaDoProfissional } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

// Planos e preços do próprio profissional (G1) e a tolerância padrão (G4).
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const [planos, tolerancia] = await Promise.all([planosDoProfissional(profissional.usuarioId, true), toleranciaDoProfissional(profissional.usuarioId)]);
  return NextResponse.json({ planos, tolerancia });
}

export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    const id = await criarPlano(profissional.usuarioId, (await request.json().catch(() => ({}))) ?? {});
    return NextResponse.json({ id });
  } catch (erro) {
    if (erro instanceof ContratoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao criar plano do Treino:", erro);
    return recusar("Não foi possível salvar o plano.", 500);
  }
}

// Tolerância após o vencimento: vale para os contratos feitos daqui em diante.
export async function PUT(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  try {
    const dados = (await request.json().catch(() => ({}))) ?? {};
    return NextResponse.json({ tolerancia: await definirTolerancia(profissional.usuarioId, dados.tolerancia) });
  } catch (erro) {
    if (erro instanceof ContratoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao salvar tolerância:", erro);
    return recusar("Não foi possível salvar.", 500);
  }
}

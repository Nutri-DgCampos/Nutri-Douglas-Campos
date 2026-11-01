import { NextResponse } from "next/server";
import { validarDesconforto } from "@/lib/treino";
import { registrarDesconforto } from "@/lib/servidor/desconfortos";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

// Aluno relata desconforto: grava na hora e avisa o profissional responsável.
export async function POST(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);

  const resultado = validarDesconforto(await request.json().catch(() => null));
  if ("erro" in resultado) return recusar(resultado.erro, 400);
  try {
    const { id, novo } = await registrarDesconforto(contexto.pacienteId, resultado.relato);
    return NextResponse.json({ id, novo }, { status: novo ? 201 : 200 });
  } catch (erro) {
    console.error("Erro ao registrar desconforto:", erro);
    return recusar("Não foi possível registrar o relato.", 500);
  }
}

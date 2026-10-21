import { NextResponse } from "next/server";
import { UUID } from "./dietas";
import { Recusa, formulariosDoPaciente, gravarDoPaciente, pacienteDoToken, type TipoDeFormulario } from "./formularios";
import { origemPermitida, recusar } from "./http";
import { obterContexto } from "./sessao";

// Rotas do paciente para anamnese e recordatório. Duas portas de entrada com
// a mesma regra: o link individual (sem login) e a área do paciente.

export async function pacienteDaRequisicao(request: Request, token?: string): Promise<string | NextResponse> {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  if (token !== undefined) {
    const pacienteId = await pacienteDoToken(token);
    return pacienteId ?? recusar("Link inválido ou substituído por um novo. Peça o link atualizado ao nutricionista.", 404);
  }
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  return contexto.pacienteId;
}

export async function listar(pacienteId: string) {
  return NextResponse.json(await formulariosDoPaciente(pacienteId), { headers: { "Cache-Control": "private, no-store" } });
}

export async function gravar(request: Request, pacienteId: string, tipo: string, id: string, enviar: boolean) {
  if (tipo !== "anamnese" && tipo !== "recordatorio") return recusar("Formulário inválido.", 400);
  if (!UUID.test(id)) return recusar("Formulário inválido.", 400);
  const corpo = await request.json().catch(() => null);
  try {
    return NextResponse.json(await gravarDoPaciente(tipo as TipoDeFormulario, pacienteId, id, corpo, enviar));
  } catch (erro) {
    if (erro instanceof Recusa) return NextResponse.json({ erro: erro.message, ...erro.extra }, { status: erro.status });
    console.error("Erro ao gravar formulário do paciente:", erro);
    return recusar("Não foi possível salvar. Tente novamente.", 500);
  }
}

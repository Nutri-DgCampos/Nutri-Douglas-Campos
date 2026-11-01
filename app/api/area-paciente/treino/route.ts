import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import { RegistroInvalido, salvarRegistro, treinoDoAluno } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// "Meu treino" do aluno conectado: prescrição vigente (não muda), registros
// da semana, valores mais recentes e carga anterior de cada exercício.
async function alunoConectado(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  return contexto.pacienteId;
}

export async function GET(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  return NextResponse.json({ treino: await treinoDoAluno(pacienteId) });
}

// Registro da sessão da semana (números, situação e observação).
export async function PUT(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  try {
    await salvarRegistro(pacienteId, await request.json().catch(() => null));
    return NextResponse.json({ treino: await treinoDoAluno(pacienteId) });
  } catch (erro) {
    if (erro instanceof RegistroInvalido) return recusar(erro.message, 400);
    console.error("Erro ao registrar treino:", erro);
    return recusar("Não foi possível salvar o registro.", 500);
  }
}

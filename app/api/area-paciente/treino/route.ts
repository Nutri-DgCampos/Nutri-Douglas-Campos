import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { recusar } from "@/lib/servidor/http";
import { caloriasInformadasNaSemana } from "@/lib/servidor/treinoAtividades";
import { RegistroInvalido, salvarRegistro, treinoDoAluno } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// "Meu treino" do aluno conectado: prescrição vigente (não muda), registros
// da semana, valores mais recentes, carga anterior de cada exercício e as
// calorias que ele informou na semana (C1).
async function situacao(pacienteId: string) {
  const [treino, caloriasInformadas] = await Promise.all([treinoDoAluno(pacienteId), caloriasInformadasNaSemana(pacienteId)]);
  return { treino, caloriasInformadas };
}

export async function GET(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  return NextResponse.json(await situacao(pacienteId));
}

// Registro da sessão da semana (números, situação, observação e calorias).
export async function PUT(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  try {
    await salvarRegistro(pacienteId, await request.json().catch(() => null));
    return NextResponse.json(await situacao(pacienteId));
  } catch (erro) {
    if (erro instanceof RegistroInvalido) return recusar(erro.message, 400);
    console.error("Erro ao registrar treino:", erro);
    return recusar("Não foi possível salvar o registro.", 500);
  }
}

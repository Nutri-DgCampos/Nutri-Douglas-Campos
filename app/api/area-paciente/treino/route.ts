import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { recusar } from "@/lib/servidor/http";
import { caloriasInformadasNaSemana } from "@/lib/servidor/treinoAtividades";
import { alunoBloqueado, MENSAGEM_DE_BLOQUEIO } from "@/lib/servidor/treinoContratos";
import { RegistroInvalido, salvarRegistro, treinoDoAluno } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// "Meu treino" do aluno conectado: prescrição vigente (não muda), registros
// da semana, valores mais recentes, carga anterior de cada exercício e as
// calorias que ele informou na semana (C1). Plano vencido além da tolerância
// (R9): sem o treino da semana e sem registrar; o histórico (relatórios e
// devolutivas) continua nas outras rotas.
async function situacao(pacienteId: string) {
  const [treino, caloriasInformadas, bloqueado] = await Promise.all([
    treinoDoAluno(pacienteId),
    caloriasInformadasNaSemana(pacienteId),
    alunoBloqueado(pacienteId),
  ]);
  return bloqueado ? { treino: null, caloriasInformadas, bloqueado } : { treino, caloriasInformadas, bloqueado };
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
  if (await alunoBloqueado(pacienteId)) return recusar(MENSAGEM_DE_BLOQUEIO, 409);
  try {
    await salvarRegistro(pacienteId, await request.json().catch(() => null));
    return NextResponse.json(await situacao(pacienteId));
  } catch (erro) {
    if (erro instanceof RegistroInvalido) return recusar(erro.message, 400);
    console.error("Erro ao registrar treino:", erro);
    return recusar("Não foi possível salvar o registro.", 500);
  }
}

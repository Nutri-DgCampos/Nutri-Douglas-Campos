import { NextResponse } from "next/server";
import { hojeNoBrasil, somarDias } from "@/lib/cronograma";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { recusar } from "@/lib/servidor/http";
import {
  AtividadeInvalida,
  atividadesDoAluno,
  caloriasInformadasNaSemana,
  equipamentosDoAluno,
  primeiroDiaDeRegistro,
  salvarAtividade,
  sessoesPlanejadas,
} from "@/lib/servidor/treinoAtividades";
import { alunoBloqueado, MENSAGEM_DE_BLOQUEIO } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

async function situacao(pacienteId: string) {
  const hoje = hojeNoBrasil();
  const [atividades, equipamentos, calorias, planejadas, bloqueado] = await Promise.all([
    // Histórico das últimas 8 semanas; edição só desde primeiroDia.
    atividadesDoAluno(pacienteId, somarDias(hoje, -56)),
    equipamentosDoAluno(pacienteId),
    caloriasInformadasNaSemana(pacienteId, hoje),
    sessoesPlanejadas(pacienteId, hoje),
    alunoBloqueado(pacienteId, hoje),
  ]);
  // Plano vencido (R9): o histórico fica; o planejado e o registro novo, não.
  return {
    atividades,
    equipamentos,
    planejadas: bloqueado ? [] : planejadas,
    bloqueado,
    caloriasInformadas: calorias,
    hoje,
    primeiroDia: primeiroDiaDeRegistro(hoje),
  };
}

// Corridas e pedais do aluno, tênis e bicicletas (T4b).
export async function GET(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  return NextResponse.json(await situacao(pacienteId));
}

// Registro ou correção (mesma chave_cliente) de uma atividade.
export async function PUT(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  if (await alunoBloqueado(pacienteId)) return recusar(MENSAGEM_DE_BLOQUEIO, 409);
  try {
    const id = await salvarAtividade(pacienteId, await request.json().catch(() => null));
    return NextResponse.json({ id, ...(await situacao(pacienteId)) });
  } catch (erro) {
    if (erro instanceof AtividadeInvalida) return recusar(erro.message, 400);
    console.error("Erro ao registrar atividade:", erro);
    return recusar("Não foi possível salvar o registro.", 500);
  }
}

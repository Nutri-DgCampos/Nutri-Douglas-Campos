import { NextResponse } from "next/server";
import { hojeNoBrasil, somarDias } from "@/lib/cronograma";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { recusar } from "@/lib/servidor/http";
import {
  AtividadeBloqueada,
  AtividadeInvalida,
  atividadesDoAluno,
  caloriasInformadasNaSemana,
  equipamentosDoAluno,
  primeiroDiaDeRegistro,
  salvarAtividade,
  sessoesPlanejadas,
} from "@/lib/servidor/treinoAtividades";
import { bloqueiosDoAluno, MENSAGEM_DE_BLOQUEIO, MENSAGEM_DE_BLOQUEIO_TOTAL } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

async function situacao(pacienteId: string) {
  const hoje = hojeNoBrasil();
  const { bloqueados, total } = await bloqueiosDoAluno(pacienteId, hoje);
  const [atividades, equipamentos, calorias, planejadas] = await Promise.all([
    // Histórico das últimas 8 semanas; edição só desde primeiroDia.
    atividadesDoAluno(pacienteId, somarDias(hoje, -56)),
    equipamentosDoAluno(pacienteId),
    caloriasInformadasNaSemana(pacienteId, hoje),
    sessoesPlanejadas(pacienteId, hoje, bloqueados),
  ]);
  // Plano vencido (R9, S2): some o planejado de quem está vencido; sem
  // nenhum profissional liberado ("bloqueado"), nem registro avulso.
  return {
    atividades,
    equipamentos,
    planejadas,
    bloqueado: total,
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
  try {
    const bloqueio = await bloqueiosDoAluno(pacienteId);
    const id = await salvarAtividade(pacienteId, await request.json().catch(() => null), undefined, bloqueio);
    return NextResponse.json({ id, ...(await situacao(pacienteId)) });
  } catch (erro) {
    if (erro instanceof AtividadeBloqueada) return recusar(erro.message === "total" ? MENSAGEM_DE_BLOQUEIO_TOTAL : MENSAGEM_DE_BLOQUEIO, 409);
    if (erro instanceof AtividadeInvalida) return recusar(erro.message, 400);
    console.error("Erro ao registrar atividade:", erro);
    return recusar("Não foi possível salvar o registro.", 500);
  }
}

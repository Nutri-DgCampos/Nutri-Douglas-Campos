import { NextResponse } from "next/server";
import { idadeEm } from "@/lib/nutricao/paciente";
import {
  autorDaAvaliacao,
  excluirAvaliacao,
  finalizarOuReabrirAvaliacao,
  historicoAte,
  pessoaDoPaciente,
  resultadosDe,
  salvarRascunhoDaAvaliacao,
} from "@/lib/servidor/avaliacoes";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, type ProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { avaliacaoParaProfissional } from "@/lib/servidor/treinoAvaliacoes";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Avaliação física no Treino (R7): quem acompanha o aluno vê; o autor
// altera. Mesmo formato de resposta da rota da Nutrição (o editor é o mesmo).
export async function GET(request: Request, { params }: Contexto) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const acesso = UUID.test(id) ? await avaliacaoParaProfissional(profissional, id) : null;
  if (!acesso) return recusar("Avaliação não encontrada.", 404);
  const { avaliacao, podeEditar } = acesso;
  const pessoa = await pessoaDoPaciente(avaliacao.patient_id);
  if (!pessoa) return recusar("Aluno não encontrado.", 404);
  const [historico, autor] = await Promise.all([historicoAte(avaliacao, pessoa), autorDaAvaliacao(avaliacao.criada_por)]);
  return NextResponse.json({
    avaliacao,
    paciente: { nome: pessoa.nome, sexo: pessoa.sexo, idade: idadeEm(pessoa.nascimento, avaliacao.data), nascimento: pessoa.nascimento },
    consulta: null,
    resultados: resultadosDe(avaliacao, pessoa),
    historico,
    envios: [],
    autor,
    pode_editar: podeEditar,
  });
}

async function doAutor(profissional: ProfissionalDeTreino, id: string) {
  const acesso = UUID.test(id) ? await avaliacaoParaProfissional(profissional, id) : null;
  if (!acesso) return recusar("Avaliação não encontrada.", 404);
  if (!acesso.podeEditar) return recusar("Só quem fez a avaliação pode alterá-la.", 403);
  return null;
}

export async function PUT(request: Request, { params }: Contexto) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const bloqueio = await doAutor(profissional, id);
  if (bloqueio) return bloqueio;
  const r = await salvarRascunhoDaAvaliacao(id, await request.json().catch(() => null));
  return NextResponse.json(r.corpo, { status: r.status });
}

export async function PATCH(request: Request, { params }: Contexto) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const bloqueio = await doAutor(profissional, id);
  if (bloqueio) return bloqueio;
  const r = await finalizarOuReabrirAvaliacao(id, await request.json().catch(() => null), profissional.usuarioId);
  return NextResponse.json(r.corpo, { status: r.status });
}

export async function DELETE(request: Request, { params }: Contexto) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const bloqueio = await doAutor(profissional, id);
  if (bloqueio) return bloqueio;
  const r = await excluirAvaliacao(id, profissional.usuarioId);
  return NextResponse.json(r.corpo, { status: r.status });
}

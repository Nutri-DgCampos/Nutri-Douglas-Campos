import { NextResponse } from "next/server";
import { idadeEm } from "@/lib/nutricao/paciente";
import {
  autorDaAvaliacao,
  buscarAvaliacao,
  excluirAvaliacao,
  feitaPorEducador,
  finalizarOuReabrirAvaliacao,
  historicoAte,
  pessoaDoPaciente,
  resultadosDe,
  salvarRascunhoDaAvaliacao,
} from "@/lib/servidor/avaliacoes";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Avaliação com resultados (preliminares, se em rascunho), histórico até a
// data dela e os PDFs já enviados.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const avaliacao = await buscarAvaliacao(id);
  if (!avaliacao) return recusar("Avaliação não encontrada.", 404);

  const pessoa = await pessoaDoPaciente(avaliacao.patient_id);
  if (!pessoa) return recusar("Paciente não encontrado.", 404);

  const [historico, envios, consulta, educador, autor] = await Promise.all([
    historicoAte(avaliacao, pessoa),
    obterPool().query(
      "select id, numero, file_name, storage_path, enviada_em from public.avaliacoes_envios where avaliacao_id = $1 order by numero desc",
      [id]
    ),
    obterPool().query<{ data: string }>("select to_char(data, 'YYYY-MM-DD') as data from public.consultas where id = $1", [
      avaliacao.consulta_id,
    ]),
    feitaPorEducador(avaliacao),
    autorDaAvaliacao(avaliacao.criada_por),
  ]);

  return NextResponse.json({
    avaliacao,
    paciente: { nome: pessoa.nome, sexo: pessoa.sexo, idade: idadeEm(pessoa.nascimento, avaliacao.data), nascimento: pessoa.nascimento },
    consulta: consulta.rows[0] ?? null,
    resultados: resultadosDe(avaliacao, pessoa),
    historico,
    envios: envios.rows,
    // Avaliação do educador físico (R7b): o nutricionista vê, não altera.
    autor,
    pode_editar: !educador,
  });
}

// Só o autor altera (R7b): a avaliação feita pelo educador físico fica só
// para leitura na Nutrição.
async function alteravel(id: string) {
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);
  const avaliacao = await buscarAvaliacao(id);
  if (!avaliacao) return recusar("Avaliação não encontrada.", 404);
  if (await feitaPorEducador(avaliacao)) return recusar("Esta avaliação foi feita pelo educador físico: só ele pode alterá-la.", 403);
  return null;
}

// Salvamento automático do rascunho (e da data da avaliação).
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  const bloqueio = await alteravel(id);
  if (bloqueio) return bloqueio;
  const r = await salvarRascunhoDaAvaliacao(id, await request.json().catch(() => null));
  return NextResponse.json(r.corpo, { status: r.status });
}

// Finalizar (congela os resultados e atualiza a altura do cadastro) ou
// reabrir para correção (fica registrado).
export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  const bloqueio = await alteravel(id);
  if (bloqueio) return bloqueio;
  const r = await finalizarOuReabrirAvaliacao(id, await request.json().catch(() => null), contexto.usuarioId);
  return NextResponse.json(r.corpo, { status: r.status });
}

// Excluir: só rascunho (o banco também garante).
export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  const bloqueio = await alteravel(id);
  if (bloqueio) return bloqueio;
  const r = await excluirAvaliacao(id, contexto.usuarioId);
  return NextResponse.json(r.corpo, { status: r.status });
}

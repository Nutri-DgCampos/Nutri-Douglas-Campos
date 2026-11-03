import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";
import { ZonasInvalidas, salvarZonas, zonasDoAluno } from "@/lib/servidor/treinoZonas";

export const runtime = "nodejs";

const modalidadeDe = (v: unknown) => (v === "corrida" || v === "ciclismo" ? v : null);

// Zonas do aluno para corrida ou ciclismo (?modalidade=).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const modalidade = modalidadeDe(new URL(request.url).searchParams.get("modalidade"));
  if (!modalidade) return recusar("Modalidade inválida.", 400);
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  return NextResponse.json({ zonas: await zonasDoAluno(id, modalidade) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const dados = (await request.json().catch(() => null)) ?? {};
  const modalidade = modalidadeDe(dados.modalidade);
  if (!modalidade) return recusar("Modalidade inválida.", 400);
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  try {
    return NextResponse.json({ zonas: await salvarZonas(profissional.usuarioId, id, modalidade, dados.zonas) });
  } catch (erro) {
    if (erro instanceof ZonasInvalidas) return recusar(erro.message, 400);
    console.error("Erro ao salvar zonas:", erro);
    return recusar("Não foi possível salvar as zonas.", 500);
  }
}

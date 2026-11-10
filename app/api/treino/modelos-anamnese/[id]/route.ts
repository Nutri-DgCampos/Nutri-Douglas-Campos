import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { AnamneseInvalida, alterarModelo, excluirModelo, lerModelo, salvarModelo } from "@/lib/servidor/treinoFormularios";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ id: string }> };

// O do autor (editável) ou um compartilhado (só leitura: "meu" = false).
export async function GET(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const modelo = UUID.test(id) ? await lerModelo(profissional, id) : null;
  if (!modelo) return recusar("Modelo não encontrado.", 404);
  return NextResponse.json({ modelo });
}

export async function PUT(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo não encontrado.", 404);
  try {
    const gravado = await salvarModelo(profissional, id, (await request.json().catch(() => ({}))) ?? {});
    return gravado ? NextResponse.json(gravado) : recusar("Só o autor altera este modelo.", 404);
  } catch (erro) {
    if (erro instanceof AnamneseInvalida) return recusar(erro.message, erro.message.includes("outra janela") ? 409 : 400);
    console.error("Erro ao salvar modelo de anamnese do Treino:", erro);
    return recusar("Não foi possível salvar o modelo.", 500);
  }
}

// Arquivar, reativar, compartilhar ou deixar privado.
export async function PATCH(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo não encontrado.", 404);
  try {
    const ok = await alterarModelo(profissional, id, (await request.json().catch(() => ({})))?.acao);
    return ok ? NextResponse.json({ ok: true }) : recusar("Modelo não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof AnamneseInvalida) return recusar(erro.message, 400);
    throw erro;
  }
}

export async function DELETE(request: Request, { params }: Parametros) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo não encontrado.", 404);
  try {
    return (await excluirModelo(profissional, id)) ? NextResponse.json({ ok: true }) : recusar("Modelo não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof AnamneseInvalida) return recusar(erro.message, 409);
    throw erro;
  }
}

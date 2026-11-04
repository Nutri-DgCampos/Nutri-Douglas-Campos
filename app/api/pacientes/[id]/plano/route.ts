import { NextResponse } from "next/server";
import { pacienteDaClinica } from "@/lib/servidor/clinica";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { aplicarPlano, PlanoInvalido, previaDoPlano } from "@/lib/servidor/planoAtivo";

export const runtime = "nodejs";

// Plano do paciente com o ciclo ativo (SPEC Plano Ativo): prévia para a
// confirmação e gravação no cadastro e no ciclo, com a liberação do
// relatório devido mais recente (Opção B). Só o nutricionista.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!(await pacienteDaClinica(id))) return recusar("Paciente não encontrado.", 404);
  try {
    const previa = await previaDoPlano(id, new URL(request.url).searchParams.get("plano"));
    return previa ? NextResponse.json(previa) : recusar("Paciente não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof PlanoInvalido) return recusar(erro.message, 400);
    throw erro;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!(await pacienteDaClinica(id))) return recusar("Paciente não encontrado.", 404);
  try {
    const dados = (await request.json().catch(() => ({}))) ?? {};
    const resultado = await aplicarPlano(contexto.usuarioId, id, dados.plano);
    return resultado ? NextResponse.json(resultado) : recusar("Paciente não encontrado.", 404);
  } catch (erro) {
    if (erro instanceof PlanoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao aplicar o plano do paciente:", erro);
    return recusar("Não foi possível salvar o plano. Nada foi alterado.", 500);
  }
}

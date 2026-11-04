import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import { anexarComprovante, ContratoInvalido, planoDoAluno } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

// Comprovante do plano do Treino, anexado pelo aluno (G3). Não confirma o
// pagamento: o profissional confere e confirma.
export async function POST(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get("arquivo");
  const contratoId = formulario?.get("contratoId");
  if (!(arquivo instanceof File) || typeof contratoId !== "string" || !UUID.test(contratoId)) {
    return recusar("Escolha o arquivo do comprovante.", 400);
  }
  try {
    await anexarComprovante(contexto.pacienteId, contexto.usuarioId, contratoId, arquivo);
    return NextResponse.json(await planoDoAluno(contexto.pacienteId));
  } catch (erro) {
    if (erro instanceof ContratoInvalido) return recusar(erro.message, 400);
    console.error("Erro ao anexar comprovante do Treino:", erro);
    return recusar("Não foi possível enviar o comprovante.", 500);
  }
}

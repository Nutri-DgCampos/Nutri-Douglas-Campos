import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { documentosDoPaciente, excluirDocumentoDoPaciente, marcarDocumentoLido } from "@/lib/servidor/publicacoes";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

// Fórmulas e Avaliações Físicas do paciente conectado (aba Dietas).
async function pacienteConectado(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  return contexto.pacienteId;
}

function caminhoValido(valor: unknown): valor is string {
  return typeof valor === "string" && valor.length > 0 && valor.length <= 500 && !valor.includes("..");
}

export async function GET(request: Request) {
  const pacienteId = await pacienteConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  return NextResponse.json({ documentos: await documentosDoPaciente(pacienteId) });
}

// Abriu o documento: o aviso daquele documento some (só dele).
export async function POST(request: Request) {
  const pacienteId = await pacienteConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  const dados = await request.json().catch(() => null);
  if (!caminhoValido(dados?.caminho)) return recusar("Documento inválido.", 400);
  await marcarDocumentoLido(pacienteId, dados.caminho);
  return NextResponse.json({ ok: true });
}

// O paciente exclui da área dele um documento enviado por engano (D9).
export async function DELETE(request: Request) {
  const pacienteId = await pacienteConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  const dados = await request.json().catch(() => null);
  if (!caminhoValido(dados?.caminho)) return recusar("Documento inválido.", 400);
  if (!(await excluirDocumentoDoPaciente(pacienteId, dados.caminho))) return recusar("Documento não encontrado.", 404);
  return NextResponse.json({ ok: true });
}

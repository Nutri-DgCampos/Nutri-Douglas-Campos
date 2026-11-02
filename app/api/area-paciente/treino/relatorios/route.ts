import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import { devolutivasDoAluno, marcarDevolutivasLidas } from "@/lib/servidor/treinoRelatorios";

export const runtime = "nodejs";

async function aluno(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  return contexto.pacienteId;
}

// Devolutivas do Treino recebidas pelo aluno (cartão Relatórios). Só o texto
// enviado pelo profissional: o relatório consolidado e o rascunho não saem.
export async function GET(request: Request) {
  const pacienteId = await aluno(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  return NextResponse.json({ devolutivas: await devolutivasDoAluno(pacienteId) });
}

// O aluno abriu a tela Relatórios: as devolutivas ficam lidas.
export async function POST(request: Request) {
  const pacienteId = await aluno(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  await marcarDevolutivasLidas(pacienteId);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import { devolutivasDoAluno, fecharSemanas, marcarDevolutivasLidas, relatoriosParaAluno } from "@/lib/servidor/treinoRelatorios";

export const runtime = "nodejs";

async function aluno(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  return contexto.pacienteId;
}

// Relatórios do Treino do aluno (cartão Relatórios, T3b): a semana completa
// por modalidade, com a nota, a adesão e o mínimo, as metas e a devolutiva
// enviada (Q6, C3). O rascunho da devolutiva nunca sai.
export async function GET(request: Request) {
  const pacienteId = await aluno(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  await fecharSemanas(undefined, { patientId: pacienteId });
  const [devolutivas, relatorios] = await Promise.all([devolutivasDoAluno(pacienteId), relatoriosParaAluno(pacienteId)]);
  return NextResponse.json({ devolutivas, relatorios });
}

// O aluno abriu a tela Relatórios: as devolutivas ficam lidas.
export async function POST(request: Request) {
  const pacienteId = await aluno(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  await marcarDevolutivasLidas(pacienteId);
  return NextResponse.json({ ok: true });
}

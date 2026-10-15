import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import { analisarTreino } from "@/lib/servidor/treinos";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Refaz a leitura de um treino (por exemplo, depois de uma falha).
// Vale para o nutricionista e para o próprio paciente.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Treino inválido.", 400);
  }

  const resultado = await obterPool().query<{ patient_id: string; status: string }>(
    "select patient_id, status from public.treinos where id = $1",
    [id]
  );

  const treino = resultado.rows[0];

  if (
    !treino ||
    (contexto.papel !== "nutricionista" && treino.patient_id !== contexto.pacienteId)
  ) {
    return recusar("Treino não encontrado.", 404);
  }

  if (treino.status === "processando") {
    return recusar("O treino já está sendo lido.", 409);
  }

  void analisarTreino(id);

  return NextResponse.json({ sucesso: true }, { status: 202 });
}

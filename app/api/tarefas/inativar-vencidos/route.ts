import { NextResponse } from "next/server";
import { banco } from "@/lib/servidor/banco";
import { autorizadoPorCron, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Inativa pacientes com acesso vencido há mais de 15 dias.
// Chamada uma vez por dia pelo container "cron".
export async function GET(request: Request) {
  if (!autorizadoPorCron(request)) {
    return recusar("Acesso não autorizado.", 401);
  }

  const { error } = await banco.rpc("inativar_pacientes_vencidos");

  if (error) {
    console.error("Erro ao inativar pacientes vencidos:", error);

    return recusar("Não foi possível inativar os pacientes vencidos.", 500);
  }

  return NextResponse.json({ sucesso: true });
}

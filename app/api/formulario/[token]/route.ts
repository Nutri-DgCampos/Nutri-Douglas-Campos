import { NextResponse } from "next/server";
import { listar, pacienteDaRequisicao } from "@/lib/servidor/respostasDoPaciente";

export const runtime = "nodejs";

// Formulários do paciente pelo link individual (sem login).
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const paciente = await pacienteDaRequisicao(request, (await params).token);
  if (paciente instanceof NextResponse) return paciente;
  return listar(paciente);
}

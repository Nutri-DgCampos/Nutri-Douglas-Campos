import { NextResponse } from "next/server";
import { listar, pacienteDaRequisicao } from "@/lib/servidor/respostasDoPaciente";

export const runtime = "nodejs";

// Formulários do paciente conectado (área do paciente).
export async function GET(request: Request) {
  const paciente = await pacienteDaRequisicao(request);
  if (paciente instanceof NextResponse) return paciente;
  return listar(paciente);
}

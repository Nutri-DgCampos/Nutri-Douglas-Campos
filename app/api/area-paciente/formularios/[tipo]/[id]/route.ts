import { NextResponse } from "next/server";
import { gravar, pacienteDaRequisicao } from "@/lib/servidor/respostasDoPaciente";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ tipo: string; id: string }> };

// Rascunho do paciente (salvamento automático), na área do paciente.
export async function PUT(request: Request, { params }: Parametros) {
  const { tipo, id } = await params;
  const paciente = await pacienteDaRequisicao(request);
  if (paciente instanceof NextResponse) return paciente;
  return gravar(request, paciente, tipo, id, false);
}

import { NextResponse } from "next/server";
import { gravar, pacienteDaRequisicao } from "@/lib/servidor/respostasDoPaciente";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ tipo: string; id: string }> };

// "Enviar respostas", na área do paciente.
export async function POST(request: Request, { params }: Parametros) {
  const { tipo, id } = await params;
  const paciente = await pacienteDaRequisicao(request);
  if (paciente instanceof NextResponse) return paciente;
  return gravar(request, paciente, tipo, id, true);
}

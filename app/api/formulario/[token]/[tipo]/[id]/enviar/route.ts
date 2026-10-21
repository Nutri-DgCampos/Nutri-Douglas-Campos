import { NextResponse } from "next/server";
import { gravar, pacienteDaRequisicao } from "@/lib/servidor/respostasDoPaciente";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ token: string; tipo: string; id: string }> };

// "Enviar respostas", pelo link individual.
export async function POST(request: Request, { params }: Parametros) {
  const { token, tipo, id } = await params;
  const paciente = await pacienteDaRequisicao(request, token);
  if (paciente instanceof NextResponse) return paciente;
  return gravar(request, paciente, tipo, id, true);
}

import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { linkDoPaciente } from "@/lib/servidor/formularios";
import { enderecoPublico, exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

async function responder(request: Request, pacienteId: string, usuarioId: string, novo: boolean) {
  const paciente = await obterPool().query<{ name: string; phone: string | null }>(
    "select name, phone from public.patients where id = $1",
    [pacienteId]
  );
  if (!paciente.rows[0]) return recusar("Paciente não encontrado.", 404);
  const token = await linkDoPaciente(pacienteId, usuarioId, novo);
  return NextResponse.json(
    { url: `${enderecoPublico(request)}/formulario/${token}`, nome: paciente.rows[0].name, telefone: paciente.rows[0].phone },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

// Link individual do paciente (cria na primeira vez).
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Paciente inválido.", 400);
  return responder(request, id, contexto.usuarioId, false);
}

// Gerar novo link: o anterior deixa de funcionar.
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Paciente inválido.", 400);
  return responder(request, id, contexto.usuarioId, true);
}

import { NextResponse } from "next/server";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

export async function GET() {
  const contexto = await obterContexto();

  return NextResponse.json(
    {
      usuario: contexto
        ? { id: contexto.usuarioId, email: contexto.email }
        : null,
      papel: contexto?.papel ?? null,
      pacienteId: contexto?.pacienteId ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

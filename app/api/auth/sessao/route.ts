import { NextResponse } from "next/server";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

export async function GET() {
  const contexto = await obterContexto({ permitirSenhaProvisoria: true });

  return NextResponse.json(
    {
      usuario: contexto
        ? { id: contexto.usuarioId, email: contexto.email }
        : null,
      papel: contexto?.papel ?? null,
      pacienteId: contexto?.pacienteId ?? null,
      deveTrocarSenha: contexto?.deveTrocarSenha ?? false,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

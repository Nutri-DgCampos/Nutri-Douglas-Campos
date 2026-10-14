import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";

export const runtime = "nodejs";

// Usada pelo healthcheck do Docker e pelo deploy.sh.
export async function GET() {
  try {
    await obterPool().query("select 1");

    return NextResponse.json({ situacao: "ok" });
  } catch {
    return NextResponse.json(
      { situacao: "banco indisponível" },
      { status: 503 }
    );
  }
}

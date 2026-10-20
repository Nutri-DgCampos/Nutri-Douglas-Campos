import { NextResponse } from "next/server";
import { dadosDosAlimentos } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Composição, medidas caseiras e substituições cadastradas de vários
// alimentos de uma vez (editor de dietas, ao escolher um alimento).
export async function POST(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const dados = await request.json().catch(() => null);
  const ids = Array.isArray(dados?.ids) ? dados.ids.filter((id: unknown) => typeof id === "string") : null;
  if (!ids) return recusar("Informe os alimentos.", 400);

  return NextResponse.json(await dadosDosAlimentos(ids));
}

import { NextRequest, NextResponse } from "next/server";
import { banco } from "@/lib/servidor/banco";
import { exigirNutricionista } from "@/lib/servidor/http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    const { data: solicitacoes, error: erroSolicitacoes } =
      await banco
        .from("patient_registration_requests")
        .select("id, name, phone, objective, status, created_at")
        .eq("status", "Pendente")
        .order("created_at", { ascending: false });

    if (erroSolicitacoes) {
      console.error(
        "Erro ao consultar solicitações:",
        erroSolicitacoes
      );

      return NextResponse.json(
        { erro: "Não foi possível consultar as solicitações." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { solicitacoes: solicitacoes ?? [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Erro na API de solicitações:", error);

    return NextResponse.json(
      { erro: "Erro ao consultar solicitações." },
      { status: 500 }
    );
  }
}
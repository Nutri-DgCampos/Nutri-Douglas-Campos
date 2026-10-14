import { NextRequest, NextResponse } from "next/server";
import { banco } from "@/lib/servidor/banco";
import { exigirNutricionista } from "@/lib/servidor/http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    const dados: unknown = await request.json();

    if (
      !dados ||
      typeof dados !== "object" ||
      Array.isArray(dados) ||
      !("id" in dados) ||
      typeof dados.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        dados.id
      )
    ) {
      return NextResponse.json(
        { erro: "Identificador inválido." },
        { status: 400 }
      );
    }

    const { data, error } = await banco
      .from("patient_registration_requests")
      .update({ status: "Concluído" })
      .eq("id", dados.id)
      .eq("status", "Pendente")
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("Erro ao concluir solicitação:", error);

      return NextResponse.json(
        { erro: "Não foi possível concluir a solicitação." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { erro: "Solicitação pendente não encontrada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ sucesso: true });
  } catch (error) {
    console.error("Erro ao concluir solicitação:", error);

    return NextResponse.json(
      { erro: "Erro ao processar a solicitação." },
      { status: 500 }
    );
  }
}
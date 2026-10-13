import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const inicioConfigurado = process.env.CADASTRO_ESPECIAL_INICIO;

    if (!inicioConfigurado) {
      return NextResponse.json(
        { erro: "Cadastro ainda não liberado." },
        { status: 403 }
      );
    }

    const inicio = new Date(inicioConfigurado);

    if (Number.isNaN(inicio.getTime())) {
      return NextResponse.json(
        { erro: "Período de cadastro não configurado." },
        { status: 403 }
      );
    }

    const fimPeriodoEspecial =
      inicio.getTime() + 30 * 24 * 60 * 60 * 1000;

    if (Date.now() < fimPeriodoEspecial) {
      return NextResponse.json(
        { erro: "Solicitações ainda não estão disponíveis." },
        { status: 403 }
      );
    }

    const origem = request.headers.get("origin");

    if (origem && origem !== new URL(request.url).origin) {
      return NextResponse.json(
        { erro: "Origem não permitida." },
        { status: 403 }
      );
    }

    const conteudo = await request.text();

    if (conteudo.length > 5000) {
      return NextResponse.json(
        { erro: "Dados muito extensos." },
        { status: 413 }
      );
    }

    let dados: Record<string, unknown>;

    try {
      const recebido: unknown = JSON.parse(conteudo);

      if (
        !recebido ||
        typeof recebido !== "object" ||
        Array.isArray(recebido)
      ) {
        throw new Error("Dados inválidos.");
      }

      dados = recebido as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { erro: "Dados inválidos." },
        { status: 400 }
      );
    }

    const nome =
      typeof dados.nome === "string" ? dados.nome.trim() : "";

    const telefone =
      typeof dados.telefone === "string"
        ? dados.telefone.trim()
        : "";

    const objetivo =
      typeof dados.objetivo === "string"
        ? dados.objetivo.trim()
        : "";

    if (
      nome.length < 3 ||
      nome.length > 150 ||
      telefone.length < 8 ||
      telefone.length > 20 ||
      objetivo.length < 3 ||
      objetivo.length > 200
    ) {
      return NextResponse.json(
        { erro: "Confira os dados informados." },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: permitido, error: erroLimite } =
      await supabase.rpc("verificar_limite_cadastro", {
        p_identificador: `solicitacao:${telefone.replace(/\D/g, "")}`,
      });

    if (erroLimite || permitido !== true) {
      return NextResponse.json(
        { erro: "Limite de tentativas atingido. Tente mais tarde." },
        { status: 429 }
      );
    }

    const { error } = await supabase
      .from("patient_registration_requests")
      .insert({
        name: nome,
        phone: telefone,
        objective: objetivo,
        status: "Pendente",
      });

    if (error) {
      console.error("Erro ao salvar solicitação:", error);

      return NextResponse.json(
        { erro: "Não foi possível enviar a solicitação." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        sucesso: true,
        mensagem: "Solicitação enviada com sucesso!",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro na API de solicitação:", error);

    return NextResponse.json(
      { erro: "Erro ao processar a solicitação." },
      { status: 500 }
    );
  }
}
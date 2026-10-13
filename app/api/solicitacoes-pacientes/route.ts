import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const autorizacao = request.headers.get("authorization");

    if (!autorizacao?.startsWith("Bearer ")) {
      return NextResponse.json(
        { erro: "Acesso não autorizado." },
        { status: 401 }
      );
    }

    const token = autorizacao.slice(7);

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const {
      data: { user },
      error: erroUsuario,
    } = await supabaseAdmin.auth.getUser(token);

    if (erroUsuario || !user) {
      return NextResponse.json(
        { erro: "Sessão inválida." },
        { status: 401 }
      );
    }

    const { data: perfil, error: erroPerfil } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (
      erroPerfil ||
      !perfil ||
      perfil.role !== "nutricionista"
    ) {
      return NextResponse.json(
        { erro: "Acesso permitido somente ao nutricionista." },
        { status: 403 }
      );
    }

    const { data: solicitacoes, error: erroSolicitacoes } =
      await supabaseAdmin
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
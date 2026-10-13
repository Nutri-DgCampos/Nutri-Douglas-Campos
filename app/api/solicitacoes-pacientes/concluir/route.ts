import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const origem = request.headers.get("origin");

    if (origem && origem !== new URL(request.url).origin) {
      return NextResponse.json(
        { erro: "Origem não permitida." },
        { status: 403 }
      );
    }

    const autorizacao = request.headers.get("authorization");

    if (!autorizacao?.startsWith("Bearer ")) {
      return NextResponse.json(
        { erro: "Acesso não autorizado." },
        { status: 401 }
      );
    }

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

    const token = autorizacao.slice(7);

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

    const { data: perfil, error: erroPerfil } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (erroPerfil || perfil?.role !== "nutricionista") {
      return NextResponse.json(
        { erro: "Acesso permitido somente ao nutricionista." },
        { status: 403 }
      );
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

    const { data, error } = await supabaseAdmin
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
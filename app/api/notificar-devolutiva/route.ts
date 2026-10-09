import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

export const runtime = "nodejs";

function criarSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SECRET_KEY;

  if (!url || !chave) {
    throw new Error("Configuração do Supabase incompleta.");
  }

  return createClient(url, chave, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function verificarNutricionista(
  token: string,
  supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>
) {
  const {
    data: { user },
    error: erroUsuario,
  } = await supabaseAdmin.auth.getUser(token);

  if (erroUsuario || !user) {
    return false;
  }

  const { data: perfil, error: erroPerfil } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (erroPerfil || perfil?.role !== "nutricionista") {
    return false;
  }

  return true;
}

export async function POST(request: Request) {
  try {
    const autorizacao = request.headers.get("authorization");

if (!autorizacao?.startsWith("Bearer ")) {
  return NextResponse.json(
    { error: "Autenticação necessária." },
    { status: 401 }
  );
}

const tokenRecebido = autorizacao.slice(7).trim();
const cronSecret = process.env.CRON_SECRET;

const autorizadoPorCron =
  !!cronSecret &&
  cronSecret.length >= 32 &&
  tokenRecebido.length === cronSecret.length &&
  (() => {
    const crypto = require("node:crypto");

    return crypto.timingSafeEqual(
      Buffer.from(tokenRecebido),
      Buffer.from(cronSecret)
    );
  })();

    const token = autorizacao.slice(7).trim();
    const supabaseAdmin = criarSupabaseAdmin();

    const autorizado = await verificarNutricionista(
      token,
      supabaseAdmin
    );

    if (!autorizado) {
      return NextResponse.json(
        { error: "Acesso permitido somente ao nutricionista." },
        { status: 403 }
      );
    }

    const dados = await request.json();
    const relatorioId = dados?.relatorioId;

    if (
      typeof relatorioId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(relatorioId)
    ) {
      return NextResponse.json(
        { error: "Identificador do relatório inválido." },
        { status: 400 }
      );
    }

    const { data: relatorio, error: erroRelatorio } =
      await supabaseAdmin
        .from("patient_reports")
        .select("id, patient_id, status, feedback_text")
        .eq("id", relatorioId)
        .maybeSingle();

    if (erroRelatorio) {
      return NextResponse.json(
        { error: "Erro ao consultar relatório." },
        { status: 500 }
      );
    }

    if (
      !relatorio ||
      relatorio.status !== "enviado" ||
      !relatorio.feedback_text?.trim()
    ) {
      return NextResponse.json(
        { error: "Devolutiva ainda não publicada." },
        { status: 409 }
      );
    }

    const { error: erroFila } = await supabaseAdmin
  .from("notification_queue")
  .upsert(
    {
      patient_id: relatorio.patient_id,
      notification_type: "devolutiva",
      title: "🔔 Sua devolutiva está disponível!",
      body: "Seu nutricionista publicou a resposta ao seu relatório.",
      target_url: "/area-paciente/relatorios",
      reference_id: relatorio.id,
      dedup_key: `devolutiva:${relatorio.id}`,
      status: "pendente",
    },
    {
      onConflict: "dedup_key",
      ignoreDuplicates: true,
    }
  );

if (erroFila) {
  console.error("Erro ao registrar notificação:", erroFila);

  return NextResponse.json(
    { error: "Não foi possível registrar a notificação." },
    { status: 500 }
  );
}

return NextResponse.json({
  success: true,
  message: "Notificação de devolutiva registrada na fila.",
});
  } catch (erro) {
    console.error("Erro na rota de devolutiva push:", erro);

    return NextResponse.json(
      { error: "Erro interno ao verificar a devolutiva." },
      { status: 500 }
    );
  }
}
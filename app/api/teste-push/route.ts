import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";

export const runtime = "nodejs";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;

if (vapidPublicKey && vapidPrivateKey && vapidSubject) {
  webpush.setVapidDetails(
    vapidSubject,
    vapidPublicKey,
    vapidPrivateKey
  );
}

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

    const token = autorizacao.slice(7).trim();

    if (!token) {
      return NextResponse.json(
        { error: "Token não informado." },
        { status: 401 }
      );
    }

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

    const { data: inscricoes, error: erroInscricoes } =
  await supabaseAdmin
    .from("push_subscriptions")
    .select("id, patient_id, endpoint, p256dh, auth_key")
    .eq("patient_id", "40e67941-394e-4fe3-846e-a5800dd6150d");

if (erroInscricoes) {
  console.error("Erro ao consultar inscrições:", erroInscricoes);

  return NextResponse.json(
    { error: "Não foi possível consultar os dispositivos." },
    { status: 500 }
  );
}

console.log(
  "Quantidade de dispositivos cadastrados:",
  inscricoes?.length ?? 0
);

if (!inscricoes || inscricoes.length === 0) {
  return NextResponse.json(
    { error: "Nenhum dispositivo encontrado para o paciente de teste." },
    { status: 404 }
  );
}

const mensagem = JSON.stringify({
  title: "🔔 Acompanhamento Nutricional",
  body: "Esta é uma notificação de teste. Seu dispositivo está conectado!",
  url: "/area-paciente",
});

for (const inscricao of inscricoes) {
  await webpush.sendNotification(
    {
      endpoint: inscricao.endpoint,
      keys: {
        p256dh: inscricao.p256dh,
        auth: inscricao.auth_key,
      },
    },
    mensagem
  );
}

    return NextResponse.json({
      success: true,
      message: "Nutricionista autenticado e autorizado.",
    });
  } catch (erro) {
    console.error("Erro na rota de teste push:", erro);

    return NextResponse.json(
      { error: "Erro interno ao verificar autorização." },
      { status: 500 }
    );
  }
}
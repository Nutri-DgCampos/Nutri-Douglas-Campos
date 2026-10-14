import { banco } from "@/lib/servidor/banco";
import { exigirNutricionista } from "@/lib/servidor/http";
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

export async function POST(request: Request) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    const corpo = await request.json().catch(() => null);

const patientId = corpo?.patientId;

if (
  typeof patientId !== "string" ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientId)
) {
  return NextResponse.json(
    { error: "ID do paciente inválido ou não informado." },
    { status: 400 }
  );
}


    const { data: inscricoes, error: erroInscricoes } =
  await banco
    .from("push_subscriptions")
    .select("id, patient_id, endpoint, p256dh, auth_key")
    .eq("patient_id", patientId);

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
      message: "Notificação de teste enviada ao serviço de push.",
    });
  } catch (erro) {
    console.error("Erro na rota de teste push:", erro);

    return NextResponse.json(
      { error: "Erro interno ao verificar autorização." },
      { status: 500 }
    );
  }
}
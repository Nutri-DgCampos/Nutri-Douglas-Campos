import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import webpush from "web-push";
import crypto from "node:crypto";

export const runtime = "nodejs";

function configurarWebPush() {
  const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const chavePrivada = process.env.VAPID_PRIVATE_KEY;
  const identificacao = process.env.VAPID_SUBJECT;

  if (!chavePublica || !chavePrivada || !identificacao) {
    throw new Error("Configuração VAPID incompleta.");
  }

  webpush.setVapidDetails(
    identificacao,
    chavePublica,
    chavePrivada
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

async function finalizarNotificacao(
  supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>,
  notificacaoId: string,
  sucesso: boolean,
  mensagemErro?: string
) {
  const { data, error } = await supabaseAdmin.rpc(
    "finalizar_notificacao",
    {
      p_notificacao_id: notificacaoId,
      p_sucesso: sucesso,
      p_erro: mensagemErro ?? null,
    }
  );

  if (error) {
    console.error("Erro ao finalizar notificação:", error);
    throw new Error("Não foi possível finalizar a notificação.");
  }

  if (data !== true) {
    throw new Error(
      "A notificação não estava disponível para finalização."
    );
  }
}

async function consultarNotificacoesInterrompidas(
  supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>
) {
  const { data, error } = await supabaseAdmin.rpc(
    "consultar_notificacoes_interrompidas"
  );

  if (error) {
    console.error(
      "Erro ao consultar notificações interrompidas:",
      error
    );

    throw new Error(
      "Não foi possível consultar notificações interrompidas."
    );
  }

  return data ?? [];
}

function obterMensagemErro(erro: unknown): string {
  if (erro instanceof Error) {
    return erro.message;
  }

  return "Erro desconhecido durante o envio da notificação.";
}

function montarMensagemPush(notificacao: {
  title: string;
  body: string;
  target_url: string;
}) {
  return JSON.stringify({
    title: notificacao.title,
    body: notificacao.body,
    url: notificacao.target_url,
  });
}

async function enviarPushParaDispositivo(
  dispositivo: {
    endpoint: string;
    p256dh: string;
    auth_key: string;
  },
  mensagem: string
) {
  await webpush.sendNotification(
    {
      endpoint: dispositivo.endpoint,
      keys: {
        p256dh: dispositivo.p256dh,
        auth: dispositivo.auth_key,
      },
    },
    mensagem
  );
}

async function removerDispositivoExpirado(
  supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>,
  dispositivoId: string
) {
  const { error } = await supabaseAdmin
    .from("push_subscriptions")
    .delete()
    .eq("id", dispositivoId);

  if (error) {
    console.error(
      "Erro ao remover inscrição push expirada:",
      error
    );

    throw new Error(
      "Não foi possível remover a inscrição expirada."
    );
  }
}

async function enviarPushParaDispositivos(
  supabaseAdmin: ReturnType<typeof criarSupabaseAdmin>,
  dispositivos: {
    id: string;
    endpoint: string;
    p256dh: string;
    auth_key: string;
  }[],
  mensagem: string
) {
  let enviados = 0;
  const erros: string[] = [];

  for (const dispositivo of dispositivos) {
    try {
      await enviarPushParaDispositivo(dispositivo, mensagem);
      enviados++;
    } catch (erro) {
      const statusCode =
        typeof erro === "object" &&
        erro !== null &&
        "statusCode" in erro
          ? erro.statusCode
          : undefined;

      if (statusCode === 404 || statusCode === 410) {
        console.warn(
          "Inscrição push expirada ou inexistente:",
          dispositivo.id
        );

        try {
          await removerDispositivoExpirado(
            supabaseAdmin,
            dispositivo.id
          );
        } catch (erroRemocao) {
          console.error(
            "Falha ao remover dispositivo expirado:",
            erroRemocao
          );
        }
      } else {
        console.error(
          "Falha ao enviar push para dispositivo:",
          dispositivo.id,
          erro
        );
      }

      erros.push(obterMensagemErro(erro));
    }
  }

  return {
    enviados,
    erros,
  };
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

async function processarNotificacoes(request: Request) {
  try {
    const autorizacao = request.headers.get("authorization");

    const tokenRecebido = autorizacao?.startsWith("Bearer ")
  ? autorizacao.slice(7).trim()
  : "";

const cronSecret = process.env.CRON_SECRET;

const autorizadoPorCron =
  !!cronSecret &&
  cronSecret.length >= 32 &&
  tokenRecebido.length === cronSecret.length &&
  crypto.timingSafeEqual(
    Buffer.from(tokenRecebido),
    Buffer.from(cronSecret)
  );

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

if (!autorizadoPorCron) {
  const autorizado = await verificarNutricionista(
    token,
    supabaseAdmin
  );

  if (!autorizado) {
    return NextResponse.json(
      { error: "Acesso não autorizado." },
      { status: 403 }
    );
  }
}

const notificacoesInterrompidas =
  await consultarNotificacoesInterrompidas(supabaseAdmin);

if (notificacoesInterrompidas.length > 0) {
  console.warn(
    "Notificações com processamento possivelmente interrompido:",
    notificacoesInterrompidas.length
  );
}

    const { data: notificacoes, error: erroFila } =
  await supabaseAdmin.rpc("reservar_proxima_notificacao");

if (erroFila) {
  console.error("Erro ao consultar fila:", erroFila);

  return NextResponse.json(
    { error: "Não foi possível consultar as notificações." },
    { status: 500 }
  );
}

const notificacao = notificacoes?.[0];

if (!notificacao) {
  return NextResponse.json({
    success: true,
    message: "Nenhuma notificação pendente.",
  });
}

const { data: dispositivos, error: erroDispositivos } =
  await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("patient_id", notificacao.patient_id);

if (erroDispositivos) {
  console.error(
    "Erro ao consultar dispositivos:",
    erroDispositivos
  );

  try {
    await finalizarNotificacao(
      supabaseAdmin,
      notificacao.id,
      false,
      "Erro ao consultar os dispositivos do paciente."
    );
  } catch (erroFinalizacao) {
    console.error(
      "Não foi possível registrar a falha:",
      erroFinalizacao
    );
  }

  return NextResponse.json(
    { error: "Não foi possível consultar os dispositivos." },
    { status: 500 }
  );
}

try {
  if (!dispositivos || dispositivos.length === 0) {
    await finalizarNotificacao(
      supabaseAdmin,
      notificacao.id,
      false,
      "O paciente não possui dispositivos cadastrados."
    );

    return NextResponse.json({
      success: false,
      message: "Paciente sem dispositivos cadastrados.",
    });
  }

  configurarWebPush();

  const mensagem = montarMensagemPush(notificacao);

  

  const resultado = await enviarPushParaDispositivos(
  supabaseAdmin,
  dispositivos,
  mensagem
);

  const sucesso = resultado.enviados > 0;

if (resultado.erros.length > 0) {
  console.warn(
    "Falhas em dispositivos durante o envio:",
    {
      notificacaoId: notificacao.id,
      enviados: resultado.enviados,
      falhas: resultado.erros.length,
    }
  );
}

await finalizarNotificacao(
  supabaseAdmin,
  notificacao.id,
  sucesso,
  sucesso
    ? undefined
    : resultado.erros.join(" | ") ||
        "Nenhum dispositivo aceitou o envio."
);

  return NextResponse.json({
    success: sucesso,
    message: sucesso
      ? "Notificação enviada ao serviço de push."
      : "Não foi possível enviar a notificação.",
    enviados: resultado.enviados,
    falhas: resultado.erros.length,
  });
} catch (erroEnvio) {
  console.error("Erro no processamento da notificação:", erroEnvio);

  try {
    await finalizarNotificacao(
      supabaseAdmin,
      notificacao.id,
      false,
      obterMensagemErro(erroEnvio)
    );
  } catch (erroFinalizacao) {
    console.error(
      "Não foi possível registrar a falha:",
      erroFinalizacao
    );
  }

  return NextResponse.json(
    { error: "Falha ao processar a notificação." },
    { status: 500 }
  );
}

return NextResponse.json({
  success: true,
  message: "Consulta da fila realizada com sucesso.",
  quantidadePendente: notificacoes?.length ?? 0,
});
  } catch (erro) {
    console.error("Erro ao processar notificações:", erro);

    return NextResponse.json(
      { error: "Erro interno no processamento." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return processarNotificacoes(request);
}

export async function GET(request: Request) {
  return processarNotificacoes(request);
}
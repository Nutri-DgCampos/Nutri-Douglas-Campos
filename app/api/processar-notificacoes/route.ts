import { banco } from "@/lib/servidor/banco";
import { autorizadoPorCron as chamadaDoCron } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
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

async function finalizarNotificacao(
  notificacaoId: string,
  sucesso: boolean,
  mensagemErro?: string
) {
  const { data, error } = await banco.rpc(
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
) {
  const { data, error } = await banco.rpc(
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
  dispositivoId: string
) {
  const { error } = await banco
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

async function processarNotificacoes(request: Request) {
  try {
    // Aceita o agendador (CRON_SECRET) ou o nutricionista conectado.
    const cronSecret = process.env.CRON_SECRET;
    const autorizadoPorCron = chamadaDoCron(request);

    if (!autorizadoPorCron) {
      const contexto = await obterContexto();

      if (!contexto) {
        return NextResponse.json(
          { error: "Autenticação necessária." },
          { status: 401 }
        );
      }

      if (contexto.papel !== "nutricionista") {
        return NextResponse.json(
          { error: "Acesso não autorizado." },
          { status: 403 }
        );
      }
    }

if (autorizadoPorCron) {
  try {
    const urlAgendamento = new URL(
      "/api/agendar-relatorios",
      request.url
    );

    const respostaAgendamento = await fetch(
      urlAgendamento.toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
        cache: "no-store",
      }
    );

    if (!respostaAgendamento.ok) {
      console.error(
        "Falha ao agendar lembretes:",
        respostaAgendamento.status
      );
    }
  } catch (erroAgendamento) {
    console.error(
      "Erro ao executar agendamento de relatórios:",
      erroAgendamento
    );
  }
}

const notificacoesInterrompidas =
  await consultarNotificacoesInterrompidas();

if (notificacoesInterrompidas.length > 0) {
  console.warn(
    "Notificações com processamento possivelmente interrompido:",
    notificacoesInterrompidas.length
  );
}

    const { data: notificacoes, error: erroFila } =
  await banco.rpc("reservar_proxima_notificacao");

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

if (notificacao.notification_type === "lembrete_relatorio") {
  const identificador = String(notificacao.dedup_key ?? "");

  const correspondencia = identificador.match(
    /^relatorio:([0-9a-f-]{36}):(\d{4}-\d{2}-\d{2}):(segunda|terca)$/i
  );

  if (
  !correspondencia ||
  !notificacao.reference_id ||
  correspondencia[1].toLowerCase() !==
    String(notificacao.reference_id).toLowerCase()
) {
  console.error(
    "Lembrete de relatório com identificação inválida:",
    notificacao.id
  );

  const { data: cancelada, error: erroCancelamento } =
    await banco
      .from("notification_queue")
      .update({
        status: "cancelada",
        last_error: "Identificação inválida do lembrete.",
        processing_started_at: null,
      })
      .eq("id", notificacao.id)
      .eq("status", "processando")
      .select("id")
      .maybeSingle();

  if (erroCancelamento || !cancelada) {
    console.error(
      "Não foi possível cancelar o lembrete inválido:",
      erroCancelamento
    );

    return NextResponse.json(
      { error: "Falha ao cancelar lembrete inválido." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Lembrete inválido cancelado.",
  });
}

  const [, cicloId, segundaPrevista] = correspondencia;

    const tipoLembrete = correspondencia[3];

  const horarioBrasil = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const obterHorario = (tipo: string) =>
    horarioBrasil.find((parte) => parte.type === tipo)?.value ?? "";

  const diaSemana = obterHorario("weekday");
  const hora = Number(obterHorario("hour"));
  const minuto = Number(obterHorario("minute"));
  const minutosDoDia = hora * 60 + minuto;

  const horarioValido =
    (tipoLembrete === "segunda" &&
      diaSemana === "Mon" &&
      minutosDoDia >= 9 * 60 &&
      minutosDoDia < 10 * 60) ||
    (tipoLembrete === "terca" &&
      diaSemana === "Tue" &&
      minutosDoDia >= 18 * 60 &&
      minutosDoDia < 19 * 60);

  if (!horarioValido) {
    const { data: cancelada, error: erroCancelamento } =
      await banco
        .from("notification_queue")
        .update({
          status: "cancelada",
          last_error: "Horário permitido para o lembrete encerrado.",
          processing_started_at: null,
        })
        .eq("id", notificacao.id)
        .eq("status", "processando")
        .select("id")
        .maybeSingle();

    if (erroCancelamento || !cancelada) {
      console.error(
        "Erro ao cancelar lembrete fora do horário:",
        erroCancelamento
      );

      return NextResponse.json(
        { error: "Não foi possível cancelar o lembrete atrasado." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lembrete cancelado: fora do horário permitido.",
    });
  }

    const partesHoje = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const obterParteHoje = (tipo: string) =>
    partesHoje.find((parte) => parte.type === tipo)?.value ?? "";

  const hojeBrasil = [
    obterParteHoje("year"),
    obterParteHoje("month"),
    obterParteHoje("day"),
  ].join("-");

  const dataSegundaAtual = new Date(`${hojeBrasil}T12:00:00Z`);

  const diasDesdeSegunda =
    (dataSegundaAtual.getUTCDay() + 6) % 7;

  dataSegundaAtual.setUTCDate(
    dataSegundaAtual.getUTCDate() - diasDesdeSegunda
  );

  const segundaAtual = dataSegundaAtual
    .toISOString()
    .slice(0, 10);

  if (segundaPrevista !== segundaAtual) {
    const { data: cancelada, error: erroCancelamento } =
      await banco
        .from("notification_queue")
        .update({
          status: "cancelada",
          last_error: "Semana do relatório já encerrada.",
          processing_started_at: null,
        })
        .eq("id", notificacao.id)
        .eq("status", "processando")
        .select("id")
        .maybeSingle();

    if (erroCancelamento || !cancelada) {
      console.error(
        "Erro ao cancelar lembrete fora da semana:",
        erroCancelamento
      );

      return NextResponse.json(
        { error: "Não foi possível cancelar o lembrete antigo." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lembrete cancelado: semana não corresponde à atual.",
    });
  }

    async function devolverLembreteParaFila() {
    const { error } = await banco
      .from("notification_queue")
      .update({
        status: "pendente",
        processing_started_at: null,
        last_error: "Falha temporária na verificação do relatório.",
      })
      .eq("id", notificacao.id)
      .eq("status", "processando");

    if (error) {
      console.error(
        "Erro ao devolver lembrete para a fila:",
        error
      );
    }
  }

    const { data: ciclo, error: erroCiclo } =
    await banco
      .from("diet_cycles")
      .select("id, patient_id, status, start_date, end_date")
      .eq("id", cicloId)
      .maybeSingle();

  if (erroCiclo) {
  console.error(
    "Erro ao verificar ciclo do lembrete:",
    erroCiclo
  );

  await devolverLembreteParaFila();

  return NextResponse.json(
    { error: "Não foi possível verificar o ciclo." },
    { status: 500 }
  );
}

  const partesDataBrasil = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());

const obterParteData = (tipo: string) =>
  partesDataBrasil.find((parte) => parte.type === tipo)?.value ?? "";

const dataAtualBrasil = [
  obterParteData("year"),
  obterParteData("month"),
  obterParteData("day"),
].join("-");

  const cicloInvalido =
    !ciclo ||
    ciclo.status !== "ativo" ||
    ciclo.patient_id !== notificacao.patient_id ||
    ciclo.start_date > dataAtualBrasil ||
    (ciclo.end_date && ciclo.end_date < dataAtualBrasil);

  if (cicloInvalido) {
    const { data: cancelada, error: erroCancelamento } =
      await banco
        .from("notification_queue")
        .update({
          status: "cancelada",
          last_error: null,
        })
        .eq("id", notificacao.id)
        .eq("status", "processando")
        .select("id")
        .maybeSingle();

    if (erroCancelamento || !cancelada) {
      console.error(
        "Erro ao cancelar lembrete de ciclo inativo:",
        erroCancelamento
      );

      return NextResponse.json(
        { error: "Não foi possível cancelar o lembrete." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lembrete cancelado: ciclo inativo ou encerrado.",
    });
  }

  const { data: relatorios, error: erroRelatorios } =
    await banco
      .from("patient_reports")
      .select("id")
      .eq("cycle_id", cicloId)
      .eq("scheduled_week_start", segundaPrevista)
      .limit(1);

  if (erroRelatorios) {
  console.error(
    "Erro ao verificar relatório respondido:",
    erroRelatorios
  );

  await devolverLembreteParaFila();

  return NextResponse.json(
    { error: "Não foi possível verificar o relatório." },
    { status: 500 }
  );
}

  if ((relatorios?.length ?? 0) > 0) {
    const { error: erroCancelamento } = await banco
      .from("notification_queue")
      .update({
        status: "cancelada",
        last_error: null,
      })
      .eq("id", notificacao.id)
      .eq("status", "processando");

    if (erroCancelamento) {
      console.error(
        "Erro ao cancelar lembrete:",
        erroCancelamento
      );

      return NextResponse.json(
        { error: "Não foi possível cancelar o lembrete." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lembrete cancelado: relatório já respondido.",
    });
  }
}

const { data: dispositivos, error: erroDispositivos } =
  await banco
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
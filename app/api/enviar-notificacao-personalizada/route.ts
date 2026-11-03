
import { banco, obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista } from "@/lib/servidor/http";
import { NextResponse } from "next/server";
import webpush from "web-push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    const corpo = await request.json().catch(() => null);

    const mensagemTexto = corpo?.mensagem;

    if (
      typeof mensagemTexto !== "string" ||
      !mensagemTexto.trim() ||
      mensagemTexto.trim().length > 300
    ) {
      return NextResponse.json(
        { error: "Informe uma mensagem de até 300 caracteres." },
        { status: 400 }
      );
    }

    const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const chavePrivada = process.env.VAPID_PRIVATE_KEY;
    const identificacao = process.env.VAPID_SUBJECT;

    if (!chavePublica || !chavePrivada || !identificacao) {
      return NextResponse.json(
        { error: "Configuração de notificações incompleta." },
        { status: 500 }
      );
    }

    webpush.setVapidDetails(
      identificacao,
      chavePublica,
      chavePrivada
    );

    const dispositivos: {
      id: string;
      endpoint: string;
      p256dh: string;
      auth_key: string;
    }[] = [];

    const tamanhoPagina = 500;
    let pagina = 0;

    while (true) {
      const inicio = pagina * tamanhoPagina;
      const fim = inicio + tamanhoPagina - 1;

      const { data, error } = await banco
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth_key")
        .order("id", { ascending: true })
        .range(inicio, fim);

      if (error) {
        console.error("Erro ao consultar dispositivos:", error);

        return NextResponse.json(
          { error: "Não foi possível consultar os dispositivos." },
          { status: 500 }
        );
      }

      dispositivos.push(...(data ?? []));

      if (!data || data.length < tamanhoPagina) {
        break;
      }

      pagina++;
    }

    // Alunos próprios de educadores físicos não recebem avisos da Nutrição.
    const doTreino = await obterPool().query<{ id: string }>(
      `select s.id from public.push_subscriptions s
         join public.patients p on p.id = s.patient_id
        where p.educador_dono_id is not null`
    );
    const foraDaClinica = new Set(doTreino.rows.map((l) => l.id));
    const daClinica = dispositivos.filter((d) => !foraDaClinica.has(d.id));
    dispositivos.length = 0;
    dispositivos.push(...daClinica);

    if (dispositivos.length === 0) {
      return NextResponse.json({
        success: true,
        enviados: 0,
        falhas: 0,
        message: "Nenhum dispositivo cadastrado para notificações.",
      });
    }

    const mensagem = JSON.stringify({
      title: "🔔 Acompanhamento Nutricional",
      body: mensagemTexto.trim(),
      url: "/area-paciente",
    });

    let enviados = 0;
    let falhas = 0;

    for (const dispositivo of dispositivos) {
      try {
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

        enviados++;
      } catch (erro) {
        falhas++;

        const statusCode =
          typeof erro === "object" &&
          erro !== null &&
          "statusCode" in erro
            ? erro.statusCode
            : undefined;

        if (statusCode === 404 || statusCode === 410) {
          const { error: erroRemocao } = await banco
            .from("push_subscriptions")
            .delete()
            .eq("id", dispositivo.id);

          if (erroRemocao) {
            console.error(
              "Erro ao remover inscrição expirada:",
              erroRemocao
            );
          }
        } else {
          console.error(
            "Erro ao enviar notificação:",
            dispositivo.id,
            erro
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      enviados,
      falhas,
      message:
        `Envio concluído. ${enviados} dispositivo(s) ` +
        `receberam a solicitação de notificação. ` +
        `${falhas} falha(s).`,
    });
  } catch (erro) {
    console.error(
      "Erro ao enviar notificações personalizadas:",
      erro
    );

    return NextResponse.json(
      { error: "Erro interno ao enviar notificações." },
      { status: 500 }
    );
  }
}

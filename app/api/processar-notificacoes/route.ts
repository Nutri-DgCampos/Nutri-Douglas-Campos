import { processarFila } from "@/lib/servidor/filaDeNotificacoes";
import { autorizadoPorCron as chamadaDoCron } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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

const resultado = await processarFila(autorizadoPorCron ? 50 : 1);

return NextResponse.json({ success: true, ...resultado });
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
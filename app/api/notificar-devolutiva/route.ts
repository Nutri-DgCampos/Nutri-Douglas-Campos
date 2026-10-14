import { banco } from "@/lib/servidor/banco";
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
      await banco
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

    const { error: erroFila } = await banco
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
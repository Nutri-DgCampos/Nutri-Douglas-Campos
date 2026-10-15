import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { enfileirarAtualizacao } from "@/lib/servidor/notificacoes";

export const runtime = "nodejs";

// Avisa o paciente no celular que uma nova dieta foi publicada.
export async function POST(request: Request) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    const dados = await request.json().catch(() => null);
    const entregaId = dados?.entregaId;

    if (
      typeof entregaId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entregaId)
    ) {
      return recusar("Identificador da entrega inválido.", 400);
    }

    const resultado = await obterPool().query<{ patient_id: string }>(
      "select patient_id from public.diet_deliveries where id = $1 and status = 'concluida'",
      [entregaId]
    );

    const entrega = resultado.rows[0];

    if (!entrega) {
      return recusar("Dieta ainda não publicada.", 409);
    }

    await enfileirarAtualizacao("dieta", entrega.patient_id, entregaId);

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao registrar notificação de dieta:", erro);
    return recusar("Não foi possível registrar a notificação.", 500);
  }
}

import { NextResponse } from "next/server";
import { disposicao } from "@/lib/servidor/pdf/documento";
import { gerarPdfExemplo } from "@/lib/servidor/pdf/exemplo";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// PDF de conferência da identidade visual (Configurações → Identidade visual).
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  try {
    const pdf = await gerarPdfExemplo(await carregarIdentidade());

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposicao("Exemplo - Plano Alimentar.pdf"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar PDF de exemplo:", erro);
    return recusar("Não foi possível gerar o PDF.", 500);
  }
}

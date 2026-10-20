import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { UUID, buscarDieta, dadosDaEmissao } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { gerarPdfDaDieta } from "@/lib/servidor/pdf/dieta";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";

export const runtime = "nodejs";

// PDF de conferência do rascunho atual. Só gera o arquivo: não publica a
// dieta nem mexe no ciclo de 33 dias.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const url = new URL(request.url);
  const modelo = url.searchParams.get("modelo") === "detalhado" ? "detalhado" : "simples";
  const baixar = url.searchParams.get("baixar") === "1";

  const dieta = await buscarDieta(id);
  if (!dieta) return recusar("Dieta não encontrada.", 404);

  try {
    const dados = await dadosDaEmissao(dieta, dieta.rascunho);
    if (!dados) return recusar("Paciente ou consulta não encontrados.", 404);

    const pdf = await gerarPdfDaDieta({ ...dados, modelo }, await carregarIdentidade());
    const nome = nomeDoArquivo("Dieta", dados.paciente.nome, hojeNoBrasil());

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposicao(nome, baixar),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar PDF da dieta:", erro);
    return recusar("Não foi possível gerar o PDF.", 500);
  }
}

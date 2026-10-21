import { NextResponse } from "next/server";
import { gravarArquivo, resolverCaminho } from "@/lib/servidor/arquivos";
import { buscarAvaliacao } from "@/lib/servidor/avaliacoes";
import { lerPdfDeBioimpedancia } from "@/lib/servidor/bioimpedancia";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";
export const maxDuration = 120;

const LIMITE = 20 * 1024 * 1024;

// "Anexar exame de bioimpedância": guarda o PDF original (vinculado ao
// paciente e à avaliação) e tenta ler os resultados. Devolve os valores lidos
// para conferência; a tela só os aplica depois que o nutricionista confirma.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const avaliacao = await buscarAvaliacao(id);
  if (!avaliacao) return recusar("Avaliação não encontrada.", 404);
  if (avaliacao.status !== "rascunho") return recusar("A avaliação está finalizada. Reabra para corrigir.", 409);

  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get("arquivo");
  if (!(arquivo instanceof File)) return recusar("Envie o PDF do exame.", 400);
  if (arquivo.size > LIMITE) return recusar("O PDF passa de 20 MB.", 400);

  const conteudo = Buffer.from(await arquivo.arrayBuffer());
  if (conteudo.subarray(0, 5).toString() !== "%PDF-") return recusar("O arquivo não é um PDF.", 400);

  const caminho = `${avaliacao.patient_id}/${id}/bioimpedancia-${Date.now()}.pdf`;
  const destino = resolverCaminho("avaliacoes", caminho);
  if (!destino) return recusar("Caminho inválido.", 400);
  await gravarArquivo(destino, conteudo, false);

  const pdf = { caminho, nome: arquivo.name.slice(0, 300) || "bioimpedancia.pdf" };

  try {
    const leitura = await lerPdfDeBioimpedancia(destino, pdf.nome, avaliacao.patient_id);
    return NextResponse.json({ pdf, leitura });
  } catch (erro) {
    console.error("Erro ao ler PDF de bioimpedância:", erro);
    // O PDF fica guardado; o preenchimento segue manual.
    return NextResponse.json({
      pdf,
      leitura: null,
      erro: "Não foi possível ler os resultados do PDF. O arquivo ficou anexado; preencha os valores manualmente.",
    });
  }
}

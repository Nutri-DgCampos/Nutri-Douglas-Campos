import { NextResponse } from "next/server";
import type { ExameDaLista } from "@/lib/nutricao/exames";
import { hojeNoBrasil } from "@/lib/cronograma";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";
import { gerarPdfDaSolicitacao } from "@/lib/servidor/pdf/solicitacaoExames";

export const runtime = "nodejs";

// Prévia (ou reimpressão) da solicitação. Depois de emitida, abre o PDF
// guardado no envio pela tela; esta rota gera a partir dos dados congelados.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Solicitação inválida.", 400);
  const s = await obterPool().query<{ paciente: string; titulo: string; exames: ExameDaLista[]; observacoes: string; emitida_em: string | null }>(
    `select p.name as paciente, s.titulo, s.exames, s.observacoes, s.emitida_em
       from public.solicitacoes_exames s join public.patients p on p.id = s.patient_id where s.id = $1`,
    [id]
  );
  if (!s.rows[0]) return recusar("Solicitação não encontrada.", 404);
  const linha = s.rows[0];
  const data = linha.emitida_em
    ? new Date(linha.emitida_em).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    : hojeNoBrasil();
  try {
    const pdf = await gerarPdfDaSolicitacao(
      { paciente: linha.paciente, data, titulo: linha.titulo, exames: linha.exames, observacoes: linha.observacoes, rascunho: !linha.emitida_em },
      await carregarIdentidade()
    );
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposicao(nomeDoArquivo("Solicitação de exames", linha.paciente, data), new URL(request.url).searchParams.get("baixar") === "1"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar PDF da solicitação:", erro);
    return recusar("Não foi possível gerar o PDF.", 500);
  }
}

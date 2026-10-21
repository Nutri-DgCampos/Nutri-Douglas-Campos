import { NextResponse } from "next/server";
import { idadeEm } from "@/lib/nutricao/paciente";
import { buscarAvaliacao, historicoAte, pessoaDoPaciente, resultadosDe } from "@/lib/servidor/avaliacoes";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { gerarPdfDaAvaliacao } from "@/lib/servidor/pdf/avaliacao";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";

export const runtime = "nodejs";

// PDF de conferência da avaliação (preliminar se em rascunho). Não envia nada.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const avaliacao = await buscarAvaliacao(id);
  if (!avaliacao) return recusar("Avaliação não encontrada.", 404);
  const pessoa = await pessoaDoPaciente(avaliacao.patient_id);
  if (!pessoa) return recusar("Paciente não encontrado.", 404);

  try {
    const pdf = await gerarPdfDaAvaliacao(
      {
        paciente: { nome: pessoa.nome, idade: idadeEm(pessoa.nascimento, avaliacao.data), sexo: pessoa.sexo },
        data: avaliacao.data,
        preliminar: avaliacao.status !== "finalizada",
        documento: avaliacao.documento,
        resultados: resultadosDe(avaliacao, pessoa),
        historico: await historicoAte(avaliacao, pessoa),
      },
      await carregarIdentidade()
    );
    const nome = nomeDoArquivo("Avaliação física", pessoa.nome, avaliacao.data);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposicao(nome, new URL(request.url).searchParams.get("baixar") === "1"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar PDF da avaliação:", erro);
    return recusar("Não foi possível gerar o PDF.", 500);
  }
}

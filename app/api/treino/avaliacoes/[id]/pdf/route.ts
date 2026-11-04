import { NextResponse } from "next/server";
import { idadeEm } from "@/lib/nutricao/paciente";
import { feitaPorEducador, historicoAte, pessoaDoPaciente, resultadosDe } from "@/lib/servidor/avaliacoes";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { gerarPdfDaAvaliacao } from "@/lib/servidor/pdf/avaliacao";
import { carregarIdentidade, identidadeDoProfissional } from "@/lib/servidor/pdf/identidade";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { avaliacaoParaProfissional } from "@/lib/servidor/treinoAvaliacoes";

export const runtime = "nodejs";

// PDF da avaliação no Treino, com a identidade de quem a fez (H1): o
// educador autor sai com a dele; a do nutricionista, com a da clínica.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const acesso = UUID.test(id) ? await avaliacaoParaProfissional(profissional, id) : null;
  if (!acesso) return recusar("Avaliação não encontrada.", 404);
  const { avaliacao } = acesso;
  const pessoa = await pessoaDoPaciente(avaliacao.patient_id);
  if (!pessoa) return recusar("Aluno não encontrado.", 404);
  try {
    const identidade =
      avaliacao.criada_por && (await feitaPorEducador(avaliacao))
        ? await identidadeDoProfissional({ usuarioId: avaliacao.criada_por, admin: false })
        : await carregarIdentidade();
    const pdf = await gerarPdfDaAvaliacao(
      {
        paciente: { nome: pessoa.nome, idade: idadeEm(pessoa.nascimento, avaliacao.data), sexo: pessoa.sexo },
        data: avaliacao.data,
        preliminar: avaliacao.status !== "finalizada",
        documento: avaliacao.documento,
        resultados: resultadosDe(avaliacao, pessoa),
        historico: await historicoAte(avaliacao, pessoa),
      },
      identidade
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
    console.error("Erro ao gerar PDF da avaliação (Treino):", erro);
    return recusar("Não foi possível gerar o PDF.", 500);
  }
}

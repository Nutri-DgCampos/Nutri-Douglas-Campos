import { NextResponse } from "next/server";
import { idadeEm } from "@/lib/nutricao/paciente";
import { gravarArquivo, removerArquivo, resolverCaminho } from "@/lib/servidor/arquivos";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { buscarAvaliacao, historicoAte, pessoaDoPaciente, resultadosDe } from "@/lib/servidor/avaliacoes";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { enfileirarAtualizacao } from "@/lib/servidor/notificacoes";
import { nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { gerarPdfDaAvaliacao } from "@/lib/servidor/pdf/avaliacao";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";

export const runtime = "nodejs";

// "Sim, gerar e enviar": PDF da avaliação finalizada para a área do paciente.
// Um envio por finalização: cliques repetidos não duplicam; depois de uma
// correção (reabrir e finalizar de novo), sai uma nova versão e a anterior
// continua no histórico. Não mexe em dietas nem no ciclo de 33 dias.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Avaliação inválida.", 400);

  const cliente = await obterPool().connect();
  let gravado: string | null = null;

  try {
    await cliente.query("begin");
    const avaliacao = await buscarAvaliacao(id, cliente, true);
    if (!avaliacao) {
      await cliente.query("rollback");
      return recusar("Avaliação não encontrada.", 404);
    }
    if (avaliacao.status !== "finalizada") {
      await cliente.query("rollback");
      return recusar("Finalize a avaliação antes de enviar.", 409);
    }

    const ja = await cliente.query(
      "select 1 from public.avaliacoes_envios where avaliacao_id = $1 and enviada_em >= $2 limit 1",
      [id, avaliacao.finalizada_em]
    );
    if (ja.rowCount) {
      await cliente.query("rollback");
      return recusar("Esta versão da avaliação já foi enviada ao paciente.", 409);
    }

    const pessoa = await pessoaDoPaciente(avaliacao.patient_id);
    if (!pessoa) throw new Error("Paciente não encontrado.");

    const pdf = await gerarPdfDaAvaliacao(
      {
        paciente: { nome: pessoa.nome, idade: idadeEm(pessoa.nascimento, avaliacao.data), sexo: pessoa.sexo },
        data: avaliacao.data,
        preliminar: false,
        documento: avaliacao.documento,
        resultados: resultadosDe(avaliacao, pessoa),
        historico: await historicoAte(avaliacao, pessoa),
      },
      await carregarIdentidade()
    );

    const numero = await cliente.query<{ numero: number }>(
      "select coalesce(max(numero), 0) + 1 as numero from public.avaliacoes_envios where avaliacao_id = $1",
      [id]
    );
    const nome = nomeDoArquivo("Avaliação física", pessoa.nome, avaliacao.data);
    const caminho = `${avaliacao.patient_id}/${id}/avaliacao-v${numero.rows[0].numero}-${Date.now()}.pdf`;
    const destino = resolverCaminho("avaliacoes", caminho);
    if (!destino) throw new Error("Caminho inválido.");
    await gravarArquivo(destino, pdf, false);
    gravado = destino;

    const envio = await cliente.query<{ id: string }>(
      `insert into public.avaliacoes_envios (avaliacao_id, patient_id, numero, file_name, storage_path, enviada_por)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [id, avaliacao.patient_id, numero.rows[0].numero, nome, caminho, contexto.usuarioId]
    );

    await registrarAcao(
      cliente,
      { pacienteId: avaliacao.patient_id, tabela: "avaliacoes_envios", registroId: envio.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { avaliacao_id: id, numero: numero.rows[0].numero }
    );

    await cliente.query("commit");
    gravado = null;

    enfileirarAtualizacao("avaliacao", avaliacao.patient_id, envio.rows[0].id).catch((erro) =>
      console.error("Erro ao registrar aviso da avaliação:", erro)
    );

    return NextResponse.json({ numero: numero.rows[0].numero, arquivo: caminho });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    if (gravado) await removerArquivo(gravado).catch(() => undefined);
    if ((erro as { code?: string }).code === "23505") return recusar("Envio já em andamento.", 409);
    console.error("Erro ao enviar avaliação:", erro);
    return recusar("Não foi possível enviar. Nada foi publicado; tente novamente.", 500);
  } finally {
    cliente.release();
  }
}

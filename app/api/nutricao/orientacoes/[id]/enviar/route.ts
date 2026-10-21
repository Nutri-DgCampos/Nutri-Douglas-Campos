import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { orientacaoTemConteudo, type ConteudoOrientacao } from "@/lib/nutricao/orientacao";
import { removerArquivo } from "@/lib/servidor/arquivos";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { registrarDocumentoEnviado } from "@/lib/servidor/documentos";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { enfileirarAtualizacao } from "@/lib/servidor/notificacoes";
import { nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";
import { gerarPdfDaOrientacao } from "@/lib/servidor/pdf/orientacao";

export const runtime = "nodejs";

// Envia a orientação à área do paciente: o PDF desta versão fica guardado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Orientação inválida.", 400);
  const revisao = (await request.json().catch(() => null))?.revisao;

  const cliente = await obterPool().connect();
  let gravado: string | null = null;
  try {
    await cliente.query("begin");
    const o = await cliente.query<{ patient_id: string; paciente: string; titulo: string; conteudo: ConteudoOrientacao; revisao: number; arquivada_em: string | null }>(
      `select o.patient_id, p.name as paciente, o.titulo, o.conteudo, o.revisao, o.arquivada_em
         from public.orientacoes o join public.patients p on p.id = o.patient_id where o.id = $1 for update of o`,
      [id]
    );
    const linha = o.rows[0];
    if (!linha) {
      await cliente.query("rollback");
      return recusar("Orientação não encontrada.", 404);
    }
    if (linha.arquivada_em) {
      await cliente.query("rollback");
      return recusar("Orientação arquivada.", 409);
    }
    if (revisao !== linha.revisao) {
      await cliente.query("rollback");
      return recusar("A orientação mudou em outra janela. Recarregue antes de enviar.", 409);
    }
    if (!orientacaoTemConteudo(linha.conteudo)) {
      await cliente.query("rollback");
      return recusar("A orientação está vazia.", 400);
    }
    const ja = await cliente.query("select 1 from public.documentos_enviados where tipo = 'orientacao' and referencia_id = $1 and enviado_em > (select atualizada_em from public.orientacoes where id = $1)", [id]);
    if (ja.rowCount) {
      await cliente.query("rollback");
      return recusar("Esta versão já foi enviada ao paciente.", 409);
    }
    const data = hojeNoBrasil();
    const pdf = await gerarPdfDaOrientacao({ paciente: linha.paciente, data, titulo: linha.titulo, conteudo: linha.conteudo }, await carregarIdentidade());
    const documento = await registrarDocumentoEnviado(cliente, {
      pacienteId: linha.patient_id,
      tipo: "orientacao",
      referenciaId: id,
      titulo: linha.titulo,
      nomeArquivo: nomeDoArquivo(linha.titulo, linha.paciente, data),
      pdf,
      usuarioId: contexto.usuarioId,
    });
    gravado = documento.destino;
    await registrarAcao(
      cliente,
      { pacienteId: linha.patient_id, tabela: "orientacoes", registroId: id, usuarioId: contexto.usuarioId },
      "finalizacao",
      { enviada_ao_paciente: true, titulo: linha.titulo }
    );
    await cliente.query("commit");
    gravado = null;
    enfileirarAtualizacao("documento", linha.patient_id, documento.id).catch((e) => console.error("Erro ao registrar aviso:", e));
    return NextResponse.json({ ok: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    if (gravado) await removerArquivo(gravado).catch(() => undefined);
    console.error("Erro ao enviar orientação:", erro);
    return recusar("Não foi possível enviar. Nada foi publicado; tente novamente.", 500);
  } finally {
    cliente.release();
  }
}

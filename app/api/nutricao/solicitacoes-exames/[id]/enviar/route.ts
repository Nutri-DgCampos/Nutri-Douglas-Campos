import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { examesPreenchidos, type ExameDaLista } from "@/lib/nutricao/exames";
import { removerArquivo } from "@/lib/servidor/arquivos";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { registrarDocumentoEnviado } from "@/lib/servidor/documentos";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { enfileirarAtualizacao } from "@/lib/servidor/notificacoes";
import { nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";
import { gerarPdfDaSolicitacao } from "@/lib/servidor/pdf/solicitacaoExames";

export const runtime = "nodejs";

// Emitir: congela a solicitação e guarda o PDF. "paciente: true" também a
// disponibiliza na área do paciente (com aviso no celular).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Solicitação inválida.", 400);
  const paraOPaciente = (await request.json().catch(() => null))?.paciente === true;

  const cliente = await obterPool().connect();
  let gravado: string | null = null;
  try {
    await cliente.query("begin");
    const s = await cliente.query<{ patient_id: string; paciente: string; titulo: string; exames: ExameDaLista[]; observacoes: string; emitida_em: string | null }>(
      `select s.patient_id, p.name as paciente, s.titulo, s.exames, s.observacoes, s.emitida_em
         from public.solicitacoes_exames s join public.patients p on p.id = s.patient_id
        where s.id = $1 for update of s`,
      [id]
    );
    const linha = s.rows[0];
    if (!linha) {
      await cliente.query("rollback");
      return recusar("Solicitação não encontrada.", 404);
    }
    if (examesPreenchidos(linha.exames).length === 0) {
      await cliente.query("rollback");
      return recusar("Inclua ao menos um exame.", 400);
    }
    const ja = await cliente.query("select 1 from public.documentos_enviados where tipo = 'solicitacao_exames' and referencia_id = $1", [id]);
    if (linha.emitida_em && (!paraOPaciente || ja.rowCount)) {
      await cliente.query("rollback");
      return recusar(ja.rowCount ? "Esta solicitação já está na área do paciente." : "Solicitação já emitida.", 409);
    }

    const data = linha.emitida_em
      ? new Date(linha.emitida_em).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
      : hojeNoBrasil();
    if (!linha.emitida_em) {
      await cliente.query("update public.solicitacoes_exames set emitida_em = now(), atualizada_em = now() where id = $1", [id]);
      await registrarAcao(
        cliente,
        { pacienteId: linha.patient_id, tabela: "solicitacoes_exames", registroId: id, usuarioId: contexto.usuarioId },
        "finalizacao",
        { titulo: linha.titulo, enviada_ao_paciente: paraOPaciente }
      );
    }
    if (paraOPaciente) {
      const pdf = await gerarPdfDaSolicitacao(
        { paciente: linha.paciente, data, titulo: linha.titulo, exames: linha.exames, observacoes: linha.observacoes, rascunho: false },
        await carregarIdentidade()
      );
      const documento = await registrarDocumentoEnviado(cliente, {
        pacienteId: linha.patient_id,
        tipo: "solicitacao_exames",
        referenciaId: id,
        titulo: linha.titulo,
        nomeArquivo: nomeDoArquivo("Solicitação de exames", linha.paciente, data),
        pdf,
        usuarioId: contexto.usuarioId,
      });
      gravado = documento.destino;
      await cliente.query("commit");
      gravado = null;
      enfileirarAtualizacao("documento", linha.patient_id, documento.id).catch((e) => console.error("Erro ao registrar aviso:", e));
    } else {
      await cliente.query("commit");
    }
    return NextResponse.json({ ok: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    if (gravado) await removerArquivo(gravado).catch(() => undefined);
    console.error("Erro ao emitir solicitação:", erro);
    return recusar("Não foi possível emitir. Nada foi publicado; tente novamente.", 500);
  } finally {
    cliente.release();
  }
}

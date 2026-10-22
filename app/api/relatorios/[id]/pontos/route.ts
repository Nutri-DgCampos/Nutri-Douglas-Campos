import { NextResponse } from "next/server";
import { analisarRelatorio, codigosRemovidos, scoreCorrigido } from "@/lib/relatorios/pontos";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { gerarDevolutiva, lerRascunho, lerVersoes } from "@/lib/servidor/devolutiva";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { iaDisponivel } from "@/lib/servidor/ia";

export const runtime = "nodejs";
export const maxDuration = 120;

// "Remover ponto de atenção" (Responder relatório, D1): só neste relatório.
// - A resposta do paciente não muda.
// - Ponto ligado a uma parte do score: a parte volta ao máximo e o score é
//   recalculado a partir das partes gravadas (determinístico; repetir o
//   pedido não devolve pontos duas vezes).
// - Se já existe devolutiva em rascunho, ela é regenerada pela IA (sem
//   envio). Se a IA falhar, a remoção e o score continuam gravados e o
//   rascunho fica marcado como desatualizado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Relatório inválido.", 400);
  const dados = await request.json().catch(() => null);
  const codigo = typeof dados?.codigo === "string" ? dados.codigo : "";

  const cliente = await obterPool().connect();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let relatorio: Record<string, any>;
  // Repetir o pedido (duplo clique) não devolve pontos nem regenera de novo.
  let novo = false;
  try {
    await cliente.query("begin");
    const linha = await cliente.query("select * from public.patient_reports where id = $1 for update", [id]);
    relatorio = linha.rows[0];
    if (!relatorio) {
      await cliente.query("rollback");
      return recusar("Relatório não encontrado.", 404);
    }
    if (relatorio.status !== "pendente") {
      await cliente.query("rollback");
      return recusar("A devolutiva deste relatório já foi enviada.", 409);
    }
    if (!analisarRelatorio(relatorio).atencao.some((p) => p.codigo === codigo)) {
      await cliente.query("rollback");
      return recusar("Ponto de atenção inválido para este relatório.", 400);
    }

    const removidos = codigosRemovidos(relatorio);
    novo = !removidos.includes(codigo);
    if (novo) {
      const novos = [...removidos, codigo];
      const original = relatorio.adherence_score_original ?? relatorio.adherence_score;
      const score = scoreCorrigido({ ...relatorio, adherence_score_original: original }, novos);
      const gravado = await cliente.query(
        `update public.patient_reports
            set pontos_removidos = pontos_removidos || $2::jsonb,
                adherence_score_original = coalesce(adherence_score_original, adherence_score),
                adherence_score = $3
          where id = $1 returning *`,
        [id, JSON.stringify([{ codigo, em: new Date().toISOString(), por: contexto.usuarioId }]), score]
      );
      relatorio = gravado.rows[0];
    }
    await cliente.query("commit");
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao remover ponto de atenção:", erro);
    return recusar("Não foi possível remover o ponto de atenção.", 500);
  } finally {
    cliente.release();
  }

  // Regenera a devolutiva que já existe (fora da transação: a IA demora).
  const rascunho = await lerRascunho(id);
  let regeneracao: "nao_havia" | "ok" | "falhou" | "descartada" = "nao_havia";
  if (novo && rascunho.texto.trim()) {
    if (!iaDisponivel()) {
      regeneracao = "falhou";
      await obterPool().query("update public.devolutivas_rascunho set desatualizada = true where report_id = $1", [id]);
    } else {
      const resultado = await gerarDevolutiva(id, contexto.usuarioId, "remocao");
      regeneracao = resultado.ok ? "ok" : resultado.motivo === "descartada" ? "descartada" : "falhou";
    }
  }

  return NextResponse.json({
    relatorio: {
      id,
      adherence_score: relatorio.adherence_score,
      adherence_score_original: relatorio.adherence_score_original,
      pontos_removidos: relatorio.pontos_removidos,
    },
    regeneracao,
    rascunho: await lerRascunho(id),
    versoes: await lerVersoes(id),
  });
}

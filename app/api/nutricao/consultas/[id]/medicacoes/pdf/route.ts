import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { removerArquivo } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { registrarDocumentoEmitido } from "@/lib/servidor/documentos";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { medicacoesDaConsulta } from "@/lib/servidor/medicacoes";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";
import { gerarPdfDeMedicacoes } from "@/lib/servidor/pdf/medicacoes";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Só "Em uso" entra no resumo (suspensos e não confirmados ficam fora).
async function montar(consultaId: string) {
  const c = await obterPool().query<{ patient_id: string; paciente: string; data: string; anotacoes: string | null }>(
    `select c.patient_id, p.name as paciente, to_char(c.data, 'YYYY-MM-DD') as data,
            (select texto from public.medicacoes_anotacoes a where a.consulta_id = c.id) as anotacoes
       from public.consultas c join public.patients p on p.id = c.patient_id where c.id = $1`,
    [consultaId]
  );
  if (!c.rows[0]) return null;
  const medicacoes = (await medicacoesDaConsulta(consultaId)).filter((m) => !m.excluida_em && m.status === "em_uso").map((m) => m.dados);
  const emissao = hojeNoBrasil();
  const pdf = await gerarPdfDeMedicacoes(
    { paciente: c.rows[0].paciente, dataConsulta: c.rows[0].data, emissao, medicacoes, anotacoes: c.rows[0].anotacoes ?? "" },
    await carregarIdentidade()
  );
  return { pdf, nome: nomeDoArquivo("Medicações", c.rows[0].paciente, emissao), pacienteId: c.rows[0].patient_id };
}

// Pré-visualização.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const r = await montar(id);
  if (!r) return recusar("Consulta não encontrada.", 404);
  return new Response(new Uint8Array(r.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": disposicao(r.nome, false), "Cache-Control": "private, no-store" },
  });
}

// Emitir e guardar no histórico da consulta (não vai ao paciente).
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const r = await montar(id);
  if (!r) return recusar("Consulta não encontrada.", 404);
  const cliente = await obterPool().connect();
  let gravado: string | null = null;
  try {
    await cliente.query("begin");
    const doc = await registrarDocumentoEmitido(cliente, {
      pacienteId: r.pacienteId,
      consultaId: id,
      tipo: "medicacoes",
      titulo: "Resumo de medicações",
      nomeArquivo: r.nome,
      pdf: r.pdf,
      usuarioId: contexto.usuarioId,
    });
    gravado = doc.destino;
    await cliente.query("commit");
    return NextResponse.json({ id: doc.id, caminho: doc.caminho, nome: r.nome });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    if (gravado) await removerArquivo(gravado).catch(() => undefined);
    console.error("Erro ao emitir PDF de medicações:", erro);
    return recusar("Não foi possível emitir o PDF.", 500);
  } finally {
    cliente.release();
  }
}

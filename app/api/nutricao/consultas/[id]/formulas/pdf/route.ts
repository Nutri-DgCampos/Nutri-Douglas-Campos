import { NextResponse } from "next/server";
import { pendenciasDaFormula, validarFormula, type Formula } from "@/lib/nutricao/formula";
import { removerArquivo } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { registrarDocumentoEmitido } from "@/lib/servidor/documentos";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { gerarPdfDeFormulas } from "@/lib/servidor/pdf/formulas";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Fórmulas escolhidas, na ordem da consulta.
async function montar(consultaId: string, ids: string[]) {
  const c = await obterPool().query<{ patient_id: string; paciente: string; data: string }>(
    `select c.patient_id, p.name as paciente, to_char(c.data, 'YYYY-MM-DD') as data
       from public.consultas c join public.patients p on p.id = c.patient_id where c.id = $1`,
    [consultaId]
  );
  if (!c.rows[0]) return { erro: recusar("Consulta não encontrada.", 404) };
  const f = await obterPool().query<{ conteudo: Formula }>(
    "select conteudo from public.formulas where consulta_id = $1 and id = any($2::uuid[]) order by ordem, criada_em",
    [consultaId, ids]
  );
  if (!f.rowCount) return { erro: recusar("Escolha ao menos uma fórmula.", 400) };
  const formulas = f.rows.map((x) => validarFormula(x.conteudo)).flatMap((v) => ("valor" in v ? [v.valor] : []));
  const pendencias = formulas.flatMap((x) => pendenciasDaFormula(x));
  const individual = formulas.length === 1;
  const titulo = individual ? formulas[0].nome.trim() || "Fórmula" : "Manipulados";
  const pdf = await gerarPdfDeFormulas({ paciente: c.rows[0].paciente, dataConsulta: c.rows[0].data, formulas, titulo }, await carregarIdentidade());
  return {
    pdf,
    pendencias,
    individual,
    titulo,
    pacienteId: c.rows[0].patient_id,
    nome: nomeDoArquivo(individual ? `Fórmula ${titulo}` : "Manipulados", c.rows[0].paciente, c.rows[0].data),
  };
}

function idsDe(valor: unknown) {
  return (Array.isArray(valor) ? valor : String(valor ?? "").split(",")).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, 50);
}

// Pré-visualização (?ids=a,b).
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const r = await montar(id, idsDe(new URL(request.url).searchParams.get("ids")));
  if ("erro" in r) return r.erro;
  return new Response(new Uint8Array(r.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": disposicao(r.nome, false), "Cache-Control": "private, no-store" },
  });
}

// Emitir e guardar (exige as fórmulas revisadas: sem pendências).
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const corpo = await request.json().catch(() => null);
  const r = await montar(id, idsDe(corpo?.ids));
  if ("erro" in r) return r.erro;
  if (r.pendencias.length) return NextResponse.json({ erro: "Revise as fórmulas antes de emitir.", pendencias: r.pendencias }, { status: 400 });
  const cliente = await obterPool().connect();
  let gravado: string | null = null;
  try {
    await cliente.query("begin");
    const doc = await registrarDocumentoEmitido(cliente, {
      pacienteId: r.pacienteId,
      consultaId: id,
      tipo: r.individual ? "formula" : "formulas",
      titulo: r.titulo,
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
    console.error("Erro ao emitir PDF de fórmulas:", erro);
    return recusar("Não foi possível emitir o PDF.", 500);
  } finally {
    cliente.release();
  }
}

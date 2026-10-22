import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { gerarDevolutiva, lerRascunho, lerVersoes, restaurarVersao, salvarEdicao } from "@/lib/servidor/devolutiva";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { iaDisponivel } from "@/lib/servidor/ia";
import { obterPool } from "@/lib/servidor/banco";

export const runtime = "nodejs";
export const maxDuration = 120;

// Devolutiva do relatório (só o nutricionista): rascunho, versões, gerar pela
// IA, editar e restaurar versão. Nada aqui envia ao paciente: o envio
// continua sendo o botão "Enviar devolutiva ao paciente".

async function relatorioExiste(id: string) {
  const linha = await obterPool().query("select 1 from public.patient_reports where id = $1", [id]);
  return (linha.rowCount ?? 0) > 0;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id) || !(await relatorioExiste(id))) return recusar("Relatório não encontrado.", 404);
  return NextResponse.json({ rascunho: await lerRascunho(id), versoes: await lerVersoes(id) });
}

// Edição à mão (gravação automática da tela). A revisão impede que uma
// gravação antiga apague um texto mais novo (por exemplo, uma regeneração).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id) || !(await relatorioExiste(id))) return recusar("Relatório não encontrado.", 404);

  const dados = await request.json().catch(() => null);
  if (typeof dados?.texto !== "string" || dados.texto.length > 20_000 || !Number.isInteger(dados?.revisao)) {
    return recusar("Dados inválidos.", 400);
  }
  const resultado = await salvarEdicao(id, dados.texto, dados.revisao);
  if (resultado.conflito) {
    return NextResponse.json({ erro: "A devolutiva mudou (regenerada ou restaurada).", rascunho: resultado.rascunho }, { status: 409 });
  }
  return NextResponse.json({ rascunho: resultado.rascunho });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id) || !(await relatorioExiste(id))) return recusar("Relatório não encontrado.", 404);

  const dados = await request.json().catch(() => null);

  if (dados?.acao === "restaurar") {
    if (!UUID.test(String(dados.versaoId))) return recusar("Versão inválida.", 400);
    const rascunho = await restaurarVersao(id, dados.versaoId, contexto.usuarioId);
    if (!rascunho) return recusar("Versão não encontrada.", 404);
    return NextResponse.json({ rascunho, versoes: await lerVersoes(id) });
  }

  if (dados?.acao === "gerar") {
    if (!iaDisponivel()) return recusar("A IA não está configurada no servidor.", 503);
    const resultado = await gerarDevolutiva(id, contexto.usuarioId);
    const versoes = await lerVersoes(id);
    if (!resultado.ok && resultado.motivo === "falha") {
      return NextResponse.json({ erro: "Não foi possível gerar a devolutiva agora. Tente de novo.", rascunho: resultado.rascunho, versoes }, { status: 502 });
    }
    return NextResponse.json({ rascunho: resultado.rascunho, versoes, descartada: !resultado.ok });
  }

  return recusar("Ação inválida.", 400);
}

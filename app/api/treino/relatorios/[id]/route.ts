import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { gerarRascunhoDoTreino } from "@/lib/servidor/devolutivaTreino";
import { recusar } from "@/lib/servidor/http";
import { iaDisponivel } from "@/lib/servidor/ia";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { DadosInvalidos, enviarDevolutiva, lerRelatorio, marcarMeta, salvarRascunho } from "@/lib/servidor/treinoRelatorios";

export const runtime = "nodejs";
export const maxDuration = 120;

// Relatório semanal do Treino. O educador vê só os dele; o administrador vê
// todos, mas só responde os próprios (B2).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const relatorio = UUID.test(id) ? await lerRelatorio(profissional, id) : null;
  if (!relatorio) return recusar("Relatório não encontrado.", 404);
  return NextResponse.json({ relatorio, ia: iaDisponivel() });
}

// Gravação automática do rascunho, com revisão contra gravações atrasadas.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const dados = await request.json().catch(() => null);
  if (!UUID.test(id) || typeof dados?.texto !== "string" || dados.texto.length > 20_000 || !Number.isInteger(dados?.revisao)) {
    return recusar("Dados inválidos.", 400);
  }
  const gravado = await salvarRascunho(profissional, id, dados.texto, dados.revisao);
  if (!gravado) {
    const relatorio = await lerRelatorio(profissional, id);
    if (!relatorio?.pode_responder) return recusar("Relatório não encontrado ou já respondido.", 404);
    return NextResponse.json({ erro: "O rascunho mudou (gerado de novo).", rascunho: relatorio.rascunho, revisao: relatorio.rascunho_revisao }, { status: 409 });
  }
  return NextResponse.json({ rascunho: gravado.rascunho, revisao: gravado.rascunho_revisao });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Relatório não encontrado.", 404);
  const dados = (await request.json().catch(() => null)) ?? {};

  if (dados.acao === "gerar") {
    if (!iaDisponivel()) return recusar("A IA não está configurada no servidor.", 503);
    const resultado = await gerarRascunhoDoTreino(profissional, id);
    if (!resultado.ok && resultado.motivo === "nao_encontrado") return recusar("Relatório não encontrado ou já respondido.", 404);
    if (!resultado.ok && resultado.motivo === "falha") return recusar("Não foi possível gerar o rascunho agora. Tente de novo.", 502);
    const relatorio = await lerRelatorio(profissional, id);
    return NextResponse.json({ rascunho: relatorio?.rascunho ?? "", revisao: relatorio?.rascunho_revisao ?? 0, descartada: !resultado.ok });
  }

  if (dados.acao === "enviar") {
    const texto = typeof dados.texto === "string" ? dados.texto.trim() : "";
    if (!texto) return recusar("Escreva a devolutiva antes de enviar.", 400);
    if (texto.length > 20_000) return recusar("Devolutiva muito longa.", 400);
    if (!(await enviarDevolutiva(profissional, id, texto))) return recusar("Relatório não encontrado ou já respondido.", 404);
    return NextResponse.json({ relatorio: await lerRelatorio(profissional, id) });
  }

  if (dados.acao === "meta") {
    if (!UUID.test(String(dados.metaId)) || ![true, false, null].includes(dados.atingida)) return recusar("Dados inválidos.", 400);
    try {
      if (!(await marcarMeta(profissional, id, dados.metaId, dados.atingida))) return recusar("Relatório não encontrado.", 404);
    } catch (erro) {
      if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
      throw erro;
    }
    return NextResponse.json({ relatorio: await lerRelatorio(profissional, id) });
  }

  return recusar("Ação inválida.", 400);
}

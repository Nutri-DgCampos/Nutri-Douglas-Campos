import { NextResponse } from "next/server";
import { validarPedido } from "@/lib/nutricao/assistente";
import { anamneseDoContexto, contextoDoPaciente, pedirAoAssistente, textoDoPaciente } from "@/lib/servidor/assistenteDieta";
import { UUID, buscarDieta } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { iaDisponivel, situacaoDoLimite } from "@/lib/servidor/ia";

export const runtime = "nodejs";
// Uma dieta completa pode levar um minuto ou mais na IA.
export const maxDuration = 180;

// Auxílio da IA no editor de dietas (Fase 7).
//
// GET: o que vai para a IA (dados do paciente sem identificação e o contexto
// da anamnese, para o nutricionista revisar) e a situação do limite diário.
// POST: pede uma proposta. A dieta não muda: a proposta volta para a prévia,
// e só o que o nutricionista escolher é aplicado (pelo próprio editor).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);
  const dieta = await buscarDieta(id);
  if (!dieta) return recusar("Dieta não encontrada.", 404);

  const [paciente, anamnese, limite] = await Promise.all([
    contextoDoPaciente(dieta, dieta.rascunho),
    anamneseDoContexto(dieta.patient_id),
    situacaoDoLimite(),
  ]);

  return NextResponse.json({
    disponivel: iaDisponivel(),
    paciente: textoDoPaciente(paciente),
    anamnese,
    limite,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);
  const dieta = await buscarDieta(id);
  if (!dieta) return recusar("Dieta não encontrada.", 404);
  if (dieta.arquivada_em) return recusar("A dieta está arquivada.", 409);

  const dados = await request.json().catch(() => null);
  // A tela grava antes de pedir; a revisão confirma que a IA lê a mesma dieta.
  if (dados?.revisao !== dieta.revisao) return recusar("A dieta mudou desde a última gravação. Tente de novo.", 409);
  const validacao = validarPedido(dados?.pedido, dieta.rascunho);
  if ("erro" in validacao) return recusar(validacao.erro, 400);

  if (!iaDisponivel()) return recusar("O auxílio da IA não está configurado no servidor. O editor continua funcionando normalmente.", 503);
  const limite = await situacaoDoLimite();
  if (limite.restantes <= 0) {
    return recusar(`O limite de ${limite.limite} pedidos à IA por dia foi atingido. Ele volta amanhã; o editor continua funcionando normalmente.`, 429);
  }

  try {
    const resultado = await pedirAoAssistente(dieta, validacao.pedido, contexto.usuarioId);
    return NextResponse.json({ ...resultado, limite: await situacaoDoLimite() });
  } catch (erro) {
    console.error("Erro no auxílio da IA:", erro);
    return recusar("A IA não respondeu agora. O editor continua funcionando normalmente; tente de novo em instantes.", 502);
  }
}

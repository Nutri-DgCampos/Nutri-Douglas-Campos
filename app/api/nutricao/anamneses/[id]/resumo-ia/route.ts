import { NextResponse } from "next/server";
import { resumirAnamnese } from "@/lib/servidor/assistenteDieta";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { iaDisponivel, situacaoDoLimite } from "@/lib/servidor/ia";

export const runtime = "nodejs";
export const maxDuration = 120;

// Resumo da anamnese pela IA (Fase 7, validação 7.4): vai sem o nome e sem
// as respostas que identificam o paciente. Fica guardado na ficha.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Anamnese inválida.", 400);
  if (!iaDisponivel()) return recusar("O auxílio da IA não está configurado no servidor.", 503);
  const limite = await situacaoDoLimite();
  if (limite.restantes <= 0) return recusar(`O limite de ${limite.limite} pedidos à IA por dia foi atingido. Ele volta amanhã.`, 429);

  try {
    const resultado = await resumirAnamnese(id, contexto.usuarioId);
    if (!resultado) return recusar("Anamnese não encontrada.", 404);
    return NextResponse.json({ ...resultado, limite: await situacaoDoLimite() });
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("A anamnese não tem")) return recusar(erro.message, 400);
    console.error("Erro no resumo da anamnese:", erro);
    return recusar("A IA não respondeu agora. Tente de novo em instantes.", 502);
  }
}

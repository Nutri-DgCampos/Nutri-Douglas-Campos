import { NextResponse } from "next/server";
import { sugerirTreino } from "@/lib/servidor/assistenteTreino";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";
export const maxDuration = 120;

// Auxílio da IA: devolve uma sugestão para o profissional revisar. Nada é
// gravado nem enviado ao aluno aqui.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Treino não encontrado.", 404);
  const dados = (await request.json().catch(() => null)) ?? {};
  const pedido = typeof dados.pedido === "string" ? dados.pedido.trim() : "";
  if (pedido.length < 3) return recusar("Escreva o que a IA deve fazer.", 400);
  if (pedido.length > 2000) return recusar("Pedido com mais de 2000 caracteres.", 400);
  const resultado = await sugerirTreino(profissional, id, pedido);
  if (!resultado.ok) return recusar(resultado.erro, resultado.status);
  return NextResponse.json({ sugestao: resultado.sugestao });
}

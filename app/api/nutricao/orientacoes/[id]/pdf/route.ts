import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import type { ConteudoOrientacao } from "@/lib/nutricao/orientacao";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { disposicao, nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";
import { gerarPdfDaOrientacao } from "@/lib/servidor/pdf/orientacao";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Orientação inválida.", 400);
  const o = await obterPool().query<{ paciente: string; titulo: string; conteudo: ConteudoOrientacao }>(
    "select p.name as paciente, o.titulo, o.conteudo from public.orientacoes o join public.patients p on p.id = o.patient_id where o.id = $1",
    [id]
  );
  if (!o.rows[0]) return recusar("Orientação não encontrada.", 404);
  const data = hojeNoBrasil();
  try {
    const pdf = await gerarPdfDaOrientacao({ ...o.rows[0], data }, await carregarIdentidade());
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposicao(nomeDoArquivo(o.rows[0].titulo, o.rows[0].paciente, data), new URL(request.url).searchParams.get("baixar") === "1"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    console.error("Erro ao gerar PDF da orientação:", erro);
    return recusar("Não foi possível gerar o PDF.", 500);
  }
}

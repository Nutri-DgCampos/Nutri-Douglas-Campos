import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// "Anotações sobre medicações" da consulta (entram no PDF e no resumo).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const dados = await request.json().catch(() => null);
  const texto = typeof dados?.texto === "string" ? dados.texto.slice(0, 20000) : "";
  const revisao = Number(dados?.revisao ?? 0);
  const r = await obterPool().query<{ revisao: number }>(
    `insert into public.medicacoes_anotacoes (consulta_id, patient_id, texto)
     select c.id, c.patient_id, $2 from public.consultas c where c.id = $1 and $3 = 0
     on conflict (consulta_id) do update
       set texto = excluded.texto, revisao = medicacoes_anotacoes.revisao + 1, atualizada_em = now()
       where medicacoes_anotacoes.revisao = $3
     returning revisao`,
    [id, texto, revisao]
  );
  if (!r.rows[0]) {
    // Primeira gravação com revisão > 0 ou conflito.
    const atual = await obterPool().query<{ revisao: number }>("select revisao from public.medicacoes_anotacoes where consulta_id = $1", [id]);
    if (atual.rows[0] && atual.rows[0].revisao === revisao) {
      const u = await obterPool().query<{ revisao: number }>(
        "update public.medicacoes_anotacoes set texto = $2, revisao = revisao + 1, atualizada_em = now() where consulta_id = $1 returning revisao",
        [id, texto]
      );
      return NextResponse.json(u.rows[0]);
    }
    return recusar("As anotações foram alteradas em outra janela. Recarregue.", 409);
  }
  return NextResponse.json(r.rows[0]);
}

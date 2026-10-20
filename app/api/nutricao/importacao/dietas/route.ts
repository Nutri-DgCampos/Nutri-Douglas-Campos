import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Dietas de um paciente que podem servir de origem para importar ou para
// importar a rotina: por consulta, com título, objetivo e situação.
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const url = new URL(request.url);
  const paciente = url.searchParams.get("paciente") ?? "";
  const exceto = url.searchParams.get("exceto");
  if (!UUID.test(paciente) || (exceto && !UUID.test(exceto))) return recusar("Parâmetros inválidos.", 400);

  const resultado = await obterPool().query(
    `select d.id, to_char(c.data, 'YYYY-MM-DD') as consulta_data,
            coalesce(v.conteudo->'documento', d.rascunho)->>'titulo' as titulo,
            coalesce(v.conteudo->'documento', d.rascunho)->>'objetivo' as objetivo,
            jsonb_array_length(coalesce(v.conteudo->'documento', d.rascunho)->'refeicoes') as refeicoes,
            v.numero as versao, v.enviada_em, d.arquivada_em
       from public.dietas d
       join public.consultas c on c.id = d.consulta_id
       left join lateral (
         select conteudo, numero, enviada_em from public.dietas_versoes
          where dieta_id = d.id order by numero desc limit 1
       ) v on true
      where d.patient_id = $1 and ($2::uuid is null or d.id <> $2)
      order by c.data desc, d.ordem
      limit 100`,
    [paciente, exceto]
  );

  return NextResponse.json({ dietas: resultado.rows });
}

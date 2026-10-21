import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Fórmulas para importar: do mesmo paciente (outras consultas) ou de outros
// pacientes (pela busca no nome da fórmula; só a estrutura é copiada).
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const url = new URL(request.url);
  const consultaId = url.searchParams.get("consulta") ?? "";
  if (!UUID.test(consultaId)) return recusar("Consulta inválida.", 400);
  const outros = url.searchParams.get("outros") === "1";
  const busca = `%${(url.searchParams.get("q") ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[%_\\]/g, "")}%`;
  const r = await obterPool().query(
    `select f.id, f.conteudo->>'nome' as nome, jsonb_array_length(f.conteudo->'componentes') as quantidade,
            to_char(c.data, 'YYYY-MM-DD') as consulta_data
       from public.formulas f
       join public.consultas c on c.id = f.consulta_id
       join public.consultas atual on atual.id = $1
      where f.consulta_id <> $1
        and ${outros ? "f.patient_id <> atual.patient_id" : "f.patient_id = atual.patient_id"}
        and public.normalizar_texto(coalesce(f.conteudo->>'nome', '')) like $2
      order by c.data desc, f.ordem
      limit 60`,
    [consultaId, busca]
  );
  return NextResponse.json({ formulas: r.rows });
}

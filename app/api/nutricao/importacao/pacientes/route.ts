import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// "Importar de outros pacientes": busca pelo nome, só pacientes com dietas.
// Devolve apenas nome e identificador.
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const url = new URL(request.url);
  const exceto = url.searchParams.get("exceto");
  const palavras = (url.searchParams.get("q") ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);

  if (palavras.length === 0) return NextResponse.json({ pacientes: [] });
  if (exceto && !UUID.test(exceto)) return recusar("Paciente inválido.", 400);

  const parametros: unknown[] = [exceto];
  const condicoes = ["($1::uuid is null or p.id <> $1)", "exists (select 1 from public.dietas d where d.patient_id = p.id)"];
  for (const palavra of palavras) {
    parametros.push(`%${palavra.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    condicoes.push(`public.normalizar_texto(p.name) like $${parametros.length}`);
  }

  const resultado = await obterPool().query(
    `select p.id, p.name from public.patients p where ${condicoes.join(" and ")} order by p.name limit 20`,
    parametros
  );
  return NextResponse.json({ pacientes: resultado.rows });
}

import { NextResponse } from "next/server";
import { validarPerguntas } from "@/lib/nutricao/anamnese";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Modelos de anamnese (Configurações → Anamnese), com busca sem acento.
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const url = new URL(request.url);
  const arquivados = url.searchParams.get("arquivados") === "1";
  const palavras = (url.searchParams.get("q") ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

  const parametros: unknown[] = [];
  const condicoes = [arquivados ? "true" : "arquivado_em is null"];
  for (const palavra of palavras) {
    parametros.push(`%${palavra.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    condicoes.push(`public.normalizar_texto(nome) like $${parametros.length}`);
  }

  const resultado = await obterPool().query(
    `select id, nome, usos, versao, arquivado_em, atualizado_em,
            jsonb_array_length(perguntas) as quantidade,
            null::text as resumo
       from public.modelos_anamnese
      where ${condicoes.join(" and ")}
      order by arquivado_em nulls first, nome
      limit 200`,
    parametros
  );
  return NextResponse.json({ modelos: resultado.rows });
}

export async function POST(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const dados = await request.json().catch(() => null);
  const nome = typeof dados?.nome === "string" ? dados.nome.trim().slice(0, 200) : "";
  const perguntas = validarPerguntas(dados?.perguntas ?? []);
  if ("erro" in perguntas) return recusar(perguntas.erro, 400);

  const criado = await obterPool().query<{ id: string; revisao: number }>(
    `insert into public.modelos_anamnese (nome, perguntas, criado_por) values ($1, $2, $3) returning id, revisao`,
    [nome || "Nova anamnese", JSON.stringify(perguntas.valor), contexto.usuarioId]
  );
  return NextResponse.json(criado.rows[0], { status: 201 });
}

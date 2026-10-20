import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { nomeValido, tipoValido, validarConteudoDoModelo } from "@/lib/servidor/modelos";

export const runtime = "nodejs";

// Lista da biblioteca, com busca por partes do nome (sem acento).
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  if (!tipoValido(tipo)) return recusar("Tipo de modelo inválido.", 400);

  const arquivados = url.searchParams.get("arquivados") === "1";
  const palavras = (url.searchParams.get("q") ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);

  const parametros: unknown[] = [tipo];
  const condicoes = ["tipo = $1", arquivados ? "true" : "arquivado_em is null"];
  for (const palavra of palavras) {
    parametros.push(`%${palavra.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    condicoes.push(`public.normalizar_texto(nome) like $${parametros.length}`);
  }

  const resultado = await obterPool().query(
    `select id, tipo, nome, usos, arquivado_em, atualizado_em,
            case tipo
              when 'observacao' then conteudo->>'texto'
              when 'refeicao' then conteudo->>'nome'
              else conteudo->>'objetivo'
            end as resumo,
            case tipo
              when 'refeicao' then (select count(*) from jsonb_array_elements(conteudo->'opcoes'))::int
              when 'dieta' then jsonb_array_length(conteudo->'refeicoes')
              else null
            end as quantidade
       from public.modelos_nutricao
      where ${condicoes.join(" and ")}
      order by arquivado_em nulls first, nome
      limit 200`,
    parametros
  );

  return NextResponse.json({ modelos: resultado.rows });
}

// Novo modelo (pela biblioteca ou por "Salvar como modelo" no editor).
export async function POST(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const dados = await request.json().catch(() => null);
  if (!tipoValido(dados?.tipo)) return recusar("Tipo de modelo inválido.", 400);
  const nome = nomeValido(dados?.nome);
  if (!nome) return recusar("Informe o nome do modelo.", 400);

  const validacao = validarConteudoDoModelo(dados.tipo, dados?.conteudo);
  if ("erro" in validacao) return recusar(validacao.erro, 400);

  const resultado = await obterPool().query<{ id: string }>(
    `insert into public.modelos_nutricao (tipo, nome, conteudo, criado_por)
     values ($1, $2, $3, $4) returning id`,
    [dados.tipo, nome, JSON.stringify(validacao.conteudo), contexto.usuarioId]
  );

  return NextResponse.json({ id: resultado.rows[0].id }, { status: 201 });
}

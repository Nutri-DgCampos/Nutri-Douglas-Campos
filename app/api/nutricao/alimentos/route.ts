import { NextResponse } from "next/server";
import { buscarAlimentos } from "@/lib/servidor/alimentos";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { gravarNutrientes, validarDadosDoAlimento } from "./validacao";

export const runtime = "nodejs";

// Busca na base de alimentos (TACO + cadastro manual).
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const parametros = new URL(request.url).searchParams;
  const categoria = Number(parametros.get("categoria"));

  const alimentos = await buscarAlimentos(parametros.get("q") ?? "", {
    limite: Number(parametros.get("limite")) || 30,
    incluirArquivados: parametros.get("arquivados") === "1",
    categoria: Number.isInteger(categoria) && categoria > 0 ? categoria : null,
  });

  return NextResponse.json({ alimentos }, { headers: { "Cache-Control": "no-store" } });
}

// Cadastro manual de alimento (origem distinta da TACO).
export async function POST(request: Request) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const validado = await validarDadosDoAlimento(await request.json().catch(() => null), true);

  if ("erro" in validado) {
    return recusar(validado.erro, 400);
  }

  const { nome, categoriaId, unidadeBase, densidade, nutrientes } = validado;
  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");

    const resultado = await cliente.query<{ id: string }>(
      `insert into public.alimentos (nome, categoria_id, fonte, unidade_base, densidade_g_ml)
       values ($1, $2, 'manual', $3, $4) returning id`,
      [nome, categoriaId, unidadeBase, densidade]
    );

    const id = resultado.rows[0].id;
    await gravarNutrientes(cliente, id, "manual", nutrientes ?? {});

    await cliente.query("commit");
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    console.error("Erro ao cadastrar alimento:", erro);
    return recusar("Não foi possível cadastrar o alimento.", 500);
  } finally {
    cliente.release();
  }
}

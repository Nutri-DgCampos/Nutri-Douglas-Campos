import { NextResponse } from "next/server";
import { composicoes, fonteDoAlimento } from "@/lib/servidor/alimentos";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { gravarNutrientes, validarDadosDoAlimento } from "../validacao";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Alimento completo: dados, composição com a fonte de cada valor, medidas
// caseiras e lista de substituições (com a composição dos substitutos).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Alimento inválido.", 400);
  }

  const pool = obterPool();
  const alimento = await pool.query(
    `select a.id, a.nome, a.categoria_id, c.nome as categoria, a.fonte, f.nome as fonte_nome,
            a.codigo_origem, a.unidade_base, a.densidade_g_ml::float as densidade_g_ml, a.arquivado
       from public.alimentos a
       join public.alimentos_fontes f on f.codigo = a.fonte
       left join public.alimentos_categorias c on c.id = a.categoria_id
      where a.id = $1`,
    [id]
  );

  if (alimento.rowCount === 0) {
    return recusar("Alimento não encontrado.", 404);
  }

  const [valores, medidas, substituicoes] = await Promise.all([
    pool.query(
      `select nutriente, valor::float as valor, traco, fonte
         from public.alimentos_nutrientes where alimento_id = $1`,
      [id]
    ),
    pool.query(
      `select id, nome_singular, nome_plural, quantidade::float as quantidade, padrao, ordem
         from public.medidas_caseiras where alimento_id = $1 order by ordem, created_at`,
      [id]
    ),
    pool.query(
      `select s.id, s.substituto_id, a.nome as substituto_nome, a.unidade_base as substituto_unidade,
              s.quantidade_referencia::float as quantidade_referencia,
              s.quantidade_substituto::float as quantidade_substituto,
              s.medida_caseira_id, s.quantidade_medidas::float as quantidade_medidas, s.observacao, s.ordem
         from public.substituicoes s
         join public.alimentos a on a.id = s.substituto_id
        where s.alimento_id = $1 order by s.ordem, s.created_at`,
      [id]
    ),
  ]);

  const idsSubstitutos = substituicoes.rows.map((linha) => linha.substituto_id as string);
  const [composicaoSubstitutos, medidasSubstitutos] = await Promise.all([
    composicoes(idsSubstitutos),
    idsSubstitutos.length
      ? pool.query(
          `select id, alimento_id, nome_singular, nome_plural, quantidade::float as quantidade, padrao, ordem
             from public.medidas_caseiras where alimento_id = any($1::uuid[]) order by ordem`,
          [idsSubstitutos]
        )
      : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  return NextResponse.json(
    {
      alimento: alimento.rows[0],
      valores: valores.rows,
      medidas: medidas.rows,
      substituicoes: substituicoes.rows.map((linha) => ({
        ...linha,
        substituto_composicao: composicaoSubstitutos[linha.substituto_id],
        substituto_medidas: medidasSubstitutos.rows.filter((medida) => medida.alimento_id === linha.substituto_id),
      })),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Altera um alimento. Alimento da TACO: só densidade, arquivamento e valores
// que a TACO não traz (gravados como "manual"). Alimento manual: tudo.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Alimento inválido.", 400);
  }

  const validado = await validarDadosDoAlimento(await request.json().catch(() => null), false);

  if ("erro" in validado) {
    return recusar(validado.erro, 400);
  }

  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");

    const atual = await fonteDoAlimento(cliente, id);

    if (!atual) {
      await cliente.query("rollback");
      return recusar("Alimento não encontrado.", 404);
    }

    const importado = atual.fonte !== "manual";

    if (importado && (validado.nome !== undefined || validado.categoriaId !== undefined || validado.unidadeBase !== undefined)) {
      await cliente.query("rollback");
      return recusar("Nome, categoria e unidade de alimentos da TACO não podem ser alterados.", 409);
    }

    const campos: string[] = [];
    const valores: unknown[] = [id];
    const definir = (coluna: string, valor: unknown) => {
      valores.push(valor);
      campos.push(`${coluna} = $${valores.length}`);
    };

    if (validado.nome !== undefined) definir("nome", validado.nome);
    if (validado.categoriaId !== undefined) definir("categoria_id", validado.categoriaId);
    if (validado.unidadeBase !== undefined) definir("unidade_base", validado.unidadeBase);
    if (validado.densidade !== undefined) definir("densidade_g_ml", validado.densidade);
    if (validado.arquivado !== undefined) definir("arquivado", validado.arquivado);

    if (campos.length > 0) {
      await cliente.query(
        `update public.alimentos set ${campos.join(", ")}, updated_at = now() where id = $1`,
        valores
      );
    }

    if (validado.nutrientes) {
      if (importado) {
        // Recusa alterar um valor que veio da fonte importada.
        const protegidos = await cliente.query<{ nutriente: string }>(
          `select nutriente from public.alimentos_nutrientes
            where alimento_id = $1 and fonte <> 'manual' and nutriente = any($2::text[])`,
          [id, Object.keys(validado.nutrientes)]
        );

        if (protegidos.rowCount) {
          await cliente.query("rollback");
          return recusar(
            `Valores da TACO não podem ser alterados (${protegidos.rows.map((linha) => linha.nutriente).join(", ")}).`,
            409
          );
        }
      }

      await gravarNutrientes(cliente, id, "manual", validado.nutrientes);
    }

    await cliente.query("commit");
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    console.error("Erro ao alterar alimento:", erro);
    return recusar("Não foi possível salvar o alimento.", 500);
  } finally {
    cliente.release();
  }
}

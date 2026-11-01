import type { PoolClient } from "pg";

// Cópia de alimento (TACO → cadastro próprio).
//
// A cópia nasce com todos os valores do original, cada um com a fonte do
// original (traço continua traço; ausente continua ausente, nunca zero).
// Depois de cada gravação, a fonte de cada valor é recalculada comparando
// com o original: igual (mesma unidade, mesmo valor normalizado, mesmo
// traço) = fonte do original ("TACO"); diferente ou novo = "manual"
// ("Personalizado"). Assim, restaurar o valor original volta a "TACO".

// Cria a cópia, com medidas caseiras e substituições, e devolve o id.
export async function criarCopia(
  cliente: PoolClient,
  origemId: string,
  dados: { nome: string; categoriaId: number | null; unidadeBase: "g" | "ml"; densidade: number | null }
) {
  const origem = await cliente.query("select id from public.alimentos where id = $1", [origemId]);
  if (!origem.rowCount) return null;

  const nova = await cliente.query<{ id: string }>(
    `insert into public.alimentos (nome, categoria_id, fonte, unidade_base, densidade_g_ml, copiado_de, copiado_em)
     values ($1, $2, 'manual', $3, $4, $5, now()) returning id`,
    [dados.nome, dados.categoriaId, dados.unidadeBase, dados.densidade, origemId]
  );
  const id = nova.rows[0].id;

  await cliente.query(
    `insert into public.alimentos_nutrientes (alimento_id, nutriente, valor, traco, fonte)
     select $1, nutriente, valor, traco, fonte from public.alimentos_nutrientes where alimento_id = $2`,
    [id, origemId]
  );

  // Medidas caseiras: ids novos; as substituições apontam para medidas do
  // substituto (outro alimento), então são copiadas como estão.
  await cliente.query(
    `insert into public.medidas_caseiras (alimento_id, nome_singular, nome_plural, quantidade, padrao, ordem)
     select $1, nome_singular, nome_plural, quantidade, padrao, ordem from public.medidas_caseiras where alimento_id = $2`,
    [id, origemId]
  );
  await cliente.query(
    `insert into public.substituicoes
       (alimento_id, substituto_id, quantidade_referencia, quantidade_substituto, medida_caseira_id, quantidade_medidas, observacao, ordem)
     select $1, substituto_id, quantidade_referencia, quantidade_substituto, medida_caseira_id, quantidade_medidas, observacao, ordem
       from public.substituicoes where alimento_id = $2 and substituto_id <> $1`,
    [id, origemId]
  );

  return id;
}

// Grava valores na cópia (qualquer fonte pode ser substituída: a cópia é do
// nutricionista) e recalcula a fonte de cada valor.
export async function gravarNutrientesDaCopia(cliente: PoolClient, id: string, nutrientes: Record<string, number | null>) {
  for (const [codigo, valor] of Object.entries(nutrientes)) {
    if (valor === null) {
      await cliente.query("delete from public.alimentos_nutrientes where alimento_id = $1 and nutriente = $2", [id, codigo]);
      continue;
    }
    await cliente.query(
      `insert into public.alimentos_nutrientes (alimento_id, nutriente, valor, traco, fonte)
       values ($1, $2, $3, false, 'manual')
       on conflict (alimento_id, nutriente) do update
         set valor = excluded.valor, traco = false, fonte = 'manual', atualizado_em = now()`,
      [id, codigo, valor]
    );
  }
  await reclassificarCopia(cliente, id);
}

// Fonte de cada valor da cópia, por comparação com o original. numeric(12,4)
// dos dois lados: a comparação é exata, sem arredondamento de exibição.
export async function reclassificarCopia(cliente: PoolClient, id: string) {
  await cliente.query(
    `update public.alimentos_nutrientes c
        set fonte = coalesce((
              select o.fonte
                from public.alimentos a
                join public.alimentos oa on oa.id = a.copiado_de and oa.unidade_base = a.unidade_base
                join public.alimentos_nutrientes o on o.alimento_id = oa.id and o.nutriente = c.nutriente
               where a.id = c.alimento_id and o.traco = c.traco and o.valor is not distinct from c.valor
            ), 'manual')
      where c.alimento_id = $1`,
    [id]
  );
}

import type { PoolClient } from "pg";
import type { Composicao } from "@/lib/nutricao/calculo";
import { obterPool } from "./banco";

// Leitura da base de alimentos para as rotas do módulo.

export type AlimentoResumo = {
  id: string;
  nome: string;
  categoria: string | null;
  fonte: string;
  unidade_base: "g" | "ml";
  arquivado: boolean;
};

export type Medida = {
  id: string;
  nome_singular: string;
  nome_plural: string;
  quantidade: number;
  padrao: boolean;
  ordem: number;
};

export async function composicoes(ids: string[]): Promise<Record<string, Composicao>> {
  const resultado: Record<string, Composicao> = Object.fromEntries(ids.map((id) => [id, {}]));
  if (ids.length === 0) return resultado;

  const linhas = await obterPool().query<{ alimento_id: string; nutriente: string; valor: string | null; traco: boolean }>(
    `select alimento_id, nutriente, valor, traco
       from public.alimentos_nutrientes where alimento_id = any($1::uuid[])`,
    [ids]
  );

  for (const linha of linhas.rows) {
    resultado[linha.alimento_id][linha.nutriente] = {
      valor: linha.valor === null ? null : Number(linha.valor),
      traco: linha.traco,
    };
  }

  return resultado;
}

// Busca por partes do nome, sem acento e sem diferenciar maiúsculas.
// Cada palavra digitada precisa aparecer no nome; ordena pela semelhança.
export async function buscarAlimentos(texto: string, opcoes: { limite?: number; incluirArquivados?: boolean; categoria?: number | null } = {}) {
  const palavras = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 6);

  const condicoes: string[] = [];
  const parametros: unknown[] = [];

  palavras.forEach((palavra) => {
    parametros.push(`%${palavra.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
    condicoes.push(`public.normalizar_texto(a.nome) like $${parametros.length}`);
  });

  if (!opcoes.incluirArquivados) condicoes.push("not a.arquivado");

  if (opcoes.categoria) {
    parametros.push(opcoes.categoria);
    condicoes.push(`a.categoria_id = $${parametros.length}`);
  }

  parametros.push(palavras.join(" "));
  const ordemTexto = `$${parametros.length}`;
  parametros.push(Math.min(Math.max(opcoes.limite ?? 30, 1), 200));

  const resultado = await obterPool().query<AlimentoResumo & { kcal: string | null }>(
    `select a.id, a.nome, c.nome as categoria, a.fonte, a.unidade_base, a.arquivado,
            (select n.valor from public.alimentos_nutrientes n where n.alimento_id = a.id and n.nutriente = 'kcal') as kcal
       from public.alimentos a
       left join public.alimentos_categorias c on c.id = a.categoria_id
      ${condicoes.length ? `where ${condicoes.join(" and ")}` : ""}
      order by similarity(public.normalizar_texto(a.nome), ${ordemTexto}) desc, a.nome
      limit $${parametros.length}`,
    parametros
  );

  return resultado.rows.map((linha) => ({ ...linha, kcal: linha.kcal === null ? null : Number(linha.kcal) }));
}

export async function fonteDoAlimento(cliente: PoolClient, id: string) {
  const resultado = await cliente.query<{ fonte: string; unidade_base: string }>(
    "select fonte, unidade_base from public.alimentos where id = $1 for update",
    [id]
  );
  return resultado.rows[0] ?? null;
}

import type { Pool, PoolClient } from "pg";
import type { Consulta, ErroConsulta, Resultado } from "@/lib/consulta";

// Transforma uma Consulta em SQL parametrizado.
// Nomes de tabelas e colunas só entram no SQL depois de conferidos contra o
// esquema real do banco; valores sempre vão como parâmetros.

type Relacao = {
  origem: string;
  coluna: string;
  destino: string;
  colunaDestino: string;
};

type Esquema = {
  colunas: Map<string, Set<string>>;
  chaves: Map<string, string[]>;
  relacoes: Relacao[];
};

// Condições extras impostas pelas permissões. Ausentes = acesso total (servidor).
export type Regra = {
  // Linhas existentes que o usuário pode ler/alterar/excluir.
  usando?: (alias: string) => string;
  // Condição que as linhas novas (insert) precisam cumprir.
  verificando?: (alias: string) => string;
  // Validação dos valores enviados em um update.
  validarValores?: (valores: Record<string, unknown>) => boolean;
};

export type Regras = {
  // null = operação não permitida para este usuário.
  obter: (
    tabela: string,
    operacao: "select" | "insert" | "update" | "delete"
  ) => Regra | null;
};

export class ErroDeConsulta extends Error {
  constructor(
    mensagem: string,
    public code: string
  ) {
    super(mensagem);
  }
}

const PERMISSAO_NEGADA = "42501";

let esquemaEmCache: Promise<Esquema> | null = null;

async function carregarEsquema(pool: Pool): Promise<Esquema> {
  const [colunas, chaves, relacoes] = await Promise.all([
    pool.query<{ tabela: string; coluna: string }>(
      `select table_name as tabela, column_name as coluna
         from information_schema.columns
        where table_schema = 'public'`
    ),
    pool.query<{ tabela: string; coluna: string }>(
      `select t.relname as tabela, a.attname as coluna
         from pg_constraint c
         join pg_class t on t.oid = c.conrelid
         join unnest(c.conkey) with ordinality as k(attnum, ordem) on true
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        where c.contype = 'p'
          and c.connamespace = 'public'::regnamespace
        order by t.relname, k.ordem`
    ),
    pool.query<Relacao>(
      `select o.relname as origem,
              a.attname as coluna,
              d.relname as destino,
              af.attname as "colunaDestino"
         from pg_constraint c
         join pg_class o on o.oid = c.conrelid
         join pg_class d on d.oid = c.confrelid
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
         join pg_attribute af on af.attrelid = c.confrelid and af.attnum = c.confkey[1]
        where c.contype = 'f'
          and c.connamespace = 'public'::regnamespace`
    ),
  ]);

  const esquema: Esquema = {
    colunas: new Map(),
    chaves: new Map(),
    relacoes: relacoes.rows,
  };

  for (const { tabela, coluna } of colunas.rows) {
    if (!esquema.colunas.has(tabela)) {
      esquema.colunas.set(tabela, new Set());
    }
    esquema.colunas.get(tabela)!.add(coluna);
  }

  for (const { tabela, coluna } of chaves.rows) {
    esquema.chaves.set(tabela, [
      ...(esquema.chaves.get(tabela) ?? []),
      coluna,
    ]);
  }

  return esquema;
}

function obterEsquema(pool: Pool) {
  if (!esquemaEmCache) {
    esquemaEmCache = carregarEsquema(pool).catch((erro) => {
      esquemaEmCache = null;
      throw erro;
    });
  }

  return esquemaEmCache;
}

function tabela(esquema: Esquema, nome: string) {
  if (!esquema.colunas.has(nome)) {
    throw new ErroDeConsulta(`Tabela desconhecida: ${nome}`, "42P01");
  }

  return `public."${nome}"`;
}

function coluna(esquema: Esquema, nomeTabela: string, nome: string) {
  if (!esquema.colunas.get(nomeTabela)?.has(nome)) {
    throw new ErroDeConsulta(
      `Coluna desconhecida: ${nomeTabela}.${nome}`,
      "42703"
    );
  }

  return `"${nome}"`;
}

// ------------------------------------------------------------------------
// Seleção de colunas, incluindo tabelas relacionadas: "id, patients ( name )"
// ------------------------------------------------------------------------

type Item =
  | { tipo: "todas" }
  | { tipo: "coluna"; nome: string }
  | { tipo: "relacao"; tabela: string; interna: boolean; itens: Item[] };

function separarItens(texto: string): string[] {
  const partes: string[] = [];
  let profundidade = 0;
  let atual = "";

  for (const caractere of texto) {
    if (caractere === "(") profundidade += 1;
    if (caractere === ")") profundidade -= 1;

    if (caractere === "," && profundidade === 0) {
      partes.push(atual);
      atual = "";
    } else {
      atual += caractere;
    }
  }

  partes.push(atual);

  if (profundidade !== 0) {
    throw new ErroDeConsulta("Seleção de colunas inválida.", "PGRST100");
  }

  return partes.map((parte) => parte.trim()).filter(Boolean);
}

function interpretarSelecao(texto: string): Item[] {
  return separarItens(texto).map((parte): Item => {
    if (parte === "*") {
      return { tipo: "todas" };
    }

    const relacao = parte.match(
      /^([a-z_][a-z0-9_]*)(!inner)?\s*\(([\s\S]*)\)$/
    );

    if (relacao) {
      return {
        tipo: "relacao",
        tabela: relacao[1],
        interna: relacao[2] === "!inner",
        itens: interpretarSelecao(relacao[3]),
      };
    }

    if (!/^[a-z_][a-z0-9_]*$/.test(parte)) {
      throw new ErroDeConsulta(
        `Seleção de colunas inválida: ${parte}`,
        "PGRST100"
      );
    }

    return { tipo: "coluna", nome: parte };
  });
}

type Montagem = {
  esquema: Esquema;
  regras: Regras | null;
  proximoAlias: () => string;
};

function condicaoDeLeitura(
  montagem: Montagem,
  nomeTabela: string,
  alias: string
): string | null {
  if (!montagem.regras) {
    return null;
  }

  const regra = montagem.regras.obter(nomeTabela, "select");

  if (!regra) {
    return "false";
  }

  return regra.usando ? regra.usando(alias) : null;
}

function montarCampos(
  montagem: Montagem,
  nomeTabela: string,
  alias: string,
  itens: Item[]
): { campos: string[]; exigencias: string[] } {
  const campos: string[] = [];
  const exigencias: string[] = [];

  for (const item of itens) {
    if (item.tipo === "todas") {
      campos.push(`${alias}.*`);
      continue;
    }

    if (item.tipo === "coluna") {
      campos.push(
        `${alias}.${coluna(montagem.esquema, nomeTabela, item.nome)}`
      );
      continue;
    }

    const destino = tabela(montagem.esquema, item.tabela);
    const aliasRelacao = montagem.proximoAlias();

    const paraUm = montagem.esquema.relacoes.filter(
      (relacao) =>
        relacao.origem === nomeTabela && relacao.destino === item.tabela
    );

    const paraMuitos = montagem.esquema.relacoes.filter(
      (relacao) =>
        relacao.origem === item.tabela && relacao.destino === nomeTabela
    );

    if (paraUm.length + paraMuitos.length !== 1) {
      throw new ErroDeConsulta(
        `Relação inexistente ou ambígua: ${nomeTabela} -> ${item.tabela}`,
        "PGRST200"
      );
    }

    const juncao = paraUm.length
      ? `${aliasRelacao}."${paraUm[0].colunaDestino}" = ${alias}."${paraUm[0].coluna}"`
      : `${aliasRelacao}."${paraMuitos[0].coluna}" = ${alias}."${paraMuitos[0].colunaDestino}"`;

    const filtros = [juncao];
    const leitura = condicaoDeLeitura(montagem, item.tabela, aliasRelacao);

    if (leitura) {
      filtros.push(`(${leitura})`);
    }

    const interno = montarCampos(
      montagem,
      item.tabela,
      aliasRelacao,
      item.itens
    );

    filtros.push(...interno.exigencias);

    const origem = `from ${destino} ${aliasRelacao} where ${filtros.join(" and ")}`;
    const aliasLinha = montagem.proximoAlias();

    campos.push(
      paraUm.length
        ? `(select row_to_json(${aliasLinha}) from (select ${interno.campos.join(", ")} ${origem}) ${aliasLinha}) as "${item.tabela}"`
        : `(select coalesce(json_agg(row_to_json(${aliasLinha})), '[]'::json) from (select ${interno.campos.join(", ")} ${origem}) ${aliasLinha}) as "${item.tabela}"`
    );

    if (item.interna) {
      exigencias.push(`exists (select 1 ${origem})`);
    }
  }

  if (campos.length === 0) {
    throw new ErroDeConsulta("Nenhuma coluna selecionada.", "PGRST100");
  }

  return { campos, exigencias };
}

// ------------------------------------------------------------------------
// Filtros
// ------------------------------------------------------------------------

function montarFiltros(
  esquema: Esquema,
  consulta: Consulta,
  alias: string,
  parametro: (valor: unknown) => string
): string[] {
  return consulta.filtros.map((filtro) => {
    const campo = `${alias}.${coluna(esquema, consulta.tabela, filtro.coluna)}`;

    switch (filtro.operador) {
      case "eq":
        return `${campo} = ${parametro(filtro.valor)}`;
      case "neq":
        return `${campo} <> ${parametro(filtro.valor)}`;
      case "gt":
        return `${campo} > ${parametro(filtro.valor)}`;
      case "gte":
        return `${campo} >= ${parametro(filtro.valor)}`;
      case "lt":
        return `${campo} < ${parametro(filtro.valor)}`;
      case "lte":
        return `${campo} <= ${parametro(filtro.valor)}`;
      case "in":
        if (!Array.isArray(filtro.valor)) {
          throw new ErroDeConsulta("Filtro 'in' exige uma lista.", "PGRST100");
        }
        return `${campo} = any(${parametro(filtro.valor)})`;
      case "is":
      case "not.is": {
        const negacao = filtro.operador === "not.is" ? "not " : "";

        if (filtro.valor === null) return `${campo} is ${negacao}null`;
        if (filtro.valor === true) return `${campo} is ${negacao}true`;
        if (filtro.valor === false) return `${campo} is ${negacao}false`;

        throw new ErroDeConsulta("Filtro 'is' inválido.", "PGRST100");
      }
      default:
        throw new ErroDeConsulta("Operador desconhecido.", "PGRST100");
    }
  });
}

// ------------------------------------------------------------------------
// Execução
// ------------------------------------------------------------------------

function linhasEnviadas(consulta: Consulta): Record<string, unknown>[] {
  const valores = consulta.valores;

  if (!valores || typeof valores !== "object") {
    throw new ErroDeConsulta("Nenhum valor informado.", "PGRST102");
  }

  const linhas = Array.isArray(valores) ? valores : [valores];

  if (
    linhas.length === 0 ||
    linhas.some(
      (linha) => !linha || typeof linha !== "object" || Array.isArray(linha)
    )
  ) {
    throw new ErroDeConsulta("Valores inválidos.", "PGRST102");
  }

  return linhas;
}

function colunasEnviadas(esquema: Esquema, consulta: Consulta) {
  const nomes = new Set<string>();

  for (const linha of linhasEnviadas(consulta)) {
    Object.keys(linha).forEach((nome) => nomes.add(nome));
  }

  if (nomes.size === 0) {
    throw new ErroDeConsulta("Nenhuma coluna informada.", "PGRST102");
  }

  return [...nomes].map((nome) => coluna(esquema, consulta.tabela, nome));
}

async function executarLeitura(
  cliente: Pool | PoolClient,
  esquema: Esquema,
  consulta: Consulta,
  regras: Regras | null
) {
  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => `$${parametros.push(valor)}`;
  let contador = 0;

  const montagem: Montagem = {
    esquema,
    regras,
    proximoAlias: () => `r${(contador += 1)}`,
  };

  const origem = tabela(esquema, consulta.tabela);
  const { campos, exigencias } = montarCampos(
    montagem,
    consulta.tabela,
    "t",
    interpretarSelecao(consulta.colunas ?? "*")
  );

  const filtros = [
    ...montarFiltros(esquema, consulta, "t", parametro),
    ...exigencias,
  ];

  const leitura = condicaoDeLeitura(montagem, consulta.tabela, "t");

  if (leitura) {
    filtros.push(`(${leitura})`);
  }

  const onde = filtros.length ? `where ${filtros.join(" and ")}` : "";

  let total: number | null = null;

  if (consulta.contar) {
    const contagem = await cliente.query<{ total: number }>(
      `select count(*)::int as total from ${origem} t ${onde}`,
      parametros
    );

    total = contagem.rows[0].total;
  }

  if (consulta.somenteContagem) {
    return { linhas: null, total };
  }

  const ordem = consulta.ordem.length
    ? `order by ${consulta.ordem
        .map(
          (item) =>
            `t.${coluna(esquema, consulta.tabela, item.coluna)} ${item.ascendente ? "asc" : "desc"}`
        )
        .join(", ")}`
    : "";

  const limite =
    consulta.limite !== null ? `limit ${parametro(consulta.limite)}` : "";

  const deslocamento =
    consulta.deslocamento !== null
      ? `offset ${parametro(consulta.deslocamento)}`
      : "";

  const resultado = await cliente.query<{ dados: unknown[] }>(
    `select coalesce(json_agg(row_to_json(q)), '[]'::json) as dados
       from (select ${campos.join(", ")} from ${origem} t ${onde} ${ordem} ${limite} ${deslocamento}) q`,
    parametros
  );

  return { linhas: resultado.rows[0].dados, total };
}

async function executarEscrita(
  cliente: PoolClient,
  esquema: Esquema,
  consulta: Consulta,
  regras: Regras | null
) {
  const parametros: unknown[] = [];
  const parametro = (valor: unknown) => `$${parametros.push(valor)}`;
  let contador = 0;

  const montagem: Montagem = {
    esquema,
    regras,
    proximoAlias: () => `r${(contador += 1)}`,
  };

  const alvo = tabela(esquema, consulta.tabela);
  let comando: string;
  let esperadas: number | null = null;

  if (consulta.acao === "insert" || consulta.acao === "upsert") {
    const regraInsercao = regras ? regras.obter(consulta.tabela, "insert") : {};

    if (!regraInsercao) {
      throw new ErroDeConsulta("Operação não permitida.", PERMISSAO_NEGADA);
    }

    const linhas = linhasEnviadas(consulta);
    const colunas = colunasEnviadas(esquema, consulta);
    const verificacao = regraInsercao.verificando
      ? `where ${regraInsercao.verificando("v")}`
      : "";

    let conflito = "";

    if (consulta.acao === "upsert") {
      const colunasConflito = (
        consulta.conflito
          ? consulta.conflito.split(",").map((nome) => nome.trim())
          : (esquema.chaves.get(consulta.tabela) ?? [])
      ).map((nome) => coluna(esquema, consulta.tabela, nome));

      if (colunasConflito.length === 0) {
        throw new ErroDeConsulta("Conflito sem colunas.", "PGRST102");
      }

      if (consulta.ignorarDuplicados) {
        conflito = `on conflict (${colunasConflito.join(", ")}) do nothing`;
      } else {
        const regraAtualizacao = regras
          ? regras.obter(consulta.tabela, "update")
          : {};

        if (!regraAtualizacao) {
          throw new ErroDeConsulta(
            "Operação não permitida.",
            PERMISSAO_NEGADA
          );
        }

        const atribuicoes = colunas
          .map((nome) => `${nome} = excluded.${nome}`)
          .join(", ");

        const podeAtualizar = regraAtualizacao.usando
          ? `where ${regraAtualizacao.usando("t")}`
          : "";

        conflito = `on conflict (${colunasConflito.join(", ")}) do update set ${atribuicoes} ${podeAtualizar}`;
      }
    } else {
      esperadas = linhas.length;
    }

    // json_populate_recordset converte cada valor para o tipo real da coluna.
    comando = `insert into ${alvo} as t (${colunas.join(", ")})
               select ${colunas.map((nome) => `v.${nome}`).join(", ")}
                 from json_populate_recordset(null::${alvo}, ${parametro(JSON.stringify(linhas))}::json) v
               ${verificacao}
               ${conflito}
               returning t.*`;

    if (regraInsercao.verificando && consulta.acao === "upsert") {
      // Linhas barradas pela verificação não podem passar em silêncio.
      const aprovadas = await cliente.query<{ total: number }>(
        `select count(*)::int as total
           from json_populate_recordset(null::${alvo}, $1::json) v
          where ${regraInsercao.verificando("v")}`,
        [JSON.stringify(linhas)]
      );

      if (aprovadas.rows[0].total !== linhas.length) {
        throw new ErroDeConsulta("Operação não permitida.", PERMISSAO_NEGADA);
      }
    }
  } else {
    const operacao = consulta.acao === "update" ? "update" : "delete";
    const regra = regras ? regras.obter(consulta.tabela, operacao) : {};

    if (consulta.filtros.length === 0) {
      throw new ErroDeConsulta(
        "Alterações e exclusões exigem ao menos um filtro.",
        "21000"
      );
    }

    const filtros = montarFiltros(esquema, consulta, "t", parametro);

    // Sem permissão, o comando não alcança nenhuma linha (mesmo efeito do RLS).
    if (!regra) {
      filtros.push("false");
    } else if (regra.usando) {
      filtros.push(`(${regra.usando("t")})`);
    }

    if (consulta.acao === "update") {
      const linhas = linhasEnviadas(consulta);

      if (linhas.length !== 1 || Array.isArray(consulta.valores)) {
        throw new ErroDeConsulta("Valores inválidos.", "PGRST102");
      }

      if (regra?.validarValores && !regra.validarValores(linhas[0])) {
        throw new ErroDeConsulta("Operação não permitida.", PERMISSAO_NEGADA);
      }

      const colunas = colunasEnviadas(esquema, consulta);

      comando = `update ${alvo} t
                    set (${colunas.join(", ")}) =
                        (select ${colunas.map((nome) => `v.${nome}`).join(", ")}
                           from json_populate_record(null::${alvo}, ${parametro(JSON.stringify(linhas[0]))}::json) v)
                  where ${filtros.join(" and ")}
              returning t.*`;
    } else {
      comando = `delete from ${alvo} t
                  where ${filtros.join(" and ")}
              returning t.*`;
    }
  }

  const retorno =
    consulta.colunas === null
      ? "null::json"
      : `(select coalesce(json_agg(row_to_json(q)), '[]'::json)
            from (select ${montarCampos(
              montagem,
              consulta.tabela,
              "m",
              interpretarSelecao(consulta.colunas)
            ).campos.join(", ")} from m) q)`;

  const resultado = await cliente.query<{
    afetadas: number;
    dados: unknown[] | null;
  }>(
    `with m as (${comando})
     select (select count(*)::int from m) as afetadas, ${retorno} as dados`,
    parametros
  );

  const { afetadas, dados } = resultado.rows[0];

  if (esperadas !== null && afetadas !== esperadas) {
    throw new ErroDeConsulta("Operação não permitida.", PERMISSAO_NEGADA);
  }

  return { linhas: dados, total: null };
}

function formatar(
  consulta: Consulta,
  linhas: unknown[] | null,
  total: number | null
): Resultado {
  if (linhas === null || consulta.formato === "lista") {
    return { data: linhas, error: null, count: total };
  }

  if (linhas.length === 1) {
    return { data: linhas[0], error: null, count: total };
  }

  if (linhas.length === 0 && consulta.formato === "talvezUnico") {
    return { data: null, error: null, count: total };
  }

  return {
    data: null,
    error: {
      message: `A consulta deveria retornar uma linha, mas retornou ${linhas.length}.`,
      code: "PGRST116",
    },
    count: total,
  };
}

export function converterErro(erro: unknown): ErroConsulta {
  if (erro instanceof ErroDeConsulta) {
    return { message: erro.message, code: erro.code };
  }

  const codigo =
    erro && typeof erro === "object" && "code" in erro
      ? String(erro.code)
      : "ERRO";

  return {
    message: erro instanceof Error ? erro.message : "Erro ao consultar o banco.",
    code: codigo,
  };
}

export async function executarConsulta(
  pool: Pool,
  consulta: Consulta,
  regras: Regras | null
): Promise<Resultado> {
  try {
    const esquema = await obterEsquema(pool);

    if (consulta.acao === "select") {
      const { linhas, total } = await executarLeitura(
        pool,
        esquema,
        consulta,
        regras
      );

      return formatar(consulta, linhas, total);
    }

    const cliente = await pool.connect();

    try {
      await cliente.query("begin");

      const { linhas, total } = await executarEscrita(
        cliente,
        esquema,
        consulta,
        regras
      );

      await cliente.query("commit");

      return formatar(consulta, linhas, total);
    } catch (erro) {
      await cliente.query("rollback").catch(() => {});
      throw erro;
    } finally {
      cliente.release();
    }
  } catch (erro) {
    return { data: null, error: converterErro(erro), count: null };
  }
}

// Descrição de uma consulta ao banco, compartilhada entre navegador e servidor.
// O navegador monta a consulta e envia para /api/dados; o servidor confere as
// permissões (lib/servidor/permissoes.ts) e a transforma em SQL (lib/servidor/sql.ts).

export type Operador =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "is"
  | "not.is";

export type Filtro = {
  coluna: string;
  operador: Operador;
  valor: unknown;
};

export type Acao = "select" | "insert" | "update" | "delete" | "upsert";

export type Consulta = {
  tabela: string;
  acao: Acao;
  // Colunas a devolver. null em insert/update/delete significa "não devolver linhas".
  colunas: string | null;
  filtros: Filtro[];
  ordem: { coluna: string; ascendente: boolean }[];
  limite: number | null;
  deslocamento: number | null;
  contar: boolean;
  somenteContagem: boolean;
  formato: "lista" | "unico" | "talvezUnico";
  valores: Record<string, unknown> | Record<string, unknown>[] | null;
  conflito: string | null;
  ignorarDuplicados: boolean;
};

export type ErroConsulta = {
  message: string;
  code: string;
};

// As telas tratam o retorno sem tipos gerados do banco: uma lista de linhas
// quaisquer ou, com single()/maybeSingle(), uma linha qualquer.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Qualquer = any;

export type Resultado<T = Qualquer> = {
  data: T | null;
  error: ErroConsulta | null;
  count: number | null;
};

export type Executor = (consulta: Consulta) => Promise<Resultado>;

export class Construtor<T = Qualquer[]> implements PromiseLike<Resultado<T>> {
  private consulta: Consulta;

  constructor(
    private executar: Executor,
    tabela: string
  ) {
    this.consulta = {
      tabela,
      acao: "select",
      colunas: null,
      filtros: [],
      ordem: [],
      limite: null,
      deslocamento: null,
      contar: false,
      somenteContagem: false,
      formato: "lista",
      valores: null,
      conflito: null,
      ignorarDuplicados: false,
    };
  }

  select(
    colunas = "*",
    opcoes?: { count?: "exact"; head?: boolean }
  ) {
    this.consulta.colunas = colunas;
    this.consulta.contar = opcoes?.count === "exact";
    this.consulta.somenteContagem = opcoes?.head === true;
    return this;
  }

  insert(valores: Record<string, unknown> | Record<string, unknown>[]) {
    this.consulta.acao = "insert";
    this.consulta.valores = valores;
    return this;
  }

  upsert(
    valores: Record<string, unknown> | Record<string, unknown>[],
    opcoes?: { onConflict?: string; ignoreDuplicates?: boolean }
  ) {
    this.consulta.acao = "upsert";
    this.consulta.valores = valores;
    this.consulta.conflito = opcoes?.onConflict ?? null;
    this.consulta.ignorarDuplicados = opcoes?.ignoreDuplicates === true;
    return this;
  }

  update(valores: Record<string, unknown>) {
    this.consulta.acao = "update";
    this.consulta.valores = valores;
    return this;
  }

  delete() {
    this.consulta.acao = "delete";
    return this;
  }

  private filtrar(coluna: string, operador: Operador, valor: unknown) {
    this.consulta.filtros.push({ coluna, operador, valor });
    return this;
  }

  eq(coluna: string, valor: unknown) {
    return this.filtrar(coluna, "eq", valor);
  }

  neq(coluna: string, valor: unknown) {
    return this.filtrar(coluna, "neq", valor);
  }

  gt(coluna: string, valor: unknown) {
    return this.filtrar(coluna, "gt", valor);
  }

  gte(coluna: string, valor: unknown) {
    return this.filtrar(coluna, "gte", valor);
  }

  lt(coluna: string, valor: unknown) {
    return this.filtrar(coluna, "lt", valor);
  }

  lte(coluna: string, valor: unknown) {
    return this.filtrar(coluna, "lte", valor);
  }

  in(coluna: string, valores: unknown[]) {
    return this.filtrar(coluna, "in", valores);
  }

  is(coluna: string, valor: null | boolean) {
    return this.filtrar(coluna, "is", valor);
  }

  // Única forma usada no sistema: .not(coluna, "is", null)
  not(coluna: string, operador: "is", valor: null | boolean) {
    return this.filtrar(coluna, `not.${operador}`, valor);
  }

  order(coluna: string, opcoes?: { ascending?: boolean }) {
    this.consulta.ordem.push({
      coluna,
      ascendente: opcoes?.ascending !== false,
    });
    return this;
  }

  limit(quantidade: number) {
    this.consulta.limite = quantidade;
    return this;
  }

  range(inicio: number, fim: number) {
    this.consulta.deslocamento = inicio;
    this.consulta.limite = fim - inicio + 1;
    return this;
  }

  single() {
    this.consulta.formato = "unico";
    return this as unknown as Construtor<Qualquer>;
  }

  maybeSingle() {
    this.consulta.formato = "talvezUnico";
    return this as unknown as Construtor<Qualquer>;
  }

  then<TResult1 = Resultado<T>, TResult2 = never>(
    onfulfilled?:
      | ((value: Resultado<T>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): PromiseLike<TResult1 | TResult2> {
    return (this.executar(this.consulta) as Promise<Resultado<T>>).then(
      onfulfilled,
      onrejected
    );
  }
}

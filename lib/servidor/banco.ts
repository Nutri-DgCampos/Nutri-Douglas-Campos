import { Pool } from "pg";
import { Construtor, type Resultado } from "@/lib/consulta";
import { converterErro, executarConsulta } from "./sql";

// Acesso ao banco pelo servidor, sem filtro de permissões.
// Usar somente em rotas de API que já conferiram quem está chamando.

const global = globalThis as unknown as { poolDoBanco?: Pool };

export function obterPool(): Pool {
  if (!global.poolDoBanco) {
    const url = process.env.DATABASE_URL;

    if (!url) {
      throw new Error("DATABASE_URL não configurada.");
    }

    global.poolDoBanco = new Pool({ connectionString: url, max: 10 });
  }

  return global.poolDoBanco;
}

// Funções do banco que podem ser chamadas, e o formato do retorno.
const FUNCOES: Record<string, "valor" | "linhas" | "nada"> = {
  verificar_limite_cadastro: "valor",
  finalizar_notificacao: "valor",
  iniciar_ciclo_dieta: "valor",
  consultar_notificacoes_interrompidas: "linhas",
  reservar_proxima_notificacao: "linhas",
  inativar_pacientes_vencidos: "nada",
};

async function chamarFuncao(
  nome: string,
  argumentos: Record<string, unknown> = {}
): Promise<Resultado> {
  try {
    const formato = FUNCOES[nome];

    if (!formato) {
      throw new Error(`Função desconhecida: ${nome}`);
    }

    const nomes = Object.keys(argumentos);

    if (nomes.some((argumento) => !/^p_[a-z_]+$/.test(argumento))) {
      throw new Error("Argumento inválido.");
    }

    const chamada = `public."${nome}"(${nomes
      .map((argumento, indice) => `${argumento} => $${indice + 1}`)
      .join(", ")})`;

    const sql =
      formato === "linhas"
        ? `select coalesce(json_agg(row_to_json(f)), '[]'::json) as dados from ${chamada} f`
        : formato === "valor"
          ? `select to_json(${chamada}) as dados`
          : `select null::json as dados from (select ${chamada}) f`;

    const resultado = await obterPool().query<{ dados: unknown }>(
      sql,
      nomes.map((argumento) => argumentos[argumento])
    );

    return { data: resultado.rows[0].dados, error: null, count: null };
  } catch (erro) {
    return { data: null, error: converterErro(erro), count: null };
  }
}

export const banco = {
  from(tabela: string) {
    return new Construtor(
      (consulta) => executarConsulta(obterPool(), consulta, null),
      tabela
    );
  },

  rpc: chamarFuncao,
};

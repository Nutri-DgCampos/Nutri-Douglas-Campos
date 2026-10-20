import type { PoolClient } from "pg";
import { obterPool } from "@/lib/servidor/banco";

// Validação dos dados de um alimento enviados pela tela de cadastro.

export type DadosDoAlimento = {
  nome?: string;
  categoriaId?: number | null;
  unidadeBase?: "g" | "ml";
  densidade?: number | null;
  arquivado?: boolean;
  // Nutriente → valor por 100 g (null = remover o valor informado manualmente).
  nutrientes?: Record<string, number | null>;
};

let codigosValidos: Set<string> | null = null;

async function nutrientesValidos() {
  if (!codigosValidos) {
    const resultado = await obterPool().query<{ codigo: string }>("select codigo from public.nutrientes");
    codigosValidos = new Set(resultado.rows.map((linha) => linha.codigo));
  }
  return codigosValidos;
}

export async function validarDadosDoAlimento(
  corpo: unknown,
  novo: boolean
): Promise<DadosDoAlimento | { erro: string }> {
  if (!corpo || typeof corpo !== "object") return { erro: "Dados inválidos." };

  const entrada = corpo as Record<string, unknown>;
  const dados: DadosDoAlimento = {};

  if (novo || entrada.nome !== undefined) {
    const nome = typeof entrada.nome === "string" ? entrada.nome.trim().replace(/\s+/g, " ") : "";
    if (!nome || nome.length > 200) return { erro: "Informe o nome do alimento." };
    dados.nome = nome;
  }

  if (entrada.categoriaId !== undefined) {
    if (entrada.categoriaId === null) dados.categoriaId = null;
    else if (Number.isInteger(entrada.categoriaId) && (entrada.categoriaId as number) > 0) dados.categoriaId = entrada.categoriaId as number;
    else return { erro: "Categoria inválida." };
  } else if (novo) {
    dados.categoriaId = null;
  }

  if (novo || entrada.unidadeBase !== undefined) {
    const unidade = entrada.unidadeBase ?? "g";
    if (unidade !== "g" && unidade !== "ml") return { erro: "A unidade deve ser g ou mL." };
    dados.unidadeBase = unidade;
  }

  if (entrada.densidade !== undefined) {
    if (entrada.densidade === null || entrada.densidade === "") dados.densidade = null;
    else {
      const densidade = Number(entrada.densidade);
      if (!Number.isFinite(densidade) || densidade <= 0 || densidade > 5) return { erro: "Densidade inválida (g por mL)." };
      dados.densidade = densidade;
    }
  } else if (novo) {
    dados.densidade = null;
  }

  if (entrada.arquivado !== undefined) {
    if (typeof entrada.arquivado !== "boolean") return { erro: "Valor inválido para arquivado." };
    dados.arquivado = entrada.arquivado;
  }

  if (entrada.nutrientes !== undefined) {
    if (!entrada.nutrientes || typeof entrada.nutrientes !== "object") return { erro: "Nutrientes inválidos." };

    const validos = await nutrientesValidos();
    const nutrientes: Record<string, number | null> = {};

    for (const [codigo, valor] of Object.entries(entrada.nutrientes as Record<string, unknown>)) {
      if (!validos.has(codigo)) return { erro: `Nutriente desconhecido: ${codigo}.` };
      if (valor === null || valor === "") nutrientes[codigo] = null;
      else {
        const numero = Number(valor);
        if (!Number.isFinite(numero) || numero < 0 || numero > 100000) return { erro: `Valor inválido para ${codigo}.` };
        nutrientes[codigo] = numero;
      }
    }

    dados.nutrientes = nutrientes;
  }

  return dados;
}

// Grava valores com a fonte informada. Valores de fontes importadas (TACO e
// complementares) nunca são sobrescritos nem apagados por aqui.
export async function gravarNutrientes(
  cliente: PoolClient,
  alimentoId: string,
  fonte: "manual",
  nutrientes: Record<string, number | null>
) {
  for (const [codigo, valor] of Object.entries(nutrientes)) {
    if (valor === null) {
      await cliente.query(
        "delete from public.alimentos_nutrientes where alimento_id = $1 and nutriente = $2 and fonte = $3",
        [alimentoId, codigo, fonte]
      );
      continue;
    }

    await cliente.query(
      `insert into public.alimentos_nutrientes (alimento_id, nutriente, valor, traco, fonte)
       values ($1, $2, $3, false, $4)
       on conflict (alimento_id, nutriente) do update
         set valor = excluded.valor, traco = false, atualizado_em = now()
         where public.alimentos_nutrientes.fonte = excluded.fonte`,
      [alimentoId, codigo, valor, fonte]
    );
  }
}

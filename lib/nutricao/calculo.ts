// Cálculo nutricional central do Módulo de Nutrição.
//
// Todas as telas (cadastro de alimentos, substituições, editor de dietas,
// modelos, painel nutricional, PDFs) usam estas funções. Regras:
// - Composição por 100 g (ou 100 mL, conforme a unidade base do alimento).
// - Valor ausente é "indisponível", nunca zero. Traço também é indisponível
//   nos cálculos, mas é mostrado como "Tr".
// - Uma soma só é "completa" quando todos os itens têm o valor; senão o
//   total é parcial e precisa ser sinalizado.
// - Arredondamento só na exibição.

export type ValorNutriente = { valor: number | null; traco: boolean };

// Nutriente → valor por 100 g. Nutriente sem chave = dado não disponível.
export type Composicao = Record<string, ValorNutriente>;

export type Resultado =
  | { situacao: "valor"; valor: number }
  | { situacao: "traco" }
  | { situacao: "indisponivel" };

export type Total = {
  // Soma dos valores conhecidos (null se nenhum item tinha o valor).
  valor: number | null;
  // Todos os itens tinham o valor.
  completo: boolean;
  // Itens considerados (para dizer "parcial: 3 de 5").
  conhecidos: number;
  itens: number;
};

// Valor de um nutriente numa quantidade (g ou mL na unidade base do alimento).
export function nutrienteDaPorcao(composicao: Composicao, nutriente: string, quantidade: number): Resultado {
  const dado = composicao[nutriente];

  if (!dado) return { situacao: "indisponivel" };
  if (dado.traco || dado.valor === null) return { situacao: "traco" };
  if (!Number.isFinite(quantidade) || quantidade < 0) return { situacao: "indisponivel" };

  return { situacao: "valor", valor: (dado.valor * quantidade) / 100 };
}

export function somar(resultados: Resultado[]): Total {
  let soma = 0;
  let conhecidos = 0;

  for (const resultado of resultados) {
    if (resultado.situacao === "valor") {
      soma += resultado.valor;
      conhecidos += 1;
    }
  }

  return {
    valor: conhecidos === 0 ? null : soma,
    completo: resultados.length > 0 && conhecidos === resultados.length,
    conhecidos,
    itens: resultados.length,
  };
}

// Item de uma lista (opção de refeição, substituição): alimento e quantidade.
export type Item = { composicao: Composicao; quantidade: number };

export function totalDoNutriente(itens: Item[], nutriente: string): Total {
  return somar(itens.map((item) => nutrienteDaPorcao(item.composicao, nutriente, item.quantidade)));
}

// ---------------------------------------------------------------------------
// Quantidades

// Quantidade (na unidade base do alimento) a partir das medidas caseiras.
export function quantidadeDasMedidas(numeroDeMedidas: number, quantidadePorMedida: number) {
  if (!(numeroDeMedidas > 0) || !(quantidadePorMedida > 0)) return null;
  return numeroDeMedidas * quantidadePorMedida;
}

// Converte uma quantidade informada em g ou mL para a unidade base do
// alimento. Entre massa e volume só converte com a densidade do alimento;
// nunca presume 1 mL = 1 g.
export function paraUnidadeBase(
  quantidade: number,
  unidadeInformada: "g" | "ml",
  alimento: { unidade_base: "g" | "ml"; densidade_g_ml: number | null }
) {
  if (unidadeInformada === alimento.unidade_base) return quantidade;
  if (!alimento.densidade_g_ml || !(alimento.densidade_g_ml > 0)) return null;

  return unidadeInformada === "ml"
    ? quantidade * alimento.densidade_g_ml // mL → g
    : quantidade / alimento.densidade_g_ml; // g → mL
}

// Nome da medida conforme a quantidade: singular só para até 1 (1 fatia,
// 0,5 xícara); plural acima de 1 (1,5 xícaras, 2 fatias).
export function nomeDaMedida(quantidade: number, singular: string, plural: string) {
  return quantidade > 1 ? plural : singular;
}

// ---------------------------------------------------------------------------
// Substituições

// Arredondamento aprovado para quantidades de substituição: de 1 em 1 g
// abaixo de 20 g; de 10 em 10 g a partir de 20 g.
export function arredondarSubstituicao(quantidade: number) {
  if (!Number.isFinite(quantidade) || quantidade <= 0) return null;
  const arredondada = quantidade < 20 ? Math.round(quantidade) : Math.round(quantidade / 10) * 10;
  return Math.max(arredondada, 1);
}

// Quantidade do substituto com a mesma energia da porção de referência do
// alimento principal (equivalência energética). Sugestão para o
// nutricionista conferir; null quando falta a energia de algum dos dois.
export function quantidadeEquivalente(
  principal: Composicao,
  quantidadeReferencia: number,
  substituto: Composicao
) {
  const energia = nutrienteDaPorcao(principal, "kcal", quantidadeReferencia);
  const kcalSubstituto = substituto.kcal;

  if (energia.situacao !== "valor" || !kcalSubstituto || kcalSubstituto.traco || !kcalSubstituto.valor) {
    return null;
  }

  return arredondarSubstituicao((energia.valor * 100) / kcalSubstituto.valor);
}

// ---------------------------------------------------------------------------
// Exibição

const CASAS: Record<string, number> = { kcal: 0, kj: 0 };

// kcal sem decimais; demais nutrientes com 1 casa (macros) ou 2 casas
// (valores pequenos em mg/µg), sempre no padrão brasileiro.
export function formatarNutriente(nutriente: string, valor: number) {
  const casas = CASAS[nutriente] ?? (Math.abs(valor) > 0 && Math.abs(valor) < 1 ? 2 : 1);
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });
}

export function textoDoResultado(nutriente: string, resultado: Resultado) {
  if (resultado.situacao === "valor") return formatarNutriente(nutriente, resultado.valor);
  if (resultado.situacao === "traco") return "Tr";
  return "—";
}

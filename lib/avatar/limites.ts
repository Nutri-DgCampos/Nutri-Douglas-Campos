// Limites visuais dos perímetros (pedido do nutricionista, 21/11/2026).
//
// O desenho tem dois limites, ambos documentados e registrados:
// 1. Faixa suportada de cada perímetro (FAIXAS_DE_PERIMETRO).
// 2. Coerência entre regiões vizinhas: a diferença entre os logaritmos de
//    (medida / neutro) de duas regiões vizinhas não passa de um máximo. Acima
//    disso a deformação 2D forma degraus; os dois valores desenhados se
//    aproximam até o máximo. Uma região sem medida cede muito mais que uma
//    medida (é uma projeção visual), e uma medida cede o mínimo necessário.
//
// Nada aqui altera a medida clínica: o resultado é só o valor desenhado,
// com a origem (medido, projetado, referência) e o limite aplicado.

import { FAIXAS_DE_PERIMETRO, PERIMETROS_NEUTROS, type Modelo, type Perimetro } from "./regioes.ts";

export const PERIMETROS: readonly Perimetro[] = ["deltoide", "torax", "braco", "antebraco", "cintura", "abdomen", "quadril", "coxa", "panturrilha"];

/** Pares vizinhos e a maior diferença representável (em ln da razão ao neutro). */
export const VIZINHOS: readonly [Perimetro, Perimetro, number][] = [
  ["deltoide", "braco", 0.25],
  ["braco", "antebraco", 0.25],
  ["deltoide", "torax", 0.3],
  ["torax", "cintura", 0.3],
  ["cintura", "abdomen", 0.2],
  ["abdomen", "quadril", 0.25],
  ["quadril", "coxa", 0.3],
  ["coxa", "panturrilha", 0.3],
];

/** Rigidez relativa: medida cede pouco; sem medida, cede quase tudo. */
const RIGIDEZ = { medido: 1, semMedida: 0.05 };

export type OrigemVisual = "medido" | "projetado" | "referencia";
export type LimiteVisual = "faixa" | "coerencia";

export type PerimetroDesenhado = {
  /** Valor clínico (cm), como está no documento; null se ausente. */
  medido: number | null;
  /** Valor usado no desenho (cm). */
  desenhado: number;
  origem: OrigemVisual;
  limites: LimiteVisual[];
};

export type ResultadoDosLimites = {
  regioes: Record<Perimetro, PerimetroDesenhado>;
  /** ln(desenhado / neutro), pronto para as bases de forma. */
  coeficientes: Record<Perimetro, number>;
};

const valido = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/**
 * Aplica faixa e coerência entre vizinhos. Valores zero, negativos ou não
 * numéricos contam como ausentes (SPEC §7.4). Determinístico.
 */
export function aplicarLimitesVisuais(modelo: Modelo, medidas: Partial<Record<Perimetro, number | null>>): ResultadoDosLimites {
  const neutro = PERIMETROS_NEUTROS[modelo], faixas = FAIXAS_DE_PERIMETRO[modelo];
  const s = {} as Record<Perimetro, number>;
  const rigidez = {} as Record<Perimetro, number>;
  const limites = {} as Record<Perimetro, Set<LimiteVisual>>;
  for (const r of PERIMETROS) {
    limites[r] = new Set();
    const v = medidas[r];
    if (valido(v)) {
      const [min, max] = faixas[r];
      const preso = Math.min(max, Math.max(min, v));
      if (preso !== v) limites[r].add("faixa");
      s[r] = Math.log(preso / neutro[r]);
      rigidez[r] = RIGIDEZ.medido;
    } else {
      s[r] = 0;
      rigidez[r] = RIGIDEZ.semMedida;
    }
  }
  const inicial = { ...s };
  // Projeções alternadas sobre cada par (convergem para um ponto viável).
  for (let volta = 0; volta < 200; volta++) {
    let mudou = false;
    for (const [a, b, maximo] of VIZINHOS) {
      const diferenca = s[a] - s[b];
      if (Math.abs(diferenca) <= maximo + 1e-9) continue;
      const excesso = Math.abs(diferenca) - maximo, sinal = Math.sign(diferenca);
      // cada lado cede na proporção inversa da sua rigidez
      const ia = 1 / rigidez[a], ib = 1 / rigidez[b];
      s[a] -= sinal * excesso * (ia / (ia + ib));
      s[b] += sinal * excesso * (ib / (ia + ib));
      mudou = true;
    }
    if (!mudou) break;
  }
  const regioes = {} as Record<Perimetro, PerimetroDesenhado>;
  const coeficientes = {} as Record<Perimetro, number>;
  for (const r of PERIMETROS) {
    const [min, max] = faixas[r];
    const desenhado = Math.min(max, Math.max(min, neutro[r] * Math.exp(s[r])));
    const v = medidas[r];
    const moveu = Math.abs(s[r] - inicial[r]) > 1e-6;
    if (valido(v) && moveu) limites[r].add("coerencia");
    regioes[r] = {
      medido: valido(v) ? v : null,
      desenhado: Math.round(desenhado * 10) / 10,
      origem: valido(v) ? "medido" : moveu ? "projetado" : "referencia",
      limites: [...limites[r]],
    };
    coeficientes[r] = Math.log(desenhado / neutro[r]);
  }
  return { regioes, coeficientes };
}

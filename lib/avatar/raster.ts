// Utilidades de raster dos avatares: polígonos e transformada de distância.
// Sem dependências, para rodar igual na tela e no servidor.

import type { Ponto } from "./regioes.ts";

/**
 * Preenche polígonos num raster largura × altura (borda incluída, como o
 * PIL). `sx`/`sy` escalam as coordenadas (do espaço 600 × 802 para a camada).
 */
export function rasterizar(poligonos: Ponto[][], largura: number, altura: number, sx = 1, sy = 1): Uint8Array {
  const dentro = new Uint8Array(largura * altura);
  for (const original of poligonos) {
    const pol = original.map(([x, y]) => [x * sx, y * sy]);
    for (let y = 0; y < altura; y++) {
      const xs: number[] = [];
      for (let i = 0; i < pol.length; i++) {
        const [x1, y1] = pol[i], [x2, y2] = pol[(i + 1) % pol.length];
        if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ini = Math.max(0, Math.ceil(xs[k] - 0.5)), fim = Math.min(largura - 1, Math.floor(xs[k + 1] + 0.5));
        for (let x = ini; x <= fim; x++) dentro[y * largura + x] = 1;
      }
    }
  }
  return dentro;
}

const INF = 1e20;

/** Uma passada 1D de Felzenszwalb e Huttenlocher, com o índice do mais próximo. */
function passada(g: Float64Array, n: number, d: Float64Array, idx: Int32Array) {
  const v = new Int32Array(n), z = new Float64Array(n + 1);
  let k = 0;
  let primeiro = -1;
  for (let q = 0; q < n; q++) if (g[q] < INF) { primeiro = q; break; }
  if (primeiro < 0) {
    d.fill(INF);
    idx.fill(-1);
    return;
  }
  v[0] = primeiro; z[0] = -INF; z[1] = INF;
  for (let q = primeiro + 1; q < n; q++) {
    if (g[q] >= INF) continue;
    let s = (g[q] + q * q - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (g[q] + q * q - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) ** 2 + g[v[k]];
    idx[q] = v[k];
  }
}

/**
 * Distância euclidiana exata de cada pixel ao pixel-alvo mais próximo e o
 * índice desse alvo (−1 se não houver alvo).
 */
export function distanciaAoAlvo(alvo: Uint8Array, largura: number, altura: number): { distancia: Float64Array; maisProximo: Int32Array } {
  const colD = new Float64Array(largura * altura), colY = new Int32Array(largura * altura);
  const g = new Float64Array(Math.max(largura, altura)), d = new Float64Array(Math.max(largura, altura)), ix = new Int32Array(Math.max(largura, altura));
  for (let x = 0; x < largura; x++) {
    for (let y = 0; y < altura; y++) g[y] = alvo[y * largura + x] ? 0 : INF;
    passada(g.subarray(0, altura), altura, d, ix);
    for (let y = 0; y < altura; y++) { colD[y * largura + x] = d[y]; colY[y * largura + x] = ix[y]; }
  }
  const distancia = new Float64Array(largura * altura), maisProximo = new Int32Array(largura * altura);
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) g[x] = colD[y * largura + x];
    passada(g.subarray(0, largura), largura, d, ix);
    for (let x = 0; x < largura; x++) {
      const xx = ix[x];
      distancia[y * largura + x] = Math.sqrt(d[x]);
      maisProximo[y * largura + x] = xx < 0 || colY[y * largura + xx] < 0 ? -1 : colY[y * largura + xx] * largura + xx;
    }
  }
  return { distancia, maisProximo };
}

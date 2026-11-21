// Geração determinística dos campos de deslocamento de cada vista.
//
// As oito bases do protótipo (braço, cintura, abdômen, quadril, coxa e as
// dobras tricipital, abdominal e da coxa) são uma tradução fiel de
// referencia-geracao-campos.py e referencia-protecao-bracos.py; o teste
// tests/avatarMotor.test.mjs compara o resultado com os campos aprovados.
// As demais bases foram acrescentadas na versão 1 (SPEC §7.2).
//
// Um campo é amostrado numa grade de 101 × 135 pontos no espaço de
// referência; o valor é o deslocamento (dx, dy), em pixels de referência,
// por unidade de coeficiente.

import {
  BASES,
  GRADE_ALTURA,
  GRADE_LARGURA,
  PERIMETROS_NEUTROS,
  REF_ALTURA,
  REF_LARGURA,
  REGIOES,
  type Base,
  type ConfigDaVista,
  type Modelo,
  type Segmento,
  type Vista,
} from "./regioes.ts";
import { distanciaAoAlvo, rasterizar } from "./raster.ts";

const N = GRADE_LARGURA * GRADE_ALTURA;

/** Campos de uma vista: dados[(ponto * bases + base) * 2 + (0 = dx | 1 = dy)]. */
export type CamposDaVista = {
  largura: number;
  altura: number;
  bases: readonly Base[];
  dados: Float32Array;
  /**
   * Camada dos braços: giro (por unidade de coeficiente) que cada faixa do
   * tronco exige para o braço liberar o tronco. O motor aplica o maior.
   */
  giros?: Partial<Record<Base, number>>;
};

type Vetor = { x: Float64Array; y: Float64Array };
const vetor = (): Vetor => ({ x: new Float64Array(N), y: new Float64Array(N) });
const escalar = () => new Float64Array(N);

export function suave(a: number, b: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Pontos da grade (np.linspace(0, 599, 101) e np.linspace(0, 801, 135)).
const GX = new Float64Array(N);
const GY = new Float64Array(N);
for (let j = 0; j < GRADE_ALTURA; j++)
  for (let i = 0; i < GRADE_LARGURA; i++) {
    GX[j * GRADE_LARGURA + i] = (i * (REF_LARGURA - 1)) / (GRADE_LARGURA - 1);
    GY[j * GRADE_LARGURA + i] = (j * (REF_ALTURA - 1)) / (GRADE_ALTURA - 1);
  }

// ---------------------------------------------------------------- membros

type Membros = { forma: Vetor; gordura: Vetor; anterior: Vetor; ocupacao: Float64Array };

/**
 * Segmentos de membro (função limb/limbs do protótipo). `escalaGordura`
 * converte mm em pixels: no protótipo vem do perímetro de referência
 * (2r / diâmetro em mm); nas regiões novas, da escala média da vista.
 */
function membros(segmentos: Segmento[], escalaGordura: (s: Segmento) => number, anterior: (1 | -1)[] = []): Membros {
  const forma = vetor(), gordura = vetor(), ant = vetor();
  const total = escalar(), ocupacao = escalar();
  segmentos.forEach((seg, k) => {
    const [[sx, sy], [ex, ey], raio] = seg;
    const vx = ex - sx, vy = ey - sy, comp = Math.hypot(vx, vy);
    const ax = vx / comp, ay = vy / comp, nx = -ay, ny = ax;
    const escala = escalaGordura(seg);
    for (let p = 0; p < N; p++) {
      const dx = GX[p] - sx, dy = GY[p] - sy;
      const t = (dx * ax + dy * ay) / comp, n = dx * nx + dy * ny;
      const wt = suave(-0.1, 0.12, t) * (1 - suave(0.78, 1.0, t));
      const wn = Math.exp(-0.5 * (n / (raio * 1.1)) ** 4);
      const w = wt * wn;
      forma.x[p] += w * n * nx;
      forma.y[p] += w * n * ny;
      const g = -w * (n / raio) * escala;
      gordura.x[p] += g * nx;
      gordura.y[p] += g * ny;
      if (anterior[k] !== undefined && n * anterior[k] > 0) {
        ant.x[p] += g * nx;
        ant.y[p] += g * ny;
      }
      total[p] += wn;
      ocupacao[p] = Math.max(ocupacao[p], w);
    }
  });
  for (let p = 0; p < N; p++) {
    const d = 0.06 + total[p];
    forma.x[p] /= d; forma.y[p] /= d;
    gordura.x[p] /= d; gordura.y[p] /= d;
    ant.x[p] /= d; ant.y[p] /= d;
  }
  return { forma, gordura, anterior: ant, ocupacao };
}

/**
 * Cadeia de dois membros (braço–antebraço, coxa–panturrilha). Cada segmento
 * usa a forma do protótipo, mas os pesos longitudinais se estendem até a
 * articulação e, onde os dois se sobrepõem, dividem a região (somam 1): a
 * articulação muda com a média dos dois, sem nó nem estrangulamento.
 */
function cadeiaDeMembros(proximais: Segmento[], distais: Segmento[]): { proximal: Vetor; distal: Vetor } {
  const proximal = vetor(), distal = vetor(), soma = escalar();
  const grupos: [Segmento[], Vetor, [number, number, number, number]][] = [
    [proximais, proximal, [-0.1, 0.12, 0.95, 1.15]],
    [distais, distal, [-0.15, 0.05, 0.78, 1.0]],
  ];
  for (const [segmentos, destino, [a0, a1, b0, b1]] of grupos)
    for (const [[sx, sy], [ex, ey], raio] of segmentos) {
      const vx = ex - sx, vy = ey - sy, comp = Math.hypot(vx, vy);
      const ax = vx / comp, ay = vy / comp, nx = -ay, ny = ax;
      for (let p = 0; p < N; p++) {
        const dx = GX[p] - sx, dy = GY[p] - sy;
        const t = (dx * ax + dy * ay) / comp, n = dx * nx + dy * ny;
        const wt = suave(a0, a1, t) * (1 - suave(b0, b1, t));
        // queda mais suave que no protótipo (1,3 raio): menos compressão fora do contorno
        const wn = Math.exp(-0.5 * (n / (raio * 1.3)) ** 4);
        const w = wt * wn;
        destino.x[p] += (w * n * nx) / (0.06 + wn);
        destino.y[p] += (w * n * ny) / (0.06 + wn);
        soma[p] += w;
      }
    }
  for (let p = 0; p < N; p++) {
    const k = 1 / Math.max(1, soma[p]);
    proximal.x[p] *= k; proximal.y[p] *= k; distal.x[p] *= k; distal.y[p] *= k;
  }
  // Na articulação, as duas contrações axiais (em direções diferentes)
  // dobrariam o lado côncavo (atrás do joelho, dentro do cotovelo). Ali o
  // campo passa a ser uma contração perpendicular à bissetriz da articulação
  // (média das direções dos dois segmentos), metade para cada segmento: com
  // coeficientes iguais é uma escala numa só direção, que não dobra nem alonga.
  proximais.forEach((sp, k) => {
    const sd = distais[k];
    if (!sd) return;
    const jx = (sp[1][0] + sd[0][0]) / 2, jy = (sp[1][1] + sd[0][1]) / 2, raio = sd[2] * 2.4;
    const dp = [sp[1][0] - sp[0][0], sp[1][1] - sp[0][1]], dd = [sd[1][0] - sd[0][0], sd[1][1] - sd[0][1]];
    const np = Math.hypot(dp[0], dp[1]), nd = Math.hypot(dd[0], dd[1]);
    let ux = dp[0] / np + dd[0] / nd, uy = dp[1] / np + dd[1] / nd;
    const nu = Math.hypot(ux, uy);
    ux /= nu; uy /= nu;
    const mx = -uy, my = ux;
    for (let p = 0; p < N; p++) {
      const rx = GX[p] - jx, ry = GY[p] - jy;
      const wj = 1 - suave(0.6 * raio, 1.4 * raio, Math.hypot(rx, ry));
      if (wj === 0) continue;
      const proj = rx * mx + ry * my;
      for (const v of [proximal, distal]) {
        v.x[p] = (1 - wj) * v.x[p] + wj * 0.5 * proj * mx;
        v.y[p] = (1 - wj) * v.y[p] + wj * 0.5 * proj * my;
      }
    }
  });
  return { proximal, distal };
}

/**
 * Camada de gordura de uma cadeia de membros (núcleo que recua). No contorno
 * visível (meia largura h) o recuo é a meia dobra × 2h / diâmetro do
 * perímetro neutro, isto é, mm convertidos pela escala local; para dentro,
 * proporcional à distância ao eixo; o alcance cobre todo o contorno. Onde
 * dois segmentos se sobrepõem (articulação), dividem a região sem somar.
 * `anteriores`: lado anterior de cada segmento proximal (+1 = n positivo),
 * para separar a metade anterior (bicipital).
 */
function cadeiaDeGordura(proximais: Segmento[], distais: Segmento[], diametroProximal: number, diametroDistal: number, anteriores: (1 | -1)[] = []) {
  const proximal = vetor(), anterior = vetor(), distal = vetor(), soma = escalar(), ocupacaoDistal = escalar(), ocupacaoProximal = escalar();
  const grupos: [Segmento[], Vetor, number, [number, number, number, number], boolean][] = [
    [proximais, proximal, diametroProximal, [-0.1, 0.12, 0.95, 1.15], true],
    [distais, distal, diametroDistal, [-0.15, 0.05, 0.78, 1.0], false],
  ];
  for (const [segmentos, destino, diametro, [a0, a1, b0, b1], ehProximal] of grupos)
    segmentos.forEach(([[sx, sy], [ex, ey], h], k) => {
      const vx = ex - sx, vy = ey - sy, comp = Math.hypot(vx, vy);
      const ax = vx / comp, ay = vy / comp, nx = -ay, ny = ax;
      for (let p = 0; p < N; p++) {
        const dx = GX[p] - sx, dy = GY[p] - sy;
        const t = (dx * ax + dy * ay) / comp, n = dx * nx + dy * ny;
        const w = suave(a0, a1, t) * (1 - suave(b0, b1, t)) * (1 - suave(1.15 * h, 1.6 * h, Math.abs(n)));
        if (w === 0) continue;
        const g = (-w * n * 2) / diametro;
        destino.x[p] += g * nx;
        destino.y[p] += g * ny;
        if (ehProximal && anteriores[k] !== undefined && n * anteriores[k] > 0) {
          anterior.x[p] += g * nx;
          anterior.y[p] += g * ny;
        }
        if (ehProximal) ocupacaoProximal[p] = Math.max(ocupacaoProximal[p], w);
        else ocupacaoDistal[p] = Math.max(ocupacaoDistal[p], w);
        soma[p] += w;
      }
    });
  for (let p = 0; p < N; p++) {
    const k = 1 / Math.max(1, soma[p]);
    for (const v of [proximal, anterior, distal]) { v.x[p] *= k; v.y[p] *= k; }
  }
  return { proximal, anterior, distal, ocupacaoProximal, ocupacaoDistal };
}

const diametroMm = (perimetroCm: number) => (perimetroCm * 10) / Math.PI;

// ------------------------------------------------------ proteção dos braços

const cacheProtecao = new Map<string, Float32Array>();

/**
 * Raster de proteção dos braços do protótipo (1 no braço, 0 longe dele),
 * 600 × 802. Na versão 1 os braços são uma camada própria e esta proteção
 * só serve à conferência com os campos aprovados.
 */
export function protecaoDosBracos(modelo: Modelo, vista: Vista): Float32Array {
  const chave = modelo + "/" + vista;
  const pronto = cacheProtecao.get(chave);
  if (pronto) return pronto;
  const c = REGIOES[modelo][vista];
  const { distancia: dist } = distanciaAoAlvo(rasterizar(c.protecaoBracos, REF_LARGURA, REF_ALTURA), REF_LARGURA, REF_ALTURA);
  const out = new Float32Array(REF_LARGURA * REF_ALTURA);
  for (let y = 0; y < REF_ALTURA; y++) {
    const t = suave(0, 1, (y - c.cotovelo + 80) / 60);
    const margem = 14 * (1 - t) + 5 * t;
    for (let x = 0; x < REF_LARGURA; x++) {
      const r = Math.min(1, Math.max(0, (dist[y * REF_LARGURA + x] - margem) / 6));
      out[y * REF_LARGURA + x] = 1 - r * r * (3 - 2 * r);
    }
  }
  cacheProtecao.set(chave, out);
  return out;
}

/**
 * Distância do eixo do tronco (cx) até o braço, linha a linha, para cada
 * lado: a borda interna do polígono do braço, sem braço = 300. Suavizada
 * (mínimo em ±8 linhas e média gaussiana) para o braço não se dobrar quando
 * acompanha o tronco. Devolve os valores nos pontos da grade.
 */
type Bordas = { esq: Float64Array; dir: Float64Array; linhas: { esq: Float64Array; dir: Float64Array } };
const cacheBordas = new Map<string, Bordas>();
export function bordasDoTronco(modelo: Modelo, vista: Vista) {
  const chave = modelo + "/" + vista;
  const pronta = cacheBordas.get(chave);
  if (pronta) return pronta;
  const cx = REGIOES[modelo][vista].tronco[4];
  const poligono = rasterizar(REGIOES[modelo][vista].protecaoBracos, REF_LARGURA, REF_ALTURA);
  const SEM = 300;
  const brutas = { esq: new Float64Array(REF_ALTURA).fill(SEM), dir: new Float64Array(REF_ALTURA).fill(SEM) };
  for (let y = 0; y < REF_ALTURA; y++)
    for (let x = 0; x < REF_LARGURA; x++) {
      if (!poligono[y * REF_LARGURA + x]) continue;
      const d = x - cx;
      if (d > 0) brutas.dir[y] = Math.min(brutas.dir[y], d);
      else brutas.esq[y] = Math.min(brutas.esq[y], -d);
    }
  const suavizar = (v: Float64Array) => {
    const minimo = new Float64Array(REF_ALTURA), out = new Float64Array(REF_ALTURA);
    for (let y = 0; y < REF_ALTURA; y++) {
      let m = SEM;
      for (let k = Math.max(0, y - 8); k <= Math.min(REF_ALTURA - 1, y + 8); k++) m = Math.min(m, v[k]);
      minimo[y] = m;
    }
    for (let y = 0; y < REF_ALTURA; y++) {
      let soma = 0, pesos = 0;
      for (let k = Math.max(0, y - 24); k <= Math.min(REF_ALTURA - 1, y + 24); k++) {
        const w = Math.exp(-0.5 * ((k - y) / 8) ** 2);
        soma += minimo[k] * w;
        pesos += w;
      }
      out[y] = soma / pesos;
    }
    return out;
  };
  const linhas = { esq: suavizar(brutas.esq), dir: suavizar(brutas.dir) };
  const resultado: Bordas = { esq: escalar(), dir: escalar(), linhas };
  for (let p = 0; p < N; p++) {
    const y = GY[p], y0 = Math.min(REF_ALTURA - 2, Math.floor(y)), f = y - y0;
    resultado.esq[p] = linhas.esq[y0] * (1 - f) + linhas.esq[y0 + 1] * f;
    resultado.dir[p] = linhas.dir[y0] * (1 - f) + linhas.dir[y0 + 1] * f;
  }
  cacheBordas.set(chave, resultado);
  return resultado;
}

/**
 * Campos de uma faixa do tronco para as duas camadas.
 * - Corpo: só escala em torno de cx (com a transição lateral). Na axila o
 *   tronco passa por trás do braço, que é desenhado na frente.
 * - Braço: gira a partir do ombro, sem dobrar e sem mudar de volume, só o
 *   bastante para o tronco não ultrapassar o braço onde há vão entre eles
 *   (abaixo da axila). Só age quando o tronco cresce (soPositivo): quando o
 *   tronco diminui, o braço fica e o vão aumenta.
 */
function faixaDoTronco(modelo: Modelo, vista: Vista, pesoY: (Y: number) => number, lateral: (dx: number) => number, extra: (p: number) => number = () => 1): { corpo: Vetor; segue: Vetor; theta: number } {
  const c = REGIOES[modelo][vista], cx = c.tronco[4];
  const bordas = bordasDoTronco(modelo, vista);
  let theta = 0;
  c.bracos.forEach(([[sx, sy]], k) => {
    const linhas = bordas.linhas[sx < cx ? "esq" : "dir"];
    for (let y = Math.ceil(c.axilas[k]); y < REF_ALTURA; y++) {
      if (linhas[y] >= SEM_BRACO) continue;
      theta = Math.max(theta, (linhas[y] * pesoY(y) * lateral(linhas[y])) / (y - (sy - 10)));
    }
  });
  const corpo = vetor(), segue = vetor();
  for (let p = 0; p < N; p++) {
    const X = GX[p], Y = GY[p], dx = X - cx, lado = dx < 0 ? "esq" : "dir";
    corpo.x[p] = dx * pesoY(Y) * lateral(dx) * extra(p);
    // Na axila o braço segue a borda do tronco (nos dois sentidos); abaixo
    // dela o giro (giroDoBraco) assume, suavemente.
    // o braço acompanha o tronco na sua borda interna real (eixo − meia
    // largura), que na isométrica fica sobre as costas, além do polígono
    const bordaPoligono = bordas[lado][p];
    const medial = eixoDoBraco(c, dx, Y);
    // (só abaixo do ombro: na calota do deltoide valeria somar ao deltoide)
    const inicio = c.eixosDosBracos.find(([[x0]]) => Math.sign(x0 - cx) === Math.sign(dx || 1))?.[0][1] ?? 0;
    const pesoMedial = suave(inicio + 30, inicio + 60, Y);
    const eMedial = medial ? Math.abs(medial.x - cx) - medial.h : 0;
    const e = bordaPoligono >= SEM_BRACO ? SEM_BRACO : bordaPoligono + Math.max(0, eMedial - bordaPoligono) * pesoMedial;
    const segueAqui = e >= SEM_BRACO ? 0 : Math.sign(dx) * e * pesoY(Y) * lateral(e);
    segue.x[p] = (1 - transicaoDaAxila(c, dx, Y)) * segueAqui;
  }
  return { corpo, segue, theta };
}

const SEM_BRACO = 299;

/** Eixo do braço (ou antebraço) do lado de dx na linha Y: x do eixo e meia largura. */
function eixoDoBraco(c: ConfigDaVista, dx: number, Y: number): { x: number; h: number } | null {
  const cx = c.tronco[4], n = c.eixosDosBracos.length / 2;
  const doLado = (k: number) => Math.sign(c.eixosDosBracos[k][0][0] - cx) === Math.sign(dx || 1);
  const bracos = [...Array(n).keys()].filter(doLado), antebracos = bracos.map((k) => k + n);
  if (!bracos.length) return null;
  const [[x0, y0], [x1, y1], h0] = c.eixosDosBracos[bracos[0]];
  const ante = c.eixosDosBracos[antebracos[0]];
  const [[ax0, ay0], [ax1, ay1], h1] = ante;
  if (Y <= y1 || Y < ay0) {
    const t = Math.max(0, Math.min(1, (Y - y0) / (y1 - y0)));
    return { x: x0 + (x1 - x0) * t, h: h0 };
  }
  const t = Math.max(0, Math.min(1, (Y - ay0) / (ay1 - ay0)));
  return { x: ax0 + (ax1 - ax0) * t, h: h1 };
}

/** 0 acima da axila do braço daquele lado, 1 bem abaixo dela. */
function transicaoDaAxila(c: ConfigDaVista, dx: number, Y: number) {
  const cx = c.tronco[4];
  const k = c.bracos.findIndex(([[sx]]) => Math.sign(sx - cx) === Math.sign(dx || 1));
  if (k < 0) return 1;
  return suave(c.axilas[k] - 10, c.axilas[k] + 30, Y);
}

/**
 * Giro do braço a partir do ombro (deslocamento horizontal proporcional à
 * distância ao ombro, sem dobrar o braço), por unidade de ângulo. O motor
 * usa o maior giro que as faixas do tronco exigirem (não a soma).
 */
function giroDoBraco(modelo: Modelo, vista: Vista): Vetor {
  const c = REGIOES[modelo][vista], cx = c.tronco[4];
  const v = vetor();
  for (let p = 0; p < N; p++) {
    const dx = GX[p] - cx, Y = GY[p];
    const k = c.bracos.findIndex(([[sx]]) => Math.sign(sx - cx) === Math.sign(dx || 1));
    if (k < 0) continue;
    const y0 = c.bracos[k][0][1] - 10;
    v.x[p] = Math.sign(dx) * transicaoDaAxila(c, dx, Y) * Math.max(0, Y - y0);
  }
  return v;
}

function amostrarProtecao(raster: Float32Array): Float64Array {
  const out = escalar();
  for (let p = 0; p < N; p++) {
    const x = GX[p], y = GY[p];
    const x0 = Math.min(REF_LARGURA - 2, Math.floor(x)), y0 = Math.min(REF_ALTURA - 2, Math.floor(y));
    const fx = x - x0, fy = y - y0;
    const a = raster[y0 * REF_LARGURA + x0], b = raster[y0 * REF_LARGURA + x0 + 1];
    const c = raster[(y0 + 1) * REF_LARGURA + x0], d = raster[(y0 + 1) * REF_LARGURA + x0 + 1];
    out[p] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  return out;
}

// ------------------------------------------------------------- protótipo

export type BasesDoPrototipo = {
  braco: Vetor; cintura: Vetor; abdomen: Vetor; quadril: Vetor; coxa: Vetor;
  tricipital: Vetor; tricipitalAnterior: Vetor; abdominal: Vetor; coxaDobra: Vetor;
  /** Parte glútea da dobra da coxa (protótipo), separada para a versão 1. */
  gluteo: Vetor;
  /** Auxiliares para as regiões novas. */
  protecao: Float64Array; ocupacaoBraco: Float64Array; ocupacaoCoxa: Float64Array; pesoAbdominal: Float64Array;
  /** Versão 1: braço seguindo a axila e giro exigido por faixa do tronco. */
  bracoNoTronco: { cintura: Vetor; abdomen: Vetor; quadril: Vetor; giros: { cintura: number; abdomen: number; quadril: number } } | null;
};

const multiplicar = (v: Vetor, w: (p: number) => number) => {
  for (let p = 0; p < N; p++) { const k = w(p); v.x[p] *= k; v.y[p] *= k; }
};

/**
 * Tradução de build() do protótipo; `tricipitalAnterior` é a metade anterior
 * do braço. Com `camadas: true` (versão 1), os braços viram camada própria:
 * sem a máscara de proteção, que comprimia o tronco contra o braço e dobrava
 * a malha já em perímetros moderados, e com a transição lateral do tronco
 * afastada do contorno, para que o contorno expandido não caia nela. Além
 * disso, o braço acompanha o tronco girando a partir do ombro, sem mudar de
 * volume e sem dobrar (faixaDoTronco).
 */
export function basesDoPrototipo(modelo: Modelo, vista: Vista, { camadas = false } = {}): BasesDoPrototipo {
  const c = REGIOES[modelo][vista];
  const [topo, cintura, abd, quadril, cx, rx, cy, ry] = c.tronco;
  const neutro = PERIMETROS_NEUTROS[modelo];
  const porPerimetro = (circ: number) => (s: Segmento) => (2 * s[2]) / ((circ * 10) / Math.PI);
  const braco = membros(c.bracos, porPerimetro(neutro.braco), c.anteriorDosBracos);
  const coxa = membros(c.pernas, porPerimetro(neutro.coxa));

  const meioDasPernas = c.pernas.reduce((s, [a, b]) => s + (a[1] + b[1]) / 2, 0) / c.pernas.length;
  const fCintura = vetor(), fAbdomen = vetor(), fQuadril = vetor(), fAbdGordura = vetor(), fGluteo = vetor();
  const pesoAbdominal = escalar();
  const [gx, gy, grx, gry] = c.gluteo;
  for (let p = 0; p < N; p++) {
    const X = GX[p], Y = GY[p];
    const lateral = 1 - suave(rx, rx + 28, Math.abs(X - cx));
    const w1 = suave(topo, cintura, Y) * (1 - suave(cintura, abd, Y)) * lateral;
    const w2 = suave(cintura, abd, Y) * (1 - suave(abd, quadril, Y)) * lateral;
    const w3 = suave(abd, quadril, Y) * (1 - suave(quadril, meioDasPernas + 10, Y)) * lateral * (1 - coxa.ocupacao[p] * 0.75);
    fCintura.x[p] = (X - cx) * w1;
    fAbdomen.x[p] = (X - cx) * w2;
    fQuadril.x[p] = (X - cx) * w3;
    const n = (X - cx) / rx, m = (Y - cy) / ry, radial = Math.sqrt(n * n + m * m);
    const apoio = 1 - suave(0.85, 1.4, radial);
    const lado = X < cx ? 0.52 : 0.52 * 0.65;
    const portao = suave(abd - 5, quadril + 10, Y);
    fAbdGordura.x[p] = -n * apoio * lado * (1 - portao);
    fAbdGordura.y[p] = -m * apoio * 0.13 * (1 - portao);
    pesoAbdominal[p] = apoio * (1 - portao);
    const e = Math.sqrt(((X - gx) / grx) ** 2 + ((Y - gy) / gry) ** 2);
    const gw = 1 - suave(0.8, 1.3, e);
    fGluteo.x[p] = -((X - gx) / grx) * gw * 0.38 * portao;
    fGluteo.y[p] = -((Y - gy) / gry) * gw * 0.14 * portao;
    coxa.gordura.x[p] += fGluteo.x[p];
    coxa.gordura.y[p] += fGluteo.y[p];
  }
  let bracoNoTronco: { cintura: Vetor; abdomen: Vetor; quadril: Vetor; giros: { cintura: number; abdomen: number; quadril: number } } | null = null;
  if (camadas) {
    // versão 1: o corpo só escala; o braço gira para liberar o tronco
    const lateral = (dx: number) => 1 - suave(rx * 1.6, rx * 1.6 + 60, Math.abs(dx));
    const f1 = faixaDoTronco(modelo, vista, (Y) => suave(topo, cintura, Y) * (1 - suave(cintura, abd, Y)), lateral);
    const f2 = faixaDoTronco(modelo, vista, (Y) => suave(cintura, abd, Y) * (1 - suave(abd, quadril, Y)), lateral);
    const f3 = faixaDoTronco(modelo, vista, (Y) => suave(abd, quadril, Y) * (1 - suave(quadril, meioDasPernas + 10, Y)), lateral, (p) => 1 - coxa.ocupacao[p] * 0.75);
    fCintura.x.set(f1.corpo.x);
    fAbdomen.x.set(f2.corpo.x);
    fQuadril.x.set(f3.corpo.x);
    bracoNoTronco = {
      cintura: f1.segue, abdomen: f2.segue, quadril: f3.segue,
      giros: { cintura: f1.theta, abdomen: f2.theta, quadril: f3.theta },
    };
  }
  const protecao = camadas ? escalar() : amostrarProtecao(protecaoDosBracos(modelo, vista));
  const independente = (p: number) => 1 - protecao[p];
  for (const v of [fCintura, fAbdomen, fQuadril, coxa.forma, fAbdGordura, coxa.gordura, fGluteo]) multiplicar(v, independente);
  if (!camadas) for (const v of [braco.forma, braco.gordura, braco.anterior]) multiplicar(v, (p) => protecao[p]);
  for (let p = 0; p < N; p++) pesoAbdominal[p] *= 1 - protecao[p];
  return {
    braco: braco.forma, cintura: fCintura, abdomen: fAbdomen, quadril: fQuadril, coxa: coxa.forma,
    tricipital: braco.gordura, tricipitalAnterior: braco.anterior, abdominal: fAbdGordura, coxaDobra: coxa.gordura, gluteo: fGluteo,
    protecao, ocupacaoBraco: braco.ocupacao, ocupacaoCoxa: coxa.ocupacao, pesoAbdominal, bracoNoTronco,
  };
}

// --------------------------------------------------------- versão 1 (todas)

/** Escala média de pixels por mm da vista, a partir dos membros de referência. */
export function pixelsPorMm(modelo: Modelo, vista: Vista) {
  const c = REGIOES[modelo][vista], neutro = PERIMETROS_NEUTROS[modelo];
  const escalas = [
    ...c.bracos.map((s) => (2 * s[2]) / ((neutro.braco * 10) / Math.PI)),
    ...c.pernas.map((s) => (2 * s[2]) / ((neutro.coxa * 10) / Math.PI)),
  ];
  return escalas.reduce((a, b) => a + b, 0) / escalas.length;
}

/** Faixa lateral do tronco: perfil que recua o contorno sem mover o centro. */
function faixaLateral(c: ConfigDaVista, faixa: [number, number, number, number], meiaLargura: number, escala: number, lado: (X: number) => number) {
  const cx = c.tronco[4];
  const campo = vetor(), peso = escalar();
  const [y0, y1, y2, y3] = faixa;
  for (let p = 0; p < N; p++) {
    const X = GX[p], Y = GY[p];
    const wy = suave(y0, y1, Y) * (1 - suave(y2, y3, Y));
    const e = Math.abs(X - cx) / meiaLargura;
    const perfil = suave(0.35, 1, e) * (1 - suave(1, 1 + 28 / meiaLargura, e));
    const w = wy * perfil * lado(X);
    campo.x[p] = -Math.sign(X - cx) * escala * w;
    peso[p] = wy * perfil * (lado(X) > 0 ? 1 : 0);
  }
  return { campo, peso };
}

/** Elipse com recuo radial (mesma forma do apoio abdominal do protótipo). */
function elipse([ex, ey, erx, ery]: [number, number, number, number], escala: number, verticalRelativo: number) {
  const campo = vetor(), peso = escalar();
  for (let p = 0; p < N; p++) {
    const n = (GX[p] - ex) / erx, m = (GY[p] - ey) / ery;
    const apoio = 1 - suave(0.85, 1.4, Math.sqrt(n * n + m * m));
    campo.x[p] = -n * apoio * escala;
    campo.y[p] = -m * apoio * escala * verticalRelativo;
    peso[p] = apoio;
  }
  return { campo, peso };
}

/** Campos da vista para as duas camadas: corpo (atrás) e braços (na frente). */
export type CamposDasCamadas = { corpo: CamposDaVista; bracos: CamposDaVista };

const cacheCampos = new Map<string, CamposDasCamadas>();

function empacotar(campos: Partial<Record<Base, Vetor>>): CamposDaVista {
  const dados = new Float32Array(N * BASES.length * 2);
  BASES.forEach((b, k) => {
    const v = campos[b];
    if (!v) return;
    for (let p = 0; p < N; p++) {
      dados[(p * BASES.length + k) * 2] = v.x[p];
      dados[(p * BASES.length + k) * 2 + 1] = v.y[p];
    }
  });
  return { largura: GRADE_LARGURA, altura: GRADE_ALTURA, bases: BASES, dados };
}

export function gerarCampos(modelo: Modelo, vista: Vista): CamposDasCamadas {
  const chave = modelo + "/" + vista;
  const pronto = cacheCampos.get(chave);
  if (pronto) return pronto;
  const c = REGIOES[modelo][vista];
  const proto = basesDoPrototipo(modelo, vista, { camadas: true });
  const cx = c.tronco[4], cinturaY = c.tronco[1];
  const corpo: Partial<Record<Base, Vetor>> = {}, bracos: Partial<Record<Base, Vetor>> = {};

  // Tronco: o corpo escala; o braço segue a axila e gira para liberar o tronco.
  const giros: Partial<Record<Base, number>> = {};
  for (const b of ["cintura", "abdomen", "quadril"] as const) {
    corpo[b] = proto[b];
    bracos[b] = proto.bracoNoTronco![b];
    giros[b] = proto.bracoNoTronco!.giros[b];
  }
  bracos.giroDoBraco = giroDoBraco(modelo, vista);
  // Membros em cadeia: braço–antebraço e coxa–panturrilha (perímetros opcionais).
  const cadeiaBraco = cadeiaDeMembros(c.bracos, c.antebracos);
  const cadeiaPerna = cadeiaDeMembros(c.pernas, c.panturrilhas);
  // Na axila (braço encostado no tronco) o braço não muda do lado interno:
  // afina ou engrossa só para fora. Abaixo da axila volta a ser simétrico.
  for (let p = 0; p < N; p++) {
    const dx = GX[p] - cx, eixo = eixoDoBraco(c, dx, GY[p]);
    if (!eixo) continue;
    const interno = suave(-0.3 * eixo.h, 0.3 * eixo.h, Math.abs(eixo.x - cx) - Math.abs(dx));
    const k = 1 - (1 - transicaoDaAxila(c, dx, GY[p])) * interno;
    cadeiaBraco.proximal.x[p] *= k;
    cadeiaBraco.proximal.y[p] *= k;
  }
  bracos.braco = cadeiaBraco.proximal;
  bracos.antebraco = cadeiaBraco.distal;
  corpo.coxa = cadeiaPerna.proximal;
  corpo.panturrilha = cadeiaPerna.distal;

  // Deltoide: alargamento radial e suave de cada calota do ombro; o mesmo
  // campo nas duas camadas mantém a junção do ombro contínua.
  // Tórax: alarga a faixa entre a linha dos ombros e a cintura, complementar
  // à cintura do protótipo; como ela, só translada a partir da borda do braço.
  const deltoide = vetor(), torax = vetor();
  for (const [ex, ey, erx, ery] of c.deltoides) {
    for (let p = 0; p < N; p++) {
      const n = (GX[p] - ex) / erx, m = (GY[p] - ey) / ery;
      const w = 1 - suave(0.45, 1.25, Math.sqrt(n * n + m * m));
      deltoide.x[p] += (GX[p] - ex) * w;
      deltoide.y[p] += (GY[p] - ey) * w * 0.35;
    }
  }
  const mt = c.meiaLarguraTorax;
  const fT = faixaDoTronco(modelo, vista, (Y) => suave(c.ombro, c.linhaTorax, Y) * (1 - suave(c.linhaTorax, cinturaY, Y)), (dx) => 1 - suave(mt * 1.6, mt * 1.6 + 60, Math.abs(dx)));
  torax.x.set(fT.corpo.x);
  giros.torax = fT.theta;
  corpo.deltoide = deltoide;
  bracos.deltoide = deltoide;
  corpo.torax = torax;
  bracos.torax = fT.segue;

  if (vista === "iso") {
    const mm = pixelsPorMm(modelo, vista);
    const lp = c.ladoPosterior ?? 1;
    const perspectiva = (X: number) => (Math.sign(X - cx) === lp ? 0.65 : 1);

    // Membros: espessura no contorno = meia dobra × escala local (21/11/2026).
    // Braço: metade posterior (tricipital) e anterior (bicipital); antebraço
    // sem dobra própria (espessura projetada); coxa e panturrilha em cadeia.
    const gm = c.gorduraDosMembros!, neutro = PERIMETROS_NEUTROS[modelo];
    const gBraco = cadeiaDeGordura(gm.bracos, gm.antebracos, diametroMm(neutro.braco), diametroMm(neutro.antebraco), c.anteriorDosBracos);
    const gPerna = cadeiaDeGordura(gm.pernas, gm.panturrilhas, diametroMm(neutro.coxa), diametroMm(neutro.panturrilha));
    const posterior = vetor();
    for (let p = 0; p < N; p++) {
      posterior.x[p] = gBraco.proximal.x[p] - gBraco.anterior.x[p];
      posterior.y[p] = gBraco.proximal.y[p] - gBraco.anterior.y[p];
    }
    bracos.tricipital = posterior;
    bracos.bicipital = gBraco.anterior;
    // coxa (cadeia) + projeção glútea do protótipo, que acompanha a dobra da coxa
    const coxaDobra = vetor();
    for (let p = 0; p < N; p++) {
      coxaDobra.x[p] = gPerna.proximal.x[p] + proto.gluteo.x[p];
      coxaDobra.y[p] = gPerna.proximal.y[p] + proto.gluteo.y[p];
    }
    corpo.coxaDobra = coxaDobra;
    corpo.panturrilhaDobra = gPerna.distal;

    // Regiões sem dobra própria: antebraço (camada dos braços) e calotas dos
    // ombros (as duas camadas, para a junção do ombro continuar contínua).
    const ante = { gordura: gBraco.distal, ocupacao: gBraco.ocupacaoDistal };
    const projetadaBracos = vetor(), calotas = vetor(), pesoCalotas = escalar();
    for (const calota of c.deltoides) {
      // só a calota do deltoide (75% dos raios): a elipse inteira avança sobre
      // as costas e contrai contra a subescapular
      const e = elipse([calota[0], calota[1], calota[2] * 0.75, calota[3] * 0.75], mm, 0.5);
      for (let p = 0; p < N; p++) {
        const livre = (1 - gBraco.ocupacaoProximal[p]) * (1 - ante.ocupacao[p]) * (1 - pesoCalotas[p]);
        calotas.x[p] += e.campo.x[p] * livre;
        calotas.y[p] += e.campo.y[p] * livre;
        pesoCalotas[p] = Math.min(1, pesoCalotas[p] + e.peso[p] * livre);
      }
    }
    for (let p = 0; p < N; p++) {
      projetadaBracos.x[p] = ante.gordura.x[p] + calotas.x[p];
      projetadaBracos.y[p] = ante.gordura.y[p] + calotas.y[p];
    }
    bracos.projetada = projetadaBracos;
    corpo.projetada = calotas;

    // Tronco, por prioridade: cada região só ocupa o que as anteriores
    // deixaram livre, para não somar espessuras nas junções (SPEC §7.2).
    const ocupado = Float64Array.from(pesoCalotas);
    const reservar = (campo: Vetor, peso: Float64Array) => {
      for (let p = 0; p < N; p++) {
        const livre = 1 - ocupado[p];
        campo.x[p] *= livre; campo.y[p] *= livre;
        ocupado[p] = Math.min(1, ocupado[p] + peso[p] * livre);
      }
      return campo;
    };
    const supra = faixaLateral(c, c.suprailiaca!, c.tronco[5], mm, perspectiva);
    corpo.suprailiaca = reservar(supra.campo, supra.peso);
    corpo.abdominal = reservar(proto.abdominal, proto.pesoAbdominal);
    const peitoral = elipse(c.peitoral!, mm, 0.5);
    for (let p = 0; p < N; p++) peitoral.campo.x[p] *= perspectiva(GX[p]);
    corpo.peitoral = reservar(peitoral.campo, peitoral.peso);
    const axilar = faixaLateral(c, c.axilar!, c.meiaLarguraTorax, mm, perspectiva);
    corpo.axilar = reservar(axilar.campo, axilar.peso);
    const sub = faixaLateral(c, c.subescapular!, c.meiaLarguraTorax, mm, (X) => (Math.sign(X - cx) === lp ? 0.65 : 0));
    corpo.subescapular = reservar(sub.campo, sub.peso);

  }

  const resultado = { corpo: empacotar(corpo), bracos: { ...empacotar(bracos), giros } };
  cacheCampos.set(chave, resultado);
  return resultado;
}

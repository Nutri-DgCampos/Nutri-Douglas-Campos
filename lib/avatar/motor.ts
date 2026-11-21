// Motor dos avatares: deformação das camadas e composição final.
//
// Trabalha só com buffers RGBA (sem Canvas, sem Node), para que a tela e o
// servidor usem exatamente o mesmo código (SPEC §12.3). A deformação é a do
// protótipo aprovado (engine-referencia.js): inversão do campo por 24 passos,
// grade inversa com refinamento exato nas células dobradas e amostragem
// bilinear ponderada pelo alfa.

import type { CamposDaVista, CamposDasCamadas } from "./campos.ts";
import { distanciaAoAlvo, rasterizar } from "./raster.ts";
import {
  BASES,
  BASES_DE_FORMA,
  REF_ALTURA,
  REF_LARGURA,
  REGIOES,
  type Base,
  type Modelo,
  type Segmento,
  type Vista,
} from "./regioes.ts";

export type ImagemRGBA = { largura: number; altura: number; dados: Uint8ClampedArray };
export type Coeficientes = Partial<Record<Base, number>>;

/** Fundo aprovado, incorporado às imagens finais (SPEC §9.2). */
export const FUNDO = "#20343A";
/** Transparência padrão da gordura (SPEC §9.1). */
export const TRANSPARENCIA_PADRAO = 85;
/** Proporção 3:4 da exportação (SPEC §9.3). */
export const EXPORTACAO = { largura: 1536, altura: 2048 };

export function novaImagem(largura: number, altura: number): ImagemRGBA {
  return { largura, altura, dados: new Uint8ClampedArray(largura * altura * 4) };
}

/**
 * Vetor na ordem de BASES. Forma age em todas as camadas; dobra só no
 * núcleo (camada muscular da isométrica). Valor não finito vira zero.
 */
export function vetorDeCoeficientes(c: Coeficientes, nucleo: boolean): Float64Array {
  const v = new Float64Array(BASES.length);
  BASES.forEach((b, k) => {
    const valor = c[b];
    if (valor === undefined || !Number.isFinite(valor)) return;
    if (!nucleo && !BASES_DE_FORMA.includes(b)) return;
    v[k] = valor;
  });
  return v;
}

/**
 * Camada dos braços: o giro a partir do ombro é o maior que alguma faixa do
 * tronco exigir para crescer sem passar pelo braço (somar os giros abriria
 * os braços demais). Tronco diminuindo não gira o braço.
 */
export function aplicarGiro(campos: CamposDaVista, coef: Float64Array): Float64Array {
  if (!campos.giros) return coef;
  let giro = 0;
  campos.bases.forEach((b, k) => {
    const theta = campos.giros![b];
    if (theta) giro = Math.max(giro, coef[k] * theta);
  });
  const novo = Float64Array.from(coef);
  novo[campos.bases.indexOf("giroDoBraco")] = giro;
  return novo;
}

// ------------------------------------------------------------- deformação

function deslocamento(campos: CamposDaVista, x: number, y: number, coef: Float64Array, out: Float64Array) {
  const gw = campos.largura, gh = campos.altura, nb = campos.bases.length, d = campos.dados;
  const u = Math.max(0, Math.min(gw - 1, (x / (REF_LARGURA - 1)) * (gw - 1)));
  const v = Math.max(0, Math.min(gh - 1, (y / (REF_ALTURA - 1)) * (gh - 1)));
  const l = Math.min(gw - 2, Math.floor(u)), t = Math.min(gh - 2, Math.floor(v)), fx = u - l, fy = v - t;
  const pesos = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
  const pontos = [t * gw + l, t * gw + l + 1, (t + 1) * gw + l, (t + 1) * gw + l + 1];
  let dx = 0, dy = 0;
  for (let k = 0; k < 4; k++) {
    const base = pontos[k] * nb * 2, w = pesos[k];
    for (let b = 0; b < nb; b++) {
      const c = coef[b];
      if (c === 0) continue;
      dx += w * d[base + b * 2] * c;
      dy += w * d[base + b * 2 + 1] * c;
    }
  }
  out[0] = dx;
  out[1] = dy;
}

/** Ponto de origem (espaço de referência) do ponto de destino (x, y). */
export function origemDe(campos: CamposDaVista, x: number, y: number, coef: Float64Array): [number, number] {
  const d = new Float64Array(2);
  let sx = x, sy = y;
  for (let n = 0; n < 24; n++) {
    deslocamento(campos, sx, sy, coef, d);
    sx -= d[0] / 24;
    sy -= d[1] / 24;
  }
  return [sx, sy];
}

/** Caixa [x0, y0, x1, y1] dos pixels com alfa, ou null se a camada estiver vazia. */
function caixaOcupada(im: ImagemRGBA): [number, number, number, number] | null {
  let x0 = im.largura, y0 = im.altura, x1 = -1, y1 = -1;
  const d = im.dados;
  for (let y = 0; y < im.altura; y++)
    for (let x = 0; x < im.largura; x++)
      if (d[(y * im.largura + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : [x0, y0, x1, y1];
}

/** Maior deslocamento (pixels de referência) em toda a grade. */
function deslocamentoMaximo(campos: CamposDaVista, coef: Float64Array) {
  const nb = campos.bases.length, d = campos.dados;
  let max = 0;
  for (let p = 0; p < campos.largura * campos.altura; p++) {
    let dx = 0, dy = 0;
    for (let b = 0; b < nb; b++) {
      if (coef[b] === 0) continue;
      dx += d[(p * nb + b) * 2] * coef[b];
      dy += d[(p * nb + b) * 2 + 1] * coef[b];
    }
    max = Math.max(max, Math.hypot(dx, dy));
  }
  return max;
}

type GradeInversa = { mapa: Float64Array; refinar: Uint8Array };

function gradeInversa(campos: CamposDaVista, coef: Float64Array): GradeInversa {
  const gw = campos.largura, gh = campos.altura;
  const mapa = new Float64Array(gw * gh * 2);
  for (let j = 0; j < gh; j++)
    for (let i = 0; i < gw; i++) {
      const [sx, sy] = origemDe(campos, (i / (gw - 1)) * (REF_LARGURA - 1), (j / (gh - 1)) * (REF_ALTURA - 1), coef);
      mapa[(j * gw + i) * 2] = sx;
      mapa[(j * gw + i) * 2 + 1] = sy;
    }
  const refinar = new Uint8Array((gw - 1) * (gh - 1));
  for (let j = 0; j < gh - 1; j++)
    for (let i = 0; i < gw - 1; i++) {
      const p = (j * gw + i) * 2, q = p + 2, r = p + gw * 2, t = r + 2;
      const primeiro = (mapa[q] - mapa[p]) * (mapa[r + 1] - mapa[p + 1]) - (mapa[q + 1] - mapa[p + 1]) * (mapa[r] - mapa[p]);
      const segundo = (mapa[t] - mapa[q]) * (mapa[r + 1] - mapa[q + 1]) - (mapa[t + 1] - mapa[q + 1]) * (mapa[r] - mapa[q]);
      if (primeiro > 0 && segundo > 0) continue;
      for (let y = Math.max(0, j - 1); y <= Math.min(gh - 2, j + 1); y++)
        for (let x = Math.max(0, i - 1); x <= Math.min(gw - 2, i + 1); x++) refinar[y * (gw - 1) + x] = 1;
    }
  return { mapa, refinar };
}

/**
 * Deforma uma camada. A saída tem o tamanho pedido e a mesma proporção da
 * fonte; coordenadas normalizadas permitem usar a fonte grande ou a reduzida.
 */
export function deformar(fonte: ImagemRGBA, campos: CamposDaVista, coef: Float64Array, largura: number, altura: number): ImagemRGBA {
  coef = aplicarGiro(campos, coef);
  const saida = novaImagem(largura, altura);
  const entrada = fonte.dados, out = saida.dados;
  const W = fonte.largura, H = fonte.altura;
  if (coef.every((c) => c === 0) && W === largura && H === altura) {
    out.set(entrada);
    return saida;
  }
  const gw = campos.largura, gh = campos.altura;
  const kx = (W - 1) / (REF_LARGURA - 1), ky = (H - 1) / (REF_ALTURA - 1);
  // Só os pixels de destino que podem amostrar a parte não vazia da fonte.
  const caixa = caixaOcupada(fonte);
  if (!caixa) return saida;
  const folga = deslocamentoMaximo(campos, coef) + 2;
  const ex = (largura - 1) / (REF_LARGURA - 1), ey = (altura - 1) / (REF_ALTURA - 1);
  const x0 = Math.max(0, Math.floor((caixa[0] / kx - folga) * ex)), x1 = Math.min(largura - 1, Math.ceil((caixa[2] / kx + folga) * ex));
  const y0 = Math.max(0, Math.floor((caixa[1] / ky - folga) * ey)), y1 = Math.min(altura - 1, Math.ceil((caixa[3] / ky + folga) * ey));
  const { mapa, refinar } = gradeInversa(campos, coef);
  for (let y = y0; y <= y1; y++) {
    const v = (y / (altura - 1)) * (gh - 1), topo = Math.min(gh - 2, Math.floor(v)), fy = v - topo;
    const yRef = (y / (altura - 1)) * (REF_ALTURA - 1);
    for (let x = x0; x <= x1; x++) {
      const u = (x / (largura - 1)) * (gw - 1), esq = Math.min(gw - 2, Math.floor(u)), fx = u - esq;
      let rx: number, ry: number;
      if (refinar[topo * (gw - 1) + esq]) {
        [rx, ry] = origemDe(campos, (x / (largura - 1)) * (REF_LARGURA - 1), yRef, coef);
      } else {
        const a = (topo * gw + esq) * 2, b = a + 2, c = a + gw * 2, d = c + 2;
        rx = (mapa[a] * (1 - fx) + mapa[b] * fx) * (1 - fy) + (mapa[c] * (1 - fx) + mapa[d] * fx) * fy;
        ry = (mapa[a + 1] * (1 - fx) + mapa[b + 1] * fx) * (1 - fy) + (mapa[c + 1] * (1 - fx) + mapa[d + 1] * fx) * fy;
      }
      const sx = rx * kx, sy = ry * ky;
      if (sx < 0 || sy < 0 || sx > W - 1 || sy > H - 1) continue;
      const lx = Math.floor(sx), ty = Math.floor(sy), dx = Math.min(W - 1, lx + 1), by = Math.min(H - 1, ty + 1);
      const ax = sx - lx, ay = sy - ty;
      const p0 = (ty * W + lx) * 4, p1 = (ty * W + dx) * 4, p2 = (by * W + lx) * 4, p3 = (by * W + dx) * 4;
      const w0 = entrada[p0 + 3] * (1 - ax) * (1 - ay), w1 = entrada[p1 + 3] * ax * (1 - ay);
      const w2 = entrada[p2 + 3] * (1 - ax) * ay, w3 = entrada[p3 + 3] * ax * ay;
      const alfa = w0 + w1 + w2 + w3, alvo = (y * largura + x) * 4;
      out[alvo + 3] = alfa;
      if (alfa > 0)
        for (let canal = 0; canal < 3; canal++)
          out[alvo + canal] = (entrada[p0 + canal] * w0 + entrada[p1 + canal] * w1 + entrada[p2 + canal] * w2 + entrada[p3 + canal] * w3) / alfa;
    }
  }
  return saida;
}

// ---------------------------------------------------------------- recorte

/** Borda aprovada (y, x) no espaço 600 × 802 (recorte-feminino-aprovado.json). */
const BORDA_FEMININA: [number, number][] = [[267, 230], [275, 232], [285, 233], [300, 234], [315, 234], [330, 233], [340, 231], [350, 228], [360, 224], [368, 218], [375, 210]];
const X_INICIAL_FEMININO = 195;

/**
 * Oculta só o trecho estreito do braço do lado oposto junto ao abdômen
 * feminino, nas duas camadas da isométrica, antes da deformação (SPEC §8.5).
 * O braço esquerdo completo, à direita da imagem, fica intacto.
 */
export function recortarCamada(modelo: Modelo, vista: Vista, camada: "pele" | "musculo" | "gordura", imagem: ImagemRGBA): ImagemRGBA {
  if (modelo !== "f" || vista !== "iso" || camada === "pele") return imagem;
  const copia: ImagemRGBA = { largura: imagem.largura, altura: imagem.altura, dados: new Uint8ClampedArray(imagem.dados) };
  const sx = imagem.largura / REF_LARGURA, sy = imagem.altura / REF_ALTURA;
  const y0 = BORDA_FEMININA[0][0], y1 = BORDA_FEMININA[BORDA_FEMININA.length - 1][0];
  for (let y = Math.floor(y0 * sy); y <= Math.ceil(y1 * sy) && y < imagem.altura; y++) {
    const yr = y / sy;
    if (yr < y0 || yr > y1) continue;
    let j = 0;
    while (j < BORDA_FEMININA.length - 2 && yr > BORDA_FEMININA[j + 1][0]) j++;
    const a = BORDA_FEMININA[j], b = BORDA_FEMININA[j + 1], t = (yr - a[0]) / (b[0] - a[0]);
    const borda = a[1] + (b[1] - a[1]) * t;
    for (let x = Math.floor(X_INICIAL_FEMININO * sx); x <= Math.ceil(borda * sx) && x < imagem.largura; x++) {
      const cobertura = Math.max(0, Math.min(1, x / sx - borda));
      const i = (y * imagem.largura + x) * 4 + 3;
      copia.dados[i] = copia.dados[i] * cobertura;
    }
  }
  return copia;
}

// ---------------------------------------------------- camadas dos braços

/** Corpo (atrás) e braços (na frente) de uma mesma fonte. */
export type CamadaSeparada = { corpo: ImagemRGBA; braco: ImagemRGBA };

/** Erosão (px de referência) que separa braço e tronco onde só se tocam. */
const EROSAO_DO_BRACO = 3;

/** Propaga a partir da pilha pelos pixels permitidos (vizinhança de 4). */
function propagar(marcado: Uint8Array, pilha: number[], permitido: (j: number) => boolean, W: number) {
  const total = marcado.length;
  while (pilha.length) {
    const i = pilha.pop()!, x = i % W;
    for (const j of [i - W, i + W, x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1]) {
      if (j < 0 || j >= total || marcado[j] || !permitido(j)) continue;
      marcado[j] = 1;
      pilha.push(j);
    }
  }
}

/**
 * Pixels do braço, dentro do polígono de proteção. Os polígonos do protótipo
 * são folgados e incluem a borda do tronco e da coxa junto ao braço; essa
 * borda precisa ficar no corpo, senão restaria parada (um "fantasma") quando
 * o tronco muda. Com uma erosão leve, que rompe contatos finos (cotovelo na
 * cintura, dedos na coxa), propaga-se o braço a partir do seu eixo e o corpo
 * a partir do que está fora do polígono; cada pixel da borda fica com a
 * camada mais próxima, e o que não pertence ao corpo (pontas dos dedos,
 * por exemplo) fica com o braço.
 */
function mascaraDoBraco(modelo: Modelo, vista: Vista, fonte: ImagemRGBA): Uint8Array {
  const W = fonte.largura, H = fonte.altura, d = fonte.dados;
  const sx = W / REF_LARGURA, sy = H / REF_ALTURA;
  const c = REGIOES[modelo][vista];
  // O polígono do protótipo nem sempre cobre todo o braço (o antebraço passa
  // da borda em alguns pontos, como as pontas dos dedos): usa-se o polígono
  // dilatado em 14 px.
  const original = rasterizar(c.protecaoBracos, W, H, sx, sy);
  const afastamento = distanciaAoAlvo(original, W, H).distancia;
  const poligono = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) poligono[i] = afastamento[i] <= 14 * sx ? 1 : 0;
  const erosao = EROSAO_DO_BRACO * sx;
  const transparente = new Uint8Array(W * H), foraDoBraco = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    transparente[i] = d[i * 4 + 3] < 200 ? 1 : 0;
    foraDoBraco[i] = poligono[i] && !transparente[i] ? 0 : 1;
  }
  const nucleoBraco = distanciaAoAlvo(foraDoBraco, W, H).distancia;
  const nucleoOpaco = distanciaAoAlvo(transparente, W, H).distancia;

  const braco = new Uint8Array(W * H), pilha: number[] = [];
  for (const [[x0, y0], [x1, y1]] of [...c.bracos, ...(c.antebracos ?? [])])
    for (let t = 0.2; t <= 0.9; t += 0.1) {
      const i = Math.round((y0 + (y1 - y0) * t) * sy) * W + Math.round((x0 + (x1 - x0) * t) * sx);
      if (nucleoBraco[i] > erosao && !braco[i]) { braco[i] = 1; pilha.push(i); }
    }
  // perto do eixo: braço e antebraço até 1,15 × a meia largura (o braço
  // sobe 30% além do início, para levar a calota do ombro); a mão continua o
  // antebraço por 70% do comprimento, com raio maior
  const eixos: Segmento[] = [];
  const n = c.eixosDosBracos.length / 2;
  c.eixosDosBracos.forEach(([a, b, r], k) => {
    const inicio: [number, number] = k < n ? [a[0] - (b[0] - a[0]) * 0.3, a[1] - (b[1] - a[1]) * 0.3] : a;
    eixos.push([inicio, b, r * 1.15]);
  });
  for (const [a, b, r] of c.eixosDosBracos.slice(n)) eixos.push([b, [b[0] + (b[0] - a[0]) * 0.7, b[1] + (b[1] - a[1]) * 0.7], r * 2]);
  const pertoDoEixo = (j: number) => {
    const px = (j % W) / sx, py = Math.floor(j / W) / sy;
    for (const [[x0, y0], [x1, y1], r] of eixos) {
      const vx = x1 - x0, vy = y1 - y0, t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / (vx * vx + vy * vy)));
      if (Math.hypot(px - x0 - vx * t, py - y0 - vy * t) <= r) return true;
    }
    return false;
  };
  propagar(braco, pilha, (j) => nucleoBraco[j] > erosao && pertoDoEixo(j), W);

  const corpo = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (!poligono[i] && !transparente[i]) { corpo[i] = 1; pilha.push(i); }
  propagar(corpo, pilha, (j) => !braco[j] && nucleoOpaco[j] > erosao, W);

  const distBraco = distanciaAoAlvo(braco, W, H).distancia, distCorpo = distanciaAoAlvo(corpo, W, H).distancia;
  const borda = erosao + 1.5 * sx;
  const mascara = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!poligono[i] || corpo[i]) continue;
    if (distCorpo[i] <= borda && distCorpo[i] < distBraco[i]) continue;
    mascara[i] = 1;
  }
  return mascara;
}

/**
 * Prepara uma fonte para o motor: aplica o recorte aprovado e separa os
 * braços (polígonos de referencia-protecao-bracos.py) numa camada própria,
 * desenhada na frente. Assim o tronco cresce por trás do braço, sem
 * comprimir contra ele nem deformá-lo (SPEC §8.4).
 */
export function prepararCamada(modelo: Modelo, vista: Vista, camada: "pele" | "musculo" | "gordura", imagem: ImagemRGBA): CamadaSeparada {
  const fonte = recortarCamada(modelo, vista, camada, imagem);
  const W = fonte.largura, H = fonte.altura, d = fonte.dados;
  const sx = W / REF_LARGURA;
  const mascara = mascaraDoBraco(modelo, vista, fonte);
  const corpo = novaImagem(W, H), braco = novaImagem(W, H);
  const visivel = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const alvo = mascara[i] ? braco.dados : corpo.dados;
    alvo[i * 4] = d[i * 4]; alvo[i * 4 + 1] = d[i * 4 + 1]; alvo[i * 4 + 2] = d[i * 4 + 2]; alvo[i * 4 + 3] = d[i * 4 + 3];
    if (!mascara[i] && d[i * 4 + 3] > 200) visivel[i] = 1;
  }
  // Contorno do tronco escondido atrás do braço, por lado. A região é um
  // intervalo contínuo de linhas: do topo do braço até a axila (mais uma
  // folga). Abaixo da axila há vão e o contorno do tronco é visível; acima,
  // ele é interpolado entre o ponto em que braço e tronco se encontram no
  // topo e o contorno conhecido logo abaixo da axila, depois suavizado. O
  // complemento ocupa até esse contorno, com borda esfumada, e quando o braço
  // se afasta aparece a continuação do tronco, sem dentes nem recortes.
  const c = REGIOES[modelo][vista];
  const cx = Math.round(c.tronco[4] * sx), sy = H / REF_ALTURA;
  const fimDoVisivel = (y: number, passo: 1 | -1) => {
    let x = cx;
    if (!visivel[y * W + x]) return -1;
    while (x + passo >= 0 && x + passo < W && visivel[y * W + x + passo]) x += passo;
    return x;
  };
  const contornos: { lado: 1 | -1; y0: number; y1: number; c: Float64Array }[] = [];
  c.bracos.forEach(([[bx]], k) => {
    const lado: 1 | -1 = bx * sx >= cx ? 1 : -1;
    const ehDoLado = (x: number) => (lado > 0 ? x >= cx : x < cx);
    let y0 = -1;
    for (let y = 0; y < H && y0 < 0; y++)
      for (let x = 0; x < W; x++) if (mascara[y * W + x] && ehDoLado(x)) { y0 = y; break; }
    if (y0 < 0) return;
    const axila = Math.round(c.axilas[k] * sy), y1 = Math.min(H - 1, axila);
    // contorno conhecido: primeira linha abaixo da axila em que o tronco termina no fundo
    let yc = -1, vc = -1;
    for (let y = axila; y < Math.min(H, axila + Math.round(60 * sy)); y++) {
      const x = fimDoVisivel(y, lado);
      if (x < 0) continue;
      const seguinte = x + lado;
      if (seguinte >= 0 && seguinte < W && !mascara[y * W + seguinte] && d[(y * W + seguinte) * 4 + 3] < 128) { yc = y; vc = Math.abs(x - cx); break; }
    }
    const xTopo = fimDoVisivel(y0, lado), vTopo = xTopo < 0 ? 0 : Math.abs(xTopo - cx);
    if (vc < 0) vc = vTopo;
    const bruto = new Float64Array(y1 - y0 + 1);
    for (let y = y0; y <= y1; y++) {
      const t = yc > y0 ? Math.min(1, (y - y0) / (yc - y0)) : 1;
      const xv = fimDoVisivel(y, lado), visto = xv < 0 ? 0 : Math.abs(xv - cx);
      bruto[y - y0] = Math.max(visto, vTopo + (vc - vTopo) * t);
    }
    const suave = new Float64Array(bruto.length), sigma = 6 * sy;
    for (let i = 0; i < bruto.length; i++) {
      let soma = 0, pesos = 0;
      for (let k2 = Math.max(0, i - Math.ceil(3 * sigma)); k2 <= Math.min(bruto.length - 1, i + Math.ceil(3 * sigma)); k2++) {
        const w = Math.exp(-0.5 * ((k2 - i) / sigma) ** 2);
        soma += bruto[k2] * w;
        pesos += w;
      }
      suave[i] = soma / pesos;
    }
    contornos.push({ lado, y0, y1, c: suave });
  });
  const { distancia: aoCorpo, maisProximo } = distanciaAoAlvo(visivel, W, H);
  // Emenda: o corpo passa por baixo do braço em toda a divisa. Na pele, 3 px
  // (evita que o fundo vaze entre as camadas reamostradas). Na isométrica o
  // braço fica sobre as costas e o núcleo recua até a meia dobra máxima (cerca
  // de 12 px): ali deve aparecer o tronco sob a gordura, e não o fundo.
  // Cor do tronco escondido: reflexo do pixel do braço através da borda do
  // tronco, 4 px além dela (pula o vinco escuro entre braço e tronco, que o
  // pixel mais próximo copiaria e espalharia).
  // Média de três reflexos (4, 7 e 10 px além da borda) para não formar listras.
  const cor = new Float64Array(4);
  const amostra = (i: number) => {
    const j = maisProximo[i], xi = i % W, yi = (i - xi) / W, xj = j % W, yj = (j - xj) / W;
    const dx = xj - xi, dy = yj - yi, n = Math.hypot(dx, dy) || 1;
    cor.fill(0);
    let usados = 0;
    for (const extra of [4, 7, 10]) {
      const salto = n + extra * sx;
      const xr = Math.round(xj + (dx / n) * salto), yr = Math.round(yj + (dy / n) * salto), k = yr * W + xr;
      if (xr < 0 || yr < 0 || xr >= W || yr >= H || !visivel[k]) continue;
      for (let c2 = 0; c2 < 4; c2++) cor[c2] += d[k * 4 + c2];
      usados++;
    }
    if (!usados) for (let c2 = 0; c2 < 4; c2++) cor[c2] = d[j * 4 + c2];
    else for (let c2 = 0; c2 < 4; c2++) cor[c2] /= usados;
    return cor;
  };
  const complementado = new Uint8Array(W * H);
  const pintar = (i: number, cobertura = 1) => {
    const c3 = amostra(i);
    corpo.dados[i * 4] = c3[0]; corpo.dados[i * 4 + 1] = c3[1]; corpo.dados[i * 4 + 2] = c3[2]; corpo.dados[i * 4 + 3] = c3[3] * cobertura;
    complementado[i] = 1;
  };
  // 12 px só nas linhas da axila (onde o braço cobre as costas); fora delas,
  // abaixo da axila há vão e 3 px bastam para a emenda.
  const naAxila = (x: number, y: number) =>
    vista === "iso" && contornos.some((k) => (k.lado > 0 ? x >= cx : x < cx) && y >= k.y0 && y <= k.y1);
  for (let i = 0; i < W * H; i++) {
    if (!mascara[i] || d[i * 4 + 3] < 250 || maisProximo[i] < 0) continue;
    const x = i % W, y = (i - x) / W;
    if (aoCorpo[i] > (naAxila(x, y) ? 12 : 3) * sx) continue;
    pintar(i);
  }
  const esfumado = 2 * sx;
  for (const { lado, y0, y1, c: contorno } of contornos)
    for (let y = y0; y <= y1; y++)
      for (let x = 0; x < W; x++) {
        if (lado > 0 ? x < cx : x >= cx) continue;
        const i = y * W + x, dist = Math.abs(x - cx);
        if (!mascara[i] || d[i * 4 + 3] < 250 || maisProximo[i] < 0) continue;
        const fundo = Math.min(1, (y1 - y) / (14 * sy));
        const cobertura = Math.min(1, Math.max(0, (contorno[y - y0] - dist) / esfumado + 0.5)) * fundo;
        if (cobertura <= 0) continue;
        if (complementado[i] && corpo.dados[i * 4 + 3] >= 250) continue;
        pintar(i, cobertura);
      }
  // desfoque leve (5 × 5) só nos pixels complementados
  const r2 = Math.max(1, Math.round(2 * sx)), copia = new Uint8ClampedArray(corpo.dados);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!complementado[i]) continue;
      const soma = [0, 0, 0];
      let n2 = 0;
      for (let yy = Math.max(0, y - r2); yy <= Math.min(H - 1, y + r2); yy++)
        for (let xx = Math.max(0, x - r2); xx <= Math.min(W - 1, x + r2); xx++) {
          const k = yy * W + xx;
          if (copia[k * 4 + 3] < 200) continue;
          soma[0] += copia[k * 4]; soma[1] += copia[k * 4 + 1]; soma[2] += copia[k * 4 + 2];
          n2++;
        }
      if (n2) for (let c2 = 0; c2 < 3; c2++) corpo.dados[i * 4 + c2] = soma[c2] / n2;
    }
  return { corpo, braco };
}

// -------------------------------------------------------------- composição

function corHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function sobrepor(destino: ImagemRGBA, camada: ImagemRGBA, ox: number, oy: number, opacidade: number) {
  const d = destino.dados, c = camada.dados;
  for (let y = 0; y < camada.altura; y++) {
    const yd = y + oy;
    if (yd < 0 || yd >= destino.altura) continue;
    for (let x = 0; x < camada.largura; x++) {
      const xd = x + ox;
      if (xd < 0 || xd >= destino.largura) continue;
      const i = (y * camada.largura + x) * 4, j = (yd * destino.largura + xd) * 4;
      const a = (c[i + 3] / 255) * opacidade;
      if (a <= 0) continue;
      d[j] = c[i] * a + d[j] * (1 - a);
      d[j + 1] = c[i + 1] * a + d[j + 1] * (1 - a);
      d[j + 2] = c[i + 2] * a + d[j + 2] * (1 - a);
    }
  }
}

export type CamadasDaVista = { pele: CamadaSeparada } | { musculo: CamadaSeparada; gordura: CamadaSeparada };

export type OpcoesDaVista = {
  vista: Vista;
  /** Camadas já preparadas (prepararCamada) na mesma proporção. */
  camadas: CamadasDaVista;
  campos: CamposDasCamadas;
  coeficientes: Coeficientes;
  /** 0 = gordura opaca, 100 = invisível. */
  transparencia: number;
  largura: number;
  altura: number;
  fundo?: string;
};

/**
 * Compõe a vista final com fundo sólido incorporado: o corpo inteiro é
 * encaixado no quadro sem esticar, com o mesmo enquadramento para qualquer
 * medida (SPEC §9.3).
 */
export function comporVista(o: OpcoesDaVista): ImagemRGBA {
  const ref = "pele" in o.camadas ? o.camadas.pele.corpo : o.camadas.musculo.corpo;
  const escala = Math.min(o.largura / ref.largura, o.altura / ref.altura);
  const lw = Math.round(ref.largura * escala), lh = Math.round(ref.altura * escala);
  const ox = Math.floor((o.largura - lw) / 2), oy = Math.floor((o.altura - lh) / 2);
  const final = novaImagem(o.largura, o.altura);
  const [r, g, b] = corHex(o.fundo ?? FUNDO);
  for (let i = 0; i < final.dados.length; i += 4) {
    final.dados[i] = r; final.dados[i + 1] = g; final.dados[i + 2] = b; final.dados[i + 3] = 255;
  }
  const forma = vetorDeCoeficientes(o.coeficientes, false), nucleo = vetorDeCoeficientes(o.coeficientes, true);
  const desenhar = (im: ImagemRGBA, campos: CamposDaVista, coef: Float64Array, opacidade: number) =>
    sobrepor(final, deformar(im, campos, coef, lw, lh), ox, oy, opacidade);
  if ("pele" in o.camadas) {
    desenhar(o.camadas.pele.corpo, o.campos.corpo, forma, 1);
    desenhar(o.camadas.pele.braco, o.campos.bracos, forma, 1);
  } else {
    // Corpo (músculo e gordura) atrás; braço (músculo e gordura) na frente.
    const t = Math.max(0, Math.min(100, Number.isFinite(o.transparencia) ? o.transparencia : TRANSPARENCIA_PADRAO));
    const opacidade = (100 - t) / 100;
    for (const parte of ["corpo", "braco"] as const) {
      const campos = parte === "corpo" ? o.campos.corpo : o.campos.bracos;
      desenhar(o.camadas.musculo[parte], campos, nucleo, 1);
      if (opacidade > 0) desenhar(o.camadas.gordura[parte], campos, forma, opacidade);
    }
  }
  return final;
}

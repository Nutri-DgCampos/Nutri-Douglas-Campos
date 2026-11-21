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
 * Afastamento dos braços em cada ponto da grade: 0 dentro do polígono do
 * braço, subindo suavemente até 1 a `largura` pixels de referência dele.
 */
function afastamentoDosBracos(modelo: Modelo, vista: Vista, largura: number): Float64Array {
  const { distancia } = distanciaAoAlvo(rasterizar(REGIOES[modelo][vista].protecaoBracos, REF_LARGURA, REF_ALTURA), REF_LARGURA, REF_ALTURA);
  const raster = new Float32Array(REF_LARGURA * REF_ALTURA);
  for (let i = 0; i < raster.length; i++) raster[i] = suave(0, largura, distancia[i]);
  return amostrarProtecao(raster);
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
  /** Auxiliares para as regiões novas. */
  protecao: Float64Array; ocupacaoBraco: Float64Array; ocupacaoCoxa: Float64Array; pesoAbdominal: Float64Array;
};

const multiplicar = (v: Vetor, w: (p: number) => number) => {
  for (let p = 0; p < N; p++) { const k = w(p); v.x[p] *= k; v.y[p] *= k; }
};

/**
 * Tradução de build() do protótipo; `tricipitalAnterior` é a metade anterior
 * do braço. Com `camadas: true` (versão 1), os braços viram camada própria:
 * sem a máscara de proteção, que comprimia o tronco contra o braço e dobrava
 * a malha já em perímetros moderados, e com a transição lateral do tronco
 * afastada do contorno, para que o contorno expandido não caia nela.
 */
export function basesDoPrototipo(modelo: Modelo, vista: Vista, { camadas = false } = {}): BasesDoPrototipo {
  const c = REGIOES[modelo][vista];
  const [topo, cintura, abd, quadril, cx, rx, cy, ry] = c.tronco;
  const neutro = PERIMETROS_NEUTROS[modelo];
  const porPerimetro = (circ: number) => (s: Segmento) => (2 * s[2]) / ((circ * 10) / Math.PI);
  const braco = membros(c.bracos, porPerimetro(neutro.braco), c.anteriorDosBracos);
  const coxa = membros(c.pernas, porPerimetro(neutro.coxa));

  const meioDasPernas = c.pernas.reduce((s, [a, b]) => s + (a[1] + b[1]) / 2, 0) / c.pernas.length;
  const fCintura = vetor(), fAbdomen = vetor(), fQuadril = vetor(), fAbdGordura = vetor();
  const pesoAbdominal = escalar();
  const [gx, gy, grx, gry] = c.gluteo;
  for (let p = 0; p < N; p++) {
    const X = GX[p], Y = GY[p];
    const lateral = camadas ? 1 - suave(rx * 1.45, rx * 1.45 + 40, Math.abs(X - cx)) : 1 - suave(rx, rx + 28, Math.abs(X - cx));
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
    coxa.gordura.x[p] += -((X - gx) / grx) * gw * 0.38 * portao;
    coxa.gordura.y[p] += -((Y - gy) / gry) * gw * 0.14 * portao;
  }
  const protecao = camadas ? escalar() : amostrarProtecao(protecaoDosBracos(modelo, vista));
  const independente = (p: number) => 1 - protecao[p];
  for (const v of [fCintura, fAbdomen, fQuadril, coxa.forma, fAbdGordura, coxa.gordura]) multiplicar(v, independente);
  if (!camadas) for (const v of [braco.forma, braco.gordura, braco.anterior]) multiplicar(v, (p) => protecao[p]);
  for (let p = 0; p < N; p++) pesoAbdominal[p] *= 1 - protecao[p];
  return {
    braco: braco.forma, cintura: fCintura, abdomen: fAbdomen, quadril: fQuadril, coxa: coxa.forma,
    tricipital: braco.gordura, tricipitalAnterior: braco.anterior, abdominal: fAbdGordura, coxaDobra: coxa.gordura,
    protecao, ocupacaoBraco: braco.ocupacao, ocupacaoCoxa: coxa.ocupacao, pesoAbdominal,
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

  corpo.cintura = proto.cintura;
  corpo.abdomen = proto.abdomen;
  corpo.quadril = proto.quadril;
  corpo.coxa = proto.coxa;
  bracos.braco = proto.braco;

  // Deltoide: alargamento radial e suave de cada calota do ombro; o mesmo
  // campo nas duas camadas mantém a junção do ombro contínua.
  // Tórax: alarga a faixa entre a linha dos ombros e a cintura (só o corpo,
  // que passa por trás do braço), complementar à cintura do protótipo.
  const deltoide = vetor(), torax = vetor();
  for (const [ex, ey, erx, ery] of c.deltoides) {
    for (let p = 0; p < N; p++) {
      const n = (GX[p] - ex) / erx, m = (GY[p] - ey) / ery;
      const w = 1 - suave(0.45, 1.25, Math.sqrt(n * n + m * m));
      deltoide.x[p] += (GX[p] - ex) * w;
      deltoide.y[p] += (GY[p] - ey) * w * 0.35;
    }
  }
  for (let p = 0; p < N; p++) {
    const X = GX[p], Y = GY[p], mt = c.meiaLarguraTorax;
    const wT = suave(c.ombro, c.linhaTorax, Y) * (1 - suave(c.linhaTorax, cinturaY, Y)) * (1 - suave(mt * 1.45, mt * 1.45 + 40, Math.abs(X - cx)));
    torax.x[p] = (X - cx) * wT;
  }
  if (vista === "iso") {
    // Na isométrica o braço cobre as costas na altura do tórax; perto dele o
    // tronco deixa de se mover, para não se separar do que está atrás do braço.
    const afastamento = afastamentoDosBracos(modelo, vista, 40);
    for (let p = 0; p < N; p++) torax.x[p] *= afastamento[p];
  }
  corpo.deltoide = deltoide;
  bracos.deltoide = deltoide;
  corpo.torax = torax;

  if (vista === "iso") {
    const mm = pixelsPorMm(modelo, vista);
    const lp = c.ladoPosterior ?? 1;
    const perspectiva = (X: number) => (Math.sign(X - cx) === lp ? 0.65 : 1);

    // Braço: metade posterior (tricipital) e anterior (bicipital).
    // Com as duas espessuras iguais, a soma é exatamente o campo aprovado.
    const posterior = vetor();
    for (let p = 0; p < N; p++) {
      posterior.x[p] = proto.tricipital.x[p] - proto.tricipitalAnterior.x[p];
      posterior.y[p] = proto.tricipital.y[p] - proto.tricipitalAnterior.y[p];
    }
    bracos.tricipital = posterior;
    bracos.bicipital = proto.tricipitalAnterior;
    corpo.coxaDobra = proto.coxaDobra;

    // Regiões sem dobra própria: antebraço (camada dos braços) e calotas dos
    // ombros (as duas camadas, para a junção do ombro continuar contínua).
    const ante = membros(c.antebracos!, () => mm);
    const projetadaBracos = vetor(), calotas = vetor(), pesoCalotas = escalar();
    for (const calota of c.deltoides) {
      const e = elipse(calota, mm, 0.5);
      for (let p = 0; p < N; p++) {
        const livre = (1 - proto.ocupacaoBraco[p]) * (1 - ante.ocupacao[p]) * (1 - pesoCalotas[p]);
        calotas.x[p] += e.campo.x[p] * livre;
        calotas.y[p] += e.campo.y[p] * livre;
        pesoCalotas[p] = Math.min(1, pesoCalotas[p] + e.peso[p] * livre);
      }
    }
    for (let p = 0; p < N; p++) {
      const livre = 1 - proto.ocupacaoBraco[p];
      projetadaBracos.x[p] = ante.gordura.x[p] * livre + calotas.x[p];
      projetadaBracos.y[p] = ante.gordura.y[p] * livre + calotas.y[p];
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

    // Panturrilhas: cedem a região do joelho às coxas.
    const pant = membros(c.panturrilhas!, () => mm);
    multiplicar(pant.gordura, (p) => 1 - proto.ocupacaoCoxa[p]);
    corpo.panturrilha = pant.gordura;
  }

  const resultado = { corpo: empacotar(corpo), bracos: empacotar(bracos) };
  cacheCampos.set(chave, resultado);
  return resultado;
}

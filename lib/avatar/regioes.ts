// Avatares dinâmicos da avaliação física (SPEC 19/11/2026): configuração
// centralizada e versionada das regiões de deformação.
//
// Todas as coordenadas estão no ESPAÇO DE REFERÊNCIA de 600 × 802 pixels,
// o mesmo das fontes do protótipo aprovado. O motor as escala para a
// resolução de cada camada (largura/600 e altura/802), então as mesmas regras
// valem na tela e na exportação.
//
// São parâmetros visuais do desenho, não equações clínicas (SPEC §7.2).
// Mudar qualquer número daqui exige nova versão em versao.ts.

export const REF_LARGURA = 600;
export const REF_ALTURA = 802;
/** Grade dos campos de deslocamento (a mesma do protótipo). */
export const GRADE_LARGURA = 101;
export const GRADE_ALTURA = 135;

export type Modelo = "m" | "f";
export type Vista = "pele" | "iso";
export type Ponto = [number, number];
/** Segmento de membro: início, fim e raio (pixels de referência). */
export type Segmento = [Ponto, Ponto, number];

/**
 * Bases de deformação. As de FORMA recebem ln(medida/referência) e agem em
 * todas as camadas (contorno externo). As de DOBRA recebem a espessura
 * ilustrativa em mm (meia dobra) e agem só no núcleo (camada muscular da
 * isométrica): o músculo recua e a faixa entre ele e o contorno da gordura
 * mostra a camada de gordura (SPEC §6).
 */
export const BASES = [
  // forma
  "braco", "cintura", "abdomen", "quadril", "coxa", "deltoide", "torax",
  // dobra (espessura em mm)
  "tricipital", "bicipital", "abdominal", "coxaDobra", "peitoral",
  "axilar", "subescapular", "suprailiaca", "panturrilha", "projetada",
] as const;
export type Base = (typeof BASES)[number];
export const BASES_DE_FORMA: readonly Base[] = ["braco", "cintura", "abdomen", "quadril", "coxa", "deltoide", "torax"];
export const BASES_DE_DOBRA: readonly Base[] = BASES.filter((b) => !BASES_DE_FORMA.includes(b));

/** Faixa do tronco do protótipo: topo, cintura, abdômen, quadril, cx, rx, cy, ry. */
export type Tronco = [number, number, number, number, number, number, number, number];

export type ConfigDaVista = {
  // ---- herdado do protótipo aprovado (configuracao-regioes.json) ----
  tronco: Tronco;
  pernas: Segmento[];
  bracos: Segmento[];
  gluteo: [number, number, number, number];
  /** Polígonos que isolam os braços das bases de tronco (referencia-protecao-bracos.py). */
  protecaoBracos: Ponto[][];
  /** Altura do cotovelo: acima dele a margem de proteção é maior. */
  cotovelo: number;
  // ---- regiões acrescentadas na versão 1 ----
  /** Linha dos ombros e linha mamilar (y). */
  ombro: number;
  linhaTorax: number;
  /** Meia largura do tórax na linha mamilar, para a transição lateral. */
  meiaLarguraTorax: number;
  /**
   * Calotas dos deltoides: centro e raios. A primeira é a do braço visível
   * (na isométrica); servem ao perímetro do deltoide e, na isométrica, à
   * espessura projetada dos ombros.
   */
  deltoides: [number, number, number, number][];
  /** Lado anterior de cada braço: +1 = lado de n positivo do segmento. */
  anteriorDosBracos: (1 | -1)[];
  /** Peitorais: centro e raios (só isométrica). */
  peitoral?: [number, number, number, number];
  /** Faixas laterais do tronco [y0, y1, y2, y3] (sobe de y0 a y1, desce de y2 a y3). */
  axilar?: [number, number, number, number];
  subescapular?: [number, number, number, number];
  suprailiaca?: [number, number, number, number];
  /** Lado posterior visível do tronco na isométrica (+1 = x > cx). */
  ladoPosterior?: 1 | -1;
  panturrilhas?: Segmento[];
  antebracos?: Segmento[];
};

const espelhar = (pontos: Ponto[]): Ponto[] => pontos.map(([x, y]) => [599 - x, y]);

const PELE_M: Ponto[] = [[217, 152], [238, 171], [246, 202], [239, 233], [230, 253], [221, 296], [216, 326], [210, 351], [204, 378], [207, 408], [203, 437], [193, 458], [180, 455], [167, 421], [166, 380], [168, 333], [174, 280], [179, 224], [183, 184], [196, 160]];
const PELE_F: Ponto[] = [[232, 152], [243, 174], [249, 203], [246, 230], [238, 254], [233, 300], [229, 326], [222, 352], [215, 383], [220, 408], [215, 443], [205, 461], [193, 455], [182, 416], [183, 360], [187, 312], [193, 267], [197, 218], [200, 179], [217, 158]];
const ISO_M: Ponto[] = [[342, 146], [368, 134], [389, 146], [402, 188], [415, 246], [424, 290], [421, 347], [417, 378], [425, 409], [411, 438], [386, 439], [359, 420], [353, 401], [371, 371], [373, 336], [367, 299], [364, 277], [354, 255], [345, 225], [335, 195], [330, 171]];
const ISO_F: Ponto[] = [[333, 139], [354, 131], [374, 143], [389, 177], [400, 230], [407, 278], [407, 332], [405, 363], [411, 392], [400, 419], [381, 430], [358, 419], [352, 398], [366, 369], [367, 340], [354, 303], [351, 275], [345, 247], [334, 220], [326, 189], [322, 161]];

export const REGIOES: Record<Modelo, Record<Vista, ConfigDaVista>> = {
  m: {
    pele: {
      tronco: [223, 297, 326, 390, 300, 70, 310, 78],
      pernas: [[[262, 411], [241, 540], 38], [[341, 411], [356, 540], 38]],
      bracos: [[[218, 194], [197, 293], 18], [[378, 194], [401, 293], 18]],
      gluteo: [300, 385, 74, 55],
      protecaoBracos: [PELE_M, espelhar(PELE_M)],
      cotovelo: 293,
      ombro: 172, linhaTorax: 216, meiaLarguraTorax: 80,
      deltoides: [[210, 185, 38, 42], [389, 185, 38, 42]],
      anteriorDosBracos: [1, -1],
    },
    iso: {
      tronco: [251, 325, 351, 390, 283, 60, 338, 82],
      pernas: [[[251, 431], [195, 552], 39], [[288, 430], [341, 551], 37]],
      bracos: [[[365, 171], [390, 279], 23]],
      gluteo: [302, 382, 39, 51],
      protecaoBracos: [ISO_M],
      cotovelo: 279,
      ombro: 168, linhaTorax: 220, meiaLarguraTorax: 55,
      deltoides: [[368, 168, 38, 40], [232, 168, 22, 20]],
      anteriorDosBracos: [1],
      peitoral: [268, 210, 48, 30],
      axilar: [215, 240, 275, 305],
      subescapular: [170, 195, 225, 250],
      suprailiaca: [292, 312, 340, 362],
      ladoPosterior: 1,
      panturrilhas: [[[222, 565], [250, 700], 28], [[352, 560], [404, 700], 27]],
      antebracos: [[[390, 281], [394, 368], 19]],
    },
  },
  f: {
    pele: {
      tronco: [235, 297, 322, 380, 300, 65, 310, 74],
      pernas: [[[264, 411], [262, 545], 33], [[333, 411], [341, 545], 33]],
      bracos: [[[227, 192], [214, 292], 14], [[372, 192], [385, 292], 14]],
      gluteo: [300, 378, 73, 53],
      protecaoBracos: [PELE_F, espelhar(PELE_F)],
      cotovelo: 293,
      ombro: 170, linhaTorax: 216, meiaLarguraTorax: 72,
      deltoides: [[218, 185, 32, 38], [381, 185, 32, 38]],
      anteriorDosBracos: [1, -1],
    },
    iso: {
      tronco: [215, 279, 300, 355, 277, 48, 290, 70],
      pernas: [[[250, 389], [203, 514], 28], [[290, 386], [337, 515], 31]],
      bracos: [[[346, 162], [378, 271], 16]],
      gluteo: [317, 352, 27, 43],
      protecaoBracos: [ISO_F],
      cotovelo: 271,
      ombro: 158, linhaTorax: 205, meiaLarguraTorax: 52,
      deltoides: [[352, 160, 32, 34], [226, 162, 18, 16]],
      anteriorDosBracos: [1],
      peitoral: [255, 205, 45, 28],
      axilar: [205, 228, 258, 285],
      subescapular: [160, 182, 210, 232],
      suprailiaca: [262, 280, 305, 325],
      ladoPosterior: 1,
      panturrilhas: [[[213, 530], [245, 690], 26], [[350, 530], [392, 690], 24]],
      antebracos: [[[378, 272], [385, 352], 15]],
    },
  },
};

/**
 * Perímetros (cm) em que a figura fica igual à fonte: o "neutro" do desenho.
 * Braço, cintura, abdômen, quadril e coxa vêm do protótipo aprovado;
 * deltoide e tórax são PROPOSTA da versão 1, a conferir na folha de aprovação.
 */
export const PERIMETROS_NEUTROS: Record<Modelo, Record<"braco" | "cintura" | "abdomen" | "quadril" | "coxa" | "deltoide" | "torax", number>> = {
  m: { braco: 35, cintura: 90, abdomen: 100, quadril: 105, coxa: 60, deltoide: 115, torax: 100 },
  f: { braco: 30, cintura: 75, abdomen: 85, quadril: 100, coxa: 55, deltoide: 100, torax: 90 },
};

type Perimetro = keyof (typeof PERIMETROS_NEUTROS)["m"];

/**
 * Faixas suportadas pelo desenho, por modelo: dentro delas a malha não dobra
 * em parte alguma do corpo (conferido em tests/avatarMotor.test.mjs). Fora
 * delas o desenho usa o limite e registra que o limite foi aplicado; a
 * medida clínica não muda.
 */
export const FAIXAS_DE_PERIMETRO: Record<Modelo, Record<Perimetro, [number, number]>> = {
  m: { braco: [20, 50], cintura: [55, 125], abdomen: [60, 135], quadril: [80, 130], coxa: [40, 80], deltoide: [80, 150], torax: [70, 140] },
  f: { braco: [20, 43], cintura: [55, 125], abdomen: [60, 135], quadril: [80, 130], coxa: [40, 75], deltoide: [80, 150], torax: [70, 140] },
};
/** Dobra (mm) suportada pelo desenho; a espessura ilustrada é a metade. */
export const FAIXA_DE_DOBRA: [number, number] = [2, 50];

export type SitioVisual = "peitoral" | "axilar" | "tricipital" | "bicipital" | "subescapular" | "suprailiaca" | "abdominal" | "coxa" | "panturrilha";

/**
 * Dobras (mm) do estado visual de referência: a figura "típica" usada quando
 * não há dado algum e como base das projeções. As sete primeiras vêm do
 * protótipo aprovado (fluxo-referencia.js). Bicipital repete a tricipital,
 * o que mantém o braço exatamente como aprovado; panturrilha é PROPOSTA da
 * versão 1. Não são valores clínicos nem metas.
 */
export const DOBRAS_DE_REFERENCIA: Record<Modelo, Record<SitioVisual, number>> = {
  m: { peitoral: 12, axilar: 14, tricipital: 18, bicipital: 18, subescapular: 20, suprailiaca: 20, abdominal: 20, coxa: 25, panturrilha: 12 },
  f: { peitoral: 16, axilar: 18, tricipital: 18, bicipital: 18, subescapular: 20, suprailiaca: 22, abdominal: 20, coxa: 25, panturrilha: 18 },
};

/**
 * Espessura ilustrativa (mm) das regiões sem dobra própria (antebraços e
 * calotas dos ombros) no estado de referência: metade da espessura
 * tricipital de referência. PROPOSTA da versão 1.
 */
export const ESPESSURA_PROJETADA_DE_REFERENCIA: Record<Modelo, number> = {
  m: DOBRAS_DE_REFERENCIA.m.tricipital / 4,
  f: DOBRAS_DE_REFERENCIA.f.tricipital / 4,
};

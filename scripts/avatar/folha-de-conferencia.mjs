// Folha de conferência dos avatares (SPEC de 19/11/2026), versão 2.
//
// Responde à revisão do nutricionista de 21/11/2026: deformações corrigidas,
// perímetros opcionais de antebraço e panturrilha, limites visuais, camada
// de gordura conferida e comparação de transparências no tamanho do PDF.
//
// Uso: node scripts/avatar/folha-de-conferencia.mjs <saida.pdf> [pasta-de-previas]

import { mkdir } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToFile } from "@react-pdf/renderer";
import sharp from "sharp";
import { gerarCampos } from "../../lib/avatar/campos.ts";
import { aplicarLimitesVisuais, VIZINHOS } from "../../lib/avatar/limites.ts";
import { comporVista, deformar, vetorDeCoeficientes } from "../../lib/avatar/motor.ts";
import {
  DOBRAS_DE_REFERENCIA,
  ESPESSURA_PROJETADA_DE_REFERENCIA,
  FAIXAS_DE_PERIMETRO,
  FAIXA_DE_DOBRA,
  PERIMETROS_NEUTROS,
  REGIOES,
} from "../../lib/avatar/regioes.ts";
import { ROTULO_VERSAO_AVATAR } from "../../lib/avatar/versao.ts";
import { lerCamadas, pngDe } from "./carregar.mjs";

const [saida, pastaPrevias] = process.argv.slice(2);
if (!saida) {
  console.error("Uso: node scripts/avatar/folha-de-conferencia.mjs <saida.pdf> [pasta-de-previas]");
  process.exit(1);
}
const h = React.createElement;
const L = 900, A = 1200;
const fmt = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const NOMES = {
  deltoide: "deltoide", torax: "tórax", braco: "braço", antebraco: "antebraço", cintura: "cintura",
  abdomen: "abdômen", quadril: "quadril", coxa: "coxa", panturrilha: "panturrilha",
};

// ------------------------------------------------------------- estados

/** Coeficientes do desenho: perímetros pelos limites visuais, dobras em meia dobra. */
function estado(modelo, { medidas = {}, dobras = {}, projetada } = {}) {
  const limites = aplicarLimitesVisuais(modelo, medidas);
  const d = { ...DOBRAS_DE_REFERENCIA[modelo], ...dobras };
  return {
    limites,
    coef: {
      ...limites.coeficientes,
      tricipital: d.tricipital / 2, bicipital: d.bicipital / 2, abdominal: d.abdominal / 2, coxaDobra: d.coxa / 2,
      peitoral: d.peitoral / 2, axilar: d.axilar / 2, subescapular: d.subescapular / 2, suprailiaca: d.suprailiaca / 2,
      panturrilhaDobra: d.panturrilha / 2,
      projetada: projetada ?? ESPESSURA_PROJETADA_DE_REFERENCIA[modelo],
    },
  };
}

/** Texto curto do que o limite visual mudou (medida para desenho). */
function notaDosLimites(limites, so) {
  const partes = [];
  for (const [r, v] of Object.entries(limites.regioes)) {
    if (so && !so.includes(r)) continue;
    if (v.medido !== null && v.limites.length) partes.push(`${NOMES[r]} ${fmt(v.medido)} para ${fmt(v.desenhado)}`);
  }
  return partes.length ? `limite: ${partes.join("; ")}` : "";
}

// ------------------------------------------------------------ recortes

// Caixas [x, y, largura, altura] no espaço de referência 600 × 802.
const RECORTES = {
  m: {
    pele: { braco: [130, 140, 170, 240], antebraco: [140, 260, 140, 230], ombros: [150, 100, 300, 160], torax: [150, 120, 300, 200], tronco: [150, 200, 300, 230], quadril: [150, 320, 300, 230], perna: [170, 500, 260, 260] },
    iso: { braco: [300, 110, 160, 330], ombros: [180, 100, 260, 170], torax: [180, 120, 280, 220], lateral: [190, 150, 190, 170], tronco: [170, 200, 280, 240], quadril: [140, 320, 290, 260], perna: [140, 500, 320, 290] },
  },
  f: {
    pele: { braco: [140, 140, 160, 240], antebraco: [150, 260, 130, 230], ombros: [150, 100, 300, 160], torax: [150, 120, 300, 200], tronco: [150, 200, 300, 230], quadril: [150, 300, 300, 230], perna: [180, 480, 240, 280] },
    iso: { braco: [290, 100, 150, 320], ombros: [170, 95, 240, 165], torax: [170, 110, 270, 210], lateral: [180, 140, 180, 160], tronco: [160, 190, 270, 230], quadril: [140, 290, 290, 260], perna: [140, 470, 320, 300] },
  },
};

// ------------------------------------------------------------- regiões

const P = (chave, rotulo, recorte, texto, nova = false) => ({ tipo: "forma", chave, rotulo, recorte, texto, nova });
const D = (chave, sitio, rotulo, recorte, texto, nova = false) => ({ tipo: "dobra", chave, sitio, rotulo, recorte, texto, nova });

const PERIMETROS_DA_FOLHA = [
  P("braco", "Braço — perímetro do braço direito relaxado", { pele: "braco", iso: "braco" }, "Governa a largura dos dois braços. O braço é uma camada à frente do tronco: cintura, abdômen e tórax não mudam o volume dele; quando o tronco cresce, o braço gira a partir do ombro só o necessário."),
  P("antebraco", "Antebraço — maior perímetro (opcional)", { pele: "antebraco", iso: "braco" }, "Perímetro opcional incluído em 21/11. Ajusta o antebraço independentemente do braço; o cotovelo faz a transição. Neutro proposto: 30 cm (M) e 25 cm (F).", true),
  P("deltoide", "Ombros — perímetro do deltoide", { pele: "ombros", iso: "ombros" }, "Alarga de forma suave a calota de cada ombro, contínua entre braço e tronco. Neutro aprovado: 115 cm (M) e 100 cm (F)."),
  P("torax", "Tórax — perímetro do tórax", { pele: "torax", iso: "torax" }, "Alarga o contorno entre a linha dos ombros e a cintura. Na axila o braço acompanha o tronco, sem recorte. Neutro aprovado: 100 cm (M) e 90 cm (F)."),
  P("cintura", "Cintura", { pele: "tronco", iso: "tronco" }, "Região do protótipo. As transições com tórax e abdômen ficam dentro do limite de coerência."),
  P("abdomen", "Abdômen", { pele: "tronco", iso: "tronco" }, "Região do protótipo, com transição independente da cintura."),
  P("quadril", "Quadril e glúteos", { pele: "quadril", iso: "quadril" }, "Região do protótipo. Quando o quadril cresce, as mãos acompanham o giro do braço."),
  P("coxa", "Coxa — perímetro da coxa direita", { pele: "quadril", iso: "quadril" }, "Região do protótipo; muda os contornos lateral e medial; o joelho faz a transição com a panturrilha."),
  P("panturrilha", "Panturrilha — maior perímetro (opcional)", { pele: "perna", iso: "perna" }, "Perímetro opcional incluído em 21/11. Ajusta a panturrilha independentemente da coxa; o joelho faz a transição. Neutro proposto: 38 cm (M) e 35 cm (F).", true),
];

const DOBRAS_DA_FOLHA = [
  D("tricipital", "tricipital", "Dobra tricipital", "braco", "Metade posterior do braço. Sem a bicipital, a frente do braço usa a mesma espessura."),
  D("bicipital", "bicipital", "Dobra bicipital", "braco", "Metade anterior do braço, quando coletada."),
  D("peitoral", "peitoral", "Dobra peitoral", "torax", "Recuo suave do músculo na região peitoral."),
  D("axilar", "axilar", "Dobra axilar média", "lateral", "Laterais do tronco abaixo das axilas."),
  D("subescapular", "subescapular", "Dobra subescapular", "lateral", "Transição posterior superior do tronco, a parte visível na isométrica."),
  D("suprailiaca", "suprailiaca", "Dobra suprailíaca", "tronco", "Flancos; divide a região com a abdominal sem somar espessuras."),
  D("abdominal", "abdominal", "Dobra abdominal", "tronco", "Abdômen; cede os flancos à suprailíaca."),
  D("coxaDobra", "coxa", "Dobra da coxa (e projeção glútea)", "quadril", "Coxa; a projeção glútea acompanha a dobra da coxa, sem ser tratada como dobra glútea."),
  D("panturrilhaDobra", "panturrilha", "Dobra da panturrilha medial", "perna", "Panturrilha; o joelho é dividido com a coxa. Referência aprovada: 12 mm (M) e 18 mm (F)."),
];

const PERFIS = {
  m: [
    ["Obesidade central", { torax: 110, cintura: 118, abdomen: 122, quadril: 112, coxa: 62, braco: 36, antebraco: 31 }],
    ["Atlético", { deltoide: 130, torax: 108, cintura: 82, braco: 40, antebraco: 32, coxa: 64, panturrilha: 40 }],
    ["Ombro largo, braço fino", { deltoide: 135, braco: 26 }],
    ["Tudo no mínimo", "min"],
    ["Tudo no máximo", "max"],
  ],
  f: [
    ["Ginoide", { torax: 92, cintura: 78, abdomen: 92, quadril: 120, coxa: 68, panturrilha: 40 }],
    ["Magra", { torax: 80, cintura: 62, abdomen: 70, quadril: 88, coxa: 48, braco: 24, antebraco: 21, panturrilha: 31 }],
    ["Cintura alta isolada", { ...PERIMETROS_NEUTROS.f, cintura: 110 }],
    ["Tudo no mínimo", "min"],
    ["Tudo no máximo", "max"],
  ],
};

// ----------------------------------------------------------- renderização

const camadas = {};
const cache = new Map();
async function render(modelo, vista, coef, transparencia) {
  const chave = JSON.stringify([modelo, vista, coef, transparencia]);
  if (cache.has(chave)) return cache.get(chave);
  camadas[modelo] ??= await lerCamadas(modelo, L, A);
  const c = camadas[modelo];
  const img = comporVista({
    vista, camadas: vista === "pele" ? { pele: c.pele } : { musculo: c.musculo, gordura: c.gordura },
    campos: gerarCampos(modelo, vista), coeficientes: coef, transparencia, largura: L, altura: A,
  });
  const png = await pngDe(img).toBuffer();
  cache.set(chave, png);
  return png;
}

async function recortar(png, modelo, vista, caixa, altura = 420) {
  const ref = camadas[modelo][vista === "pele" ? "pele" : "musculo"].corpo;
  const sx = ref.largura / 600, sy = ref.altura / 802;
  const ox = Math.floor((L - ref.largura) / 2), oy = Math.floor((A - ref.altura) / 2);
  const [x, y, w, hh] = caixa;
  const area = { left: Math.round(ox + x * sx), top: Math.round(oy + y * sy), width: Math.round(w * sx), height: Math.round(hh * sy) };
  return sharp(png).extract(area).resize({ height: altura }).jpeg({ quality: 88 }).toBuffer();
}

// JPEG: o fundo já é sólido (#20343A), e o PDF fica pequeno o bastante para e-mail
const dataUri = (buf) => "data:image/jpeg;base64," + buf.toString("base64");

// ------------------------------------------------------------------- PDF

const cor = { fundo: "#20343A", texto: "#1d2a30", suave: "#5b6b72", nova: "#b4531f", limite: "#9a3412" };
const st = StyleSheet.create({
  pagina: { padding: 26, fontSize: 9, fontFamily: "Helvetica", color: cor.texto },
  titulo: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sub: { fontSize: 9.5, color: cor.suave, marginBottom: 8, lineHeight: 1.35 },
  nova: { color: cor.nova, fontFamily: "Helvetica-Bold" },
  linha: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  rotuloLinha: { width: 88, fontSize: 9, fontFamily: "Helvetica-Bold" },
  celula: { flex: 1, alignItems: "center", marginHorizontal: 3 },
  legenda: { fontSize: 7.5, color: cor.suave, marginTop: 2, textAlign: "center" },
  limite: { fontSize: 7, color: cor.limite, textAlign: "center" },
  rodape: { position: "absolute", bottom: 14, left: 26, right: 26, fontSize: 7.5, color: cor.suave, flexDirection: "row", justifyContent: "space-between" },
  paragrafo: { fontSize: 9.5, lineHeight: 1.4, marginBottom: 5 },
  item: { fontSize: 9.5, lineHeight: 1.4, marginBottom: 2, marginLeft: 10 },
  secao: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 4, marginBottom: 3 },
});

const rodape = (n) => h(View, { style: st.rodape, fixed: true },
  h(Text, null, `Folha de conferência dos avatares — versão 2 (${ROTULO_VERSAO_AVATAR})`),
  h(Text, null, `Página ${n}`));

const pagina = (n, titulo, sub, ...conteudo) => h(Page, { size: "A4", orientation: "landscape", style: st.pagina, wrap: false },
  h(Text, { style: st.titulo }, ...titulo),
  sub ? h(Text, { style: st.sub }, sub) : null,
  ...conteudo, rodape(n));

function linhaDeImagens(rotulo, imagens, alturaImg) {
  const larguraImg = (841.89 - 52 - 88) / imagens.length - 6;
  return h(View, { style: st.linha },
    h(Text, { style: st.rotuloLinha }, rotulo),
    ...imagens.map(({ src, legenda, nota }) => h(View, { style: st.celula },
      h(View, { style: { width: larguraImg, height: alturaImg } },
        h(Image, { src, style: { width: larguraImg, height: alturaImg, objectFit: "contain" } })),
      h(Text, { style: st.legenda }, legenda),
      nota ? h(Text, { style: st.limite }, nota) : null)));
}

const modelos = [["m", "Masculino"], ["f", "Feminino"]];
const previas = [];

async function paginaDoPerimetro(r, n) {
  const linhas = [];
  for (const [modelo, nomeModelo] of modelos) {
    const [min, max] = FAIXAS_DE_PERIMETRO[modelo][r.chave], neutro = PERIMETROS_NEUTROS[modelo][r.chave];
    const meio = (a, b) => Math.round((a + b) / 2);
    const estados = [[min, "mínimo"], [meio(min, neutro), ""], [neutro, "neutro"], [meio(neutro, max), ""], [max, "máximo"]].map(([v, q]) => {
      const e = estado(modelo, { medidas: { ...PERIMETROS_NEUTROS[modelo], [r.chave]: v } });
      return { ...e, legenda: q ? `${fmt(v)} cm · ${q}` : `${fmt(v)} cm`, nota: notaDosLimites(e.limites) };
    });
    for (const vista of ["pele", "iso"]) {
      const caixa = RECORTES[modelo][vista][r.recorte[vista]];
      const imagens = [];
      for (const e of estados) {
        const corte = await recortar(await render(modelo, vista, e.coef, 85), modelo, vista, caixa);
        imagens.push({ src: dataUri(corte), legenda: e.legenda, nota: e.nota, buf: corte });
      }
      previas.push({ nome: `${String(n).padStart(2, "0")}-${r.chave}-${modelo}-${vista}`, imagens });
      linhas.push(linhaDeImagens(`${nomeModelo}\n${vista === "pele" ? "Pele frontal" : "Isométrica (85%)"}`, imagens, 86));
    }
  }
  return pagina(n, [r.rotulo, r.nova ? h(Text, { style: st.nova }, "   NOVA") : null],
    r.texto + " As outras medidas ficam medidas no neutro; quando a diferença para as vizinhas passa do que o desenho representa, aparece o limite aplicado (medida para desenho).",
    ...linhas);
}

async function paginaDaDobra(r, n) {
  const linhas = [];
  for (const [modelo, nomeModelo] of modelos) {
    const ref = DOBRAS_DE_REFERENCIA[modelo][r.sitio];
    const imagens = [];
    for (const [v, q] of [[FAIXA_DE_DOBRA[0], "mínimo"], [ref, "referência"], [36, ""], [FAIXA_DE_DOBRA[1], "máximo"]]) {
      const e = estado(modelo, { dobras: { [r.sitio]: v } });
      const corte = await recortar(await render(modelo, "iso", e.coef, 49), modelo, "iso", RECORTES[modelo].iso[r.recorte]);
      imagens.push({ src: dataUri(corte), legenda: `${fmt(v)} mm (ilustra ${fmt(v / 2)} mm)${q ? " · " + q : ""}`, buf: corte });
    }
    previas.push({ nome: `${String(n).padStart(2, "0")}-${r.chave}-${modelo}`, imagens });
    linhas.push(linhaDeImagens(`${nomeModelo}\nIsométrica (49%)`, imagens, 205));
  }
  return pagina(n, [r.rotulo], r.texto + " Transparência de 49% para conferência; perímetros no neutro.", ...linhas);
}

async function paginaGeral(n) {
  const linhas = [];
  for (const [modelo, nomeModelo] of modelos) {
    const { coef } = estado(modelo);
    const imgs = [];
    for (const [vista, t, leg] of [["pele", 85, "Pele frontal"], ["iso", 85, "Isométrica · 85% (padrão)"], ["iso", 49, "Isométrica · 49%"], ["iso", 0, "Isométrica · 0%"]]) {
      const b = await sharp(await render(modelo, vista, coef, t)).resize({ height: 520 }).jpeg({ quality: 88 }).toBuffer();
      imgs.push({ src: dataUri(b), legenda: leg, buf: b });
    }
    previas.push({ nome: `${String(n).padStart(2, "0")}-geral-${modelo}`, imagens: imgs });
    linhas.push(linhaDeImagens(nomeModelo, imgs, 205));
  }
  return pagina(n, ["Estado de referência"], "Todas as medidas no neutro e todas as dobras na referência visual. Fundo #20343A incorporado à imagem.", ...linhas);
}

/** Figura no tamanho exato que terá no PDF (115 pt de largura, proporção 3:4). */
const FIGURA_PDF = { largura: 115, altura: 153.3 };

async function paginaTransparencias(n) {
  const linhas = [];
  for (const t of [85, 65, 49]) {
    const celulas = [];
    for (const [modelo] of modelos) {
      const { coef } = estado(modelo);
      for (const vista of ["pele", "iso"]) {
        const b = await sharp(await render(modelo, vista, coef, t)).resize({ width: 600 }).jpeg({ quality: 90 }).toBuffer();
        celulas.push(h(View, { style: { marginRight: 10 } },
          h(View, { style: { width: FIGURA_PDF.largura, height: FIGURA_PDF.altura } },
            h(Image, { src: dataUri(b), style: { width: FIGURA_PDF.largura, height: FIGURA_PDF.altura } }))));
      }
    }
    linhas.push(h(View, { style: { flexDirection: "row", alignItems: "center", marginBottom: 8 } },
      h(Text, { style: { width: 110, fontSize: 10, fontFamily: "Helvetica-Bold" } }, `${t}% de transparência${t === 85 ? "\n(padrão atual)" : ""}`),
      ...celulas));
  }
  return pagina(n, ["Transparência da gordura no tamanho final do PDF"],
    "Mesma geometria nas três linhas; só muda a transparência (0% = gordura opaca, 100% = invisível). Masculino e feminino, pele e isométrica, cada figura no tamanho exato que terá no PDF (115 pt de largura). Para escolher a melhor leitura no PDF.",
    ...linhas);
}

async function paginaExemploDoBloco(n) {
  const blocos = [];
  for (const [modelo, nomeModelo, perfil] of [["m", "Masculino · obesidade central", PERFIS.m[0][1]], ["f", "Feminino · ginoide", PERFIS.f[0][1]]]) {
    const { coef } = estado(modelo, { medidas: perfil });
    const figuras = [];
    for (const [vista, titulo] of [["pele", "Pele · vista frontal"], ["iso", "Isométrica · músculo e gordura"]]) {
      const b = await sharp(await render(modelo, vista, coef, 85)).resize({ width: 600 }).jpeg({ quality: 90 }).toBuffer();
      figuras.push(h(View, { style: { flex: 1, alignItems: "center", paddingTop: 6 } },
        h(Text, { style: { color: "#e2eef0", fontSize: 8, marginBottom: 3 } }, titulo),
        h(Image, { src: dataUri(b), style: { width: FIGURA_PDF.largura, height: FIGURA_PDF.altura } })));
    }
    blocos.push(h(View, { style: { width: 579, marginBottom: 14, borderWidth: 0.6, borderColor: "#d5dde0" } },
      h(Text, { style: { fontSize: 10, padding: 6 } }, "Representação corporal — avaliação atual"),
      h(View, { style: { flexDirection: "row", backgroundColor: cor.fundo, height: 180 } }, ...figuras),
      h(Text, { style: { fontSize: 7.5, color: cor.suave, padding: 6 } }, "Imagem aproximada com base na sua avaliação. Nas regiões sem medida de dobra, a distribuição de gordura é ilustrativa."),
      h(Text, { style: { fontSize: 7, color: cor.suave, paddingHorizontal: 6, paddingBottom: 4 } }, `(exemplo: ${nomeModelo}, 85%)`)));
  }
  return pagina(n, ["Exemplo do bloco no tamanho do PDF"],
    "Réplica do bloco que substituirá a faixa de corpos no PDF, nas proporções da prévia aprovada (largura 579 pt, figuras de 115 pt). A integração ao PDF real fica para depois da conferência.",
    ...blocos);
}

/** Mede a faixa entre o contorno da gordura e o núcleo no lado livre do membro (mm). */
async function medirFaixa(modelo, parte, segmento, perimetro, coef) {
  const c = await lerCamadas(modelo, 1536, 2048);
  const campos = gerarCampos(modelo, "iso")[parte === "braco" ? "bracos" : "corpo"];
  const mus = c.musculo[parte], gor = c.gordura[parte];
  const W = mus.largura, H = mus.altura, kx = (W - 1) / 599, ky = (H - 1) / 801;
  const [[sx, sy], [ex, ey], hh] = segmento;
  const px = (sx + ex) / 2, py = (sy + ey) / 2, comp = Math.hypot(ex - sx, ey - sy), nx = -(ey - sy) / comp, ny = (ex - sx) / comp;
  const extensao = (im, sinal) => {
    let s = 0;
    while (s < 3 * hh) {
      const x = Math.round((px + nx * sinal * (s + 0.25)) * kx), y = Math.round((py + ny * sinal * (s + 0.25)) * ky);
      if (im.dados[(y * W + x) * 4 + 3] <= 128) break;
      s += 0.25;
    }
    return s;
  };
  const nucleo = deformar(mus, campos, vetorDeCoeficientes(coef, true), W, H);
  const contorno = deformar(gor, campos, vetorDeCoeficientes({}, false), W, H);
  const f = Math.max(...[-1, 1].map((s) => extensao(contorno, s) - extensao(nucleo, s)).filter((v) => v < 2.5 * hh));
  return f / ((2 * hh) / ((perimetro * 10) / Math.PI));
}

async function paginaDaGordura(n) {
  const linhas = [];
  const medidas = [];
  for (const [modelo, nomeModelo] of modelos) {
    const gm = REGIOES[modelo].iso.gorduraDosMembros, neutro = PERIMETROS_NEUTROS[modelo];
    const imagens = [];
    for (const [dobra, t] of [[18, 85], [36, 85], [18, 49], [36, 49], [18, 0], [36, 0]]) {
      const { coef } = estado(modelo, { dobras: { tricipital: dobra, bicipital: dobra } });
      const corte = await recortar(await render(modelo, "iso", coef, t), modelo, "iso", RECORTES[modelo].iso.braco);
      imagens.push({ src: dataUri(corte), legenda: `dobra ${dobra} mm · ${t}%`, buf: corte });
    }
    linhas.push(linhaDeImagens(`${nomeModelo}\nBraço ${neutro.braco} cm\n(perímetro fixo)`, imagens, 190));
    for (const dobra of [18, 36]) {
      const braco = await medirFaixa(modelo, "braco", gm.bracos[0], neutro.braco, { tricipital: dobra / 2, bicipital: dobra / 2 });
      const coxa = await medirFaixa(modelo, "corpo", gm.pernas[1], neutro.coxa, { coxaDobra: dobra / 2 });
      medidas.push(`${nomeModelo}, dobra ${dobra} mm (esperado ${dobra / 2} mm por lado): braço ${fmt(braco)} mm, coxa ${fmt(coxa)} mm`);
    }
  }
  return pagina(n, ["Camada de gordura: espessura ilustrada = dobra ÷ 2"],
    "Mesmo perímetro, dobra de 18 e de 36 mm: a faixa entre o contorno externo e o núcleo engrossa e o núcleo diminui. O núcleo não representa músculo medido. Medido nas imagens de exportação:",
    h(View, { style: { marginBottom: 6 } }, ...medidas.map((m) => h(Text, { style: st.item }, "• " + m))),
    ...linhas,
    h(Text, { style: [st.sub, { marginTop: 2 }] }, "Escala: na figura do PDF (115 pt de largura para o corpo inteiro), 9 mm de camada correspondem a cerca de 0,6 pt. Por isso, no PDF, a gordura é percebida sobretudo pela cor da camada (transparência), e não pela espessura da faixa."));
}

async function paginaDasCombinacoes(modelo, nomeModelo, n) {
  const linhas = [];
  const colunas = [];
  for (const [nome, perfil] of PERFIS[modelo]) {
    let medidas = perfil;
    let dobras = {};
    let projetada;
    if (perfil === "min" || perfil === "max") {
      const q = perfil === "max" ? 1 : 0;
      medidas = {};
      for (const [k, f] of Object.entries(FAIXAS_DE_PERIMETRO[modelo])) medidas[k] = f[q];
      for (const k of Object.keys(DOBRAS_DE_REFERENCIA[modelo])) dobras[k] = FAIXA_DE_DOBRA[q];
      projetada = q ? FAIXA_DE_DOBRA[1] / 4 : 0.5;
    }
    colunas.push({ nome, ...estado(modelo, { medidas, dobras, projetada }), medidas });
  }
  for (const vista of ["pele", "iso"]) {
    const imagens = [];
    for (const col of colunas) {
      const b = await sharp(await render(modelo, vista, col.coef, 85)).resize({ height: 520 }).jpeg({ quality: 88 }).toBuffer();
      const lista = Object.entries(col.medidas).filter(([k, v]) => v !== PERIMETROS_NEUTROS[modelo][k]).map(([k, v]) => `${NOMES[k]} ${v}`).join(", ");
      imagens.push({ src: dataUri(b), legenda: vista === "pele" ? `${col.nome}${lista && !col.nome.startsWith("Tudo") ? ": " + lista : ""}` : col.nome, nota: vista === "iso" ? notaDosLimites(col.limites) : "", buf: b });
    }
    previas.push({ nome: `${String(n).padStart(2, "0")}-combinacoes-${modelo}-${vista}`, imagens });
    linhas.push(linhaDeImagens(vista === "pele" ? "Pele frontal" : "Isométrica\n(85%)", imagens, 205));
  }
  return pagina(n, [`Combinações de medidas — ${nomeModelo}`],
    "Medidas diferentes ao mesmo tempo (as não citadas ficam ausentes e são desenhadas como referência ou projeção). Abaixo de cada figura, o limite visual aplicado, quando houve.",
    ...linhas);
}

function capa() {
  const p = (t) => h(Text, { style: st.paragrafo }, t);
  const i = (t) => h(Text, { style: st.item }, "• " + t);
  const s = (t) => h(Text, { style: st.secao }, t);
  const pct = (d) => `${Math.round((Math.exp(d) - 1) * 100)}%`;
  return h(Page, { size: "A4", orientation: "landscape", style: st.pagina, wrap: false },
    h(Text, { style: [st.titulo, { fontSize: 18, marginBottom: 6 }] }, "Avatares dinâmicos — folha de conferência, versão 2"),
    p("Responde à revisão de 21/11. Para cada página, responda: aprovado, ou o que ajustar."),
    s("Valores aprovados (calibração do desenho, não medidas clínicas)"),
    i("Deltoide 115 cm (M) e 100 cm (F); tórax 100 cm (M) e 90 cm (F); dobra de referência da panturrilha 12 mm (M) e 18 mm (F)."),
    i("Antebraços e ombros sem dobra própria: 4,5 mm ilustrados, sempre identificados como referência ou projeção. É a metade da espessura ilustrada de 9 mm da tricipital de 18 mm (não a metade da dobra de 18 mm)."),
    s("O que foi corrigido"),
    i("Axilas e junção braço–tronco: o braço é uma camada à frente; na axila acompanha o tronco e, abaixo dela, gira a partir do ombro só o necessário. Sem recortes, buracos ou braço descolado."),
    i("Cotovelo e joelho: braço–antebraço e coxa–panturrilha dividem a articulação; sem nós nem estrangulamentos."),
    i("Degraus entre tórax, cintura, abdômen, quadril e coxas: limite visual de coerência entre regiões vizinhas (abaixo)."),
    i("Camada de gordura: estava 2 a 4 vezes mais fina que o calculado nos membros; agora a espessura no contorno é a meia dobra na escala local (página própria)."),
    s("Para aprovar"),
    i("Perímetros opcionais novos, no maior perímetro: antebraço e panturrilha (direito e esquerdo, como braço e coxa; o desenho usa o direito). Neutros propostos: antebraço 30 cm (M) e 25 cm (F); panturrilha 38 cm (M) e 35 cm (F)."),
    i(`Limite de coerência (maior diferença desenhada entre vizinhas, em relação aos neutros): ${VIZINHOS.map(([a, b, d]) => `${NOMES[a]}–${NOMES[b]} ${pct(d)}`).join("; ")}. Acima disso as duas regiões desenhadas se aproximam; região sem medida cede (vira projeção). A medida clínica não muda e o limite fica registrado.`),
    i("Faixas do desenho: braço 20–50 cm (F até 43), antebraço 18–40 (F 16–36), deltoide 80–150, tórax 70–140, cintura 55–125, abdômen 60–135, quadril 80–130, coxa 40–80 (F até 75), panturrilha 25–55 (F até 52); dobras 2–50 mm."),
    i("Transparência: comparação 85%, 65% e 49% no tamanho do PDF (o padrão continua 85% até a escolha)."),
    rodape(1));
}

// ------------------------------------------------------------------ main

const t0 = Date.now();
const paginas = [capa()];
let n = 2;
paginas.push(await paginaGeral(n++));
paginas.push(await paginaTransparencias(n++));
paginas.push(await paginaExemploDoBloco(n++));
paginas.push(await paginaDaGordura(n++));
paginas.push(await paginaDasCombinacoes("m", "masculino", n++));
paginas.push(await paginaDasCombinacoes("f", "feminino", n++));
for (const r of PERIMETROS_DA_FOLHA) {
  paginas.push(await paginaDoPerimetro(r, n++));
  process.stdout.write(".");
}
for (const r of DOBRAS_DA_FOLHA) {
  paginas.push(await paginaDaDobra(r, n++));
  process.stdout.write(".");
}
await renderToFile(h(Document, { title: "Avatares — folha de conferência v2" }, ...paginas), saida);
console.log(`\nPDF: ${saida} (${paginas.length} páginas, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);

if (pastaPrevias) {
  await mkdir(pastaPrevias, { recursive: true });
  for (const pv of previas) {
    const metas = await Promise.all(pv.imagens.map((im) => sharp(im.buf).metadata()));
    const largura = metas.reduce((s, m) => s + m.width + 8, 0), altura = Math.max(...metas.map((m) => m.height));
    let x = 0;
    const comp = pv.imagens.map((im, k) => { const c = { input: im.buf, left: x, top: 0 }; x += metas[k].width + 8; return c; });
    await sharp({ create: { width: largura, height: altura, channels: 4, background: "#ffffff" } }).composite(comp).png().toFile(path.join(pastaPrevias, pv.nome + ".png"));
  }
  console.log(`Prévias: ${pastaPrevias} (${previas.length})`);
}

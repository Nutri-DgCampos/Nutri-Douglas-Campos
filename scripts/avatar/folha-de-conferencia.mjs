// Folha de conferência das regiões dos avatares (fase 2 da SPEC de 19/11/2026).
//
// Para cada região: mínimo, referência e máximo suportados, nos dois modelos,
// com todas as outras medidas no estado de referência. Serve para o
// nutricionista aprovar ou pedir ajuste antes de as imagens irem para o PDF.
//
// Uso: node scripts/avatar/folha-de-conferencia.mjs <saida.pdf> [pasta-de-previas]

import { mkdir } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToFile } from "@react-pdf/renderer";
import sharp from "sharp";
import { gerarCampos } from "../../lib/avatar/campos.ts";
import { comporVista } from "../../lib/avatar/motor.ts";
import {
  DOBRAS_DE_REFERENCIA,
  ESPESSURA_PROJETADA_DE_REFERENCIA,
  FAIXAS_DE_PERIMETRO,
  FAIXA_DE_DOBRA,
  PERIMETROS_NEUTROS,
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

// ------------------------------------------------------------- estados

function coeficientes(modelo, { perimetros = {}, dobras = {}, projetada } = {}) {
  const c = {};
  for (const [k, v] of Object.entries(perimetros)) c[k] = Math.log(v / PERIMETROS_NEUTROS[modelo][k]);
  const d = { ...DOBRAS_DE_REFERENCIA[modelo], ...dobras };
  Object.assign(c, {
    tricipital: d.tricipital / 2, bicipital: d.bicipital / 2, abdominal: d.abdominal / 2, coxaDobra: d.coxa / 2,
    peitoral: d.peitoral / 2, axilar: d.axilar / 2, subescapular: d.subescapular / 2, suprailiaca: d.suprailiaca / 2,
    panturrilha: d.panturrilha / 2,
    projetada: projetada ?? ESPESSURA_PROJETADA_DE_REFERENCIA[modelo],
  });
  return c;
}

const todos = (modelo, qual) => {
  const perimetros = {}, dobras = {};
  for (const [k, faixa] of Object.entries(FAIXAS_DE_PERIMETRO[modelo])) perimetros[k] = qual === "min" ? faixa[0] : faixa[1];
  for (const k of Object.keys(DOBRAS_DE_REFERENCIA[modelo])) dobras[k] = qual === "min" ? FAIXA_DE_DOBRA[0] : FAIXA_DE_DOBRA[1];
  return coeficientes(modelo, { perimetros, dobras, projetada: qual === "min" ? 0.5 : FAIXA_DE_DOBRA[1] / 4 });
};

// ------------------------------------------------------------ recortes

// Caixas [x, y, largura, altura] no espaço de referência 600 × 802.
const RECORTES = {
  m: {
    pele: { braco: [140, 150, 150, 200], ombros: [150, 100, 300, 160], torax: [170, 130, 260, 170], tronco: [180, 240, 240, 170], quadril: [160, 330, 280, 220] },
    iso: { braco: [310, 110, 150, 300], ombros: [180, 100, 260, 170], torax: [190, 140, 190, 150], lateral: [190, 150, 190, 170], tronco: [190, 230, 200, 180], quadril: [140, 320, 270, 260], perna: [140, 520, 320, 240] },
  },
  f: {
    pele: { braco: [140, 150, 150, 200], ombros: [150, 100, 300, 160], torax: [170, 130, 260, 170], tronco: [180, 240, 240, 170], quadril: [160, 330, 280, 220] },
    iso: { braco: [295, 100, 140, 290], ombros: [170, 95, 240, 165], torax: [180, 135, 180, 140], lateral: [180, 140, 180, 160], tronco: [180, 210, 180, 170], quadril: [140, 290, 260, 260], perna: [140, 490, 310, 250] },
  },
};

// ------------------------------------------------------------- regiões

const P = (chave, rotulo, recorte, texto, nova = false) => ({ tipo: "forma", chave, rotulo, recorte, texto, nova });
const D = (chave, rotulo, recorte, texto, nova = false) => ({ tipo: "dobra", chave, rotulo, recorte, texto, nova });

const REGIOES_DA_FOLHA = [
  P("braco", "Braço — perímetro do braço direito relaxado", { pele: "braco", iso: "braco" }, "Governa a largura dos dois braços (lado direito como referência bilateral). O braço é desenhado na frente do tronco e não é afetado por cintura, abdômen ou tórax. Feminino: desenho até 43 cm."),
  P("deltoide", "Ombros — perímetro do deltoide", { pele: "ombros", iso: "ombros" }, "Alarga de forma suave a calota de cada ombro, acima do braço e contínua com o tronco. Neutro proposto: 115 cm (masculino) e 100 cm (feminino).", true),
  P("torax", "Tórax — perímetro do tórax", { pele: "torax", iso: "torax" }, "Alarga o contorno entre a linha dos ombros e a cintura, sem tocar os braços; transição complementar com deltoide e cintura. Neutro proposto: 100 cm (masculino) e 90 cm (feminino).", true),
  P("cintura", "Cintura", { pele: "tronco", iso: "tronco" }, "Região aprovada no protótipo. Aqui ela varia sozinha: com cintura muito alta e tórax no neutro, o contorno logo abaixo do peito forma um degrau. Na prática as medidas sobem juntas (ver Combinações extremas)."),
  P("abdomen", "Abdômen", { pele: "tronco", iso: "tronco" }, "Região aprovada no protótipo, com transição independente da cintura. Mesma observação da cintura quando varia sozinho."),
  P("quadril", "Quadril e glúteos", { pele: "quadril", iso: "quadril" }, "Região aprovada no protótipo."),
  P("coxa", "Coxa — perímetro da coxa direita", { pele: "quadril", iso: "quadril" }, "Região aprovada no protótipo; muda os contornos lateral e medial. Feminino: desenho até 75 cm."),
  D("tricipital", "Dobra tricipital", "braco", "Espessura da metade posterior do braço. Com a bicipital ausente, a frente do braço usa a mesma espessura, o que reproduz o braço aprovado."),
  D("bicipital", "Dobra bicipital", "braco", "Espessura da metade anterior do braço, quando a bicipital for coletada.", true),
  D("peitoral", "Dobra peitoral", "torax", "Recuo suave do músculo na região peitoral.", true),
  D("axilar", "Dobra axilar média", "lateral", "Laterais do tronco abaixo das axilas.", true),
  D("subescapular", "Dobra subescapular", "lateral", "Transição posterior superior do tronco, a parte visível na isométrica (o sítio fica nas costas).", true),
  D("suprailiaca", "Dobra suprailíaca", "tronco", "Flancos acima da crista ilíaca; divide a região com a abdominal sem somar espessuras.", true),
  D("abdominal", "Dobra abdominal", "tronco", "Região aprovada no protótipo; agora cede os flancos à suprailíaca."),
  D("coxa", "Dobra da coxa (e projeção glútea)", "quadril", "Região aprovada no protótipo; a projeção glútea acompanha a dobra da coxa, sem ser tratada como dobra glútea."),
  D("panturrilha", "Dobra da panturrilha medial", "perna", "Panturrilhas; cede a região do joelho à coxa. Referência visual proposta: 12 mm (masculino) e 18 mm (feminino).", true),
  { tipo: "projetada", chave: "projetada", rotulo: "Regiões sem dobra própria — antebraços e ombros", recorte: "braco", nova: true,
    texto: "Espessura projetada, sem medida local. Referência proposta: metade da espessura tricipital de referência (4,5 mm). A regra final de projeção será a da fase 3." },
];

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
  return sharp(png).extract(area).resize({ height: altura }).png().toBuffer();
}

const dataUri = (buf) => "data:image/png;base64," + buf.toString("base64");

// ------------------------------------------------------------------- PDF

const cor = { fundo: "#20343A", texto: "#1d2a30", suave: "#5b6b72", nova: "#b4531f", linha: "#d5dde0" };
const st = StyleSheet.create({
  pagina: { padding: 26, fontSize: 9, fontFamily: "Helvetica", color: cor.texto },
  titulo: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  sub: { fontSize: 9.5, color: cor.suave, marginBottom: 8, lineHeight: 1.35 },
  nova: { color: cor.nova, fontFamily: "Helvetica-Bold" },
  linha: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  rotuloLinha: { width: 88, fontSize: 9, fontFamily: "Helvetica-Bold" },
  celula: { flex: 1, alignItems: "center", marginHorizontal: 3 },
  legenda: { fontSize: 8, color: cor.suave, marginTop: 2, textAlign: "center" },
  rodape: { position: "absolute", bottom: 14, left: 26, right: 26, fontSize: 7.5, color: cor.suave, flexDirection: "row", justifyContent: "space-between" },
  paragrafo: { fontSize: 10, lineHeight: 1.45, marginBottom: 6 },
  item: { fontSize: 10, lineHeight: 1.45, marginBottom: 3, marginLeft: 10 },
});

const rodape = (n) => h(View, { style: st.rodape, fixed: true },
  h(Text, null, `Folha de conferência dos avatares — versão ${ROTULO_VERSAO_AVATAR}`),
  h(Text, null, `Página ${n}`));

function linhaDeImagens(rotulo, imagens, alturaImg) {
  // largura útil da página A4 deitada, menos margens, rótulo e espaçamentos
  const larguraImg = (841.89 - 52 - 88) / imagens.length - 6;
  return h(View, { style: st.linha },
    h(Text, { style: st.rotuloLinha }, rotulo),
    ...imagens.map(({ src, legenda }) => h(View, { style: st.celula },
      // caixa de tamanho definido: a imagem encaixa sem ditar a altura da linha
      h(View, { style: { width: larguraImg, height: alturaImg } },
        h(Image, { src, style: { width: larguraImg, height: alturaImg, objectFit: "contain" } })),
      h(Text, { style: st.legenda }, legenda))));
}

const modelos = [["m", "Masculino"], ["f", "Feminino"]];
const previas = [];

async function paginaDaRegiao(r, n) {
  const linhas = [];
  const vistas = r.tipo === "forma" ? ["pele", "iso"] : ["iso"];
  const transp = r.tipo === "forma" ? 85 : 49;
  for (const [modelo, nomeModelo] of modelos) {
    let estados;
    if (r.tipo === "forma") {
      const [min, max] = FAIXAS_DE_PERIMETRO[modelo][r.chave], neutro = PERIMETROS_NEUTROS[modelo][r.chave];
      const meio = (a, b) => Math.round((a + b) / 2);
      estados = [[min, "mínimo"], [meio(min, neutro), ""], [neutro, "neutro"], [meio(neutro, max), ""], [max, "máximo"]].map(([v, q]) => ({
        coef: coeficientes(modelo, { perimetros: { [r.chave]: v } }), legenda: q ? `${fmt(v)} cm · ${q}` : `${fmt(v)} cm` }));
    } else if (r.tipo === "dobra") {
      const ref = DOBRAS_DE_REFERENCIA[modelo][r.chave];
      estados = [[FAIXA_DE_DOBRA[0], "mínimo"], [ref, "referência"], [FAIXA_DE_DOBRA[1], "máximo"]].map(([v, q]) => ({
        coef: coeficientes(modelo, { dobras: { [r.chave]: v } }), legenda: `${fmt(v)} mm (ilustra ${fmt(v / 2)} mm) · ${q}` }));
    } else {
      const ref = ESPESSURA_PROJETADA_DE_REFERENCIA[modelo];
      estados = [[0.5, "mínimo"], [ref, "referência"], [FAIXA_DE_DOBRA[1] / 4, "máximo"]].map(([v, q]) => ({
        coef: coeficientes(modelo, { projetada: v }), legenda: `${fmt(v)} mm ilustrados · ${q}` }));
    }
    for (const vista of vistas) {
      const caixa = RECORTES[modelo][vista][typeof r.recorte === "string" ? r.recorte : r.recorte[vista]];
      const imagens = [];
      for (const e of estados) {
        const corte = await recortar(await render(modelo, vista, e.coef, transp), modelo, vista, caixa);
        imagens.push({ src: dataUri(corte), legenda: e.legenda, buf: corte });
      }
      previas.push({ nome: `${String(n).padStart(2, "0")}-${r.chave}-${modelo}-${vista}`, imagens });
      linhas.push(linhaDeImagens(`${nomeModelo}\n${vista === "pele" ? "Pele frontal" : `Isométrica (${transp}%)`}`, imagens, vistas.length === 2 ? 108 : 205));
    }
  }
  return h(Page, { size: "A4", orientation: "landscape", style: st.pagina, wrap: false },
    h(Text, { style: st.titulo }, r.rotulo, r.nova ? h(Text, { style: st.nova }, "   NOVA") : null),
    h(Text, { style: st.sub }, r.texto + (r.tipo === "forma" ? "" : " Transparência de 49% (conferência de contraste); o padrão do paciente continua 85%.")),
    ...linhas,
    rodape(n));
}

async function paginaGeral(n) {
  const linhas = [];
  for (const [modelo, nomeModelo] of modelos) {
    const ref = coeficientes(modelo);
    const imgs = [];
    for (const [vista, t, leg] of [["pele", 85, "Pele frontal"], ["iso", 85, "Isométrica · 85% (padrão)"], ["iso", 49, "Isométrica · 49%"], ["iso", 0, "Isométrica · 0%"]]) {
      const png = await render(modelo, vista, ref, t);
      const b = await sharp(png).resize({ height: 520 }).png().toBuffer();
      imgs.push({ src: dataUri(b), legenda: leg, buf: b });
    }
    previas.push({ nome: `${String(n).padStart(2, "0")}-geral-${modelo}`, imagens: imgs });
    linhas.push(linhaDeImagens(nomeModelo, imgs, 210));
  }
  return h(Page, { size: "A4", orientation: "landscape", style: st.pagina, wrap: false },
    h(Text, { style: st.titulo }, "Estado de referência"),
    h(Text, { style: st.sub }, "Todas as medidas no neutro e todas as dobras na referência visual. Corpo inteiro, fundo #20343A incorporado à imagem."),
    ...linhas, rodape(n));
}

async function paginaExtremos(n) {
  const linhas = [];
  for (const [modelo, nomeModelo] of modelos) {
    const imgs = [];
    for (const [qual, rot] of [["min", "todos no mínimo"], ["max", "todos no máximo"]]) {
      for (const [vista, t] of [["pele", 85], ["iso", 49]]) {
        const png = await render(modelo, vista, todos(modelo, qual), t);
        const b = await sharp(png).resize({ height: 520 }).png().toBuffer();
        imgs.push({ src: dataUri(b), legenda: `${vista === "pele" ? "Pele" : "Isométrica 49%"} · ${rot}`, buf: b });
      }
    }
    previas.push({ nome: `${String(n).padStart(2, "0")}-extremos-${modelo}`, imagens: imgs });
    linhas.push(linhaDeImagens(nomeModelo, imgs, 210));
  }
  return h(Page, { size: "A4", orientation: "landscape", style: st.pagina, wrap: false },
    h(Text, { style: st.titulo }, "Combinações extremas"),
    h(Text, { style: st.sub }, "Todos os perímetros e todas as dobras no limite mínimo e no máximo suportados ao mesmo tempo. Conferir que nada se rompe, inverte ou sai do quadro."),
    ...linhas, rodape(n));
}

function capa() {
  const p = (t) => h(Text, { style: st.paragrafo }, t);
  const i = (t) => h(Text, { style: st.item }, "• " + t);
  return h(Page, { size: "A4", orientation: "landscape", style: st.pagina, wrap: false },
    h(Text, { style: [st.titulo, { fontSize: 20, marginBottom: 10 }] }, "Avatares dinâmicos — folha de conferência das regiões"),
    p("Esta folha mostra como cada região do desenho responde às medidas da avaliação, antes de as imagens entrarem no PDF do paciente. Cada página traz uma região nos modelos masculino e feminino, do mínimo ao máximo suportados (nos perímetros, também dois valores intermediários). As demais medidas ficam no estado de referência."),
    p("Para cada página, responda: aprovado, ou o que ajustar (por exemplo: \"ombros exagerados no máximo\", \"panturrilha fina demais\")."),
    p("O que é novo nesta versão (marcado como NOVA):"),
    i("Ombros (perímetro do deltoide) e tórax: não existiam no protótipo."),
    i("Dobras bicipital, peitoral, axilar média, subescapular, suprailíaca e panturrilha medial."),
    i("Regiões sem dobra própria (antebraços e ombros): espessura projetada."),
    p("Valores propostos que precisam do seu aceite:"),
    i("Perímetros neutros (figura igual à imagem original): deltoide 115 cm (M) e 100 cm (F); tórax 100 cm (M) e 90 cm (F)."),
    i("Dobra de referência visual da panturrilha: 12 mm (M) e 18 mm (F). As outras sete referências vêm do protótipo aprovado."),
    i("Espessura das regiões sem dobra: metade da tricipital de referência (4,5 mm)."),
    p("Mudança técnica que afeta o visual: o braço passou a ser uma camada desenhada na frente do tronco. No protótipo, o tronco era comprimido contra o braço e o desenho se rompia já com cintura acima de 97 cm (masculino) ou 82 cm (feminino); agora o tronco cresce por trás do braço e as faixas abaixo ficam íntegras."),
    p("Faixas que o desenho suporta (acima delas usa o limite e registra que o limite foi aplicado; a medida clínica não muda): braço 20–50 cm (feminino até 43), cintura 55–125, abdômen 60–135, quadril 80–130, coxa 40–80 (feminino até 75), deltoide 80–150, tórax 70–140; dobras 2–50 mm."),
    p("Lembretes: a espessura desenhada é a metade da dobra (regra aprovada). Os valores de referência são do desenho, não metas nem valores clínicos. A regra de projeção para dobras ausentes será tratada na próxima fase; aqui cada região é mostrada isoladamente."),
    rodape(1));
}

// ------------------------------------------------------------------ main

const t0 = Date.now();
const paginas = [capa()];
let n = 2;
paginas.push(await paginaGeral(n++));
paginas.push(await paginaExtremos(n++));
for (const r of REGIOES_DA_FOLHA) {
  paginas.push(await paginaDaRegiao(r, n++));
  process.stdout.write(".");
}
await renderToFile(h(Document, { title: "Avatares — folha de conferência" }, ...paginas), saida);
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

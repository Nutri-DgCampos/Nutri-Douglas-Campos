// Leitura e gravação de PNG para scripts e testes dos avatares (Node).
// Usa o sharp já presente em node_modules. O aplicativo terá o seu próprio
// adaptador no servidor (fase 5); o motor em lib/avatar não depende disto.

import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { FONTES, FONTES_TELA, PASTA_FONTES } from "../../lib/avatar/versao.ts";
import { prepararCamada } from "../../lib/avatar/motor.ts";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const caminhoDaFonte = (relativo) => path.join(RAIZ, "public", PASTA_FONTES, relativo);

/** PNG → ImagemRGBA, opcionalmente redimensionado (Lanczos) para largura × altura. */
export async function lerPng(arquivo, largura, altura) {
  let s = sharp(arquivo).ensureAlpha();
  if (largura && altura) s = s.resize(largura, altura, { fit: "fill", kernel: "lanczos3" });
  const { data, info } = await s.raw().toBuffer({ resolveWithObject: true });
  return { largura: info.width, altura: info.height, dados: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length) };
}

export function pngDe(imagem) {
  return sharp(Buffer.from(imagem.dados.buffer, imagem.dados.byteOffset, imagem.dados.length), {
    raw: { width: imagem.largura, height: imagem.altura, channels: 4 },
  }).png();
}

/**
 * Camadas preparadas (recorte feminino aplicado) já no tamanho em que serão
 * deformadas: o maior encaixe da fonte em largura × altura.
 */
export async function lerCamadas(modelo, largura, altura, { tela = false } = {}) {
  const fontes = (tela ? FONTES_TELA : FONTES)[modelo];
  const encaixe = async (rel) => {
    const meta = await sharp(caminhoDaFonte(rel)).metadata();
    const escala = Math.min(largura / meta.width, altura / meta.height);
    return [Math.round(meta.width * escala), Math.round(meta.height * escala)];
  };
  const [pl, pa] = await encaixe(fontes.pele);
  const [il, ia] = await encaixe(fontes.musculo);
  return {
    pele: prepararCamada(modelo, "pele", "pele", await lerPng(caminhoDaFonte(fontes.pele), pl, pa)),
    musculo: prepararCamada(modelo, "iso", "musculo", await lerPng(caminhoDaFonte(fontes.musculo), il, ia)),
    gordura: prepararCamada(modelo, "iso", "gordura", await lerPng(caminhoDaFonte(fontes.gordura), il, ia)),
  };
}

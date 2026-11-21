// Motor dos avatares dinâmicos (SPEC 19/11/2026, fases 1 e 2): campos,
// camadas, recorte, composição e integridade da malha nas faixas suportadas.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { basesDoPrototipo, gerarCampos } from "../lib/avatar/campos.ts";
import { aplicarGiro, comporVista, deformar, FUNDO, novaImagem, prepararCamada, recortarCamada, vetorDeCoeficientes } from "../lib/avatar/motor.ts";
import { aplicarLimitesVisuais, PERIMETROS, VIZINHOS } from "../lib/avatar/limites.ts";
import { rasterizar } from "../lib/avatar/raster.ts";
import { BASES, BASES_DE_DOBRA, FAIXAS_DE_PERIMETRO, FAIXA_DE_DOBRA, PERIMETROS_NEUTROS, REGIOES } from "../lib/avatar/regioes.ts";
import { FONTES_TELA } from "../lib/avatar/versao.ts";
import { caminhoDaFonte, lerPng } from "../scripts/avatar/carregar.mjs";

const MODELOS = ["m", "f"];
const VISTAS = ["pele", "iso"];
const N = 101 * 135;
const indice = (b) => BASES.indexOf(b);

test("as oito bases do protótipo são reproduzidas (erro médio < 0,01 px)", () => {
  const proto = JSON.parse(readFileSync(new URL("./fixtures/avatar/campos-deslocamento-prototipo.json", import.meta.url), "utf8"));
  const nomes = ["braco", "cintura", "abdomen", "quadril", "coxa", "tricipital", "abdominal", "coxaDobra"];
  for (const modelo of MODELOS)
    for (const [vista, chave] of [["pele", "skin"], ["iso", "iso"]]) {
      const spec = proto[modelo][chave];
      const bytes = new Int8Array(inflateSync(Buffer.from(spec.data, "base64")));
      const gerado = basesDoPrototipo(modelo, vista);
      nomes.forEach((nome, b) => {
        let soma = 0, fora = 0;
        for (const eixo of [0, 1]) {
          const arr = eixo ? gerado[nome].y : gerado[nome].x;
          for (let p = 0; p < N; p++) {
            const e = Math.abs(bytes[p * 16 + b * 2 + eixo] * spec.scale[b * 2 + eixo] - arr[p]);
            soma += e;
            if (e > 0.5) fora++;
          }
        }
        assert.ok(soma / (2 * N) < 0.01, `${modelo}/${vista}/${nome}: erro médio ${soma / (2 * N)}`);
        assert.ok(fora <= 0.002 * 2 * N, `${modelo}/${vista}/${nome}: ${fora} pontos acima de 0,5 px`);
      });
    }
});

test("o tronco não muda o volume do braço: na camada dos braços ele só translada ou gira", () => {
  for (const modelo of MODELOS)
    for (const vista of VISTAS) {
      const { corpo, bracos } = gerarCampos(modelo, vista);
      const nb = BASES.length, gw = 101;
      const cx = REGIOES[modelo][vista].tronco[4];
      for (const base of ["cintura", "abdomen", "quadril", "torax", "giroDoBraco"]) {
        const k = indice(base);
        // dentro de cada lado, o deslocamento não varia ao longo da linha (sem escalar o braço)
        for (let j = 0; j < 135; j++)
          for (let i = 0; i < gw - 1; i++) {
            const x0 = (i * 599) / 100, x1 = ((i + 1) * 599) / 100;
            if (Math.sign(x0 - cx) !== Math.sign(x1 - cx)) continue;
            const a = bracos.dados[((j * gw + i) * nb + k) * 2], b = bracos.dados[((j * gw + i + 1) * nb + k) * 2];
            assert.ok(Math.abs(a - b) < 1e-6, `${modelo}/${vista}/${base}: o braço seria escalado`);
          }
      }
      // braço, antebraço e dobras do braço nunca agem no corpo; dobras do tronco nunca agem no braço
      const zerado = (campos, base) => {
        const k = indice(base);
        for (let p = 0; p < N; p++) if (campos.dados[(p * nb + k) * 2] !== 0 || campos.dados[(p * nb + k) * 2 + 1] !== 0) return false;
        return true;
      };
      for (const base of ["braco", "antebraco", "tricipital", "bicipital", "giroDoBraco"]) assert.ok(zerado(corpo, base), `${modelo}/${vista}: ${base} agiria no tronco`);
      for (const base of ["coxa", "panturrilha", "abdominal", "suprailiaca", "peitoral", "axilar", "subescapular", "coxaDobra", "panturrilhaDobra"])
        assert.ok(zerado(bracos, base), `${modelo}/${vista}: ${base} agiria no braço`);
    }
});

test("camada de gordura: no contorno, meia dobra × escala local; dobra maior com perímetro fixo engrossa a faixa e reduz o núcleo", async () => {
  for (const modelo of MODELOS) {
    const ler = (k) => lerPng(caminhoDaFonte(FONTES_TELA[modelo][k]));
    const mus = prepararCamada(modelo, "iso", "musculo", await ler("musculo"));
    const gor = prepararCamada(modelo, "iso", "gordura", await ler("gordura"));
    const gm = REGIOES[modelo].iso.gorduraDosMembros, neutro = PERIMETROS_NEUTROS[modelo];
    const casos = [
      ["braço", "bracos", "braco", gm.bracos[0], neutro.braco, (d) => ({ tricipital: d / 2, bicipital: d / 2 })],
      ["coxa", "corpo", "corpo", gm.pernas[1], neutro.coxa, (d) => ({ coxaDobra: d / 2 })],
      ["panturrilha", "corpo", "corpo", gm.panturrilhas[1], neutro.panturrilha, (d) => ({ panturrilhaDobra: d / 2 })],
    ];
    for (const [nome, chaveCampos, parte, [[sx, sy], [ex, ey], h], perimetro, coefDe] of casos) {
      const campos = gerarCampos(modelo, "iso")[chaveCampos];
      const px = (sx + ex) / 2, py = (sy + ey) / 2, comp = Math.hypot(ex - sx, ey - sy), nx = -(ey - sy) / comp, ny = (ex - sx) / comp;
      const extensao = (im, sinal) => {
        let s = 0;
        while (s < 3 * h) {
          const x = Math.round(px + nx * sinal * (s + 0.25)), y = Math.round(py + ny * sinal * (s + 0.25));
          if (im.dados[(y * 600 + x) * 4 + 3] <= 128) break;
          s += 0.25;
        }
        return s;
      };
      const escala = (2 * h) / ((perimetro * 10) / Math.PI);
      const contorno = deformar(gor[parte], campos, vetorDeCoeficientes({}, false), 600, 802);
      const medir = (dobra) => {
        const nucleo = deformar(mus[parte], campos, vetorDeCoeficientes(coefDe(dobra), true), 600, 802);
        const faixas = [-1, 1].map((s) => extensao(contorno, s) - extensao(nucleo, s)).filter((f) => f < 2.5 * h);
        return { faixa: Math.max(...faixas) / escala, nucleo: Math.min(extensao(nucleo, -1), extensao(nucleo, 1)) };
      };
      const a = medir(18), b = medir(36);
      assert.ok(a.faixa > 9 * 0.75 && a.faixa < 9 * 1.2, `${modelo} ${nome}: faixa ${a.faixa.toFixed(1)} mm para dobra de 18 mm (esperado ≈ 9)`);
      assert.ok(b.faixa / a.faixa > 1.7 && b.faixa / a.faixa < 2.3, `${modelo} ${nome}: dobra dobrada → faixa ×${(b.faixa / a.faixa).toFixed(2)}`);
      assert.ok(b.nucleo < a.nucleo, `${modelo} ${nome}: núcleo deve diminuir`);
    }
  }
});

test("limites visuais: faixa, coerência entre vizinhos e origem, sem tocar a medida clínica", () => {
  const neutro = PERIMETROS_NEUTROS.m;
  // sem dado: referência
  const vazio = aplicarLimitesVisuais("m", {});
  for (const r of PERIMETROS) {
    assert.equal(vazio.regioes[r].origem, "referencia");
    assert.equal(vazio.regioes[r].desenhado, neutro[r]);
  }
  // fora da faixa: limite aplicado, medida preservada
  const alto = aplicarLimitesVisuais("m", { cintura: 160 });
  assert.equal(alto.regioes.cintura.medido, 160);
  assert.ok(alto.regioes.cintura.limites.includes("faixa"));
  assert.ok(alto.regioes.cintura.desenhado <= 125);
  // zero, negativo e não numérico contam como ausentes
  for (const v of [0, -5, Number.NaN]) assert.equal(aplicarLimitesVisuais("m", { braco: v }).regioes.braco.medido, null);
  // vizinhos medidos no neutro: a cintura isolada é aproximada até o máximo representável
  const isolada = aplicarLimitesVisuais("m", { ...neutro, cintura: 125 });
  for (const [a, b, max] of VIZINHOS) assert.ok(Math.abs(isolada.coeficientes[a] - isolada.coeficientes[b]) <= max + 1e-6, `${a}–${b}`);
  assert.ok(isolada.regioes.cintura.limites.includes("coerencia"));
  assert.equal(isolada.regioes.cintura.medido, 125);
  // sem vizinhos medidos, eles são projetados e a medida quase não cede
  const solta = aplicarLimitesVisuais("m", { cintura: 120 });
  assert.equal(solta.regioes.abdomen.origem, "projetado");
  assert.ok(solta.regioes.cintura.desenhado >= 118);
  // determinístico
  assert.deepEqual(aplicarLimitesVisuais("f", { abdomen: 130, quadril: 82 }), aplicarLimitesVisuais("f", { abdomen: 130, quadril: 82 }));
});

test("na pele as dobras não deformam nada (só a isométrica tem núcleo)", () => {
  for (const modelo of MODELOS) {
    const { corpo, bracos } = gerarCampos(modelo, "pele");
    for (const base of BASES_DE_DOBRA) {
      const k = indice(base);
      for (const campos of [corpo, bracos])
        for (let p = 0; p < N; p++) assert.equal(campos.dados[(p * BASES.length + k) * 2], 0);
    }
  }
});

test("coeficientes: forma em todas as camadas, dobra só no núcleo; inválido vira zero", () => {
  const c = { cintura: Math.log(100 / 90), tricipital: 9, abdomen: Number.NaN, quadril: Infinity };
  const pele = vetorDeCoeficientes(c, false), nucleo = vetorDeCoeficientes(c, true);
  assert.ok(pele[indice("cintura")] > 0 && nucleo[indice("cintura")] > 0);
  assert.equal(pele[indice("tricipital")], 0);
  assert.equal(nucleo[indice("tricipital")], 9);
  assert.equal(nucleo[indice("abdomen")], 0);
  assert.equal(nucleo[indice("quadril")], 0);
});

// ---------------------------------------------------- malha sem dobras

const mascaras = new Map();
async function mascarasDaVista(modelo, vista) {
  const chave = modelo + vista;
  if (mascaras.has(chave)) return mascaras.get(chave);
  const im = await lerPng(caminhoDaFonte(FONTES_TELA[modelo][vista === "pele" ? "pele" : "musculo"]));
  const poligono = rasterizar(REGIOES[modelo][vista].protecaoBracos, 600, 802);
  const resultado = {};
  for (const parte of ["corpo", "bracos"]) {
    const base = new Uint8Array(600 * 802);
    for (let i = 0; i < base.length; i++) base[i] = im.dados[i * 4 + 3] > 10 && (parte === "bracos" ? poligono[i] : !poligono[i]) ? 1 : 0;
    const dilatada = new Uint8Array(base);
    for (let y = 0; y < 802; y++)
      for (let x = 0; x < 600; x++)
        if (base[y * 600 + x])
          for (let dy = -3; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const X = x + dx, Y = y + dy;
              if (X >= 0 && Y >= 0 && X < 600 && Y < 802) dilatada[Y * 600 + X] = 1;
            }
    resultado[parte] = dilatada;
  }
  mascaras.set(chave, resultado);
  return resultado;
}

/** Células da grade com jacobiano ≤ 0,02 (inversão ou quase) cujo centro cai no corpo daquela camada. */
function dobrasNoCorpo(campos, coef, mascara) {
  const gw = 101, nb = BASES.length, d = campos.dados, hx = 599 / 100, hy = 801 / 134;
  const F = (i, j, e) => {
    let s = 0;
    const p = j * gw + i;
    for (let b = 0; b < nb; b++) if (coef[b]) s += d[(p * nb + b) * 2 + e] * coef[b];
    return s;
  };
  let n = 0;
  for (let j = 0; j < 134; j++)
    for (let i = 0; i < 100; i++) {
      const a = 1 + (F(i + 1, j, 0) - F(i, j, 0)) / hx, b = (F(i, j + 1, 0) - F(i, j, 0)) / hy;
      const c = (F(i + 1, j, 1) - F(i, j, 1)) / hx, e = 1 + (F(i, j + 1, 1) - F(i, j, 1)) / hy;
      if (a * e - b * c > 0.02) continue;
      if (mascara[Math.round((j + 0.5) * hy) * 600 + Math.round((i + 0.5) * hx)]) n++;
    }
  return n;
}

test("a malha não dobra dentro do corpo: cada medida isolada, combinações diferentes e extremos", async () => {
  const perfis = {
    m: [{ torax: 110, cintura: 118, abdomen: 122, quadril: 112, coxa: 62, braco: 36, antebraco: 31 }, { deltoide: 130, torax: 108, cintura: 82, braco: 40, antebraco: 32, coxa: 64, panturrilha: 40 }, { deltoide: 135, braco: 26 }],
    f: [{ torax: 92, cintura: 78, abdomen: 92, quadril: 120, coxa: 68, panturrilha: 40 }, { torax: 80, cintura: 62, abdomen: 70, quadril: 88, coxa: 48, braco: 24, antebraco: 21, panturrilha: 31 }, { cintura: 110 }],
  };
  for (const modelo of MODELOS)
    for (const vista of VISTAS) {
      const campos = gerarCampos(modelo, vista), m = await mascarasDaVista(modelo, vista);
      const faixas = FAIXAS_DE_PERIMETRO[modelo], neutro = PERIMETROS_NEUTROS[modelo];
      const conferir = (medidas, dobras, rotulo) => {
        const c = { ...aplicarLimitesVisuais(modelo, medidas).coeficientes, ...dobras };
        for (const parte of ["corpo", "bracos"]) {
          const coef = aplicarGiro(campos[parte], vetorDeCoeficientes(c, true));
          const n = dobrasNoCorpo(campos[parte], coef, m[parte]);
          assert.equal(n, 0, `${modelo}/${vista}/${parte} ${rotulo}: ${n} células dobradas`);
        }
      };
      for (const [k, [min, max]] of Object.entries(faixas))
        for (const v of [min, max]) {
          conferir({ [k]: v }, {}, `${k}=${v} (vizinhos ausentes)`);
          conferir({ ...neutro, [k]: v }, {}, `${k}=${v} (vizinhos no neutro)`);
        }
      for (const base of BASES_DE_DOBRA) conferir({}, { [base]: FAIXA_DE_DOBRA[1] / 2 }, `${base} máxima`);
      perfis[modelo].forEach((perfil, i) => conferir(perfil, {}, `perfil ${i + 1}`));
      for (const q of [0, 1]) {
        const medidas = {}, dobras = {};
        for (const [k, f] of Object.entries(faixas)) medidas[k] = f[q];
        for (const base of BASES_DE_DOBRA) dobras[base] = FAIXA_DE_DOBRA[q] / 2;
        conferir(medidas, dobras, q ? "tudo no máximo" : "tudo no mínimo");
      }
    }
});

// ------------------------------------------------- camadas e composição

async function camadas(modelo) {
  const ler = (k) => lerPng(caminhoDaFonte(FONTES_TELA[modelo][k]));
  return {
    pele: prepararCamada(modelo, "pele", "pele", await ler("pele")),
    musculo: prepararCamada(modelo, "iso", "musculo", await ler("musculo")),
    gordura: prepararCamada(modelo, "iso", "gordura", await ler("gordura")),
  };
}

const alfa = (im, x, y) => im.dados[(y * im.largura + x) * 4 + 3];

test("recorte feminino: some só o trecho junto ao abdômen, nas duas camadas", async () => {
  for (const k of ["musculo", "gordura"]) {
    const fonte = await lerPng(caminhoDaFonte(FONTES_TELA.f[k]));
    const recortada = recortarCamada("f", "iso", k, fonte);
    assert.ok(alfa(fonte, 228, 300) > 0, "o trecho existe na fonte");
    assert.equal(alfa(recortada, 228, 300), 0, `${k}: trecho junto ao abdômen removido`);
    // braço esquerdo completo, à direita da imagem (ombro, braço, mão)
    for (const [x, y] of [[360, 160], [385, 250], [390, 330], [385, 400]]) assert.equal(alfa(recortada, x, y), alfa(fonte, x, y));
  }
  const masc = await lerPng(caminhoDaFonte(FONTES_TELA.m.musculo));
  assert.equal(recortarCamada("m", "iso", "musculo", masc), masc, "masculino não recorta");
});

test("separar braço e corpo não altera a imagem sem deformação", async () => {
  for (const modelo of MODELOS) {
    const c = await camadas(modelo);
    const fonte = await lerPng(caminhoDaFonte(FONTES_TELA[modelo].pele));
    const final = comporVista({ vista: "pele", camadas: { pele: c.pele }, campos: gerarCampos(modelo, "pele"), coeficientes: {}, transparencia: 85, largura: 600, altura: 802 });
    // fundo + corpo + braço = fundo + fonte, pixel a pixel (tolerância: arredondamento
    // e o complemento do tronco sob pixels do braço com alfa 250 a 254)
    const ref = comporVista({ vista: "pele", camadas: { pele: { corpo: fonte, braco: novaImagem(600, 802) } }, campos: gerarCampos(modelo, "pele"), coeficientes: {}, transparencia: 85, largura: 600, altura: 802 });
    let maior = 0;
    for (let i = 0; i < final.dados.length; i++) maior = Math.max(maior, Math.abs(final.dados[i] - ref.dados[i]));
    assert.ok(maior <= 6, `${modelo}: diferença máxima ${maior}`);
  }
});

test("fundo #20343A incorporado; transparência não muda a geometria; olhos e lábios sem gordura", async () => {
  const c = await camadas("m");
  const campos = gerarCampos("m", "iso");
  const compor = (t) => comporVista({ vista: "iso", camadas: { musculo: c.musculo, gordura: c.gordura }, campos, coeficientes: {}, transparencia: t, largura: 600, altura: 802 });
  const opaca = compor(0), invisivel = compor(100), padrao = compor(85);
  const [r, g, b] = [0x20, 0x34, 0x3a];
  for (const im of [opaca, invisivel, padrao]) assert.deepEqual([...im.dados.slice(0, 4)], [r, g, b, 255]);
  assert.equal(FUNDO.toLowerCase(), "#20343a");
  // transparência 100% = só músculo
  const soMusculo = comporVista({ vista: "iso", camadas: { musculo: c.musculo, gordura: { corpo: novaImagem(600, 802), braco: novaImagem(600, 802) } }, campos, coeficientes: {}, transparencia: 0, largura: 600, altura: 802 });
  assert.deepEqual(invisivel.dados, soMusculo.dados);
  // olhos e lábios: buracos na gordura mostram o músculo mesmo com gordura opaca
  const gord = await lerPng(caminhoDaFonte(FONTES_TELA.m.gordura)), musc = await lerPng(caminhoDaFonte(FONTES_TELA.m.musculo));
  let conferidos = 0;
  for (let y = 0; y < 802 * 0.16; y++)
    for (let x = 0; x < 600; x++)
      if (alfa(gord, x, y) === 0 && alfa(musc, x, y) === 255) {
        const i = (y * 600 + x) * 4;
        assert.deepEqual([...opaca.dados.slice(i, i + 3)], [...invisivel.dados.slice(i, i + 3)], `olho/lábio em (${x}, ${y})`);
        assert.notDeepEqual([...opaca.dados.slice(i, i + 3)], [r, g, b], "sem cavidade escura");
        conferidos++;
      }
  assert.ok(conferidos > 50, `${conferidos} pixels de olhos e lábios`);
});

test("mesmos dados, mesma imagem (determinismo)", async () => {
  const c = await camadas("f");
  const coef = { cintura: Math.log(90 / 75), torax: Math.log(100 / 90), abdominal: 12, peitoral: 8, panturrilha: 9 };
  const compor = () => comporVista({ vista: "iso", camadas: { musculo: c.musculo, gordura: c.gordura }, campos: gerarCampos("f", "iso"), coeficientes: coef, transparencia: 49, largura: 450, altura: 600 });
  assert.deepEqual(compor().dados, compor().dados);
});

test("deformar com coeficientes nulos devolve a camada", async () => {
  const fonte = await lerPng(caminhoDaFonte(FONTES_TELA.m.pele));
  const saida = deformar(fonte, gerarCampos("m", "pele").corpo, new Float64Array(BASES.length), 600, 802);
  assert.deepEqual(saida.dados, fonte.dados);
});

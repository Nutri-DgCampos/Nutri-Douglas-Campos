// Testes numéricos do cálculo nutricional central.
// Rodar: node --test tests/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arredondarSubstituicao,
  nomeDaMedida,
  nutrienteDaPorcao,
  paraUnidadeBase,
  quantidadeDasMedidas,
  quantidadeEquivalente,
  somar,
  totalDoNutriente,
  formatarNutriente,
} from "../lib/nutricao/calculo.ts";

// Arroz integral cozido (TACO 1) e feijão carioca cozido (TACO 561), por 100 g.
// O colesterol 0 do feijão é ilustrativo (zero real), para o teste.
const arroz = {
  kcal: { valor: 124, traco: false },
  proteinas: { valor: 2.6, traco: false },
  carboidratos: { valor: 25.8, traco: false },
  lipidios: { valor: 1.0, traco: false },
  riboflavina: { valor: null, traco: true },
};
const feijao = {
  kcal: { valor: 76, traco: false },
  proteinas: { valor: 4.8, traco: false },
  carboidratos: { valor: 13.6, traco: false },
  colesterol: { valor: 0, traco: false },
};

test("porção proporcional a 100 g", () => {
  assert.deepEqual(nutrienteDaPorcao(arroz, "kcal", 150), { situacao: "valor", valor: 186 });
  assert.deepEqual(nutrienteDaPorcao(arroz, "proteinas", 50), { situacao: "valor", valor: 1.3 });
});

test("ausente não vira zero; traço é indisponível; zero real continua zero", () => {
  assert.deepEqual(nutrienteDaPorcao(arroz, "colesterol", 100), { situacao: "indisponivel" });
  assert.deepEqual(nutrienteDaPorcao(arroz, "riboflavina", 100), { situacao: "traco" });
  assert.deepEqual(nutrienteDaPorcao(feijao, "colesterol", 100), { situacao: "valor", valor: 0 });
});

test("total completo e total parcial", () => {
  const itens = [
    { composicao: arroz, quantidade: 100 },
    { composicao: feijao, quantidade: 70 },
  ];
  const kcal = totalDoNutriente(itens, "kcal");
  assert.equal(Math.round(kcal.valor * 10) / 10, 177.2);
  assert.equal(kcal.completo, true);

  const lipidios = totalDoNutriente(itens, "lipidios");
  assert.equal(lipidios.valor, 1);
  assert.equal(lipidios.completo, false);
  assert.equal(lipidios.conhecidos, 1);

  assert.deepEqual(somar([]), { valor: null, completo: false, conhecidos: 0, itens: 0 });
});

test("medidas caseiras: 2 colheres de 25 g = 50 g", () => {
  assert.equal(quantidadeDasMedidas(2, 25), 50);
  assert.equal(quantidadeDasMedidas(0.5, 240), 120);
  assert.equal(quantidadeDasMedidas(0, 25), null);
});

test("mL e g só convertem com densidade", () => {
  const leite = { unidade_base: "g", densidade_g_ml: 1.03 };
  assert.equal(paraUnidadeBase(200, "ml", leite), 206);
  assert.equal(paraUnidadeBase(200, "ml", { unidade_base: "g", densidade_g_ml: null }), null);
  assert.equal(paraUnidadeBase(200, "g", leite), 200);
});

test("singular e plural das medidas", () => {
  assert.equal(nomeDaMedida(1, "fatia", "fatias"), "fatia");
  assert.equal(nomeDaMedida(0.5, "xícara", "xícaras"), "xícara");
  assert.equal(nomeDaMedida(1.5, "xícara", "xícaras"), "xícaras");
});

test("arredondamento de substituição: 1 g abaixo de 20 g, 10 g a partir de 20 g", () => {
  assert.equal(arredondarSubstituicao(12.4), 12);
  assert.equal(arredondarSubstituicao(19.6), 20);
  assert.equal(arredondarSubstituicao(24), 20);
  assert.equal(arredondarSubstituicao(163.2), 160);
  assert.equal(arredondarSubstituicao(165), 170);
  assert.equal(arredondarSubstituicao(0.3), 1);
  assert.equal(arredondarSubstituicao(0), null);
});

test("equivalência energética: 100 g de arroz (124 kcal) = 160 g de feijão (76 kcal/100 g)", () => {
  // 124 kcal ÷ 0,76 kcal/g = 163,2 g → 160 g
  assert.equal(quantidadeEquivalente(arroz, 100, feijao), 160);
  assert.equal(quantidadeEquivalente(arroz, 100, { proteinas: { valor: 3, traco: false } }), null);
});

test("exibição: kcal sem decimais, macros com 1 casa", () => {
  assert.equal(formatarNutriente("kcal", 186.6), "187");
  assert.equal(formatarNutriente("proteinas", 37.54), "37,5");
  assert.equal(formatarNutriente("tiamina", 0.084), "0,08");
});

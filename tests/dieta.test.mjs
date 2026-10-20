// Testes numéricos da dieta do editor (totais, painel, quantidades).
// Rodar: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  documentoVazio,
  hidratacaoDiaria,
  indicadoresDoPainel,
  novaOpcao,
  novaRefeicao,
  novoItem,
  pendenciasDoEnvio,
  quantidadeDoItem,
  textoDaQuantidade,
  totaisDaDieta,
  validarDocumento,
} from "../lib/nutricao/dieta.ts";

const ARROZ = "11111111-1111-4111-8111-111111111111";
const FRANGO = "22222222-2222-4222-8222-222222222222";
const PAO = "33333333-3333-4333-8333-333333333333";
const LEITE = "44444444-4444-4444-8444-444444444444";

const v = (valor) => ({ valor, traco: false });

// Composições por 100 g (ilustrativas, números redondos para conferir à mão).
const composicoes = {
  [ARROZ]: { kcal: v(130), carboidratos: v(28), proteinas: v(2.5), lipidios: v(0.2), fibras: v(1.6) },
  [FRANGO]: { kcal: v(160), carboidratos: v(0), proteinas: v(32), lipidios: v(2.5) }, // sem fibra: dado ausente
  [PAO]: { kcal: v(250), carboidratos: v(48), proteinas: v(9), lipidios: v(3), fibras: v(6) },
  [LEITE]: { kcal: v(60), carboidratos: v(4.5), proteinas: v(3), lipidios: v(3.2) },
};

const colherDeServir = { id: "55555555-5555-4555-8555-555555555555", singular: "colher de servir", plural: "colheres de servir", quantidade: 50 };
const file = { id: "66666666-6666-4666-8666-666666666666", singular: "filé médio", plural: "filés médios", quantidade: 120 };

function item(alimentoId, campos) {
  return { ...novoItem(), alimentoId, nomeOriginal: "x", unidade: "g", ...campos };
}

test("quantidade efetiva: medida × número, ajuste manual prevalece", () => {
  assert.deepEqual(quantidadeDoItem({ medida: colherDeServir, numeroMedidas: 2, quantidadeAjustada: null }), {
    calculada: 100,
    efetiva: 100,
    ajustada: false,
  });
  assert.deepEqual(quantidadeDoItem({ medida: colherDeServir, numeroMedidas: 2, quantidadeAjustada: 110 }), {
    calculada: 100,
    efetiva: 110,
    ajustada: true,
  });
  // Sem medida cadastrada: quantidade direto em gramas.
  assert.equal(quantidadeDoItem({ medida: null, numeroMedidas: null, quantidadeAjustada: 80 }).efetiva, 80);
  assert.equal(quantidadeDoItem({ medida: colherDeServir, numeroMedidas: null, quantidadeAjustada: null }).efetiva, null);
});

test("texto da quantidade na prescrição", () => {
  assert.equal(textoDaQuantidade({ medida: colherDeServir, numeroMedidas: 2, quantidadeAjustada: null, unidade: "g" }), "2 colheres de servir (100 g)");
  assert.equal(textoDaQuantidade({ medida: colherDeServir, numeroMedidas: 1, quantidadeAjustada: null, unidade: "g" }), "1 colher de servir (50 g)");
  assert.equal(textoDaQuantidade({ medida: colherDeServir, numeroMedidas: 2, quantidadeAjustada: 110, unidade: "g" }), "110 g (aprox. 2 colheres de servir)");
  assert.equal(textoDaQuantidade({ medida: null, numeroMedidas: null, quantidadeAjustada: 200, unidade: "ml" }), "200 mL");
  assert.equal(textoDaQuantidade({ medida: file, numeroMedidas: 1.5, quantidadeAjustada: null, unidade: "g" }), "1,5 filés médios (180 g)");
});

// Aceite da fase: totais iguais à soma só das opções de referência.
test("totais da dieta usam só a opção de referência de cada refeição", () => {
  const doc = documentoVazio("Dias com treino");

  const almoco = novaRefeicao("Almoço");
  almoco.opcoes[0].itens.push(
    item(ARROZ, { medida: colherDeServir, numeroMedidas: 2 }), // 100 g
    item(FRANGO, { medida: file, numeroMedidas: 1 }) // 120 g
  );
  const alternativa = novaOpcao();
  alternativa.itens.push(item(PAO, { quantidadeAjustada: 100 }));
  almoco.opcoes.push(alternativa);

  const lanche = novaRefeicao("Lanche");
  lanche.opcoes[0].itens.push(item(PAO, { quantidadeAjustada: 50 }));
  const outraOpcao = novaOpcao();
  outraOpcao.itens.push(item(LEITE, { quantidadeAjustada: 200 }));
  lanche.opcoes.push(outraOpcao);
  lanche.opcaoReferencia = outraOpcao.id; // a referência é a 2ª opção

  doc.refeicoes.push(almoco, lanche);

  const totais = totaisDaDieta(doc, composicoes, ["kcal", "proteinas", "fibras"]);

  // Almoço (op. 1): arroz 100 g = 130 kcal; frango 120 g = 192 kcal. Lanche (op. 2): leite 200 g = 120 kcal.
  assert.equal(totais.kcal.valor, 130 + 192 + 120);
  assert.equal(totais.kcal.completo, true);
  assert.ok(Math.abs(totais.proteinas.valor - (2.5 + 38.4 + 6)) < 1e-9);
  // Fibra: o frango e o leite não têm o dado → total parcial, só com o arroz.
  assert.equal(totais.fibras.valor, 1.6);
  assert.equal(totais.fibras.completo, false);
});

test("painel: percentual energético, por kg e kcal não proteica/gN", () => {
  // 2.000 kcal, 100 g de proteína, 250 g de carboidrato, 60 g de lipídio; 80 kg.
  const totais = {
    kcal: { valor: 2000, completo: true, conhecidos: 1, itens: 1 },
    proteinas: { valor: 100, completo: true, conhecidos: 1, itens: 1 },
    carboidratos: { valor: 250, completo: true, conhecidos: 1, itens: 1 },
    lipidios: { valor: 60, completo: true, conhecidos: 1, itens: 1 },
  };
  const p = indicadoresDoPainel(totais, 80);

  assert.equal(p.macros.proteinas.percentual.valor, 20); // 100 × 4 ÷ 2000
  assert.equal(p.macros.carboidratos.percentual.valor, 50); // 250 × 4 ÷ 2000
  assert.equal(p.macros.lipidios.percentual.valor, 27); // 60 × 9 ÷ 2000
  assert.equal(p.kcalPorKg.valor, 25);
  assert.equal(p.macros.proteinas.porKg.valor, 1.25);
  // Exemplo aprovado (M-06): (2000 − 400) ÷ (100 ÷ 6,25) = 100:1.
  assert.equal(p.kcalNaoProteicaPorGN.valor, 100);
  // Fibra sem nenhum dado: indisponível, nunca zero.
  assert.equal(p.fibras.valor, null);

  // Sem peso de referência: nada por kg.
  assert.equal(indicadoresDoPainel(totais, null).kcalPorKg.valor, null);
});

test("hidratação: mL/kg × peso", () => {
  assert.equal(hidratacaoDiaria(50, 50), 2500);
  assert.equal(hidratacaoDiaria(50, 100), 5000);
  assert.equal(hidratacaoDiaria(null, 80), null);
  assert.equal(hidratacaoDiaria(35, null), null);
});

test("validação recusa formato inválido e corrige a opção de referência", () => {
  assert.ok("erro" in validarDocumento(null));
  assert.ok("erro" in validarDocumento({ ...documentoVazio(), refeicoes: [{ ...novaRefeicao("A"), horario: "25:00" }] }));
  assert.ok("erro" in validarDocumento({ ...documentoVazio(), refeicoes: [{ ...novaRefeicao("A"), opcoes: [] }] }));

  const refeicao = novaRefeicao("Café");
  refeicao.opcaoReferencia = "77777777-7777-4777-8777-777777777777"; // não existe
  const resultado = validarDocumento({ ...documentoVazio(), refeicoes: [refeicao] });
  assert.ok("documento" in resultado);
  assert.equal(resultado.documento.refeicoes[0].opcaoReferencia, refeicao.opcoes[0].id);

  // Quantidade zero ou negativa não é aceita.
  const comZero = novaRefeicao("Café");
  comZero.opcoes[0].itens.push({ ...novoItem(), quantidadeAjustada: 0 });
  assert.ok("erro" in validarDocumento({ ...documentoVazio(), refeicoes: [comZero] }));
});

test("pendências do envio", () => {
  const doc = documentoVazio("Dieta");
  assert.deepEqual(pendenciasDoEnvio(doc), ["A dieta não tem refeições."]);

  const refeicao = novaRefeicao("");
  refeicao.opcoes[0].itens.push(novoItem(), item(ARROZ, { nomeOriginal: "Arroz" }));
  doc.refeicoes.push(refeicao);

  assert.deepEqual(pendenciasDoEnvio(doc), [
    "Refeição 1 está sem nome.",
    "Refeição 1: a linha 1 está sem alimento.",
    "Refeição 1: Arroz está sem quantidade.",
  ]);
});

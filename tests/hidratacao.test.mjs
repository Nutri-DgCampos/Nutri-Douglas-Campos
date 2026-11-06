import { test } from "node:test";
import assert from "node:assert/strict";
import {
  copiarDocumento,
  documentoTemConteudo,
  documentoVazio,
  hidratacaoDiaria,
  ORIENTACAO_HIDRATACAO_PADRAO,
  validarDocumento,
} from "../lib/nutricao/dieta.ts";

// Hidratação (SPEC complementar 06/11, item 4).
const TEXTO =
  "A hidratação deve ser mantida de forma constante durante o dia. Evite permanecer muitas horas sem ingerir líquidos e, posteriormente, consumir grandes quantidades de água de uma só vez. Isso favorece uma melhor absorção e utilização dos líquidos pelo organismo.";

test("dieta nova já vem com a orientação exata e sem ml/kg padrão", () => {
  const d = documentoVazio();
  assert.equal(ORIENTACAO_HIDRATACAO_PADRAO, TEXTO);
  assert.equal(d.hidratacao.observacoes, TEXTO);
  assert.equal(d.hidratacao.mlPorKg, null, "40 ml/kg da imagem é só exemplo");
});

test("a orientação padrão sozinha não conta como conteúdo da dieta", () => {
  assert.equal(documentoTemConteudo(documentoVazio()), false);
  const editada = documentoVazio();
  editada.hidratacao.observacoes = "Beba água ao acordar.";
  assert.equal(documentoTemConteudo(editada), true);
});

test("cópia preserva a orientação da origem, inclusive vazia; rotina usa o padrão", () => {
  const vazia = { ...documentoVazio(), hidratacao: { mlPorKg: 35, observacoes: "" } };
  assert.deepEqual(copiarDocumento(vazia).hidratacao, { mlPorKg: 35, observacoes: "" });
  const propria = { ...documentoVazio(), hidratacao: { mlPorKg: 40, observacoes: "Texto próprio" } };
  assert.equal(copiarDocumento(propria).hidratacao.observacoes, "Texto próprio");
  assert.equal(copiarDocumento(propria, "rotina").hidratacao.observacoes, TEXTO);
});

test("vazio salvo de propósito continua vazio; ml/kg e texto são independentes", () => {
  const d = documentoVazio();
  d.hidratacao.observacoes = "";
  const salvo = validarDocumento(JSON.parse(JSON.stringify(d))).documento;
  assert.equal(salvo.hidratacao.observacoes, "");
  d.hidratacao.observacoes = TEXTO;
  d.hidratacao.mlPorKg = 35;
  const outro = validarDocumento(JSON.parse(JSON.stringify(d))).documento;
  assert.equal(outro.hidratacao.observacoes, TEXTO);
  assert.equal(outro.hidratacao.mlPorKg, 35);
});

test("recálculo: 61 kg × 40 = 2440 ml; × 35 = 2135 ml", () => {
  assert.equal(hidratacaoDiaria(40, 61), 2440);
  assert.equal(hidratacaoDiaria(35, 61), 2135);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { conferirMedida, lerDecimal } from "../lib/relatorios/medidas.ts";

test("aceita vírgula ou ponto; vazio é null; separador de milhar é inválido", () => {
  assert.equal(lerDecimal("76,5"), 76.5);
  assert.equal(lerDecimal("76.5"), 76.5);
  assert.equal(lerDecimal(" 80 "), 80);
  assert.equal(lerDecimal(""), null);
  assert.equal(lerDecimal("76.500,0"), undefined);
  assert.equal(lerDecimal("abc"), undefined);
});

test("peso 76500 (o caso de 04/11) é recusado com a explicação; 76,5 passa", () => {
  assert.match(conferirMedida("peso", "76500").erro, /Confira o peso/);
  assert.deepEqual(conferirMedida("peso", "76,5"), { valor: 76.5 });
  assert.deepEqual(conferirMedida("peso", ""), { valor: null });
});

test("água em mililitros e sono acima de 24 h são recusados", () => {
  assert.match(conferirMedida("agua", "2500").erro, /Confira a água/);
  assert.deepEqual(conferirMedida("agua", "2,5"), { valor: 2.5 });
  assert.match(conferirMedida("sono", "30").erro, /horas de sono/);
  assert.deepEqual(conferirMedida("sono", "7,5"), { valor: 7.5 });
});

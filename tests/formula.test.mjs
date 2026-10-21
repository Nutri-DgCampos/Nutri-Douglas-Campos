import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularDispensacao, copiarFormula, formulaVazia, novoComponente, pendenciasDaFormula, textoDaDosagem, validarFormula } from "../lib/nutricao/formula.ts";

test("6.2: 300 mg por cápsula, 2 cápsulas por dose, 2 doses/dia, 30 dias = 120 cápsulas e 36.000 mg", () => {
  const f = formulaVazia("Teste");
  f.componentes = [{ ...novoComponente("Magnésio"), quantidade: 300, unidade: "mg", base: "unidade" }];
  f.dispensacao = { unidadesPorDose: 2, dosesPorDia: 2, dias: 30 };
  const d = calcularDispensacao(f);
  assert.equal(d.totalDeUnidades, 120);
  assert.equal(d.componentes[0].porDose, 600);
  assert.equal(d.componentes[0].total, 36000);
  assert.deepEqual(d.faltando, []);
});

test("componente por dose e falta de dado (6.1)", () => {
  const f = formulaVazia("Sachê");
  f.componentes = [{ ...novoComponente("Creatina"), quantidade: 3, unidade: "g", base: "dose" }];
  f.dispensacao = { unidadesPorDose: null, dosesPorDia: 1, dias: 30 };
  const d = calcularDispensacao(f);
  assert.equal(d.componentes[0].total, 90);
  assert.equal(d.totalDeUnidades, null);
  assert.deepEqual(d.faltando, []); // não há componente por unidade

  f.dispensacao = { unidadesPorDose: null, dosesPorDia: null, dias: null };
  assert.equal(calcularDispensacao(f).componentes[0].total, null);
  assert.deepEqual(calcularDispensacao(f).faltando, ["doses por dia", "dias de tratamento"]);
});

test("pendências, texto da dosagem e cópia sem dados do paciente", () => {
  const f = formulaVazia("");
  f.componentes = [{ ...novoComponente("Biotina"), quantidade: null, unidade: "mg" }];
  f.observacao = "Paciente com gastrite";
  assert.deepEqual(pendenciasDaFormula(f), ["Informe o nome da fórmula.", "Biotina: informe a dosagem e a unidade."]);
  assert.equal(textoDaDosagem({ ...novoComponente("Vit D"), quantidade: 2000, unidade: "UI" }), "2.000UI");
  const copia = copiarFormula(f, true);
  assert.equal(copia.observacao, "");
  assert.notEqual(copia.componentes[0].id, f.componentes[0].id);
  assert.ok("erro" in validarFormula({ componentes: [{ id: "x" }] }));
});

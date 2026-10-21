import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularSemana, formatar, medicacaoVazia, resumoEmTexto, textoDaConcentracao, validarMedicacao } from "../lib/nutricao/medicacao.ts";

function med(alterar) {
  const m = medicacaoVazia("Teste");
  alterar(m);
  return m;
}

test("5.1: 200 mg/mL × 2 mL = 400 mg (por administração, numa semana de um dia)", () => {
  const m = med((m) => {
    m.concentracao = 200;
    m.unidadeAtivo = "mg";
    m.unidadeQuantidade = "mL";
    m.semana.seg = { quantidade: 2, vezes: null };
  });
  const c = calcularSemana(m);
  assert.equal(c.fisicoSemanal, 2);
  assert.equal(c.ativoSemanal, 400);
  assert.equal(textoDaConcentracao(m), "200 mg/mL");
});

test("5.2: soma dia a dia, com vezes no dia e doses diferentes (exemplo da figura: seg e qua 1 mL de 200 mg/mL = 400 mg)", () => {
  const figura = med((m) => {
    m.concentracao = 200;
    m.unidadeAtivo = "mg";
    m.unidadeQuantidade = "mL";
    m.semana.seg = { quantidade: 1, vezes: null };
    m.semana.qua = { quantidade: 1, vezes: null };
  });
  assert.equal(calcularSemana(figura).ativoSemanal, 400);
  const varias = med((m) => {
    m.concentracao = 10;
    m.unidadeAtivo = "mg";
    m.unidadeQuantidade = "comprimido";
    m.semana.dom = { quantidade: 1, vezes: 2 };
    m.semana.ter = { quantidade: 0.5, vezes: 3 };
  });
  const c = calcularSemana(varias);
  assert.equal(c.fisicoSemanal, 3.5);
  assert.equal(c.ativoSemanal, 35);
  assert.equal(c.unidadeFisica, "comprimido");
});

test("5.3: sem conversão; quantidade em UI já é o princípio; falta de dado não vira zero", () => {
  const ui = med((m) => {
    m.unidadeQuantidade = "UI";
    m.semana.seg = { quantidade: 2000, vezes: null };
    m.semana.sex = { quantidade: 2000, vezes: null };
  });
  const c = calcularSemana(ui);
  assert.equal(c.ativoSemanal, 4000);
  assert.equal(c.unidadeAtivo, "UI");

  const semConcentracao = med((m) => {
    m.unidadeQuantidade = "mL";
    m.semana.seg = { quantidade: 1, vezes: null };
  });
  const s = calcularSemana(semConcentracao);
  assert.equal(s.fisicoSemanal, 1);
  assert.equal(s.ativoSemanal, null);
  assert.match(s.faltando[0], /concentração/);

  const vazio = calcularSemana(medicacaoVazia("x"));
  assert.equal(vazio.fisicoSemanal, null);
  assert.equal(vazio.faltando.length, 2);
});

test("5.5: arredonda em 2 casas, sem zeros à direita; validação recusa negativos", () => {
  assert.equal(formatar(1 / 3), "0,33");
  assert.equal(formatar(2.5), "2,5");
  const v = validarMedicacao({ ...medicacaoVazia("x"), concentracao: -5, semana: { seg: { quantidade: -1, vezes: 2 } } });
  assert.ok("valor" in v);
  assert.equal(v.valor.concentracao, null);
  assert.equal(v.valor.semana.seg.quantidade, null);
});

test("resumo copiado traz o aviso obrigatório", () => {
  const texto = resumoEmTexto({ paciente: "Fulana", data: "21/10/2026", profissional: "", medicacoes: [], anotacoes: "" });
  assert.match(texto, /não constitui receita médica/);
});

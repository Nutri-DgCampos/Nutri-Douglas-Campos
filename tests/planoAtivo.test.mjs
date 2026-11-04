import { test } from "node:test";
import assert from "node:assert/strict";
import { relatorioAbertoHoje, relatorioParaLiberar, segundasPrevistas } from "../lib/cronograma.ts";

// Correção do plano com o ciclo ativo (SPEC Plano Ativo, Opção B; S11 e S12).
// Ciclo que começou na segunda 05/10/2026 e termina em 07/11 (início + 33).
const ciclo = (frequencia, extra = {}) => ({ start_date: "2026-10-05", end_date: "2026-11-07", followup_frequency: frequencia, ...extra });
const nada = new Set();

test("calendário semanal do ciclo: segundas 12/10, 19/10, 26/10 e 02/11", () => {
  assert.deepEqual(segundasPrevistas(ciclo("Semanal")).map((p) => p.segunda), ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"]);
});

test("CA-01, CA-12 e CA-14: na quarta, três semanas vencidas, libera só a mais recente", () => {
  const r = relatorioParaLiberar(ciclo("Semanal"), 0, "2026-10-28", nada);
  assert.deepEqual(r, { numero: 3, segunda: "2026-10-26", modo: "liberacao" });
});

test("CA-02: antes do primeiro vencimento não libera nada", () => {
  assert.equal(relatorioParaLiberar(ciclo("Semanal"), 0, "2026-10-09", nada), null);
});

test("CA-11: a mais recente já respondida, nada é liberado (nem a anterior)", () => {
  assert.equal(relatorioParaLiberar(ciclo("Semanal"), 0, "2026-10-28", new Set(["2026-10-26"])), null);
});

test("S12: na segunda ou na terça da semana prevista, usa a janela normal", () => {
  assert.equal(relatorioParaLiberar(ciclo("Semanal"), 0, "2026-10-26", nada).modo, "janela");
  assert.equal(relatorioParaLiberar(ciclo("Semanal"), 0, "2026-10-27", nada).modo, "janela");
  assert.equal(relatorioParaLiberar(ciclo("Semanal"), 0, "2026-10-25", nada).segunda, "2026-10-19", "domingo: ainda é a semana anterior");
});

test("CA-03: semanal para mensal; o mensal só vence ao completar 4 semanas", () => {
  assert.equal(relatorioParaLiberar(ciclo("Mensal"), 0, "2026-10-28", nada), null);
  assert.deepEqual(relatorioParaLiberar(ciclo("Mensal"), 0, "2026-11-04", nada), { numero: 1, segunda: "2026-11-02", modo: "liberacao" });
});

test("CA-08: fora das datas do ciclo não libera", () => {
  assert.equal(relatorioParaLiberar(ciclo("Semanal"), 0, "2026-11-08", nada), null);
});

test("cadastro retroativo: não libera semana anterior ao cadastro", () => {
  // Quinzenal: vence em 19/10 e 02/11. Cadastro em 28/10: a de 19/10 é anterior.
  const retro = ciclo("Quinzenal", { retroactive_registered_at: "2026-10-28" });
  assert.equal(relatorioParaLiberar(retro, 0, "2026-10-29", nada), null);
  assert.equal(relatorioParaLiberar(ciclo("Quinzenal"), 0, "2026-10-29", nada)?.segunda, "2026-10-19", "sem cadastro retroativo, libera");
});

test("S11: a semana liberada abre só no dia da correção, depois volta a regra normal", () => {
  const previstos = segundasPrevistas(ciclo("Semanal"));
  const liberacao = { relatorio_liberado_semana: "2026-10-26", relatorio_liberado_ate: "2026-10-28" };
  assert.equal(relatorioAbertoHoje(previstos, "2026-10-28", nada, null, liberacao)?.numero, 3);
  assert.equal(relatorioAbertoHoje(previstos, "2026-10-29", nada, null, liberacao), null);
  assert.equal(relatorioAbertoHoje(previstos, "2026-10-28", new Set(["2026-10-26"]), null, liberacao), null, "já respondido");
  assert.equal(relatorioAbertoHoje(previstos, "2026-10-28", nada), null, "sem liberação, quarta não abre");
});

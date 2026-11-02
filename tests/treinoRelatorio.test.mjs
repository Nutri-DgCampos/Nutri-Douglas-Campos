import { test } from "node:test";
import assert from "node:assert/strict";
import { adesaoDaSemana, causasDeAtencao, contarSemana, diferencaDeCarga } from "../lib/treinoRelatorio.ts";

const s = (...situacoes) => situacoes.map((situacao) => ({ situacao }));

test("adesão: parcial vale meia sessão; reagendado sem confirmação fica fora da conta (B4)", () => {
  const c = contarSemana(s("concluido", "parcial", "nao_concluido", "reagendado", "sem_registro"));
  assert.equal(c.planejadas, 4);
  assert.equal(c.feitas, 1.5);
  assert.equal(c.reagendadas, 1);
  assert.equal(c.sem_registro, 1);
  assert.equal(adesaoDaSemana(c, true), 37.5);
});

test("semana sem registros não tem adesão (não é zero)", () => {
  const c = contarSemana(s("sem_registro", "sem_registro", "sem_registro"));
  assert.equal(adesaoDaSemana(c, false), null);
  assert.equal(adesaoDaSemana(contarSemana(s("reagendado")), true), null, "sem sessão planejada para medir");
});

test("salvar números sem marcar a situação não conta como feito", () => {
  const c = contarSemana(s("sem_situacao", "concluido"));
  assert.equal(c.feitas, 1);
  assert.equal(adesaoDaSemana(c, true), 50);
});

test("diferença de carga só quando há prescrito e registrado", () => {
  const base = { series: 3, repeticoes: 10, descanso_segundos: 60 };
  assert.deepEqual(diferencaDeCarga({ nome: "Remada", prescrito: { ...base, carga_kg: 40 }, registrado: { ...base, carga_kg: 45 }, anterior_kg: null }), { kg: 5, pct: 12.5 });
  assert.equal(diferencaDeCarga({ nome: "Remada", prescrito: { ...base, carga_kg: null }, registrado: { ...base, carga_kg: 45 }, anterior_kg: null }), null);
  assert.deepEqual(diferencaDeCarga({ nome: "Prancha", prescrito: { ...base, carga_kg: 0 }, registrado: { ...base, carga_kg: 5 }, anterior_kg: null }), { kg: 5, pct: null });
});

const semana = (semana_inicio, extra = {}) => ({ semana_inicio, sem_registros: false, adesao: 80, adesao_minima: 60, em_pausa: false, meta_nao_atingida: false, ...extra });

test("lista de atenção: a mesma causa em 2 semanas seguidas", () => {
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { sem_registros: true, adesao: null }), semana("2026-10-25", { sem_registros: true, adesao: null })]).causas, ["sem_registros"]);
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { adesao: 50 }), semana("2026-10-25", { adesao: 59.9 })]).causas, ["baixa_adesao"]);
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { meta_nao_atingida: true }), semana("2026-10-25", { meta_nao_atingida: true })]).causas, ["meta_nao_atingida"]);
  // Causas diferentes não se somam.
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { adesao: 50 }), semana("2026-10-25", { sem_registros: true, adesao: null })]).causas, []);
  // Mínimo do aluno editável.
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { adesao: 70, adesao_minima: 75 }), semana("2026-10-25", { adesao: 70, adesao_minima: 75 })]).causas, ["baixa_adesao"]);
});

test("lista de atenção: pausa e semanas não seguidas não geram alerta (B6)", () => {
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { sem_registros: true, adesao: null }), semana("2026-10-25", { sem_registros: true, adesao: null, em_pausa: true })]).causas, []);
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { adesao: 10 }), semana("2026-10-18", { adesao: 10 })]).causas, [], "falta a semana do meio");
  assert.deepEqual(causasDeAtencao([semana("2026-11-01", { adesao: 10 })]).causas, [], "uma semana só");
});

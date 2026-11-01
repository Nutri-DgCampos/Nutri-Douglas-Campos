import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDoExercicio, datasDaSemana, domingoDaSemana, planoComRegistros } from "../lib/treino.ts";

test("semana de domingo a sábado (horário de Brasília vem de fora)", () => {
  assert.equal(domingoDaSemana("2026-11-01"), "2026-11-01", "domingo abre a própria semana");
  assert.equal(domingoDaSemana("2026-11-07"), "2026-11-01", "sábado fecha a semana");
  assert.equal(domingoDaSemana("2026-11-08"), "2026-11-08");
  assert.deepEqual(datasDaSemana("2026-11-04"), {
    dom: "2026-11-01",
    seg: "2026-11-02",
    ter: "2026-11-03",
    qua: "2026-11-04",
    qui: "2026-11-05",
    sex: "2026-11-06",
    sab: "2026-11-07",
  });
  // Virada de mês e de ano.
  assert.equal(datasDaSemana("2026-12-31").sab, "2027-01-02");
});

test("chave do exercício liga o mesmo exercício escrito de formas diferentes", () => {
  assert.equal(chaveDoExercicio("Remada baixa na polia (triângulo)"), "remada baixa na polia triangulo");
  assert.equal(chaveDoExercicio("  REMADA  Baixa na Polia - Triângulo "), "remada baixa na polia triangulo");
  assert.notEqual(chaveDoExercicio("Supino reto"), chaveDoExercicio("Supino inclinado"));
});

test("painel mostra os valores registrados por cima, sem mudar a prescrição", () => {
  const prescricao = {
    dias: [{ dia: "seg", titulo: "A", kcal_estimadas: 300, exercicios: [{ nome: "Remada", grupo: "Costas", series: 4, repeticoes: 12, carga_kg: 40, descanso_segundos: 60, observacao: null }] }],
  };
  const copia = structuredClone(prescricao);
  const painel = planoComRegistros(prescricao, { seg: { 0: { indice: 0, series: null, repeticoes: null, carga_kg: 45, descanso_segundos: null } } });
  assert.equal(painel.dias[0].exercicios[0].carga_kg, 45);
  assert.equal(painel.dias[0].exercicios[0].series, 4, "campo não registrado fica o prescrito");
  assert.deepEqual(prescricao, copia, "a prescrição não muda");
});

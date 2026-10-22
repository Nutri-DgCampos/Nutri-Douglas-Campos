import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarRelatorio, pontosDoRelatorio, scoreCorrigido, semDificuldade } from "../lib/relatorios/pontos.ts";

// Relatório com as partes gravadas como no envio: alimentação 5 dias
// (21/30), água 7 dias (15/15), sono ruim (3/10), fora do plano 1 (12/15),
// sem treino, aeróbico, suplementos e meta individual (aplicáveis = 70).
function relatorio(extra = {}) {
  return {
    regras_versao: 2,
    diet_days: 5,
    diet_score: 21,
    water_goal_days: 7,
    water_score: 15,
    sleep_quality: "ruim",
    sleep_score: 3,
    off_plan_count: 1,
    off_plan_score: 12,
    diet_difficulty: "Não tive",
    applicable_points: 70,
    earned_points: 51,
    adherence_score: 73,
    pontos_removidos: [],
    ...extra,
  };
}

const codigos = (r) => analisarRelatorio(r).atencao.map((p) => p.codigo);

test("D2: 'Não tive' e parecidos não geram ponto nos relatórios novos; nos antigos, só a regra antiga", () => {
  for (const t of ["Não tive", "não tive.", "Nenhuma", "nada", "Não tive nenhuma dificuldade", "sem dificuldade", "NÃO"]) {
    assert.equal(semDificuldade(t, 2), true, t);
  }
  assert.equal(semDificuldade("Tive fome à noite", 2), false);
  assert.equal(semDificuldade("Não consegui seguir o almoço", 2), false, "frase com 'não' que é dificuldade de verdade");
  assert.ok(!codigos(relatorio()).includes("dieta_dificuldade"));
  assert.ok(codigos(relatorio({ regras_versao: 1 })).includes("dieta_dificuldade"), "relatório antigo com 'Não tive' continua como era");
  assert.ok(!codigos(relatorio({ regras_versao: 1, diet_difficulty: "não" })).includes("dieta_dificuldade"));
});

test("D5: hormônios — 'falhei' e 'parei há menos de 6 meses' geram ponto; nenhuma resposta mexe no score", () => {
  assert.ok(codigos(relatorio({ hormonios_uso: "falhou" })).includes("hormonios"));
  assert.ok(codigos(relatorio({ hormonios_uso: "parou_menos_6_meses" })).includes("hormonios"));
  assert.ok(!codigos(relatorio({ hormonios_uso: "uso_correto" })).includes("hormonios"));
  assert.ok(!codigos(relatorio({ hormonios_uso: "nao_usa" })).includes("hormonios"));
  const r = relatorio({ hormonios_uso: "falhou" });
  assert.equal(analisarRelatorio(r).atencao.find((p) => p.codigo === "hormonios").parte, null);
  assert.equal(scoreCorrigido(r, ["hormonios"]), 73, "remover o ponto de hormônios não muda o score");
  // Relatório antigo: pergunta de medicamentos, sem a de hormônios.
  assert.ok(codigos(relatorio({ regras_versao: 1, medication_changes: "sim - troquei", hormonios_uso: "falhou" })).includes("medicamentos"));
  assert.ok(!codigos(relatorio({ regras_versao: 1, medication_changes: "sim - troquei", hormonios_uso: "falhou" })).includes("hormonios"));
});

test("D1: remover ponto ligado a uma parte devolve a parte ao máximo, só neste relatório, sem passar de 100", () => {
  const r = relatorio();
  assert.equal(scoreCorrigido(r, []), 73);
  // Alimentação 21 → 30: (51 + 9) / 70 = 85,7 → 86.
  assert.equal(scoreCorrigido(r, ["dieta_dias"]), 86);
  // + sono 3 → 10: (60 + 7) / 70 = 95,7 → 96.
  assert.equal(scoreCorrigido(r, ["dieta_dias", "sono_qualidade"]), 96);
  // Repetir o código não soma duas vezes.
  assert.equal(scoreCorrigido(r, ["dieta_dias", "dieta_dias"]), 86);
  // Limite de 100.
  assert.equal(scoreCorrigido(relatorio({ applicable_points: 50, earned_points: 49 }), ["dieta_dias", "sono_qualidade"]), 100);
  // Ponto sem parte do score: score igual.
  assert.equal(scoreCorrigido(relatorio({ urine_color: "turva" }), ["urina"]), 73);
});

test("pontos removidos somem só deste relatório; outro relatório com a mesma resposta gera o ponto de novo", () => {
  const removido = relatorio({ pontos_removidos: [{ codigo: "dieta_dias", em: "2026-10-22T12:00:00Z" }] });
  assert.ok(!pontosDoRelatorio(removido).atencao.some((p) => p.codigo === "dieta_dias"));
  assert.ok(pontosDoRelatorio(removido).removidos.some((p) => p.codigo === "dieta_dias"));
  assert.ok(pontosDoRelatorio(relatorio()).atencao.some((p) => p.codigo === "dieta_dias"));
});

test("textos dos pontos iguais aos de antes (regra única)", () => {
  const { positivos, atencao } = analisarRelatorio(relatorio({ water_goal_days: 6, off_plan_count: 3, stool_consistency: "tipo_1" }));
  assert.deepEqual(positivos, ["Boa hidratação: atingiu a meta de água por 6 dias."]);
  assert.deepEqual(
    atencao.map((p) => p.texto),
    [
      "Atenção à adesão alimentar: seguiu o plano por 5 dias.",
      "Atenção à qualidade do sono: paciente percebeu o sono como ruim.",
      "Frequência elevada de refeições fora do plano: ocorreram 3 vezes nesta semana.",
      "Funcionamento intestinal: fezes endurecidas, com tendência à constipação.",
    ]
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { adesaoDaSemana, causasDeAtencao, contarSemana as contar, diferencaDeCarga, notaDaSemana, pontosDaSemana } from "../lib/treinoRelatorio.ts";

const SEMANA = { inicio: "2026-11-01", fim: "2026-11-07" };
const contarSemana = (sessoes) => contar(sessoes, SEMANA);
const s = (...situacoes) => situacoes.map((situacao) => ({ situacao, data_efetiva: situacao === "reagendado" ? "2026-11-06" : null }));

test("adesão: parcial vale meia sessão; reagendado na mesma semana conta como planejado, não feito (B4, R4)", () => {
  const c = contarSemana(s("concluido", "parcial", "nao_concluido", "reagendado", "sem_registro"));
  assert.equal(c.planejadas, 5);
  assert.equal(c.feitas, 1.5);
  assert.equal(c.reagendadas, 1);
  assert.equal(c.sem_registro, 1);
  assert.equal(adesaoDaSemana(c, true), 30);
});

test("reagendado ou feito em outra semana fica fora da conta das duas (R4b)", () => {
  const c = contarSemana([
    { situacao: "concluido", data_efetiva: null },
    { situacao: "reagendado", data_efetiva: "2026-11-09" },
    { situacao: "concluido", data_efetiva: "2026-11-10" },
    { situacao: "concluido", data_efetiva: "2026-11-05" },
  ]);
  assert.equal(c.planejadas, 2, "só as duas da própria semana");
  assert.equal(c.feitas, 2);
  assert.equal(c.outra_semana, 2);
  assert.equal(adesaoDaSemana(c, true), 100);
  assert.equal(contarSemana([{ situacao: "sem_registro", data_efetiva: "2026-11-20" }]).planejadas, 1, "sem registro nunca sai da conta");
});

test("semana sem registros não tem adesão (não é zero)", () => {
  const c = contarSemana(s("sem_registro", "sem_registro", "sem_registro"));
  assert.equal(adesaoDaSemana(c, false), null);
  assert.equal(adesaoDaSemana(contarSemana([{ situacao: "reagendado", data_efetiva: "2026-11-12" }]), true), null, "sem sessão planejada para medir");
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

test("nota 0 a 100 (Q1): 60% adesão, 25% metas, 15% manter ou evoluir; sem dado, N/A", () => {
  assert.deepEqual(notaDaSemana({ adesao: 80, metas: [true, false], adesaoAnterior: 70 }), { nota: Math.round((80 * 60 + 50 * 25 + 100 * 15) / 100), partes: { adesao: 80, metas: 50, evolucao: 100 } });
  assert.equal(notaDaSemana({ adesao: 80, metas: [true], adesaoAnterior: 90 }).nota, Math.round((80 * 60 + 100 * 25) / 100), "caiu: evolução zero");
  assert.equal(notaDaSemana({ adesao: null, metas: [true], adesaoAnterior: 90 }).nota, null);
  assert.equal(notaDaSemana({ adesao: 80, metas: [], adesaoAnterior: 90 }).nota, null, "sem meta marcada: N/A, nunca zero");
  assert.equal(notaDaSemana({ adesao: 80, metas: [true], adesaoAnterior: null }).nota, null, "primeira semana: N/A");
  assert.equal(notaDaSemana({ adesao: 120, metas: [true], adesaoAnterior: 100 }).partes.adesao, 100);
});

test("pontos positivos e de atenção (Q3): só fatos", () => {
  const base = {
    semRegistros: false,
    emPausa: false,
    adesao: 50,
    adesaoMinima: 60,
    adesaoAnterior: 40,
    contagem: { planejadas: 4, feitas: 2, concluidas: 2, parciais: 0, nao_concluidas: 1, reagendadas: 0, sem_situacao: 0, sem_registro: 1 },
    metas: [{ texto: "Correr 3 vezes", atingida: true }, { texto: "Dormir cedo", atingida: undefined }],
    desconfortos: [{ data: "2026-11-03", regiao: "Joelho", intensidade: 6, conduta: "parei", exercicio: null, comentario: null }],
    cargasAcima: ["Agachamento livre"],
    distancia: { planejada: 20, registrada: 15 },
  };
  const p = pontosDaSemana(base);
  assert.ok(p.atencao.some((x) => x.includes("abaixo do mínimo")));
  assert.ok(p.positivos.some((x) => x.includes("maior que na semana anterior")));
  assert.ok(p.positivos.includes("Meta atingida: Correr 3 vezes"));
  assert.ok(!p.atencao.some((x) => x.includes("Dormir cedo")), "meta não marcada não vira ponto");
  assert.ok(p.atencao.some((x) => x.includes("1 desconforto relatado (maior intensidade 6/10)")));
  assert.ok(p.atencao.some((x) => x.includes("Agachamento livre")));
  assert.ok(p.atencao.some((x) => x.includes("15 km para 20 km planejados (75%)")));
  assert.ok(p.atencao.some((x) => x.includes("1 sessão não concluída")));
  assert.ok(!p.positivos.some((x) => /desconforto/i.test(x)), "nunca 'nenhum desconforto' quando houve relato");
  assert.ok(pontosDaSemana({ ...base, semRegistros: true, adesao: null }).atencao[0].includes("não quer dizer que não treinou"));
});
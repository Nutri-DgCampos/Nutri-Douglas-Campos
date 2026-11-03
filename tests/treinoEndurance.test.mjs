import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ajustarVolume,
  novaSessaoEndurance,
  planoEnduranceParaAluno,
  problemasParaEnvioEndurance,
  referenciaDaSessao,
  semanaDoCiclo,
  sessaoDaReferencia,
  totaisDaSemana,
  validarPlanoEndurance,
  validarZonas,
  zonasDePotencia,
} from "../lib/treinoEndurance.ts";

const sessao = (dia, campos) => ({ ...novaSessaoEndurance("ciclismo", dia), descricao: "x", ...campos });

test("VIS-04: o total da semana vem das linhas (34,0 km, não 42 km)", () => {
  const semana = {
    sessoes: [6, 5, 7, 12, 4].map((km, i) => ({ ...novaSessaoEndurance("corrida", ["seg", "ter", "qui", "sab", "dom"][i]), distancia_km: km })),
  };
  assert.equal(totaisDaSemana(semana).distancia_km, 34);
});

test("VIS-05: distância 230 km, TSS 415 (não 460) e altimetria 2.150 m", () => {
  const linhas = [
    [30, 30, 250],
    [45, 95, 450],
    [50, 110, 520],
    [80, 160, 820],
    [25, 20, 110],
  ];
  const semana = { sessoes: linhas.map(([km, tss, alt], i) => sessao(["seg", "ter", "qui", "sab", "dom"][i], { distancia_km: km, tss, altimetria_m: alt })) };
  const t = totaisDaSemana(semana);
  assert.equal(t.distancia_km, 230);
  assert.equal(t.tss, 415);
  assert.equal(t.altimetria_m, 2150);
  assert.equal(t.tssParcial, false);
});

test("sem dado, total é 'Não disponível' (null); TSS parcial é sinalizado", () => {
  const t = totaisDaSemana({ sessoes: [sessao("seg", {}), sessao("ter", { tss: 50 })] });
  assert.equal(t.distancia_km, null);
  assert.equal(t.tss, 50);
  assert.equal(t.tssParcial, true);
});

test("zonas de potência de Coggan (R2) pelo FTP", () => {
  const z = zonasDePotencia(200);
  assert.deepEqual(z.map((x) => [x.zona, x.min, x.max]), [
    ["Z1", null, 110],
    ["Z2", 112, 150],
    ["Z3", 152, 180],
    ["Z4", 182, 210],
    ["Z5", 212, 240],
    ["Z6", 242, 300],
    ["Z7", 302, null],
  ]);
});

test("validação: ciclo começa no domingo; TSS e potência só no ciclismo", () => {
  assert.ok("erro" in validarPlanoEndurance({ ciclo: { inicio: "2026-11-03" }, semanas: [{ sessoes: [] }] }, "corrida"), "terça não é domingo");
  const ok = validarPlanoEndurance({ ciclo: { fase: "Base", inicio: "2026-11-01" }, semanas: [{ sessoes: [{ dia: "seg", descricao: "a", tss: 80, potencia_alvo: "200 W", ritmo_alvo: "5:30" }] }] }, "corrida");
  assert.equal(ok.plano.semanas[0].sessoes[0].tss, null);
  assert.equal(ok.plano.semanas[0].sessoes[0].potencia_alvo, null);
  assert.equal(ok.plano.semanas[0].sessoes[0].ritmo_alvo, "5:30");
  assert.ok("erro" in validarPlanoEndurance({ ciclo: {}, semanas: [{ sessoes: [{ dia: "xyz" }] }] }, "corrida"));
  assert.ok("erro" in validarPlanoEndurance({ ciclo: {}, semanas: Array.from({ length: 17 }, () => ({ sessoes: [] })) }, "corrida"));
});

test("envio exige título, início, sessões com descrição e distância ou tempo", () => {
  const vazio = problemasParaEnvioEndurance({ titulo: "", plano: { ciclo: { fase: null, inicio: null }, semanas: [{ sessoes: [] }] } });
  assert.equal(vazio.length, 3);
  const semAlvo = problemasParaEnvioEndurance({ titulo: "T", plano: { ciclo: { fase: null, inicio: "2026-11-01" }, semanas: [{ sessoes: [sessao("seg", {})] }] } });
  assert.ok(semAlvo[0].includes("distância ou o tempo"));
  assert.deepEqual(problemasParaEnvioEndurance({ titulo: "T", plano: { ciclo: { fase: null, inicio: "2026-11-01" }, semanas: [{ sessoes: [sessao("seg", { duracao_min: 60 })] }] } }), []);
});

test("ajustar volume (P3): só distância e tempo, da semana ou do ciclo", () => {
  const plano = { ciclo: { fase: null, inicio: null }, semanas: [{ sessoes: [sessao("seg", { distancia_km: 40, duracao_min: 90, tss: 60, altimetria_m: 300 })] }, { sessoes: [sessao("seg", { distancia_km: 50 })] }] };
  const menos = ajustarVolume(plano, -10, 0);
  assert.equal(menos.semanas[0].sessoes[0].distancia_km, 36);
  assert.equal(menos.semanas[0].sessoes[0].duracao_min, 81);
  assert.equal(menos.semanas[0].sessoes[0].tss, 60);
  assert.equal(menos.semanas[0].sessoes[0].altimetria_m, 300);
  assert.equal(menos.semanas[1].sessoes[0].distancia_km, 50, "outra semana não muda");
  assert.equal(ajustarVolume(plano, 10, null).semanas[1].sessoes[0].distancia_km, 55);
  assert.equal(plano.semanas[0].sessoes[0].distancia_km, 40, "o original não muda");
});

test("semana do ciclo pela data e referência da sessão", () => {
  const plano = { ciclo: { fase: null, inicio: "2026-11-01" }, semanas: [{ sessoes: [] }, { sessoes: [] }] };
  assert.equal(semanaDoCiclo(plano, "2026-10-31"), null);
  assert.equal(semanaDoCiclo(plano, "2026-11-01"), 0);
  assert.equal(semanaDoCiclo(plano, "2026-11-07"), 0);
  assert.equal(semanaDoCiclo(plano, "2026-11-08"), 1);
  assert.equal(semanaDoCiclo(plano, "2026-11-15"), null, "ciclo terminou");
  assert.deepEqual(sessaoDaReferencia(referenciaDaSessao(3, 7)), { semana: 3, indice: 7 });
});

test("o aluno não recebe notas nem a Opção oculta", () => {
  const plano = { ciclo: { fase: null, inicio: null }, semanas: [{ sessoes: [sessao("seg", { notas: "privada", alternativa: { descricao: "rolo", visivel: false } }), sessao("ter", { alternativa: { descricao: "esteira", visivel: true } })] }] };
  const aluno = planoEnduranceParaAluno(plano);
  assert.equal(aluno.semanas[0].sessoes[0].notas, null);
  assert.equal(aluno.semanas[0].sessoes[0].alternativa, null);
  assert.equal(aluno.semanas[0].sessoes[1].alternativa.descricao, "esteira");
  assert.equal(plano.semanas[0].sessoes[0].notas, "privada");
});

test("zonas: ritmo no formato min:seg e faixas coerentes", () => {
  assert.ok("erro" in validarZonas({ ritmo: [{ zona: "Z1", de: "5,30" }] }, "corrida"));
  assert.ok("erro" in validarZonas({ fc: [{ zona: "Z1", min: 150, max: 140 }] }, "corrida"));
  const ok = validarZonas({ ftp: 250, potencia: [{ zona: "Z2", min: 140, max: 187 }], ritmo: [{ zona: "Z1", de: "6:00" }] }, "ciclismo");
  assert.equal(ok.zonas.ftp, 250);
  assert.deepEqual(ok.zonas.ritmo, [], "ritmo só na corrida");
});

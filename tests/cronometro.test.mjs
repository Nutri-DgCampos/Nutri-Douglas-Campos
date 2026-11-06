import { test } from "node:test";
import assert from "node:assert/strict";
import { ajustar, descansoValido, iniciar, mmss, pausar, reiniciar, restante, retomar, rodando, terminou } from "../lib/cronometro.ts";

// Cronômetro de descanso (SPEC complementar 06/11, item 3; critérios 3.3).
test("60 s começa em 01:00 e chega a 00:00", () => {
  const c = iniciar("seg-0", 60, 1_000);
  assert.equal(mmss(restante(c, 1_000)), "01:00");
  assert.equal(mmss(restante(c, 1_500)), "01:00", "arredonda para cima");
  assert.equal(mmss(restante(c, 31_000)), "00:30");
  assert.equal(terminou(c, 61_000), true);
  assert.equal(mmss(restante(c, 90_000)), "00:00", "não fica negativo");
});

test("pausa, retoma e reinicia", () => {
  let c = iniciar("seg-0", 60, 0);
  c = pausar(c, 20_000);
  assert.equal(rodando(c, 50_000), false);
  assert.equal(mmss(restante(c, 50_000)), "00:40", "pausado não anda");
  c = retomar(c, 50_000);
  assert.equal(mmss(restante(c, 60_000)), "00:30");
  c = reiniciar(c, 60_000);
  assert.equal(mmss(restante(c, 60_000)), "01:00");
  assert.equal(rodando(c, 60_000), true);
});

test("tempo pelo relógio: voltar à aba depois de 25 s não reinicia nem aumenta", () => {
  const c = iniciar("seg-0", 90, 0);
  assert.equal(mmss(restante(c, 25_000)), "01:05");
});

test("ajuste manual sem passar de 15 min nem ficar negativo", () => {
  const c = iniciar("seg-0", 60, 0);
  assert.equal(mmss(restante(ajustar(c, 15_000, 0), 0)), "01:15");
  assert.equal(mmss(restante(ajustar(c, -90_000, 0), 0)), "00:00");
});

test("descanso vazio, textual ou inválido não vira valor inventado", () => {
  assert.equal(descansoValido(60), 60);
  assert.equal(descansoValido(null), null);
  assert.equal(descansoValido(0), null);
  assert.equal(descansoValido("60 s"), null);
  assert.equal(descansoValido(2000), null);
});

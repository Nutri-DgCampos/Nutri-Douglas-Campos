import { test } from "node:test";
import assert from "node:assert/strict";
import { PERGUNTAS_DA_ANAMNESE, validarRespostas } from "../lib/treinoAnamnese.ts";

test("anamnese do treino (R6): perguntas abertas aprovadas, sem nota", () => {
  assert.deepEqual(
    PERGUNTAS_DA_ANAMNESE.map((p) => p.chave),
    ["objetivo", "historico", "lesoes", "medicamentos", "liberacao_medica", "disponibilidade", "observacoes"]
  );
  const r = validarRespostas({ objetivo: "  Hipertrofia ", lesoes: "", nota: 10, desconhecida: "x" });
  assert.deepEqual(r, { respostas: { objetivo: "Hipertrofia" } }, "só as perguntas aprovadas; vazio não grava");
  assert.ok("erro" in validarRespostas({ objetivo: 5 }));
  assert.ok("erro" in validarRespostas({ objetivo: "x".repeat(2001) }));
});

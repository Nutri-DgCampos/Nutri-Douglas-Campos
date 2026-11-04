import { test } from "node:test";
import assert from "node:assert/strict";
import { acessoAoTreino, liberaHoje, profissionaisBloqueados, situacaoDoContrato, textoDoPreco, vencimentoDe } from "../lib/treinoContrato.ts";

const c = (campos) => ({ inicio: "2026-11-01", vencimento: "2026-11-30", tolerancia_dias: 7, confirmado_em: null, comprovante_em: null, cancelado_em: null, ...campos });

test("pago: em dia até o vencimento, depois tolerância, depois vencido (G4)", () => {
  const pago = c({ confirmado_em: "2026-11-01T10:00:00Z" });
  assert.equal(situacaoDoContrato(pago, "2026-11-30"), "em_dia");
  assert.equal(situacaoDoContrato(pago, "2026-12-07"), "em_tolerancia");
  assert.equal(situacaoDoContrato(pago, "2026-12-08"), "vencido");
  assert.equal(liberaHoje(pago, "2026-12-07"), true);
  assert.equal(liberaHoje(pago, "2026-12-08"), false);
});

test("sem confirmação: mesmo prazo de tolerância para pagar; comprovante não é confirmação", () => {
  assert.equal(situacaoDoContrato(c({}), "2026-11-05"), "aguardando_pagamento");
  assert.equal(situacaoDoContrato(c({ comprovante_em: "2026-11-02T10:00:00Z" }), "2026-11-05"), "comprovante_enviado");
  assert.equal(liberaHoje(c({}), "2026-11-08"), true);
  assert.equal(situacaoDoContrato(c({ comprovante_em: "2026-11-02T10:00:00Z" }), "2026-11-09"), "sem_pagamento");
  assert.equal(liberaHoje(c({ comprovante_em: "2026-11-02T10:00:00Z" }), "2026-11-09"), false);
});

test("bloqueio (R9): só com contratos e nenhum em dia; cancelado não conta", () => {
  assert.deepEqual(acessoAoTreino([], "2026-12-20"), { bloqueado: false }, "sem contrato: como antes da T8");
  const vencido = c({ confirmado_em: "2026-11-01T10:00:00Z" });
  assert.deepEqual(acessoAoTreino([vencido], "2026-12-20"), { bloqueado: true });
  const renovado = c({ inicio: "2026-12-01", vencimento: "2026-12-30", confirmado_em: "2026-12-15T10:00:00Z" });
  assert.deepEqual(acessoAoTreino([vencido, renovado], "2026-12-20"), { bloqueado: false });
  assert.deepEqual(acessoAoTreino([c({ cancelado_em: "2026-11-02T10:00:00Z" })], "2026-12-20"), { bloqueado: false }, "só cancelado: sem contrato válido");
  assert.equal(situacaoDoContrato(c({ inicio: "2026-12-01", vencimento: "2026-12-30", confirmado_em: "2026-11-20T10:00:00Z" }), "2026-11-25"), "futuro");
});

test("vencimento pela duração e preço em reais", () => {
  assert.equal(vencimentoDe("2026-11-01", 30), "2026-11-30");
  assert.equal(vencimentoDe("2026-11-01", 1), "2026-11-01");
  assert.equal(textoDoPreco(19990).replace(/\s/g, " "), "R$ 199,90");
});

test("bloqueio por profissional (S2): cada um pelos próprios contratos", () => {
  const vencidoA = c({ profissional_id: "A", confirmado_em: "2026-11-01T10:00:00Z" });
  const emDiaB = c({ profissional_id: "B", inicio: "2026-12-01", vencimento: "2026-12-30", confirmado_em: "2026-12-01T10:00:00Z" });
  assert.deepEqual(profissionaisBloqueados([vencidoA, emDiaB], "2026-12-20"), ["A"]);
  const renovadoA = c({ profissional_id: "A", inicio: "2026-12-01", vencimento: "2026-12-30", confirmado_em: "2026-12-02T10:00:00Z" });
  assert.deepEqual(profissionaisBloqueados([vencidoA, renovadoA, emDiaB], "2026-12-20"), []);
  assert.deepEqual(profissionaisBloqueados([c({ profissional_id: "A", cancelado_em: "2026-11-02T10:00:00Z" })], "2026-12-20"), [], "só cancelado: sem bloqueio");
});

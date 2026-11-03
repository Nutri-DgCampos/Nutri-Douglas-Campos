import { test } from "node:test";
import assert from "node:assert/strict";
import { ritmo, rotuloDoConsumo, tenisNoLimite, textoDaDuracao, validarAtividade, velocidade } from "../lib/treinoAtividades.ts";

const base = (campos) => ({
  chave_cliente: "6f1d2c3b-4a5e-4f60-9a7b-8c9d0e1f2a3b",
  modalidade: "corrida",
  data: "2026-11-03",
  situacao: "concluido",
  consumos: [],
  ...campos,
});

test("atividade: só a data é obrigatória; nada é estimado", () => {
  const r = validarAtividade(base({}));
  assert.ok("atividade" in r);
  for (const campo of ["distancia_km", "duracao_segundos", "fc_media", "kcal", "elevacao_m", "tss"]) assert.equal(r.atividade[campo], null, campo);
  assert.ok("erro" in validarAtividade(base({ data: "" })));
  assert.ok("erro" in validarAtividade(base({ chave_cliente: "x" })), "chave do aparelho é obrigatória (idempotência)");
});

test("atividade: limites e coerência dos números informados", () => {
  assert.ok("erro" in validarAtividade(base({ fc_media: 300 })));
  assert.ok("erro" in validarAtividade(base({ fc_media: 160, fc_max: 150 })), "FC máxima menor que a média");
  assert.ok("erro" in validarAtividade(base({ rpe: 11 })));
  assert.ok("erro" in validarAtividade(base({ situacao: "reagendado" })), "reagendado pede a nova data");
  assert.ok("atividade" in validarAtividade(base({ situacao: "reagendado", data_efetiva: "2026-11-05" })));
});

test("potência, cadência e TSS só valem no pedal", () => {
  const corrida = validarAtividade(base({ potencia_media: 200, tss: 80, cadencia_media: 170 }));
  assert.equal(corrida.atividade.potencia_media, null);
  assert.equal(corrida.atividade.tss, null);
  const pedal = validarAtividade(base({ modalidade: "ciclismo", potencia_media: 200, tss: 80, cadencia_media: 90 }));
  assert.equal(pedal.atividade.potencia_media, 200);
  assert.equal(pedal.atividade.tss, 80);
});

test("consumo durante o treino: várias entradas, horário ou minuto, sem cálculo", () => {
  const r = validarAtividade(
    base({
      consumos: [
        { categoria: "agua", quantidade: 500, unidade: "mL", minuto: 30 },
        { categoria: "gel", descricao: "Gel de carboidrato", quantidade: 1, unidade: "unidade", horario: "07:40" },
      ],
    })
  );
  assert.equal(r.atividade.consumos.length, 2);
  assert.equal(rotuloDoConsumo(r.atividade.consumos[0]), "Água · 500 mL · aos 30 min");
  assert.equal(rotuloDoConsumo(r.atividade.consumos[1]), "Gel (Gel de carboidrato) · 1 unidade · às 07:40");
  assert.ok("erro" in validarAtividade(base({ consumos: [{ categoria: "cerveja" }] })));
  assert.ok("erro" in validarAtividade(base({ consumos: [{ categoria: "agua", horario: "25:00" }] })));
  assert.ok("erro" in validarAtividade(base({ consumos: [{ categoria: "agua", unidade: "litro" }] })));
});

test("ritmo e velocidade: conta do que o aluno informou", () => {
  assert.equal(ritmo(10, 3000), "5:00 /km");
  assert.equal(ritmo(5, 1650), "5:30 /km");
  assert.equal(ritmo(null, 1650), null);
  assert.equal(velocidade(30, 3600), "30 km/h");
  assert.equal(velocidade(45, 5400), "30 km/h");
  assert.equal(textoDaDuracao(3725), "1h02");
  assert.equal(textoDaDuracao(1650), "27min 30s");
});

test("aviso do tênis no limite (R1); bicicleta sem aviso", () => {
  assert.equal(tenisNoLimite({ tipo: "tenis", alerta_km: 500, km_total: 499.9 }), false);
  assert.equal(tenisNoLimite({ tipo: "tenis", alerta_km: 500, km_total: 500 }), true);
  assert.equal(tenisNoLimite({ tipo: "bicicleta", alerta_km: null, km_total: 9000 }), false);
});

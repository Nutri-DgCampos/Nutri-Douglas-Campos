// TMB e gasto energético: SPEC de 10/11/2026 (decisões D1 a D12 aprovadas
// pelo nutricionista). Exemplo de referência do relatório
// docs/modulo-nutricao/06-proposta-tmb-gasto-2026-11-10.md: mulher, 44 anos,
// 165 cm, 70 kg, 30% de gordura (MLG 49 kg).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONJUNTOS_FATOR,
  calcularGetFator,
  calcularGetNaf,
  calcularRotina,
  calcularTmb,
  valorDoFator,
} from "../lib/nutricao/avaliacao.ts";
import { avaliacaoVazia, calcularAvaliacao, completarDocumento, validarAvaliacao } from "../lib/nutricao/avaliacaoDocumento.ts";

const mulher = { sexo: "feminino", idade: 44, peso: 70, alturaCm: 165 };
const TMB = 10 * 70 + 6.25 * 165 - 5 * 44 - 161; // Mifflin: 1.350,25
const perto = (atual, esperado, tolerancia = 1e-6) => assert.ok(Math.abs(atual - esperado) <= tolerancia, `${atual} ≠ ${esperado}`);

test("TMB: exemplo do relatório e Tinsley só com MLG (D6)", () => {
  perto(calcularTmb("mifflin_1990", mulher, null).valor, 1350.25);
  perto(calcularTmb("harris_benedict_1984", mulher, null).valor, 447.593 + 9.247 * 70 + 3.098 * 165 - 4.33 * 44);
  perto(calcularTmb("fao_1985_peso", mulher, null).valor, 8.7 * 70 + 829);
  perto(calcularTmb("cunningham_1980", mulher, 49).valor, 1578);
  perto(calcularTmb("tinsley_2019", mulher, 49).valor, 25.9 * 49 + 284); // 1.553,1
  // Tinsley usa só a MLG: sem ela, não calcula (nada de versão com peso).
  assert.equal(calcularTmb("tinsley_2019", mulher, null).valor, null);
  assert.equal(calcularTmb("tinsley_2019", mulher, null).falta.length, 1);
});

test("Fator de atividade: FAO com sugerido e ajuste dentro da faixa (D1)", () => {
  perto(calcularGetFator(TMB, { conjunto: "fao", nivel: "fao_sedentario", valor: null }).valor, TMB * 1.53);
  perto(calcularGetFator(TMB, { conjunto: "fao", nivel: "fao_sedentario", valor: 1.65 }).valor, TMB * 1.65);
  perto(calcularGetFator(TMB, { conjunto: "fao", nivel: "fao_ativo", valor: null }).valor, TMB * 1.76);
  perto(calcularGetFator(TMB, { conjunto: "fao", nivel: "fao_vigoroso", valor: 2.4 }).valor, TMB * 2.4);
  // Fora da faixa do nível: não calcula.
  const fora = calcularGetFator(TMB, { conjunto: "fao", nivel: "fao_sedentario", valor: 1.3 });
  assert.equal(fora.valor, null);
  assert.match(fora.falta[0], /1,40 e 1,69/);
  assert.equal(calcularGetFator(TMB, { conjunto: "fao", nivel: "fao_ativo", valor: 1.69 }).valor, null);
});

test("Fator de atividade: tradicionais fixos, nunca combinados com a FAO (D1)", () => {
  perto(calcularGetFator(TMB, { conjunto: "tradicional", nivel: "trad_leve", valor: null }).valor, TMB * 1.375); // 1.856,6
  // Valor digitado não altera o fator tradicional.
  assert.equal(valorDoFator({ conjunto: "tradicional", nivel: "trad_leve", valor: 1.6 }), 1.375);
  // Nível de um conjunto não vale no outro.
  assert.equal(calcularGetFator(TMB, { conjunto: "tradicional", nivel: "fao_ativo", valor: null }).valor, null);
  assert.deepEqual(
    CONJUNTOS_FATOR.tradicional.niveis.map((x) => x.valor),
    [1.2, 1.375, 1.55, 1.725, 1.9]
  );
  assert.deepEqual(
    CONJUNTOS_FATOR.fao.niveis.map((x) => [x.valor, ...x.faixa]),
    [
      [1.53, 1.4, 1.69],
      [1.76, 1.7, 1.99],
      [2.25, 2.0, 2.4],
    ]
  );
  assert.equal(calcularGetFator(null, { conjunto: "fao", nivel: "fao_ativo", valor: null }).valor, null);
});

const musculacao = { id: "00000000-0000-4000-8000-00000000000a", atividadeId: "musculacao_moderada", minutos: 60, vezesPorSemana: 3 }; // MET 5,0
const caminhada = { id: "00000000-0000-4000-8000-00000000000b", atividadeId: "caminhada_moderada", minutos: 40, vezesPorSemana: 2 }; // MET 3,8

test("Rotina semanal: MET corrigido pela TMB e minutos fora do estilo de vida (D3, D4, D5)", () => {
  const r = TMB / 1440;
  const { valor, rotina } = calcularRotina(TMB, "sentado", [musculacao, caminhada], 44);
  perto(rotina.semTreino, TMB * 1.4); // 1.890,35
  const [m, c] = rotina.atividades;
  perto(m.bruto, 5 * r * 60);
  perto(m.liquido, 4 * r * 60);
  perto(m.desconto, 0.4 * r * 60);
  perto(m.acrescimo, (5 - 1.4) * r * 60);
  // Dia com treino = TMB × E × (1440 − min) ÷ 1440 + MET × TMB ÷ 1440 × min.
  perto(m.diaComTreino, ((TMB * 1.4 * (1440 - 60)) / 1440) + 5 * r * 60);
  perto(c.diaComTreino, ((TMB * 1.4 * (1440 - 40)) / 1440) + 3.8 * r * 40);
  // Média = soma da semana ÷ 7.
  const semana = 7 * TMB * 1.4 + 3 * (5 - 1.4) * r * 60 + 2 * (3.8 - 1.4) * r * 40;
  perto(rotina.semanal, semana);
  perto(valor, semana / 7);
  assert.equal(Math.round(valor), 2003);
  perto(rotina.nafEquivalente, valor / TMB);
});

test("Rotina semanal: sem treino, faltas, repetidas, 60+ e semana impossível", () => {
  const vazia = calcularRotina(TMB, "em_pe", [], 44);
  perto(vazia.valor, TMB * 1.7);
  assert.equal(calcularRotina(TMB, null, [musculacao], 44).valor, null);
  assert.equal(calcularRotina(null, "sentado", [musculacao], 44).valor, null);
  // Incompleta fica fora, com aviso.
  const incompleta = calcularRotina(TMB, "sentado", [{ ...caminhada, minutos: null }], 44);
  perto(incompleta.valor, TMB * 1.4);
  assert.match(incompleta.avisos[0], /fora do cálculo/);
  // A mesma atividade duas vezes: aviso de possível dupla contagem.
  const repetida = calcularRotina(TMB, "sentado", [musculacao, { ...musculacao, id: "c" }], 44);
  assert.ok(repetida.avisos.some((a) => a.includes("mais de uma vez")));
  // 60+: MET60 do Older Adult Compendium (musculação leve: 4,3).
  const idosa = calcularRotina(TMB, "sentado", [{ id: "d", atividadeId: "musculacao_leve", minutos: 60, vezesPorSemana: 1 }], 65);
  assert.equal(idosa.rotina.atividades[0].valor.met, 4.3);
  // Mais minutos que a semana: não calcula.
  assert.equal(calcularRotina(TMB, "sentado", [{ ...musculacao, minutos: 1440, vezesPorSemana: 8 }], 44).valor, null);
});

function documento(gasto, atividades = []) {
  const doc = avaliacaoVazia(70, 165);
  doc.tmb.protocolo = "mifflin_1990";
  doc.gasto = { ...doc.gasto, ...gasto };
  doc.atividades = atividades;
  return doc;
}

test("Métodos exclusivos: só o escolhido calcula, sem soma nem multiplicação cruzada", () => {
  const preenchido = {
    categoria: "inativo",
    naf: 1.6,
    fator: { conjunto: "fao", nivel: "fao_ativo", valor: null },
    rotina: { estilo: "sentado" },
  };
  const paciente = { sexo: "feminino", idade: 44 };
  const fator = calcularAvaliacao(documento({ ...preenchido, metodo: "fator" }, [musculacao]), paciente);
  perto(fator.get.valor, TMB * 1.76);
  assert.equal(fator.getMaisMets, null);
  assert.equal(fator.mets.atividades.length, 0);
  assert.equal(fator.gastoDetalhe.rotina, null);
  assert.equal(fator.gastoDetalhe.fator.valor, 1.76);

  const rotina = calcularAvaliacao(documento({ ...preenchido, metodo: "rotina" }, [musculacao]), paciente);
  perto(rotina.get.valor, calcularRotina(TMB, "sentado", [musculacao], 44).valor);
  assert.equal(rotina.gastoDetalhe.fator, null);
  assert.equal(rotina.getMaisMets, null);

  // DRIs: como antes, inclusive o "GET + METs" do Inativo.
  const dri = calcularAvaliacao(documento({ ...preenchido, metodo: "dri_2023" }, [musculacao]), paciente);
  assert.ok(dri.get.valor > 0);
  assert.ok(dri.getMaisMets > dri.get.valor);
});

test("Rascunho antigo (esquema 1): TMB × NAF com o mesmo NAF e o mesmo resultado (D9)", () => {
  const antigo = documento({ metodo: "tmb_naf", naf: 1.55 });
  delete antigo.gasto.fator;
  delete antigo.gasto.rotina;
  antigo.esquema = 1;
  const r = calcularAvaliacao(antigo, { sexo: "feminino", idade: 44 });
  perto(r.get.valor, calcularGetNaf(TMB, 1.55).valor);
  assert.equal(r.get.metodo, "tmb_naf");

  const completo = completarDocumento(antigo);
  assert.equal(completo.gasto.metodo, "tmb_naf");
  assert.equal(completo.gasto.naf, 1.55);
  assert.deepEqual(completo.gasto.fator, { conjunto: null, nivel: null, valor: null });

  // Gravar de novo (validação) mantém método e NAF.
  const validado = validarAvaliacao(antigo);
  assert.equal(validado.documento.gasto.metodo, "tmb_naf");
  assert.equal(validado.documento.gasto.naf, 1.55);
});

test("Validação: nível de outro conjunto, método e estilo inválidos", () => {
  assert.match(validarAvaliacao(documento({ fator: { conjunto: "fao", nivel: "trad_leve", valor: null } })).erro, /conjunto/);
  assert.ok(validarAvaliacao(documento({ metodo: "outro" })).erro);
  assert.ok(validarAvaliacao(documento({ rotina: { estilo: "deitado" } })).erro);
  const ok = validarAvaliacao(documento({ metodo: "rotina", rotina: { estilo: "bracal" } }, [musculacao]));
  assert.equal(ok.documento.gasto.rotina.estilo, "bracal");
  assert.equal(ok.documento.esquema, 2);
});

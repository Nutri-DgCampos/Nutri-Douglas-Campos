// Testes numéricos da avaliação física, com os exemplos aprovados
// (docs/modulo-nutricao/04-metodos-cientificos.md e 05-proposta-metodos-M03-M08.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avatarMaisProximo,
  calcularDobras,
  calcularGetDri,
  calcularGetNaf,
  calcularTmb,
  classificarGordura,
  composicao,
  evolucaoDaRegiao,
  gastoDaAtividade,
  referenciaDeGordura,
} from "../lib/nutricao/avaliacao.ts";

const homem = { sexo: "masculino", idade: 35, peso: 80, alturaCm: 180 };
const mulher = { sexo: "feminino", idade: 35, peso: 60, alturaCm: 165 };
const arred = (v, casas = 0) => Number(v.toFixed(casas));

test("M-01: TMB pelos exemplos aprovados", () => {
  assert.equal(arred(calcularTmb("harris_benedict_1984", homem, null).valor), 1825);
  assert.equal(arred(calcularTmb("harris_benedict_1984", mulher, null).valor), 1362);
  assert.equal(arred(calcularTmb("mifflin_1990", homem, null).valor), 1755);
  assert.equal(arred(calcularTmb("mifflin_1990", mulher, null).valor), 1295);
  assert.equal(arred(calcularTmb("fao_1985_peso", homem, null).valor), 1807);
  assert.equal(arred(calcularTmb("fao_1985_peso", mulher, null).valor), 1351);
  assert.equal(calcularTmb("cunningham_1980", homem, 65).valor, 1930);
  // FAO com peso e altura (A em metros): 11,3 × 80 + 16 × 1,80 + 901.
  assert.equal(arred(calcularTmb("fao_1985_peso_altura", homem, null).valor, 1), arred(11.3 * 80 + 16 * 1.8 + 901, 1));
});

test("M-01: faixas da FAO fechadas no início (30 e 60 anos vão para a faixa de cima)", () => {
  assert.equal(calcularTmb("fao_1985_peso", { ...homem, idade: 30 }, null).valor, 11.6 * 80 + 879);
  assert.equal(calcularTmb("fao_1985_peso", { ...homem, idade: 29 }, null).valor, 15.3 * 80 + 679);
  assert.equal(calcularTmb("fao_1985_peso", { ...homem, idade: 60 }, null).valor, 13.5 * 80 + 487);
});

test("M-01: sem dado obrigatório não calcula; Cunningham exige MLG", () => {
  assert.deepEqual(calcularTmb("mifflin_1990", { ...homem, alturaCm: null }, null).falta, ["altura"]);
  assert.equal(calcularTmb("cunningham_1980", homem, null).valor, null);
  assert.equal(calcularTmb("mifflin_1990", { ...homem, idade: 85 }, null).avisos.length, 1);
});

test("M-02: GET pelas DRIs 2023 e por TMB × NAF", () => {
  assert.equal(arred(calcularGetDri("inativo", homem).valor), 2672);
  assert.equal(arred(calcularGetDri("pouco_ativo", homem).valor), 2892);
  assert.equal(arred(calcularGetDri("ativo", homem).valor), 3072);
  assert.equal(arred(calcularGetDri("muito_ativo", homem).valor), 3442);
  assert.equal(calcularGetDri("inativo", { ...homem, idade: 17 }).valor, null);
  assert.equal(calcularGetNaf(1800, 1.55).valor, 2790);
  assert.equal(calcularGetNaf(1800, 2.6).valor, null); // fora de 1,40–2,40
});

test("M-03: METs — exemplo aprovado e 60+", () => {
  const sessao = gastoDaAtividade({ id: "x", atividadeId: "musculacao_moderada", minutos: 60, vezesPorSemana: 4 }, 80, 35);
  assert.equal(sessao.porSessao, 420);
  assert.equal(sessao.semanal, 1680);
  assert.equal(sessao.semanal / 7, 240);
  assert.equal(sessao.porSessaoLiquido, 336);
  // 60+: Older Adult Compendium com repouso de 2,7 (musculação leve: MET60 4,3).
  const idoso = gastoDaAtividade({ id: "x", atividadeId: "musculacao_leve", minutos: 60, vezesPorSemana: 1 }, 80, 65);
  assert.equal(idoso.repouso, 2.7);
  assert.equal(arred(idoso.porSessao, 2), arred(((4.3 * 2.7 * 80) / 200) * 60, 2));
  // 60+ sem atividade equivalente: valor de adultos, com aviso.
  const semEquivalente = gastoDaAtividade({ id: "x", atividadeId: "mtb_moderado", minutos: 60, vezesPorSemana: 1 }, 80, 65);
  assert.equal(semEquivalente.repouso, 3.5);
  assert.ok(semEquivalente.aviso);
});

test("M-04: dobras pelos exemplos aprovados", () => {
  const pct = (protocolo, valores, pessoa, extra = {}) =>
    arred(calcularDobras({ protocolo, versaoSlaughter: "ts", maturacao: null, etnia: null, valores, ...extra }, pessoa).percentual, 1);

  // JP7: homem 35 a, S = 100 → 15,3%; mulher 30 a, S = 110 → 22,2%.
  const sete = (total) => ({ peitoral: total / 7, axilar_media: total / 7, triceps: total / 7, subescapular: total / 7, abdominal: total / 7, supra_iliaca: total / 7, coxa: total / 7 });
  assert.equal(pct("jp7", sete(100), homem), 15.3);
  assert.equal(pct("jp7", sete(110), { ...mulher, idade: 30 }), 22.2);
  // JP3: homem 35 a, S = 50 → 15,6%; mulher 30 a, S = 60 → 24,1%.
  assert.equal(pct("jp3", { peitoral: 20, abdominal: 15, coxa: 15 }, homem), 15.6);
  assert.equal(pct("jp3", { triceps: 20, supra_iliaca: 20, coxa: 20 }, { ...mulher, idade: 30 }), 24.1);
  // Faulkner: S = 60 → 15,0%.
  assert.equal(pct("faulkner", { triceps: 15, subescapular: 15, supra_iliaca: 15, abdominal: 15 }, homem), 15.0);
  // Petroski: homem 35 a, S = 60 → 20,7%; mulher 30 a, S = 70, 60 kg, 165 cm → 24,8%.
  const petro = (total) => ({ subescapular: total / 4, triceps: total / 4, supra_iliaca: total / 4, panturrilha_medial: total / 4 });
  assert.equal(pct("petroski", petro(60), homem), 20.7);
  assert.equal(pct("petroski", petro(70), { sexo: "feminino", idade: 30, peso: 60, alturaCm: 165 }), 24.8);
});

test("M-04: Slaughter (8 a 18 anos)", () => {
  const menino = { sexo: "masculino", idade: 12, peso: 40, alturaCm: 150 };
  const menina = { sexo: "feminino", idade: 12, peso: 40, alturaCm: 150 };
  const s = (pessoa, valores, extra = {}) =>
    calcularDobras({ protocolo: "slaughter", versaoSlaughter: "ts", maturacao: null, etnia: null, valores, ...extra }, pessoa);

  // Menino pré-púbere branco, S = 20 → 19,3%.
  assert.equal(arred(s(menino, { triceps: 10, subescapular: 10 }, { maturacao: "pre", etnia: "branca" }).percentual, 1), 19.3);
  // Sem maturação e etnia: não calcula (S ≤ 35).
  assert.deepEqual(s(menino, { triceps: 10, subescapular: 10 }).falta, ["maturação sexual (Tanner)", "etnia"]);
  // S > 35: 0,783 × S + 1,6 (conferido em Freedman et al., 2015).
  assert.equal(arred(s(menino, { triceps: 20, subescapular: 20 }).percentual, 2), arred(0.783 * 40 + 1.6, 2));
  // Meninas: S = 30 → 25,7%; S = 40 → 31,5%.
  assert.equal(arred(s(menina, { triceps: 15, subescapular: 15 }).percentual, 1), 25.7);
  assert.equal(arred(s(menina, { triceps: 20, subescapular: 20 }).percentual, 1), 31.5);
  // Tríceps + panturrilha: menino T = 25 → 19,4%.
  assert.equal(arred(s(menino, { triceps: 12, panturrilha_medial: 13 }, { versaoSlaughter: "tc" }).percentual, 1), 19.4);
  // Adulto: calcula com aviso de população.
  assert.equal(s({ ...menino, idade: 30 }, { triceps: 20, subescapular: 20 }).avisos.length, 1);
});

test("M-04: falta de dobra impede o cálculo; composição pelo peso", () => {
  const r = calcularDobras({ protocolo: "jp3", versaoSlaughter: "ts", maturacao: null, etnia: null, valores: { peitoral: 10, coxa: 12 } }, homem);
  assert.equal(r.percentual, null);
  assert.deepEqual(r.falta, ["abdominal"]);
  assert.deepEqual(composicao(25, 80), { massaGorda: 20, massaLivre: 60 });
  assert.deepEqual(composicao(null, 80), { massaGorda: null, massaLivre: null });
});

test("M-05: faixas de Gallagher (Tabela 4) e avatares", () => {
  assert.equal(classificarGordura(20.9, "feminino", 30), "baixo");
  assert.equal(classificarGordura(21, "feminino", 30), "adequado");
  assert.equal(classificarGordura(33, "feminino", 30), "sobrepeso");
  assert.equal(classificarGordura(39, "feminino", 30), "obesidade");
  assert.equal(classificarGordura(27.9, "masculino", 50), "sobrepeso");
  assert.equal(classificarGordura(28, "masculino", 50), "obesidade");
  assert.equal(referenciaDeGordura("masculino", 19), null); // fora de 20–79: sem referência
  assert.equal(referenciaDeGordura("masculino", 80), null);
  // Exemplo do roteiro: 34,2% destaca o avatar de 35% e mantém o valor real.
  assert.equal(avatarMaisProximo(34.2, "feminino").valor, 35);
  assert.equal(avatarMaisProximo(50, "masculino").foraDaEscala, true);
  assert.equal(avatarMaisProximo(null, "masculino"), null);
});

test("Perimetria: compara com a última medida válida anterior", () => {
  assert.deepEqual(evolucaoDaRegiao(117, [120]), { evolucao: "diminuiu", diferenca: -3 });
  assert.deepEqual(evolucaoDaRegiao(37, [null, 35]), { evolucao: "aumentou", diferenca: 2 });
  assert.equal(evolucaoDaRegiao(90, [90]).evolucao, "igual");
  assert.equal(evolucaoDaRegiao(90, []).evolucao, "sem_comparacao");
  assert.equal(evolucaoDaRegiao(null, [90]).evolucao, "sem_comparacao");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarMudancas,
  confirmarSugestoes,
  marcarAuxilio,
  montarProposta,
  mudancasDaProposta,
  pedidoVazio,
  temSeloDaIa,
  validarPedido,
} from "../lib/nutricao/assistente.ts";
import { documentoVazio, novaRefeicao, novoItem, quantidadeDoItem, validarDocumento } from "../lib/nutricao/dieta.ts";

const ARROZ = "11111111-1111-4111-8111-111111111111";
const BANANA = "22222222-2222-4222-8222-222222222222";
const OVO = "33333333-3333-4333-8333-333333333333";
const COLHER = { id: "44444444-4444-4444-8444-444444444444", singular: "colher de servir", plural: "colheres de servir", quantidade: 50 };

function dietaDeExemplo() {
  const doc = documentoVazio("Teste", "");
  const cafe = novaRefeicao("Café da manhã");
  cafe.horario = "07:00";
  cafe.opcoes[0].itens.push(
    { ...novoItem(), alimentoId: BANANA, nomeOriginal: "Banana, prata, crua", unidade: "g", quantidadeAjustada: 80 },
    { ...novoItem(), alimentoId: OVO, nomeOriginal: "Ovo, de galinha, inteiro, cozido", unidade: "g", quantidadeAjustada: 50 }
  );
  const almoco = novaRefeicao("Almoço");
  almoco.opcoes[0].itens.push({ ...novoItem(), alimentoId: ARROZ, nomeOriginal: "Arroz, tipo 1, cozido", unidade: "g", medida: COLHER, numeroMedidas: 2 });
  doc.refeicoes.push(cafe, almoco);
  return doc;
}

function catalogoDe(doc) {
  return {
    alimentos: {
      a1: { id: ARROZ, nome: "Arroz, tipo 1, cozido", unidade: "g", medidas: { m1: COLHER } },
      a2: { id: BANANA, nome: "Banana, prata, crua", unidade: "g", medidas: {} },
      a3: { id: OVO, nome: "Ovo, de galinha, inteiro, cozido", unidade: "g", medidas: {} },
    },
    refeicoes: Object.fromEntries(doc.refeicoes.map((r, n) => [`r${n + 1}`, r.id])),
  };
}

const item = (alimento, extra = {}) => ({ alimento, descricao: "", medida: null, numeroMedidas: null, quantidade: null, ...extra });

test("pedido: precisa de texto (ou meta de calorias na dieta do zero) e de refeição válida no alcance de uma refeição", () => {
  const doc = dietaDeExemplo();
  assert.match(validarPedido({ ...pedidoVazio() }, doc).erro, /Escreva/);
  assert.ok("pedido" in validarPedido({ ...pedidoVazio(), doZero: true, metas: { kcal: 1800, parametros: [] } }, doc));
  assert.match(validarPedido({ ...pedidoVazio(), pedido: "x", alcance: "refeicao", refeicaoId: ARROZ }, doc).erro, /refeição/);
  const ok = validarPedido({ ...pedidoVazio(), pedido: "x", alcance: "refeicao", refeicaoId: doc.refeicoes[1].id }, doc);
  assert.equal(ok.pedido.refeicaoId, doc.refeicoes[1].id);
  const parametros = Array.from({ length: 5 }, () => ({ nutriente: "fibras", condicao: "min", valor: 25 }));
  assert.match(validarPedido({ ...pedidoVazio(), pedido: "x", metas: { parametros } }, doc).erro, /No máximo 4/);
});

test("proposta: código inexistente não vira alimento; medida só do cadastro; com medida, o peso vem da medida", () => {
  const doc = dietaDeExemplo();
  const pedido = { ...pedidoVazio(), pedido: "x" };
  const { refeicoes, pendencias } = montarProposta(
    {
      mensagem: "ok",
      refeicoes: [
        {
          codigo: "r2",
          nome: "Almoço",
          horario: "12:00",
          observacao: null,
          opcoes: [
            {
              itens: [
                item("a1", { medida: "m1", numeroMedidas: 3, quantidade: 999 }),
                item("a99", { descricao: "Tapioca" }),
                item("a3", { medida: "m1", numeroMedidas: 1, quantidade: 60 }),
                item("a2"),
              ],
            },
          ],
        },
      ],
    },
    catalogoDe(doc),
    pedido
  );
  const [arroz, tapioca, ovo, banana] = refeicoes[0].opcoes[0].itens;
  assert.equal(refeicoes[0].id, doc.refeicoes[1].id, "refeição existente mantém o id");
  assert.equal(quantidadeDoItem(arroz).efetiva, 150, "3 colheres × 50 g, não os 999 g escritos pela IA");
  assert.equal(tapioca.alimentoId, null);
  assert.equal(tapioca.sugeridoIa, "Tapioca");
  assert.equal(ovo.medida, null, "medida de outro alimento é ignorada");
  assert.equal(ovo.quantidadeAjustada, 60);
  assert.equal(banana.quantidadeAjustada, null);
  assert.ok(pendencias.some((p) => p.includes("Tapioca")));
  assert.ok(pendencias.some((p) => p.includes("sem quantidade")));
  assert.ok([arroz, tapioca, ovo, banana].every((i) => i.ia === true));
});

test("proposta: código em outro formato ou nome idêntico ao da base é aceito; nome parecido não", () => {
  const doc = dietaDeExemplo();
  const { refeicoes } = montarProposta(
    {
      mensagem: "",
      refeicoes: [
        {
          codigo: null,
          nome: "Lanche",
          horario: null,
          observacao: null,
          opcoes: [{ itens: [item(" A2 ", { quantidade: 100 }), item("x", { descricao: "banana, PRATA, crua", quantidade: 90 }), item(null, { descricao: "Banana prata", quantidade: 80 })] }],
        },
      ],
    },
    catalogoDe(doc),
    { ...pedidoVazio(), pedido: "x" }
  );
  const [a, b, c] = refeicoes[0].opcoes[0].itens;
  assert.equal(a.alimentoId, BANANA);
  assert.equal(b.alimentoId, BANANA);
  assert.equal(c.alimentoId, null, "semelhança de nome não basta");
});

test("proposta de uma refeição: só a escolhida, mesmo que a IA devolva outras", () => {
  const doc = dietaDeExemplo();
  const pedido = { ...pedidoVazio(), pedido: "x", alcance: "refeicao", refeicaoId: doc.refeicoes[0].id };
  const { refeicoes, pendencias } = montarProposta(
    {
      mensagem: "",
      refeicoes: [
        { codigo: "r2", nome: "Almoço", horario: null, observacao: null, opcoes: [{ itens: [item("a1", { quantidade: 100 })] }] },
        { codigo: "r1", nome: "Café", horario: null, observacao: null, opcoes: [{ itens: [item("a2", { quantidade: 120 })] }] },
      ],
    },
    catalogoDe(doc),
    pedido
  );
  assert.equal(refeicoes.length, 1);
  assert.equal(refeicoes[0].id, doc.refeicoes[0].id);
  assert.equal(refeicoes[0].opcoes[0].itens[0].alimentoId, BANANA);
  assert.equal(pendencias.length, 1);
});

test("comparação: inclusão, exclusão, quantidade, refeição nova e removida; aplica só as escolhidas", () => {
  const doc = dietaDeExemplo();
  const pedido = { ...pedidoVazio(), pedido: "x" };
  const { refeicoes } = montarProposta(
    {
      mensagem: "",
      refeicoes: [
        { codigo: "r1", nome: "Café da manhã", horario: "07:30", observacao: null, opcoes: [{ itens: [item("a2", { quantidade: 120 }), item("a1", { medida: "m1", numeroMedidas: 1 })] }] },
        { codigo: null, nome: "Ceia", horario: "21:00", observacao: null, opcoes: [{ itens: [item("a2", { quantidade: 60 })] }] },
      ],
    },
    catalogoDe(doc),
    pedido
  );
  const mudancas = mudancasDaProposta(doc, { pedido, refeicoes });
  const tipos = mudancas.map((m) => m.tipo).sort();
  assert.deepEqual(tipos, ["dados_refeicao", "exclusao", "inclusao", "quantidade", "refeicao_nova", "refeicao_removida"]);

  // Nada escolhido: a dieta fica igual.
  assert.deepEqual(aplicarMudancas(doc, mudancas, new Set()), doc);

  // Só a quantidade da banana e a ceia.
  const escolhidas = new Set(mudancas.filter((m) => m.tipo === "quantidade" || m.tipo === "refeicao_nova").map((m) => m.id));
  const resultado = aplicarMudancas(doc, mudancas, escolhidas);
  assert.equal(resultado.refeicoes.length, 3);
  assert.equal(resultado.refeicoes[1].nome, "Ceia", "a ceia entra logo depois do café, como na proposta");
  const banana = resultado.refeicoes[0].opcoes[0].itens.find((i) => i.alimentoId === BANANA);
  assert.equal(banana.quantidadeAjustada, 120);
  assert.equal(banana.ia, true);
  assert.equal(resultado.refeicoes[0].opcoes[0].itens.length, 2, "o ovo continua (exclusão não escolhida)");
  assert.equal(resultado.refeicoes[0].horario, "07:00", "horário não escolhido");
  assert.equal(doc.refeicoes.length, 2, "a original não muda");

  // Tudo: almoço removido, ovo fora, arroz incluído no café.
  const tudo = aplicarMudancas(doc, mudancas, new Set(mudancas.map((m) => m.id)));
  assert.deepEqual(tudo.refeicoes.map((r) => r.nome), ["Café da manhã", "Ceia"]);
  assert.deepEqual(tudo.refeicoes[0].opcoes[0].itens.map((i) => i.alimentoId), [BANANA, ARROZ]);
  assert.equal(tudo.refeicoes[0].horario, "07:30");
});

test("dieta do zero: todas as refeições novas e as atuais sugeridas para remoção", () => {
  const doc = dietaDeExemplo();
  const pedido = { ...pedidoVazio(), doZero: true, metas: { ...pedidoVazio().metas, kcal: 1800 } };
  const { refeicoes } = montarProposta(
    { mensagem: "", refeicoes: [{ codigo: "r1", nome: "Café", horario: "07:00", observacao: null, opcoes: [{ itens: [item("a2", { quantidade: 100 })] }] }] },
    catalogoDe(doc),
    pedido
  );
  assert.notEqual(refeicoes[0].id, doc.refeicoes[0].id, "do zero ignora o código da refeição atual");
  const mudancas = mudancasDaProposta(doc, { pedido, refeicoes });
  assert.equal(mudancas.filter((m) => m.tipo === "refeicao_removida").length, 2);
  assert.equal(mudancas.filter((m) => m.tipo === "refeicao_nova").length, 1);
});

test("selo IA: passa pela validação, some ao confirmar; auxílio registrado no documento", () => {
  const doc = dietaDeExemplo();
  doc.refeicoes[0].ia = true;
  doc.refeicoes[0].opcoes[0].itens[0].ia = true;
  doc.refeicoes[1].opcoes[0].itens.push({ ...novoItem(), ia: true, sugeridoIa: "Tapioca" });
  const marcado = marcarAuxilio(marcarAuxilio(doc, new Date("2026-10-21T12:00:00Z")));
  assert.equal(marcado.auxilioIa.aplicacoes, 2);
  const { documento } = validarDocumento(JSON.parse(JSON.stringify(marcado)));
  assert.equal(documento.refeicoes[0].ia, true);
  assert.equal(documento.refeicoes[0].opcoes[0].itens[0].ia, true);
  assert.equal(documento.refeicoes[1].opcoes[0].itens[1].sugeridoIa, "Tapioca");
  assert.equal(documento.auxilioIa.aplicacoes, 2);
  assert.ok(temSeloDaIa(documento));
  confirmarSugestoes(documento);
  assert.ok(!temSeloDaIa(documento));
});

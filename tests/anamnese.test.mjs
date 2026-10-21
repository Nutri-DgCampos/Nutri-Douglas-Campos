import { test } from "node:test";
import assert from "node:assert/strict";
import {
  documentoDoRecordatorio,
  novaOpcao,
  novaPergunta,
  obrigatoriasEmBranco,
  pendenciasDoModelo,
  pendenciasDoRecordatorio,
  perguntasParaFicha,
  recordatorioVazio,
  situacaoDoFormulario,
  textoDaResposta,
  validarPerguntas,
  validarRecordatorio,
  validarRespostas,
} from "../lib/nutricao/anamnese.ts";
import { quantidadeDoItem, totaisDaDieta } from "../lib/nutricao/dieta.ts";

function modelo() {
  const profissao = { ...novaPergunta("curto"), texto: "Qual a profissão?", obrigatoria: true };
  const frutas = { ...novaPergunta("multipla"), texto: "Frequência de frutas", opcoes: [novaOpcao("Diariamente"), novaOpcao("Às vezes"), novaOpcao("Nunca")] };
  const sintomas = { ...novaPergunta("multipla"), texto: "Sente:", variasRespostas: true, opcoes: [novaOpcao("Insônia"), novaOpcao("Ansiedade"), novaOpcao("")] };
  const livre = { ...novaPergunta("texto_livre"), texto: "" };
  return [profissao, frutas, sintomas, livre];
}

test("modelo: validação, pendências e cópia para a ficha", () => {
  const perguntas = modelo();
  const v = validarPerguntas(perguntas);
  assert.ok("valor" in v);
  assert.equal(v.valor.length, 4);
  assert.equal(v.valor[0].variasRespostas, false);
  assert.equal(v.valor[2].variasRespostas, true);

  assert.deepEqual(pendenciasDoModelo("Primeira consulta", perguntas), []);
  assert.deepEqual(pendenciasDoModelo("", []), ["Informe o nome do modelo.", "Inclua ao menos uma pergunta."]);
  const semAlternativas = [{ ...novaPergunta("multipla"), texto: "X", opcoes: [novaOpcao("Só uma")] }];
  assert.match(pendenciasDoModelo("M", semAlternativas)[0], /duas alternativas/);

  // Alternativa vazia não vai para a ficha.
  assert.equal(perguntasParaFicha(perguntas)[2].opcoes.length, 2);

  assert.ok("erro" in validarPerguntas([{ ...novaPergunta(), tipo: "data" }]));
  const repetida = novaPergunta();
  assert.ok("erro" in validarPerguntas([repetida, repetida]));
});

test("respostas: só o que pertence às perguntas; múltipla simples guarda uma", () => {
  const perguntas = perguntasParaFicha(modelo());
  const [profissao, frutas, sintomas] = perguntas;
  const v = validarRespostas(
    {
      [profissao.id]: "Engenheira",
      [frutas.id]: [frutas.opcoes[0].id, frutas.opcoes[1].id],
      [sintomas.id]: [sintomas.opcoes[0].id, sintomas.opcoes[1].id, "inventada"],
      "00000000-0000-4000-8000-000000000000": "fora do modelo",
    },
    perguntas
  );
  assert.ok("valor" in v);
  assert.deepEqual(Object.keys(v.valor).length, 3);
  assert.deepEqual(v.valor[frutas.id], [frutas.opcoes[0].id]);
  assert.deepEqual(v.valor[sintomas.id], [sintomas.opcoes[0].id, sintomas.opcoes[1].id]);
  assert.equal(textoDaResposta(sintomas, v.valor[sintomas.id]), "Insônia; Ansiedade");

  assert.deepEqual(obrigatoriasEmBranco(perguntas, v.valor), []);
  assert.deepEqual(
    obrigatoriasEmBranco(perguntas, { [profissao.id]: "   " }).map((p) => p.id),
    [profissao.id]
  );
});

test("recordatório: validação e pendências do envio", () => {
  const r = recordatorioVazio();
  assert.ok("valor" in validarRecordatorio(r));
  assert.deepEqual(pendenciasDoRecordatorio(r), ["Informe ao menos um alimento."]);
  r.refeicoes[0].itens[0].alimento = "Pão francês";
  r.refeicoes[0].nome = "";
  assert.match(pendenciasDoRecordatorio(r)[0], /nome da refeição/);
  r.refeicoes[0].horario = "25:00";
  assert.ok("erro" in validarRecordatorio(r));
});

test("recordatório → dieta: itens em cinza, com o texto do paciente, fora dos totais", () => {
  const r = recordatorioVazio();
  r.refeicoes[0].horario = "07:00";
  r.refeicoes[0].itens = [
    { id: crypto.randomUUID(), alimento: "Pão francês", quantidade: "1 unidade" },
    { id: crypto.randomUUID(), alimento: "  ", quantidade: "" },
  ];
  r.refeicoes[0].observacao = "Às vezes tapioca";
  r.refeicoes[1].itens[0].alimento = "Arroz";
  const doc = documentoDoRecordatorio(r);
  assert.equal(doc.refeicoes.length, 2); // refeições sem alimento não vêm
  assert.equal(doc.refeicoes[0].nome, "Café da manhã");
  assert.equal(doc.refeicoes[0].horario, "07:00");
  assert.equal(doc.refeicoes[0].observacao, null); // observação do paciente não vai para a prescrição
  const [item] = doc.refeicoes[0].opcoes[0].itens;
  assert.equal(item.referencia, true);
  assert.equal(item.alimentoId, null);
  assert.equal(item.informado, "Pão francês — 1 unidade");
  assert.equal(quantidadeDoItem(item).efetiva, null);
  const totais = totaisDaDieta(doc, {}, ["kcal"]);
  assert.equal(totais.kcal.valor, null);
});

test("situação do formulário", () => {
  const base = { status: "rascunho", enviado_em: null, paciente_editou_em: null, respondido_em: null };
  assert.equal(situacaoDoFormulario(base), "rascunho");
  assert.equal(situacaoDoFormulario({ ...base, enviado_em: "x" }), "enviado");
  assert.equal(situacaoDoFormulario({ ...base, enviado_em: "x", paciente_editou_em: "y" }), "em_preenchimento");
  assert.equal(situacaoDoFormulario({ ...base, enviado_em: "x", respondido_em: "z" }), "respondido");
  assert.equal(situacaoDoFormulario({ ...base, status: "concluido" }), "concluido");
});

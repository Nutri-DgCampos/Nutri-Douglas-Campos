import { test } from "node:test";
import assert from "node:assert/strict";
import { dadosDoBanco, dadosParaBanco } from "../lib/nutricao/dadosPessoais.ts";

// Dados pessoais comuns do cadastro (SPEC 06/11, cadastro): mesmas regras na
// Nutrição e no Treino, na tela e no servidor.
test("aceita nascimento, sexo da lista, altura com vírgula e e-mail", () => {
  const r = dadosParaBanco({ nascimento: "1990-05-20", sexo: "masculino", altura: "178,5", emailContato: "Aluno@Exemplo.com" });
  assert.deepEqual(r, { valores: { birth_date: "1990-05-20", sex: "masculino", height_cm: 178.5, contact_email: "aluno@exemplo.com" } });
});

test("vazio fica vazio (dados antigos não são exigidos)", () => {
  assert.deepEqual(dadosParaBanco({ nascimento: "", sexo: "", altura: "", emailContato: "" }), {
    valores: { birth_date: null, sex: null, height_cm: null, contact_email: null },
  });
});

test("recusa nascimento no futuro, sexo fora da lista e altura absurda", () => {
  assert.match(dadosParaBanco({ nascimento: "2999-01-01", sexo: "", altura: "", emailContato: "" }).erro, /nascimento/);
  assert.match(dadosParaBanco({ nascimento: "", sexo: "outro", altura: "", emailContato: "" }).erro, /sexo/);
  assert.match(dadosParaBanco({ nascimento: "", sexo: "", altura: "1780", emailContato: "" }).erro, /altura/);
});

test("ida e volta do banco", () => {
  assert.deepEqual(dadosDoBanco({ birth_date: "1990-05-20", sex: "feminino", height_cm: "163.5", contact_email: null }), {
    nascimento: "1990-05-20",
    sexo: "feminino",
    altura: "163,5",
    emailContato: "",
  });
});

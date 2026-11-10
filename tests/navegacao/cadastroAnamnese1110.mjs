// SPEC 06/11/2026 "Cadastro integrado, anamneses, fotos e identificação do
// Treino" (implementada em 10/11, com as decisões do cliente: educador altera
// só nascimento/sexo/altura de paciente da clínica; anamnese antiga privada;
// estrelas das fotos só para ver).
// Rode com ARQUIVOS_DIR igual à do servidor (fotos). Ver LEIA-ME.md.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const B = "http://localhost:3100";
const PASTA = path.join(import.meta.dirname, "visual");
fs.mkdirSync(PASTA, { recursive: true });
const navegador = await chromium.launch({ channel: "msedge", headless: true });
let falhas = 0;
const conferir = (nome, ok, detalhe) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 600)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();

const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const EMAIL_E = "teste.educador.c1110@local.test";
const EMAIL_O = "teste.outro.c1110@local.test";
const EMAIL_A = "teste.aluno.c1110@local.test";
const NOME_A = "Aluno Próprio Teste C1110";
const ARQUIVOS = process.env.ARQUIVOS_DIR;
const original = sql(`select coalesce(to_char(birth_date,'YYYY-MM-DD'),'') || '|' || coalesce(sex,'') || '|' || coalesce(height_cm::text,'') from patients where id = '${P}';`).split("|");

function limpar() {
  // A proteção de fichas respondidas fica desligada só nesta limpeza.
  sql(`set session_replication_role = replica;
       delete from anamneses where patient_id = '${P}' and (modulo = 'treino' or titulo = 'Teste C1110');
       set session_replication_role = origin;
       delete from consultas where patient_id = '${P}' and id in (select consulta_id from anamneses where titulo = 'Teste C1110');
       delete from fotos_evolucao where patient_id = '${P}' and storage_path like '${P}/teste-c1110%';
       delete from notification_queue where patient_id = '${P}' and notification_type = 'formulario_treino';
       delete from treino_vinculos where profissional_id in (select id from users where email in ('${EMAIL_E}', '${EMAIL_O}'));
       delete from notificacoes_profissionais where usuario_id in (select id from users where email in ('${EMAIL_E}', '${EMAIL_O}'));
       delete from patients where name like 'Aluno Próprio Teste C1110%';
       delete from users where email in ('${EMAIL_A}', '${EMAIL_E}', '${EMAIL_O}');`);
}
let restaurado = false;
function restaurar() {
  limpar();
  sql(`update patients set birth_date = ${original[0] ? `'${original[0]}'` : "null"}, sex = ${original[1] ? `'${original[1]}'` : "null"},
         height_cm = ${original[2] || "null"} where id = '${P}';`);
  restaurado = true;
}
process.on("exit", () => {
  if (!restaurado) restaurar();
});
limpar();

async function sessao(email, senha, largura = 1400) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: "pt-BR" });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(e.message));
  pagina.on("response", (r) => {
    const url = r.url().replace(B, "");
    if (url.startsWith("/api/") && r.status() >= 500) erros.push(`${r.status()} ${url}`);
  });
  if (email) {
    await pagina.goto(`${B}/login`, { waitUntil: "networkidle" });
    await pagina.fill('input[type="email"]', email);
    await pagina.fill('input[type="password"]', senha);
    await pagina.click('button[type="submit"]');
    await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }).catch(() => undefined);
    await pagina.waitForTimeout(800);
  }
  return { contexto, pagina, erros };
}
const api = (pagina, url, metodo = "GET", corpo) =>
  pagina.evaluate(
    async ([u, m, c]) => {
      const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: c ? JSON.stringify(c) : undefined });
      const tipo = r.headers.get("content-type") ?? "";
      return { status: r.status, tipo, corpo: tipo.includes("json") ? await r.json().catch(() => null) : null };
    },
    [url, metodo, corpo]
  );

// --- Preparação: dois educadores; E vinculado ao paciente da clínica ---------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
for (const [nome, email] of [["Educador Teste C1110", EMAIL_E], ["Outro Educador C1110", EMAIL_O]]) {
  await api(n.pagina, "/api/treino/educadores", "POST", { nome, email, senha: "inicial-123", cref: "000555-G/SP" });
}
sql(`update users set must_change_password = false where email in ('${EMAIL_E}', '${EMAIL_O}');`);
const E = sql(`select id from users where email = '${EMAIL_E}';`);
await api(n.pagina, `/api/treino/alunos/${P}`, "POST", { acao: "vincular", educadorId: E });
const e = await sessao(EMAIL_E, "inicial-123");
const o = await sessao(EMAIL_O, "inicial-123");

// =====================================================================================
// Identidade visual (item 6)
// =====================================================================================
await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
const barraE = await e.pagina.locator("aside").first().innerText();
conferir("6: barra do educador mostra \"Solução Fit DLC\" acima de \"Módulo de Treino\"", /Solução Fit DLC/.test(barraE) && /Módulo de Treino/.test(barraE) && !/Douglas Campos/.test(barraE), barraE.slice(0, 80));
await n.pagina.goto(`${B}/`, { waitUntil: "networkidle" });
conferir("6: barra do nutricionista continua \"Douglas Campos\"", /Douglas Campos/.test(await n.pagina.locator("aside").first().innerText()), null);
await e.pagina.screenshot({ path: path.join(PASTA, "c1110-painel-educador.png") });

// =====================================================================================
// Cadastro (item 2)
// =====================================================================================
await e.pagina.getByRole("button", { name: "Cadastrar aluno" }).click();
const dialogo = e.pagina.getByRole("dialog", { name: "Cadastrar aluno" });
await dialogo.getByLabel("Nome completo").fill(NOME_A);
await dialogo.getByLabel("E-mail de acesso").fill(EMAIL_A);
await dialogo.getByLabel("Senha provisória").fill("inicial-123");
await dialogo.locator("#campo-nascimento").fill("1990-05-20");
await dialogo.locator(".p-dropdown").first().click();
await e.pagina.getByRole("option", { name: "Masculino", exact: true }).click();
await dialogo.locator("#campo-altura").fill("178");
const textoDoDialogo = await dialogo.innerText();
conferir("2: cadastro do Treino não mostra plano nem pagamento da Nutrição", !/Plano contratado|Status do pagamento/.test(textoDoDialogo), null);
await e.pagina.screenshot({ path: path.join(PASTA, "c1110-cadastro-aluno.png") });
await dialogo.getByRole("button", { name: "Cadastrar" }).click();
await e.pagina.waitForURL(/\/treino\/alunos\/[0-9a-f-]{36}$/, { timeout: 30000 }).catch(() => undefined);
const A = sql(`select id from patients where name = '${NOME_A}';`);
conferir("2: educador cadastra nascimento, sexo e altura do aluno", sql(`select to_char(birth_date,'YYYY-MM-DD') || '|' || sex || '|' || height_cm from patients where id = '${A}';`) === "1990-05-20|masculino|178.0", A);
sql(`update users set must_change_password = false where email = '${EMAIL_A}';`);

const avaliacao = await api(e.pagina, `/api/treino/alunos/${A}/avaliacoes`, "POST");
await e.pagina.goto(`${B}/treino/alunos/${A}/avaliacao/${avaliacao.corpo?.id}`, { waitUntil: "networkidle" });
await e.pagina.getByText("Avaliação física").first().waitFor({ timeout: 20000 }).catch(() => undefined);
await e.pagina.waitForTimeout(1500);
const textoAvaliacao = await e.pagina.locator("body").innerText();
conferir("2: a avaliação física pega nascimento e sexo do cadastro (sem os avisos)", !/Sem data de nascimento/.test(textoAvaliacao) && !/Sexo não cadastrado/.test(textoAvaliacao) && /anos na data/.test(textoAvaliacao), textoAvaliacao.slice(0, 300));
await api(e.pagina, `/api/treino/avaliacoes/${avaliacao.corpo?.id}`, "DELETE");

const editado = await api(e.pagina, `/api/treino/alunos/${A}`, "PATCH", { nome: NOME_A, telefone: "", email: EMAIL_A, nascimento: "1990-05-20", sexo: "masculino", altura: "180", emailContato: "" });
conferir("2: edição do aluno próprio altera a altura", editado.status === 200 && sql(`select height_cm from patients where id = '${A}';`) === "180.0", editado);
conferir("2: data de nascimento no futuro é recusada", (await api(e.pagina, `/api/treino/alunos/${A}`, "PATCH", { nome: NOME_A, email: EMAIL_A, nascimento: "2999-01-01" })).status === 400, null);

// Paciente da clínica: só nascimento, sexo e altura; o mesmo cadastro da Nutrição.
const fisicos = await api(e.pagina, `/api/treino/alunos/${P}/dados-fisicos`, "PUT", { nascimento: "1994-03-15", sexo: "feminino", altura: "164" });
conferir(
  "2: educador vinculado altera nascimento/sexo/altura do paciente da clínica; o nutricionista vê o mesmo dado",
  fisicos.status === 200 && sql(`select height_cm from patients where id = '${P}';`) === "164.0",
  fisicos
);
conferir("2: e-mail de contato do paciente da clínica não é tocado", sql(`select contact_email from patients where id = '${P}';`) === "paciente.teste@exemplo.com", null);
conferir("2: profissional sem vínculo não lê nem altera o cadastro", (await api(o.pagina, `/api/treino/alunos/${P}/dados-fisicos`)).status === 404 && (await api(o.pagina, `/api/treino/alunos/${P}/dados-fisicos`, "PUT", { altura: "150" })).status === 404, null);

// =====================================================================================
// Anamnese (itens 3 e 4)
// =====================================================================================
const lista = (await api(e.pagina, `/api/treino/alunos/${P}/anamneses`)).corpo;
const inicial = lista.modelos.find((m) => m.nome === "Anamnese do treino");
conferir("3: cada educador começa com o modelo das 7 perguntas aprovadas", inicial && sql(`select jsonb_array_length(perguntas) from treino_modelos_anamnese where id = '${inicial.id}';`) === "7", lista.modelos);
// Modelo novo, editado e reordenado.
const novo = (await api(e.pagina, "/api/treino/modelos-anamnese", "POST", { nome: "Modelo C1110", perguntas: [] })).corpo;
const [ID1, ID2] = [crypto.randomUUID(), crypto.randomUUID()];
const perguntas = [
  { id: ID1, texto: "Pratica esporte?", tipo: "multipla", obrigatoria: true, opcoes: [{ id: crypto.randomUUID(), texto: "Sim" }, { id: crypto.randomUUID(), texto: "Não" }], variasRespostas: false },
  { id: ID2, texto: "Qual o objetivo?", tipo: "longo", obrigatoria: false, opcoes: [], variasRespostas: false },
];
const salvo = await api(e.pagina, `/api/treino/modelos-anamnese/${novo.id}`, "PUT", { nome: "Modelo C1110", perguntas: [perguntas[1], perguntas[0]], revisao: novo.revisao });
conferir("3: educador cria e reordena perguntas do próprio modelo", salvo.status === 200 && sql(`select perguntas->0->>'id' from treino_modelos_anamnese where id = '${novo.id}';`) === ID2, salvo);
const deOutro = (await api(o.pagina, "/api/treino/modelos-anamnese")).corpo.modelos;
conferir("4: modelo privado não aparece para outro profissional", !deOutro.some((m) => m.id === novo.id), null);
await api(e.pagina, `/api/treino/modelos-anamnese/${novo.id}`, "PATCH", { acao: "compartilhar" });
const compartilhado = (await api(o.pagina, `/api/treino/modelos-anamnese/${novo.id}`)).corpo?.modelo;
conferir("4: compartilhado aparece para o outro só para leitura; ele não altera", compartilhado?.meu === false && (await api(o.pagina, `/api/treino/modelos-anamnese/${novo.id}`, "PUT", { nome: "x", perguntas: [], revisao: 0 })).status === 404, compartilhado?.meu);
await e.pagina.goto(`${B}/treino/anamneses/${novo.id}`, { waitUntil: "networkidle" });
await e.pagina.getByText("Compartilhar com os profissionais do Treino").waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("4: o editor do Treino (o mesmo da Nutrição) mostra o compartilhamento", (await e.pagina.getByText("Compartilhar com os profissionais do Treino").count()) === 1, null);

// Anamnese do paciente da clínica, enviada pelo link.
const criada = await api(e.pagina, `/api/treino/alunos/${P}/anamneses`, "POST", { modeloId: inicial.id });
const AN = criada.corpo?.id;
let ficha = (await api(e.pagina, `/api/treino/anamneses/${AN}`)).corpo.formulario;
await api(e.pagina, `/api/treino/anamneses/${AN}`, "PUT", { respostas: {}, observacoes: "Nota privada do educador C1110", revisao: ficha.revisao });
const enviada = await api(e.pagina, `/api/treino/anamneses/${AN}`, "PATCH", { acao: "enviar" });
conferir("3: educador envia a anamnese ao aluno", enviada.status === 200, enviada);
const link = (await api(e.pagina, `/api/treino/alunos/${P}/link-formularios`)).corpo;
const visitante = await sessao(null, null, 420);
await visitante.pagina.goto(link.url, { waitUntil: "networkidle" });
await visitante.pagina.getByText("Anamnese do treino").first().waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("3: o aluno vê a anamnese do Treino no link (o mesmo link da Nutrição)", (await visitante.pagina.getByText("Treino · Enviado em").count()) >= 1, null);
const token = link.url.split("/formulario/")[1];
ficha = (await api(visitante.pagina, `/api/formulario/${token}`)).corpo.anamneses.find((a) => a.id === AN);
const respostas = { [ficha.perguntas[0].id]: "Ganhar condicionamento" };
await api(visitante.pagina, `/api/formulario/${token}/anamnese/${AN}`, "PUT", { respostas, revisao: ficha.revisao });
const resposta = await api(visitante.pagina, `/api/formulario/${token}/anamnese/${AN}/enviar`, "POST", { respostas, revisao: ficha.revisao + 1 });
conferir("3: o aluno responde pelo link e envia", resposta.status === 200 && sql(`select respondido_em is not null from anamneses where id = '${AN}';`) === "t", resposta);
conferir("3: o aviso de resposta vai para o educador que enviou, não para o nutricionista",
  sql(`select count(*) from notificacoes_profissionais where referencia_id = '${AN}' and usuario_id = '${E}';`) === "1" &&
    sql(`select count(*) from notificacoes_profissionais n join profiles p on p.id = n.usuario_id where n.referencia_id = '${AN}' and p.role = 'nutricionista';`) === "0",
  null
);

// Nutricionista vinculado lê a do educador; não altera; não vê a nota privada.
const naNutricao = (await api(n.pagina, `/api/nutricao/pacientes/${P}/formularios`)).corpo.anamneses.find((a) => a.id === AN);
conferir("3: na ficha da Nutrição, a anamnese do Treino aparece (Treino, educador)", naNutricao?.modulo === "treino" && naNutricao?.autor === "Educador Teste C1110", naNutricao);
const leitura = await api(n.pagina, `/api/nutricao/anamneses/${AN}`);
conferir("3: o nutricionista lê as respostas, sem a nota privada do educador", leitura.corpo?.somenteLeitura === true && JSON.stringify(leitura.corpo).includes("Ganhar condicionamento") && !JSON.stringify(leitura.corpo).includes("Nota privada"), leitura.corpo?.somenteLeitura);
conferir("3: o nutricionista não altera a anamnese do educador", (await api(n.pagina, `/api/nutricao/anamneses/${AN}`, "PATCH", { acao: "arquivar" })).status === 403, null);
await n.pagina.goto(`${B}/nutricao/${P}/anamnese-treino/${AN}`, { waitUntil: "networkidle" });
await n.pagina.getByText("Ganhar condicionamento").first().waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("3: a tela da Nutrição abre a anamnese do Treino só para leitura", (await n.pagina.getByText(/Só leitura: quem criou/).count()) === 1, null);
conferir("3: o aviso do nutricionista ignora a anamnese do Treino", !((await api(n.pagina, "/api/nutricao/formularios/avisos")).corpo.avisos ?? []).some((a) => a.patient_id === P), null);
conferir("3: profissional sem vínculo não vê as respostas", (await api(o.pagina, `/api/treino/anamneses/${AN}`)).status === 404, null);

// Anamnese preenchida pelo nutricionista: o educador vinculado lê; o rascunho, não.
const CONSULTA = sql(`insert into consultas (patient_id, data, tipo) values ('${P}', current_date, 'retorno') returning id;`).split("\n")[0];
const NUTRI = sql(`insert into anamneses (patient_id, consulta_id, titulo, perguntas, respostas, status, concluido_em, observacoes)
  values ('${P}', '${CONSULTA}', 'Teste C1110', '[{"id":"q","texto":"Come bem?","tipo":"curto","obrigatoria":false,"opcoes":[],"variasRespostas":false}]', '{"q":"Sim"}', 'concluido', now(), 'Nota do nutricionista') returning id;`).split("\n")[0];
const RASCUNHO = sql(`insert into anamneses (patient_id, consulta_id, titulo, perguntas, respostas) values ('${P}', '${CONSULTA}', 'Teste C1110', '[]', '{}') returning id;`).split("\n")[0];
const doEducador = (await api(e.pagina, `/api/treino/alunos/${P}/anamneses`)).corpo.anamneses;
conferir("3: o educador vê a anamnese preenchida do nutricionista, não o rascunho", doEducador.some((a) => a.id === NUTRI && !a.minha) && !doEducador.some((a) => a.id === RASCUNHO), doEducador.map((a) => a.titulo));
const lida = await api(e.pagina, `/api/treino/anamneses/${NUTRI}`);
conferir("3: e lê só para leitura, sem a nota do nutricionista", lida.corpo?.somenteLeitura === true && !JSON.stringify(lida.corpo).includes("Nota do nutricionista") && (await api(e.pagina, `/api/treino/anamneses/${NUTRI}`, "PATCH", { acao: "reabrir" })).status === 403, lida.status);

// Editar o modelo não reescreve respostas anteriores.
const m = (await api(e.pagina, `/api/treino/modelos-anamnese/${inicial.id}`)).corpo.modelo;
await api(e.pagina, `/api/treino/modelos-anamnese/${inicial.id}`, "PUT", { nome: m.nome, perguntas: m.perguntas.slice(0, 2), revisao: m.revisao });
conferir("3: editar o modelo não muda a ficha já respondida (nova versão do modelo)", sql(`select jsonb_array_length(perguntas) from anamneses where id = '${AN}';`) === "7" && sql(`select versao from treino_modelos_anamnese where id = '${inicial.id}';`) === "2", null);

await e.pagina.goto(`${B}/treino/alunos/${P}`, { waitUntil: "networkidle" });
await e.pagina.getByRole("region", { name: "Anamneses" }).waitFor({ timeout: 20000 }).catch(() => undefined);
await e.pagina.getByRole("region", { name: "Anamneses" }).screenshot({ path: path.join(PASTA, "c1110-anamneses.png") });

// Aluno próprio: o atalho de formulários aparece na área dele.
const fichaA = (await api(e.pagina, `/api/treino/alunos/${A}/anamneses`, "POST", { modeloId: inicial.id })).corpo.id;
await api(e.pagina, `/api/treino/anamneses/${fichaA}`, "PATCH", { acao: "enviar" });
const a = await sessao(EMAIL_A, "inicial-123", 420);
await a.pagina.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
await a.pagina.getByText("Formulários").first().waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("3: o aluno próprio vê \"Formulários\" na área dele", (await a.pagina.getByText("Você tem formulário para preencher").count()) === 1, null);

// =====================================================================================
// Fotos (item 5)
// =====================================================================================
if (ARQUIVOS) {
  const caminho = `${P}/teste-c1110.jpg`;
  fs.mkdirSync(path.join(ARQUIVOS, "fotos", P), { recursive: true });
  // JPEG 1×1.
  fs.writeFileSync(path.join(ARQUIVOS, "fotos", caminho), Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64"));
  const FOTO = sql(`insert into fotos_evolucao (patient_id, perfil, data, storage_path) values ('${P}', 'frente', current_date, '${caminho}') returning id;`).split("\n")[0];
  const fotos = await api(e.pagina, `/api/treino/alunos/${P}/fotos`);
  conferir("5: o educador vinculado lista as fotos do cadastro (sem o caminho do disco)", fotos.corpo?.fotos?.length === 1 && !JSON.stringify(fotos.corpo).includes("teste-c1110"), fotos.corpo);
  const imagem = await api(e.pagina, `/api/treino/alunos/${P}/fotos/${FOTO}`);
  conferir("5: e abre a imagem", imagem.status === 200 && imagem.tipo.includes("image/jpeg"), imagem.status);
  conferir("5: sem vínculo, nem lista nem imagem", (await api(o.pagina, `/api/treino/alunos/${P}/fotos`)).status === 404 && (await api(o.pagina, `/api/treino/alunos/${P}/fotos/${FOTO}`)).status === 404, null);
  conferir("5: foto de outro paciente não sai pelo id", (await api(e.pagina, `/api/treino/alunos/${A}/fotos/${FOTO}`)).status === 404, null);
  await e.pagina.goto(`${B}/treino/alunos/${P}`, { waitUntil: "networkidle" });
  await e.pagina.getByText("Comparativo de fotos").waitFor({ timeout: 20000 }).catch(() => undefined);
  conferir("5: a tela Treino mostra o Comparativo de fotos, com as estrelas só para ver", (await e.pagina.getByText("Comparativo de fotos").count()) === 1 && (await e.pagina.getByRole("button", { name: /Favoritar/ }).count()) === 0, null);
  await e.pagina.getByText("Comparativo de fotos").scrollIntoViewIfNeeded();
  await e.pagina.screenshot({ path: path.join(PASTA, "c1110-fotos.png") });
  sql(`delete from fotos_evolucao where id = '${FOTO}';`);
  fs.rmSync(path.join(ARQUIVOS, "fotos", caminho), { force: true });
} else {
  console.log("(fotos: rode com ARQUIVOS_DIR para testar)");
}

// =====================================================================================
// Planos (item 7): nada muda
// =====================================================================================
conferir("7: nenhum contrato ou pagamento criado", sql(`select count(*) from treino_contratos where patient_id in ('${P}', '${A}');`) === "0" && sql(`select count(*) from payments where patient_id in ('${P}', '${A}') and created_at > now() - interval '1 hour';`) === "0", null);

const erros = [...n.erros, ...e.erros, ...o.erros, ...visitante.erros, ...a.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
sql(`set session_replication_role = replica; delete from anamneses where consulta_id = '${CONSULTA}'; set session_replication_role = origin; delete from consultas where id = '${CONSULTA}';`);
restaurar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

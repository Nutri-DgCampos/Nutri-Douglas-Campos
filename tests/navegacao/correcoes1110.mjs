// SPEC de correções do Módulo de Treino (10/11/2026):
// 001 treino do profissional na Área do Paciente; 002 cadastro de aluno
// sempre vazio; 003 pedido de vínculo para e-mail já cadastrado (Opção A;
// clínica → nutricionista; dono desativado → sem pedido); 004 título da
// janela "Olá, <educador>". Ver LEIA-ME.md.
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
const EDU = { E: ["Educadora Dona C1110b", "teste.dona.c1110b@local.test"], Bs: ["Educador Pede C1110b", "teste.pede.c1110b@local.test"], C: ["Educador Terceiro C1110b", "teste.terceiro.c1110b@local.test"] };
const EMAIL_A = "teste.aluno.c1110b@local.test";
const NOME_A = "Aluno Próprio Teste C1110b";
const emails = [...Object.values(EDU).map((e) => e[1]), EMAIL_A, "teste.novo.c1110b@local.test"];

function limpar() {
  sql(`delete from treino_prescricoes where patient_id = '${P}' and titulo = 'Treino C1110b';
       delete from treino_vinculos where profissional_id in (select id from users where email in (${emails.map((e) => `'${e}'`).join(",")}));
       delete from notificacoes_profissionais where usuario_id in (select id from users where email in (${emails.map((e) => `'${e}'`).join(",")}))
          or (tipo = 'vinculo' and patient_id = '${P}');
       delete from treino_pedidos_vinculo where patient_id = '${P}';
       delete from patients where name like 'Aluno Próprio Teste C1110b%' or name like 'Aluno Novo C1110b%';
       delete from users where email in (${emails.map((e) => `'${e}'`).join(",")});`);
}
let limpo = false;
process.on("exit", () => {
  if (!limpo) limpar();
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
  await entrar(pagina, email, senha);
  return { contexto, pagina, erros };
}
async function entrar(pagina, email, senha) {
  await pagina.goto(`${B}/login`, { waitUntil: "networkidle" });
  await pagina.fill('input[type="email"]', email);
  await pagina.fill('input[type="password"]', senha);
  await pagina.click('button[type="submit"]');
  await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }).catch(() => undefined);
  await pagina.waitForTimeout(800);
}
const api = (pagina, url, metodo = "GET", corpo) =>
  pagina.evaluate(
    async ([u, m, c]) => {
      const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: c ? JSON.stringify(c) : undefined });
      return { status: r.status, corpo: await r.json().catch(() => null) };
    },
    [url, metodo, corpo]
  );

// --- Preparação ------------------------------------------------------------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
for (const [nome, email] of Object.values(EDU)) await api(n.pagina, "/api/treino/educadores", "POST", { nome, email, senha: "inicial-123", cref: "000666-G/SP" });
sql(`update users set must_change_password = false where email in (${Object.values(EDU).map((e) => `'${e[1]}'`).join(",")});`);
const id = (email) => sql(`select id from users where email = '${email}';`);
const [E, BS, C] = [id(EDU.E[1]), id(EDU.Bs[1]), id(EDU.C[1])];
const e = await sessao(EDU.E[1], "inicial-123");
const b = await sessao(EDU.Bs[1], "inicial-123");
const c = await sessao(EDU.C[1], "inicial-123");
const A = (await api(e.pagina, "/api/treino/alunos", "POST", { nome: NOME_A, email: EMAIL_A, senha: "inicial-123" })).corpo?.id;

// =====================================================================================
// 004 — título da janela
// =====================================================================================
await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
conferir("004: janela do educador mostra \"Olá, <nome dele>\"", (await e.pagina.title()) === `Olá, ${EDU.E[0]}`, await e.pagina.title());
const barra = await e.pagina.locator("aside").first().innerText();
conferir("004: menu lateral continua \"Solução Fit DLC\" / \"Módulo de Treino\"", /Solução Fit DLC/.test(barra) && /Módulo de Treino/.test(barra), barra.slice(0, 60));
await b.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
conferir("004: outro educador vê o próprio nome", (await b.pagina.title()) === `Olá, ${EDU.Bs[0]}`, await b.pagina.title());
await n.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
conferir("004: nutricionista mantém \"Acompanhamento Nutricional\"", (await n.pagina.title()) === "Acompanhamento Nutricional", await n.pagina.title());
// Troca de sessão na mesma janela: sai um educador, entra outro.
await c.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await api(c.pagina, "/api/auth/sair", "POST", {});
await entrar(c.pagina, EDU.Bs[1], "inicial-123");
await c.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
conferir("004: depois de sair e entrar com outro educador, não sobra o nome anterior", (await c.pagina.title()) === `Olá, ${EDU.Bs[0]}`, await c.pagina.title());
await api(c.pagina, "/api/auth/sair", "POST", {});
await entrar(c.pagina, EDU.C[1], "inicial-123");

// =====================================================================================
// 002 — cadastro sempre vazio
// =====================================================================================
await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await e.pagina.getByRole("button", { name: "Cadastrar aluno" }).click();
let dialogo = e.pagina.getByRole("dialog", { name: "Cadastrar aluno" });
const email = dialogo.getByLabel("E-mail de acesso");
const senha = dialogo.getByLabel("Senha provisória");
conferir("002: e-mail e senha sem preenchimento do navegador (autocomplete)", (await email.getAttribute("autocomplete")) === "off" && (await senha.getAttribute("autocomplete")) === "new-password", null);
await dialogo.getByLabel("Nome completo").fill("Rascunho");
await email.fill("rascunho@exemplo.com");
await senha.fill("segredo1");
await dialogo.getByRole("button", { name: "Cancelar" }).click();
await e.pagina.waitForTimeout(400);
await e.pagina.getByRole("button", { name: "Cadastrar aluno" }).click();
dialogo = e.pagina.getByRole("dialog", { name: "Cadastrar aluno" });
conferir(
  "002: fechar e reabrir começa vazio",
  (await dialogo.getByLabel("E-mail de acesso").inputValue()) === "" && (await dialogo.getByLabel("Senha provisória").inputValue()) === "" && (await dialogo.getByLabel("Nome completo").inputValue()) === "",
  null
);
await dialogo.getByLabel("Nome completo").fill("Aluno Novo C1110b");
await dialogo.getByLabel("E-mail de acesso").fill("teste.novo.c1110b@local.test");
await dialogo.getByLabel("Senha provisória").fill("inicial-123");
await dialogo.getByRole("button", { name: "Cadastrar" }).click();
await e.pagina.waitForURL(/\/treino\/alunos\/[0-9a-f-]{36}$/, { timeout: 30000 }).catch(() => undefined);
await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await e.pagina.getByRole("button", { name: "Cadastrar aluno" }).click();
dialogo = e.pagina.getByRole("dialog", { name: "Cadastrar aluno" });
conferir("002: depois de cadastrar um aluno, o próximo começa vazio", (await dialogo.getByLabel("E-mail de acesso").inputValue()) === "" && (await dialogo.getByLabel("Senha provisória").inputValue()) === "", null);
await dialogo.getByRole("button", { name: "Cancelar" }).click();

// =====================================================================================
// 003 — pedido de vínculo
// =====================================================================================
await b.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await b.pagina.getByRole("button", { name: "Cadastrar aluno" }).click();
dialogo = b.pagina.getByRole("dialog", { name: "Cadastrar aluno" });
await dialogo.getByLabel("Nome completo").fill("Qualquer nome");
await dialogo.getByLabel("E-mail de acesso").fill(EMAIL_A);
await dialogo.getByLabel("Senha provisória").fill("inicial-123");
await dialogo.getByRole("button", { name: "Cadastrar" }).click();
const pedir = b.pagina.getByRole("dialog", { name: "Solicitar vínculo" });
await pedir.waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("003: e-mail já cadastrado oferece \"Solicitar vínculo\" sem mostrar dados do aluno", (await pedir.count()) === 1 && !(await pedir.innerText()).includes(NOME_A), null);
await pedir.getByLabel("Mensagem para o profissional responsável").fill("Vou acompanhar a corrida dele.");
await b.pagina.screenshot({ path: path.join(PASTA, "c1110b-solicitar-vinculo.png") });
await pedir.getByRole("button", { name: "Solicitar vínculo" }).click();
await b.pagina.waitForTimeout(1500);
const PEDIDO = sql(`select id from treino_pedidos_vinculo where patient_id = '${A}' and solicitante_id = '${BS}' and status = 'pendente';`);
conferir("003: pedido registrado para a educadora que cadastrou o aluno", Boolean(PEDIDO) && sql(`select destinatario_id from treino_pedidos_vinculo where id = '${PEDIDO}';`) === E, PEDIDO);
conferir("003: ela recebe o aviso", sql(`select count(*) from notificacoes_profissionais where usuario_id = '${E}' and tipo = 'vinculo';`) === "1", null);
conferir("003: nenhum usuário duplicado", sql(`select count(*) from users where lower(email) = '${EMAIL_A}';`) === "1", null);
conferir("003: pedido pendente duplicado é recusado", (await api(b.pagina, "/api/treino/pedidos-vinculo", "POST", { email: EMAIL_A, mensagem: "" })).status === 409, null);
conferir("003: antes da aprovação, quem pediu não acessa o aluno", (await api(b.pagina, `/api/treino/alunos/${A}`)).status === 404, null);
conferir("003: quem pediu e terceiros não decidem", (await api(b.pagina, `/api/treino/pedidos-vinculo/${PEDIDO}`, "PATCH", { acao: "aprovar" })).status === 404 && (await api(c.pagina, `/api/treino/pedidos-vinculo/${PEDIDO}`, "PATCH", { acao: "aprovar" })).status === 404, null);
conferir("003: o nutricionista não decide pedido de aluno próprio de educador", (await api(n.pagina, `/api/treino/pedidos-vinculo/${PEDIDO}`, "PATCH", { acao: "aprovar" })).status === 404, null);

await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
const cartao = e.pagina.getByRole("region", { name: "Pedidos de vínculo" });
await cartao.waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("003: a dona vê quem pede, para qual aluno e a mensagem", /Educador Pede C1110b/.test(await cartao.innerText()) && /Vou acompanhar a corrida dele/.test(await cartao.innerText()), null);
await cartao.screenshot({ path: path.join(PASTA, "c1110b-pedidos.png") });
await cartao.getByRole("button", { name: "Aprovar" }).click();
await e.pagina.locator(".p-confirm-dialog").getByRole("button", { name: "Aprovar" }).click();
await e.pagina.waitForTimeout(1500);
conferir("003: aprovado: vínculo criado; cadastro e vínculo original mantidos", sql(`select count(*) from treino_vinculos where patient_id = '${A}' and fim is null;`) === "2" && sql(`select educador_dono_id from patients where id = '${A}';`) === E, null);
conferir("003: quem pediu passa a ver o aluno (como não próprio) e recebe o aviso", (await api(b.pagina, `/api/treino/alunos/${A}`)).status === 200 && sql(`select count(*) from notificacoes_profissionais where usuario_id = '${BS}' and tipo = 'vinculo';`) === "1", null);
conferir("003: novo pedido do mesmo profissional: \"já vinculado\"", /já está vinculado/.test((await api(b.pagina, "/api/treino/pedidos-vinculo", "POST", { email: EMAIL_A })).corpo?.erro ?? ""), null);

// Recusa.
const recusa = (await api(c.pagina, "/api/treino/pedidos-vinculo", "POST", { email: EMAIL_A, mensagem: "" })).corpo?.id;
await api(e.pagina, `/api/treino/pedidos-vinculo/${recusa}`, "PATCH", { acao: "recusar" });
conferir("003: recusado: nada muda e o terceiro continua sem acesso", sql(`select status from treino_pedidos_vinculo where id = '${recusa}';`) === "recusado" && (await api(c.pagina, `/api/treino/alunos/${A}`)).status === 404, null);
conferir("003: quem pediu vê \"Recusado\"", (await api(c.pagina, "/api/treino/pedidos-vinculo")).corpo.enviados.some((p) => p.id === recusa && p.status === "recusado" && p.aluno === null), null);

// Paciente da clínica: o nutricionista decide.
const clinica = (await api(b.pagina, "/api/treino/pedidos-vinculo", "POST", { email: "teste.paciente@local.test", mensagem: "Personal da paciente" })).corpo?.id;
conferir("003: paciente da clínica: o pedido vai ao nutricionista, não a educadores", (await api(n.pagina, "/api/treino/pedidos-vinculo")).corpo.recebidos.some((p) => p.id === clinica) && !(await api(e.pagina, "/api/treino/pedidos-vinculo")).corpo.recebidos.some((p) => p.id === clinica), clinica);
await api(n.pagina, `/api/treino/pedidos-vinculo/${clinica}`, "PATCH", { acao: "aprovar" });
conferir("003: nutricionista aprova e o educador passa a acompanhar a paciente", (await api(b.pagina, `/api/treino/alunos/${P}`)).status === 200, null);

// Dono desativado, conta de profissional e e-mail inexistente.
sql(`update educadores_fisicos set ativo = false where usuario_id = '${E}';`);
const inativo = await api(c.pagina, "/api/treino/pedidos-vinculo", "POST", { email: EMAIL_A });
sql(`update educadores_fisicos set ativo = true where usuario_id = '${E}';`);
conferir("003: dono desativado: sem pedido, com a orientação", inativo.status === 409 && /inativo. Fale com o administrador/.test(inativo.corpo?.erro ?? ""), inativo.corpo);
conferir("003: e-mail de profissional não vira pedido", /Não é possível pedir vínculo/.test((await api(b.pagina, "/api/treino/pedidos-vinculo", "POST", { email: EDU.E[1] })).corpo?.erro ?? ""), null);
conferir("003: e-mail inexistente não vira pedido (cadastro normal)", (await api(b.pagina, "/api/treino/pedidos-vinculo", "POST", { email: "ninguem.c1110b@local.test" })).status === 409, null);

// =====================================================================================
// 001 — treino do profissional na Área do Paciente
// =====================================================================================
sql(`insert into treino_vinculos (patient_id, profissional_id, criado_por) values ('${P}', '${E}', '${E}') on conflict do nothing;`);
const plano = JSON.stringify({ dias: [{ dia: "seg", titulo: "Glúteos C1110b", kcal_estimadas: null, observacao: null, exercicios: [{ nome: "Agachamento C1110b", grupo: "Quadríceps", series: 4, repeticoes: 10, repeticoes_max: null, carga_kg: 30, descanso_segundos: 60, observacao: null, exercicio_id: null, video_url: null, alternativa: null, avancado: null }] }] });
sql(`insert into treino_prescricoes (patient_id, programa_id, origem, plano, criada_por, titulo, publicada_em) values ('${P}', gen_random_uuid(), 'profissional', '${plano}', '${E}', 'Treino C1110b', now());`);
const paciente = await sessao("teste.paciente@local.test", "654987", 420);
await paciente.pagina.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
await paciente.pagina.getByText("Seu treino enviado pelo profissional está disponível.").waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("001: o cartão Treino mostra o treino do profissional e \"Ver meu treino\"", (await paciente.pagina.getByText("Seu treino enviado pelo profissional está disponível.").count()) === 1 && (await paciente.pagina.getByRole("link", { name: "Ver meu treino" }).count()) === 1, null);
conferir("001: anexar e colar texto continuam disponíveis", (await paciente.pagina.getByRole("button", { name: "Colar texto" }).count()) === 1, null);
await paciente.pagina.screenshot({ path: path.join(PASTA, "c1110b-area-paciente.png"), fullPage: true });
await paciente.pagina.getByRole("link", { name: "Ver meu treino" }).click();
await paciente.pagina.getByText("Glúteos C1110b").first().waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("001: \"Meu treino\" mostra o mesmo treino (vigente)", (await paciente.pagina.getByText("Glúteos C1110b").count()) >= 1, null);
const aluno = await sessao(EMAIL_A, "inicial-123", 420).catch(() => null);
if (aluno) {
  sql(`update users set must_change_password = false where email = '${EMAIL_A}';`);
  await entrar(aluno.pagina, EMAIL_A, "inicial-123");
  const resumo = await api(aluno.pagina, "/api/area-paciente/treino/resumo");
  conferir("001: outro aluno sem treino não vê o treino da paciente", resumo.status === 200 && resumo.corpo.musculacao === null && resumo.corpo.planilhas === false, resumo.corpo);
}

const erros = [...n.erros, ...e.erros, ...b.erros, ...c.erros, ...paciente.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
limpar();
limpo = true;
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

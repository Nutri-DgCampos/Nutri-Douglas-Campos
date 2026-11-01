// Melhorias 01/11/2026. Item 2: avisos ao nutricionista (sino + web push).
// Ver LEIA-ME.md para rodar. Não envia push de verdade: o aparelho de teste
// usa um endereço .invalid, que nunca existe na internet.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const B = "http://localhost:3100";
const PASTA = path.join(import.meta.dirname, "visual");
fs.mkdirSync(PASTA, { recursive: true });
const navegador = await chromium.launch({ channel: "msedge", headless: true });
let falhas = 0;
const conferir = (nome, ok, detalhe) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 500)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const NOME_P = sql(`select name from patients where id = '${P}';`);
const NUTRI = sql(`select id from users where email = 'teste.nutri@local.test';`);
const NUTRICIONISTAS = Number(sql("select count(*) from profiles where role = 'nutricionista';"));
const ENDPOINT = "https://push.invalid/teste-avisos";

function limpar() {
  sql(`delete from notificacoes_profissionais where patient_id = '${P}' and tipo <> 'desconforto';
       delete from push_profissionais where endpoint = '${ENDPOINT}';
       -- Só no banco local de teste: as travas de exclusão (corretas em uso real) ficam desligadas nesta sessão.
       set session_replication_role = replica;
       create temp table consultas_teste as select consulta_id as id from anamneses where patient_id = '${P}' and titulo = 'TESTE AVISOS';
       delete from anamneses where patient_id = '${P}' and titulo = 'TESTE AVISOS';
       delete from consultas where id in (select id from consultas_teste);
       delete from renewal_requests where patient_id = '${P}' and requested_plan = 'TESTE AVISOS';
       delete from patient_reports where patient_id = '${P}' and general_notes = 'TESTE AVISOS';
       delete from blood_exams where patient_id = '${P}' and exam_name = 'TESTE AVISOS';`);
}
limpar();
const avisos = (tipo) => sql(`select count(*) from notificacoes_profissionais where patient_id = '${P}' and tipo = '${tipo}';`);

// --- Eventos do paciente ----------------------------------------------------
// Exames: três arquivos numa única operação, pela tela do paciente.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "exames-"));
const arquivos = [1, 2, 3].map((n) => {
  const f = path.join(temp, `exame-${n}.pdf`);
  fs.writeFileSync(f, `%PDF-1.4\n% exame de teste ${n}\n%%EOF\n`);
  return f;
});
const a = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale: "pt-BR" });
const pa = await a.newPage();
await pa.goto(`${B}/login`, { waitUntil: "networkidle" });
await pa.fill('input[type="email"]', "teste.paciente@local.test");
await pa.fill('input[type="password"]', "654987");
await pa.click('button[type="submit"]');
await pa.waitForTimeout(2500);
await pa.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
await pa.getByLabel("Nome do exame").fill("TESTE AVISOS");
await pa.locator("#arquivo-exame").setInputFiles(arquivos);
await pa.waitForTimeout(4000);
conferir("três exames gravados", sql(`select count(*) from blood_exams where patient_id = '${P}' and exam_name = 'TESTE AVISOS';`) === "3", null);
conferir("lote de três exames = um aviso por nutricionista", avisos("exames") === String(NUTRICIONISTAS), avisos("exames"));
conferir("aviso traz a contagem de arquivos", sql(`select corpo || '|' || quantidade from notificacoes_profissionais where patient_id = '${P}' and tipo = 'exames' and usuario_id = '${NUTRI}';`) === "Enviou 3 exames.|3", null);
conferir("push dos exames espera o lote terminar", sql(`select (liberar_em > criada_em)::text from notificacoes_profissionais where patient_id = '${P}' and tipo = 'exames' and usuario_id = '${NUTRI}';`) === "true", null);
await a.close();

// Anamnese, relatório e renovação (gravados como a tela do paciente grava).
const CONSULTA = sql(`insert into consultas (patient_id, data, tipo) values ('${P}', current_date, 'retorno') returning id;`).split("\n")[0];
const ANAMNESE = sql(`insert into anamneses (patient_id, consulta_id, titulo, perguntas, enviado_em) values ('${P}', '${CONSULTA}', 'TESTE AVISOS', '[]', now()) returning id;`).split("\n")[0];
conferir("anamnese ainda não respondida não gera aviso", avisos("anamnese") === "0", null);
sql(`update anamneses set respondido_em = now() where id = '${ANAMNESE}';`);
conferir("anamnese enviada gera aviso", avisos("anamnese") === String(NUTRICIONISTAS), avisos("anamnese"));
sql(`update anamneses set respondido_em = respondido_em, titulo = 'TESTE AVISOS' where id = '${ANAMNESE}';`);
conferir("regravar sem novo envio não duplica", avisos("anamnese") === String(NUTRICIONISTAS), avisos("anamnese"));
const RELATORIO = sql(`insert into patient_reports (patient_id, general_notes) values ('${P}', 'TESTE AVISOS') returning id;`).split("\n")[0];
conferir("relatório gera aviso separado", avisos("relatorio") === String(NUTRICIONISTAS), avisos("relatorio"));
sql(`insert into renewal_requests (patient_id, requested_plan) values ('${P}', 'TESTE AVISOS');`);
conferir("renovação gera aviso", avisos("renovacao") === String(NUTRICIONISTAS), avisos("renovacao"));
const textos = sql(`select string_agg(titulo || ': ' || corpo, ' / ' order by tipo) from notificacoes_profissionais where patient_id = '${P}' and usuario_id = '${NUTRI}' and tipo <> 'desconforto';`);
conferir("texto = nome completo + tipo do evento, nada clínico", textos === `${NOME_P}: Enviou a anamnese. / ${NOME_P}: Enviou 3 exames. / ${NOME_P}: Enviou o relatório nutricional. / ${NOME_P}: Solicitou a renovação do plano.`, textos);

// --- Nutricionista: sino, leitura e destino ----------------------------------
const n = await navegador.newContext({ viewport: { width: 1400, height: 900 }, locale: "pt-BR" });
const pn = await n.newPage();
const erros = [];
pn.on("pageerror", (e) => erros.push(e.message));
pn.on("response", (r) => {
  const url = r.url().replace(B, "");
  if (url.startsWith("/") && r.status() >= 500) erros.push(`${r.status()} ${url}`);
});
await pn.goto(`${B}/login`, { waitUntil: "networkidle" });
await pn.fill('input[type="email"]', "teste.nutri@local.test");
await pn.fill('input[type="password"]', "teste-nutri-123");
await pn.click('button[type="submit"]');
await pn.waitForTimeout(2500);
const naoLidasAntes = Number(sql(`select count(*) from notificacoes_profissionais where usuario_id = '${NUTRI}' and lido_em is null;`));
const sino = pn.locator(".menu-lateral").getByRole("button", { name: /Notificações/ });
conferir("contador de não lidas no sino", (await sino.textContent()).includes(String(Math.min(naoLidasAntes, 99))), await sino.textContent());
await sino.click();
const painel = pn.locator(".p-overlaypanel");
await painel.waitFor();
await pn.waitForTimeout(800);
conferir("lista mostra o paciente e o evento", (await painel.textContent()).includes(NOME_P) && (await painel.textContent()).includes("Enviou 3 exames."), null);
await pn.screenshot({ path: path.join(PASTA, "m2-sino.png") });
conferir("abrir o sino não marca nada como lido", Number(sql(`select count(*) from notificacoes_profissionais where usuario_id = '${NUTRI}' and lido_em is null;`)) === naoLidasAntes, null);
await painel.locator("a", { hasText: "Enviou 3 exames." }).click();
await pn.waitForURL(/\/exames\?paciente=/);
await pn.waitForTimeout(2000);
conferir("clique leva aos exames do paciente", (await pn.getByText(`Exames de ${NOME_P}`).count()) === 1, pn.url());
const leitura = sql(`select tipo || '=' || (lido_em is not null) from notificacoes_profissionais where patient_id = '${P}' and usuario_id = '${NUTRI}' and tipo <> 'desconforto' order by tipo;`).split("\n").join(" ");
conferir("só o aviso clicado fica lido", leitura === "anamnese=false exames=true relatorio=false renovacao=false", leitura);
conferir("o outro nutricionista continua com o aviso não lido", NUTRICIONISTAS < 2 || sql(`select count(*) from notificacoes_profissionais where patient_id = '${P}' and tipo = 'exames' and usuario_id <> '${NUTRI}' and lido_em is null;`) === "1", null);

const idAnamnese = sql(`select id from notificacoes_profissionais where patient_id = '${P}' and tipo = 'anamnese' and usuario_id = '${NUTRI}';`);
await pn.goto(`${B}/avisos/${idAnamnese}`, { waitUntil: "networkidle" });
conferir("anamnese abre a anamnese certa", pn.url().endsWith(`/nutricao/${P}/consultas/${CONSULTA}/anamnese/${ANAMNESE}`), pn.url());
const idOutro = sql(`select id from notificacoes_profissionais where patient_id = '${P}' and tipo = 'exames' and usuario_id <> '${NUTRI}' limit 1;`);
if (idOutro) {
  await pn.goto(`${B}/avisos/${idOutro}`, { waitUntil: "networkidle" });
  conferir("aviso de outra conta não abre nem é marcado", sql(`select (lido_em is null)::text from notificacoes_profissionais where id = '${idOutro}';`) === "true", pn.url());
}

// Sem sessão: o link pede login e volta ao conteúdo.
const idRelatorio = sql(`select id from notificacoes_profissionais where patient_id = '${P}' and tipo = 'relatorio' and usuario_id = '${NUTRI}';`);
const s = await navegador.newContext({ viewport: { width: 390, height: 900 }, locale: "pt-BR" });
const ps = await s.newPage();
await ps.goto(`${B}/avisos/${idRelatorio}`, { waitUntil: "networkidle" });
conferir("link sem sessão vai para o login", ps.url().includes("/login?voltar="), ps.url());
conferir("nada é marcado sem login", sql(`select (lido_em is null)::text from notificacoes_profissionais where id = '${idRelatorio}';`) === "true", null);
await ps.fill('input[type="email"]', "teste.nutri@local.test");
await ps.fill('input[type="password"]', "teste-nutri-123");
await ps.click('button[type="submit"]');
await ps.waitForTimeout(3500);
conferir("depois do login, abre o relatório certo", ps.url().endsWith(`/pacientes/${P}/relatorio/${RELATORIO}`), ps.url());
conferir("e marca o aviso como lido", sql(`select (lido_em is not null)::text from notificacoes_profissionais where id = '${idRelatorio}';`) === "true", null);
const sinoCelular = ps.locator(".barra-superior").getByRole("button", { name: /Notificações/ });
conferir("celular: sino na barra superior", (await sinoCelular.count()) === 1, null);
await s.close();

// --- Configurações → Notificações -------------------------------------------
sql(`insert into push_profissionais (usuario_id, endpoint, p256dh, auth_key, descricao, ativo) values ('${NUTRI}', '${ENDPOINT}', 'x', 'y', 'Chrome no Android', false);`);
await pn.goto(`${B}/nutricao/configuracoes/notificacoes`, { waitUntil: "networkidle" });
await pn.waitForTimeout(1500);
const lista = pn.locator('section[aria-label="Aparelhos cadastrados"]');
conferir("aparelho cadastrado aparece", (await lista.getByText("Chrome no Android").count()) === 1, null);
await pn.screenshot({ path: path.join(PASTA, "m2-configuracoes.png"), fullPage: true });
await lista.locator("li", { hasText: "Chrome no Android" }).locator(".p-inputswitch").click();
await pn.waitForTimeout(1000);
conferir("ligar o push do aparelho", sql(`select ativo::text from push_profissionais where endpoint = '${ENDPOINT}';`) === "true", null);
await lista.locator("li", { hasText: "Chrome no Android" }).locator(".p-inputswitch").click();
await pn.waitForTimeout(1000);
conferir("pausar o push do aparelho", sql(`select ativo::text from push_profissionais where endpoint = '${ENDPOINT}';`) === "false", null);
const antesRemover = sql(`select count(*) from notificacoes_profissionais where usuario_id = '${NUTRI}';`);
await lista.getByRole("button", { name: "Remover aparelho" }).click();
await pn.getByRole("button", { name: "Confirmar" }).click();
await pn.waitForTimeout(1000);
conferir("remover o aparelho não apaga o histórico", sql(`select count(*) from push_profissionais where endpoint = '${ENDPOINT}';`) === "0" && sql(`select count(*) from notificacoes_profissionais where usuario_id = '${NUTRI}';`) === antesRemover, null);

// Paciente e educador não leem o sino do nutricionista.
const p2 = await navegador.newContext();
const pp = await p2.newPage();
await pp.goto(`${B}/login`, { waitUntil: "networkidle" });
await pp.fill('input[type="email"]', "teste.paciente@local.test");
await pp.fill('input[type="password"]', "654987");
await pp.click('button[type="submit"]');
await pp.waitForTimeout(2500);
conferir("paciente não acessa o sino", (await pp.evaluate(async () => (await fetch("/api/avisos")).status)) === 403, null);
await pp.goto(`${B}/avisos/${idAnamnese}`, { waitUntil: "networkidle" });
conferir("paciente não abre aviso do nutricionista", !pp.url().includes("/anamnese/"), pp.url());
await p2.close();
conferir("sem erros", erros.length === 0, erros);

await navegador.close();
fs.rmSync(temp, { recursive: true, force: true });
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

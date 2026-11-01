// Melhorias 01/11/2026. Item 3: fotos corporais no link de anamnese e
// sobreposição no Comparativo de fotos. Ver LEIA-ME.md para rodar.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const B = "http://localhost:3100";
const PASTA = path.join(import.meta.dirname, "visual");
fs.mkdirSync(PASTA, { recursive: true });
const ARQUIVOS = process.env.ARQUIVOS_DIR;
if (!ARQUIVOS) throw new Error("Defina ARQUIVOS_DIR (a mesma pasta do servidor de desenvolvimento).");
const navegador = await chromium.launch({ channel: "msedge", headless: true });
let falhas = 0;
const conferir = (nome, ok, detalhe) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 500)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();

const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const IMAGEM = path.join(import.meta.dirname, "..", "..", "public", "icon-512.png");
const HOJE = sql("select (now() at time zone 'America/Sao_Paulo')::date::text;");
const CICLO_ANTES = sql(`select string_agg(id::text || start_date::text || end_date::text || status, ',' order by start_date) from diet_cycles where patient_id = '${P}';`);

function limpar() {
  sql(`delete from fotos_evolucao where patient_id = '${P}' and (data = '${HOJE}' or origem = 'link' or storage_path like '${P}/teste-antiga-%');
       delete from payments where patient_id in (select id from patients where name = 'Paciente Teste Fotos');
       delete from notification_queue where patient_id in (select id from patients where name = 'Paciente Teste Fotos');
       delete from fotos_evolucao where patient_id in (select id from patients where name = 'Paciente Teste Fotos');
       delete from diet_cycles where patient_id in (select id from patients where name = 'Paciente Teste Fotos');
       delete from patients where name = 'Paciente Teste Fotos';`);
}
limpar();
const fotosDeHoje = () => sql(`select string_agg(perfil || '/' || origem, ',' order by perfil) from fotos_evolucao where patient_id = '${P}' and data = '${HOJE}';`);

async function entrar(email, senha, largura) {
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
    await pagina.waitForTimeout(2500);
  }
  return { contexto, pagina, erros };
}

const n = await entrar("teste.nutri@local.test", "teste-nutri-123", 1400);
const link = await n.pagina.evaluate(async (p) => (await (await fetch(`/api/nutricao/pacientes/${p}/link-formularios`)).json()).url, P);
const base = new URL(link).pathname.replace("/formulario/", "/api/formulario/");

// --- Paciente pelo link (sem login) ------------------------------------------
const a = await entrar(null, null, 390);
await a.pagina.goto(link, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
const secao = a.pagina.locator('section[aria-label="Fotos Corporais"]');
conferir("link mostra a seção Fotos Corporais", (await secao.count()) === 1, null);
conferir("sexo do cadastro (feminino) e avatares de frente e costas", (await secao.getByText("Feminino").count()) === 1 && (await secao.getByRole("img", { name: "Silhueta feminino, de frente" }).count()) === 1 && (await secao.getByRole("img", { name: "Silhueta feminino, de costas" }).count()) === 1, null);
conferir("anamnese continua no link, sem exigir fotos", (await a.pagina.getByText(/anamnese|recordatório|Nenhum formulário para preencher/i).count()) >= 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "m3-link-celular.png"), fullPage: true });

await secao.getByLabel("Foto de Frente").setInputFiles(IMAGEM);
await a.pagina.waitForTimeout(2000);
conferir("uma foto só (Frente) é aceita", fotosDeHoje() === "frente/link", fotosDeHoje());
conferir("miniatura da foto enviada hoje aparece", (await secao.getByRole("img", { name: "Sua foto de Frente" }).count()) === 1, null);
const caminhoFrente = sql(`select storage_path from fotos_evolucao where patient_id = '${P}' and data = '${HOJE}' and perfil = 'frente';`);
const repetida = await a.pagina.evaluate(async ([b, arquivo]) => {
  const r = await fetch(`${b}/fotos?perfil=frente`, { method: "POST", headers: { "Content-Type": "image/png" }, body: new Uint8Array(arquivo) });
  return r.status;
}, [base, [...fs.readFileSync(IMAGEM)]]);
conferir("mesma posição no mesmo dia não substitui a foto", repetida === 409 && sql(`select storage_path from fotos_evolucao where patient_id = '${P}' and data = '${HOJE}' and perfil = 'frente';`) === caminhoFrente, repetida);
const falsa = await a.pagina.evaluate(async (b) => (await fetch(`${b}/fotos?perfil=lado`, { method: "POST", headers: { "Content-Type": "image/png" }, body: "isto não é imagem" })).status, base);
conferir("arquivo que não é imagem é recusado no servidor", falsa === 400 && !fotosDeHoje().includes("lado"), falsa);
await secao.getByLabel("Foto de Costas").setInputFiles(IMAGEM);
await a.pagina.waitForTimeout(2000);
conferir("completar outra posição no mesmo dia", fotosDeHoje() === "costas/link,frente/link", fotosDeHoje());
const ciclo = sql(`select coalesce(ciclo_id::text, 'sem') from fotos_evolucao where patient_id = '${P}' and data = '${HOJE}' and perfil = 'frente';`);
const cicloEsperado = sql(`select coalesce((select id::text from diet_cycles where patient_id = '${P}' and start_date <= '${HOJE}' and end_date >= '${HOJE}' order by start_date desc limit 1), 'sem');`);
conferir("foto associada ao ciclo que contém a data do envio", ciclo === cicloEsperado, [ciclo, cicloEsperado]);

await secao.locator("div", { hasText: "Costas" }).getByRole("button", { name: "Excluir" }).last().click();
await a.pagina.getByRole("button", { name: "Confirmar" }).click();
await a.pagina.waitForTimeout(1500);
conferir("paciente exclui a própria foto", fotosDeHoje() === "frente/link", fotosDeHoje());
conferir("o link não lê foto de outro dia", (await a.pagina.evaluate(async (b) => (await fetch(`${b}/fotos`)).json(), base)).fotos.length === 1, null);
conferir("token inválido é recusado", (await a.pagina.evaluate(async () => (await fetch("/api/formulario/token-falso/fotos")).status)) === 404, null);
conferir("sem erros (paciente)", a.erros.length === 0, a.erros);

// Ciclo de 33 dias intacto.
conferir("enviar fotos não altera o ciclo de dieta", sql(`select string_agg(id::text || start_date::text || end_date::text || status, ',' order by start_date) from diet_cycles where patient_id = '${P}';`) === CICLO_ANTES, null);

// Foto antes do primeiro ciclo: associada quando o ciclo começa, mantendo a data.
const NOVO = sql(`insert into patients (name, plan) values ('Paciente Teste Fotos', 'Mensal') returning id;`).split("\n")[0];
sql(`insert into fotos_evolucao (patient_id, perfil, data, storage_path, origem) values ('${NOVO}', 'frente', current_date - 3, '${NOVO}/x.png', 'link');`);
conferir("antes do 1º ciclo, a foto fica como registro inicial", sql(`select coalesce(ciclo_id::text, 'sem') from fotos_evolucao where patient_id = '${NOVO}';`) === "sem", null);
const CICLO1 = sql(`insert into diet_cycles (patient_id, start_date, end_date, followup_frequency, cycle_number) values ('${NOVO}', current_date, current_date + 32, 'Mensal', 1) returning id;`).split("\n")[0];
conferir("o 1º ciclo recebe a foto inicial, com a data original", sql(`select ciclo_id || '|' || (data = current_date - 3) from fotos_evolucao where patient_id = '${NOVO}';`) === `${CICLO1}|true`, null);
conferir("o ciclo continua com 33 dias a partir do início", sql(`select (end_date - start_date)::text from diet_cycles where id = '${CICLO1}';`) === "32", null);

// --- Nutricionista: Comparativo e sobreposição -------------------------------
// Uma foto de Frente mais antiga (cópia do arquivo) para comparar.
const antigo = `${P}/teste-antiga-frente.png`;
fs.mkdirSync(path.join(ARQUIVOS, "fotos", P), { recursive: true });
fs.copyFileSync(IMAGEM, path.join(ARQUIVOS, "fotos", antigo));
sql(`insert into fotos_evolucao (patient_id, perfil, data, storage_path) values ('${P}', 'frente', current_date - 40, '${antigo}');`);
const hashAntes = fs.readFileSync(path.join(ARQUIVOS, "fotos", antigo)).toString("base64");

await n.pagina.goto(`${B}/pacientes/${P}`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(2500);
const comparativo = n.pagina.locator("section", { hasText: "Comparativo de fotos" });
conferir("foto do link aparece no Comparativo de fotos (mesma galeria)", (await comparativo.getByRole("button", { name: new RegExp(`^${HOJE.split("-").reverse().join("/")}`) }).count()) === 1, null);
await comparativo.getByRole("button", { name: "Sobrepor as duas fotos" }).click();
const dialogo = n.pagina.locator(".p-dialog", { hasText: "Sobrepor fotos" });
await dialogo.waitFor();
await n.pagina.waitForTimeout(800);
conferir("sobreposição abre com as duas fotos", (await dialogo.locator("img").count()) === 2, null);
await dialogo.getByRole("slider", { name: "Transparência" }).focus();
for (let i = 0; i < 5; i++) await n.pagina.keyboard.press("ArrowRight");
await dialogo.getByRole("button", { name: "Mover para a direita" }).click();
const area = dialogo.locator('[aria-label^="Área de sobreposição"]');
const caixa = await area.boundingBox();
await n.pagina.mouse.move(caixa.x + 100, caixa.y + 100);
await n.pagina.mouse.down();
await n.pagina.mouse.move(caixa.x + 140, caixa.y + 120, { steps: 5 });
await n.pagina.mouse.up();
const transformacao = await dialogo.locator("img").nth(1).evaluate((img) => img.style.transform);
conferir("transparência, arrastar e alinhamento mexem só na tela", (await dialogo.getByText("Transparência da foto de cima: 55%").count()) === 1 && transformacao.includes("translate(42px, 20px)"), transformacao);
await n.pagina.screenshot({ path: path.join(PASTA, "m3-sobreposicao.png") });
await dialogo.getByRole("button", { name: "Close" }).click();
await n.pagina.waitForTimeout(500);
// Arrastar e soltar (computador) abre de novo, sem os ajustes anteriores.
const figuras = comparativo.locator("figure");
await figuras.nth(1).dragTo(figuras.nth(0));
await dialogo.waitFor();
conferir("arrastar uma foto sobre a outra abre a sobreposição", await dialogo.isVisible(), null);
conferir("ajustes descartados ao fechar (opção B)", (await dialogo.getByText("Transparência da foto de cima: 50%").count()) === 1 && !(await dialogo.locator("img").nth(1).evaluate((img) => img.style.transform)).includes("42px"), null);
conferir("foto original intacta", fs.readFileSync(path.join(ARQUIVOS, "fotos", antigo)).toString("base64") === hashAntes, null);
conferir("sem erros (nutricionista)", n.erros.length === 0, n.erros);

await navegador.close();
if (process.argv.includes("--limpar")) {
  limpar();
  fs.rmSync(path.join(ARQUIVOS, "fotos", antigo), { force: true });
}
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

// Melhorias 01/11/2026. Item 1: copiar alimento da TACO para cadastro próprio.
// Ver LEIA-ME.md para rodar.
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
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 500)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();

// Arroz, tipo 1, cozido (TACO nº 3): tem traços, medida caseira e substituição.
const ORIGINAL = sql(`select id from alimentos where fonte = 'taco' and codigo_origem = '3';`);
const limpar = () => sql(`delete from alimentos where copiado_de = '${ORIGINAL}';`);
limpar();
const retratoDoOriginal = () =>
  sql(`select string_agg(nutriente || '=' || coalesce(valor::text, 'tr') || '/' || fonte, ',' order by nutriente) from alimentos_nutrientes where alimento_id = '${ORIGINAL}';`);
const ANTES = retratoDoOriginal();
const copias = () => sql(`select count(*) from alimentos where copiado_de = '${ORIGINAL}';`);
const valorDaCopia = (id, n) => sql(`select coalesce(valor::text, 'tr') || '/' || fonte from alimentos_nutrientes where alimento_id = '${id}' and nutriente = '${n}';`);

const contexto = await navegador.newContext({ viewport: { width: 1400, height: 900 }, locale: "pt-BR" });
const pg = await contexto.newPage();
const erros = [];
pg.on("pageerror", (e) => erros.push(e.message));
pg.on("response", (r) => {
  const url = r.url().replace(B, "");
  if (url.startsWith("/api/") && r.status() >= 500) erros.push(`${r.status()} ${url}`);
});
await pg.goto(`${B}/login`, { waitUntil: "networkidle" });
await pg.fill('input[type="email"]', "teste.nutri@local.test");
await pg.fill('input[type="password"]', "teste-nutri-123");
await pg.click('button[type="submit"]');
await pg.waitForTimeout(2500);

const linha = (nome) => pg.locator("tr", { has: pg.locator("td", { hasText: new RegExp(`^${nome}$`) }) });

await pg.goto(`${B}/nutricao/configuracoes/alimentos/${ORIGINAL}`, { waitUntil: "networkidle" });
await pg.waitForTimeout(1500);
await pg.screenshot({ path: path.join(PASTA, "m1-taco-botao.png") });
await pg.getByRole("button", { name: "Copiar alimento" }).click();
await pg.waitForURL(/alimentos\/novo\?copiar=/);
await pg.waitForTimeout(2000);
conferir("formulário abre com o nome “(Cópia)”", (await pg.locator("#nome-alimento").inputValue()) === "Arroz, tipo 1, cozido (Cópia)", await pg.locator("#nome-alimento").inputValue());
conferir("abrir a cópia não grava nada", copias() === "0", copias());
conferir("valores copiados aparecem como TACO", (await linha("Carboidratos").textContent()).includes("taco"), await linha("Carboidratos").textContent());
conferir("traço continua traço (Tr), não zero", (await linha("Tiamina \\(B1\\)").locator("input").getAttribute("placeholder")) === "Tr", null);
conferir("ausente continua em branco", (await linha("Colesterol").locator("input").inputValue()) === "", null);

await pg.getByRole("button", { name: "Cancelar" }).click();
await pg.waitForTimeout(1500);
conferir("Cancelar volta ao original sem criar registro", pg.url().endsWith(ORIGINAL) && copias() === "0", pg.url());

await pg.getByRole("button", { name: "Copiar alimento" }).click();
await pg.waitForURL(/alimentos\/novo\?copiar=/);
await pg.waitForTimeout(2000);
await linha("Proteínas").locator("input").fill("3");
await linha("Colesterol").locator("input").fill("5");
conferir("valor alterado vira Personalizado na hora", (await linha("Proteínas").textContent()).includes("Personalizado"), null);
conferir("valor preenchido onde não havia vira Personalizado", (await linha("Colesterol").textContent()).includes("Personalizado"), null);
await pg.screenshot({ path: path.join(PASTA, "m1-copia-formulario.png"), fullPage: true });
await pg.getByRole("button", { name: "Salvar cópia" }).click();
await pg.waitForTimeout(2500);
conferir("Salvar cria uma única cópia", copias() === "1", copias());
const COPIA = sql(`select id from alimentos where copiado_de = '${ORIGINAL}';`);
conferir("abre a cópia gravada", pg.url().endsWith(COPIA), pg.url());
conferir("proteínas alteradas = Personalizado", valorDaCopia(COPIA, "proteinas") === "3.0000/manual", valorDaCopia(COPIA, "proteinas"));
conferir("carboidratos iguais = TACO", valorDaCopia(COPIA, "carboidratos") === "28.1000/taco", valorDaCopia(COPIA, "carboidratos"));
conferir("colesterol novo = Personalizado", valorDaCopia(COPIA, "colesterol") === "5.0000/manual", null);
conferir(
  "todos os nutrientes e traços copiados",
  sql(`select count(*) || '/' || count(*) filter (where traco) from alimentos_nutrientes where alimento_id = '${COPIA}';`) ===
    sql(`select (count(*) + 1) || '/' || count(*) filter (where traco) from alimentos_nutrientes where alimento_id = '${ORIGINAL}';`),
  null
);
conferir(
  "medidas caseiras e substituições copiadas",
  sql(`select (select count(*) from medidas_caseiras where alimento_id = '${COPIA}') || '/' || (select count(*) from substituicoes where alimento_id = '${COPIA}');`) ===
    sql(`select (select count(*) from medidas_caseiras where alimento_id = '${ORIGINAL}') || '/' || (select count(*) from substituicoes where alimento_id = '${ORIGINAL}');`),
  null
);
conferir("selo “Cópia de” na cópia", (await pg.getByText("Cópia de Arroz, tipo 1, cozido").count()) === 1, null);
conferir("selos persistem ao reabrir", (await linha("Proteínas").textContent()).includes("Personalizado") && (await linha("Carboidratos").textContent()).includes("taco"), null);

// Restaurar o valor original volta a TACO.
await linha("Proteínas").locator("input").fill("2,5");
await pg.getByRole("button", { name: "Salvar composição" }).click();
await pg.waitForTimeout(1500);
conferir("valor restaurado ao original volta a TACO", valorDaCopia(COPIA, "proteinas") === "2.5000/taco", valorDaCopia(COPIA, "proteinas"));
await linha("Proteínas").locator("input").fill("2,6");
await pg.getByRole("button", { name: "Salvar composição" }).click();
await pg.waitForTimeout(1500);
conferir("alterar de novo volta a Personalizado", valorDaCopia(COPIA, "proteinas") === "2.6000/manual", null);
await pg.screenshot({ path: path.join(PASTA, "m1-copia-salva.png"), fullPage: true });

conferir("o original da TACO não mudou", retratoDoOriginal() === ANTES, null);

// Excluir (arquivar) a cópia: some da busca, o original continua.
await pg.getByRole("button", { name: "Arquivar" }).click();
await pg.getByRole("button", { name: "Confirmar" }).click();
await pg.waitForTimeout(1200);
const busca = await pg.evaluate(async () => (await (await fetch("/api/nutricao/alimentos?q=arroz%20tipo%201%20cozido")).json()).alimentos.map((a) => a.nome));
conferir("cópia excluída some da busca para novas dietas", !busca.some((n) => n.includes("(Cópia)")) && busca.includes("Arroz, tipo 1, cozido"), busca);
conferir("sem erros", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

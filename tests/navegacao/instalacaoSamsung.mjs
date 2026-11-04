// Aviso "Instale o aplicativo" no Samsung Internet (04/11/2026): o Play
// Protect do Android 14+ bloqueia o app gerado por esse navegador; o aviso
// orienta a instalar pelo Chrome. Ver LEIA-ME.md para rodar.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const B = "http://localhost:3100";
const PASTA = path.join(import.meta.dirname, "visual");
fs.mkdirSync(PASTA, { recursive: true });
const navegador = await chromium.launch({ channel: "msedge", headless: true });
let falhas = 0;
const conferir = (nome, ok, detalhe) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 400)}`);
};

const SAMSUNG = "Mozilla/5.0 (Linux; Android 16; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36";

async function abrir(agente) {
  const contexto = await navegador.newContext({ viewport: { width: 400, height: 860 }, locale: "pt-BR", userAgent: agente });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(e.message));
  await pagina.goto(`${B}/login`, { waitUntil: "networkidle" });
  await pagina.fill('input[type="email"]', "teste.paciente@local.test");
  await pagina.fill('input[type="password"]', "654987");
  await pagina.click('button[type="submit"]');
  await pagina.waitForURL(/area-paciente/, { timeout: 20000 }).catch(() => undefined);
  await pagina.waitForTimeout(2500);
  return { pagina, erros };
}

const s = await abrir(SAMSUNG);
const aviso = s.pagina.getByRole("region", { name: "Instalar o aplicativo" });
await aviso.waitFor({ timeout: 15000 }).catch(() => undefined);
conferir("Samsung Internet: o aviso orienta a usar o Chrome", (await aviso.getByText("Google Chrome").count()) === 1, null);
conferir("Samsung Internet: sem o botão Instalar", (await aviso.getByRole("button", { name: "Instalar" }).count()) === 0, null);
const link = await aviso.getByRole("link", { name: "Abrir no Chrome" }).getAttribute("href").catch(() => null);
conferir("link abre a mesma página no Chrome", /^intent:\/\/localhost:3100\/area-paciente#Intent;scheme=http;package=com\.android\.chrome;/.test(link ?? ""), link);
await s.pagina.screenshot({ path: path.join(PASTA, "instalacao-samsung.png"), fullPage: true });

const c = await abrir(undefined);
conferir("outros navegadores: sem a orientação do Chrome", (await c.pagina.getByText("Pelo navegador da Samsung").count()) === 0, null);

conferir("sem erros de página", [...s.erros, ...c.erros].length === 0, [...s.erros, ...c.erros]);
await navegador.close();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

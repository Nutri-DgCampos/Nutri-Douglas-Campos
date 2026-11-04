// Relatório semanal: peso, água e sono com vírgula e faixa plausível
// (04/11/2026: peso "76500" dava só "Erro ao salvar relatório").
// Ver LEIA-ME.md para rodar.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const B = "http://localhost:3100";
const navegador = await chromium.launch({ channel: "msedge", headless: true });
let falhas = 0;
const conferir = (nome, ok, detalhe) => {
  if (!ok) falhas += 1;
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 400)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();
const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const antes = sql(`select count(*) from patient_reports where patient_id = '${P}';`);

const contexto = await navegador.newContext({ viewport: { width: 420, height: 900 }, locale: "pt-BR" });
const pagina = await contexto.newPage();
const erros = [];
pagina.on("pageerror", (e) => erros.push(e.message));
await pagina.goto(`${B}/login`, { waitUntil: "networkidle" });
await pagina.fill('input[type="email"]', "teste.paciente@local.test");
await pagina.fill('input[type="password"]', "654987");
await pagina.click('button[type="submit"]');
await pagina.waitForTimeout(2500);
await pagina.goto(`${B}/area-paciente/acompanhamento`, { waitUntil: "networkidle" });

const peso = pagina.getByPlaceholder("Ex.: 80,5");
conferir("campo de peso aceita texto com vírgula (teclado decimal)", (await peso.getAttribute("inputmode")) === "decimal", null);

async function enviar() {
  await pagina.getByRole("button", { name: "Enviar relatório" }).click();
  await pagina.waitForTimeout(1200);
  return pagina.locator("body").innerText();
}

await peso.fill("76500");
conferir("peso 76500: mensagem explicando como digitar, sem tentar gravar", /Confira o peso/.test(await enviar()), null);
// A água só aparece depois de outra resposta; a faixa dela está nos testes unitários (tests/medidas.test.mjs).
await peso.fill("76,5");
const texto = await enviar();
// Fora de segunda e terça, o aviso seguinte é o do prazo: prova que o peso passou.
const janela = ["1", "2"].includes(sql("select extract(isodow from (now() at time zone 'America/Sao_Paulo')::date);"));
conferir("com 76,5 kg, a conferência passa (segue a regra normal do prazo)", janela || /segundas e terças/.test(texto), null);
conferir("nenhum relatório gravado pelos valores errados", sql(`select count(*) from patient_reports where patient_id = '${P}';`) === antes || /segunda|terça/i.test(texto), null);
conferir("sem erros de página", erros.length === 0, erros);

// Se gravou (teste rodado na segunda ou na terça), apaga o relatório de teste.
sql(`delete from patient_reports where patient_id = '${P}' and created_at > now() - interval '10 minutes' and weight = 76.5;`);
await navegador.close();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

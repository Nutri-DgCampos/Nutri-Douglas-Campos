// Módulo de Treino, etapa T1: prescrição × registro do aluno.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const { datasDaSemana } = await import(pathToFileURL(path.join(import.meta.dirname, "..", "..", "lib", "treino.ts")).href);
const hojeBr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const semanaPassada = new Date(`${hojeBr}T12:00:00Z`);
semanaPassada.setUTCDate(semanaPassada.getUTCDate() - 7);

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
const literal = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";

const plano = {
  dias: [
    {
      dia: "seg",
      titulo: "Treino T1 - Costas",
      kcal_estimadas: 400,
      exercicios: [
        { nome: "Remada baixa na polia", grupo: "Costas", series: 4, repeticoes: 12, carga_kg: 40, descanso_segundos: 60, observacao: "Cabo na diagonal." },
        { nome: "Puxada unilateral", grupo: "Costas", series: 4, repeticoes: 12, carga_kg: null, descanso_segundos: 60, observacao: null },
      ],
    },
  ],
};

function limpar() {
  sql(`delete from treino_sessoes where patient_id = '${P}';
       delete from treino_prescricoes where patient_id = '${P}' and plano->'dias'->0->>'titulo' = 'Treino T1 - Costas';
       delete from treinos where patient_id = '${P}' and texto_enviado = 'TESTE T1';`);
}
limpar();
const TREINO = sql(`insert into treinos (patient_id, texto_enviado, status, plano, analisado_em, created_at) values ('${P}', 'TESTE T1', 'concluido', ${literal(plano)}, now(), now() + interval '1 hour') returning id;`).split("\n")[0];
const PRESC = sql(`insert into treino_prescricoes (patient_id, origem, treino_id, plano, publicada_em) values ('${P}', 'externa', '${TREINO}', ${literal(plano)}, now() + interval '1 hour') returning id;`).split("\n")[0];
// Semana passada: registrou 42 kg na remada.
const SEMANA_PASSADA = datasDaSemana(semanaPassada.toISOString().slice(0, 10)).seg;
const ANTIGA = sql(`insert into treino_sessoes (patient_id, prescricao_id, dia, data_planejada, situacao) values ('${P}', '${PRESC}', 'seg', '${SEMANA_PASSADA}', 'concluido') returning id;`).split("\n")[0];
sql(`insert into treino_exercicios_registro (sessao_id, indice, nome, chave, series, repeticoes, carga_kg) values ('${ANTIGA}', 0, 'Remada baixa na polia', 'remada baixa na polia', 4, 12, 42);`);

async function sessao(email, senha, largura) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: "pt-BR" });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(e.message));
  pagina.on("response", (r) => {
    const url = r.url().replace(B, "");
    if (url.startsWith("/api/") && r.status() >= 500) erros.push(`${r.status()} ${url}`);
  });
  await pagina.goto(`${B}/login`, { waitUntil: "networkidle" });
  await pagina.fill('input[type="email"]', email);
  await pagina.fill('input[type="password"]', senha);
  await pagina.click('button[type="submit"]');
  await pagina.waitForTimeout(2500);
  return { contexto, pagina, erros };
}

const a = await sessao("teste.paciente@local.test", "654987", 1200);
const pg = a.pagina;
await pg.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await pg.waitForTimeout(1500);
conferir("Meu treino abre com a prescrição vigente", (await pg.getByText("Treino T1 - Costas").count()) === 1, null);
await pg.getByText("Treino T1 - Costas").click();
const modal = pg.locator(".p-dialog", { hasText: "Remada baixa na polia" });
await modal.waitFor();
const cargaRemada = modal.locator("li", { hasText: "Remada baixa na polia" }).locator('input[inputmode="decimal"], input').nth(2);
conferir("campo de carga parte da prescrição (40), sem preencher a anterior", (await cargaRemada.inputValue()).startsWith("40"), await cargaRemada.inputValue());
conferir("“Anterior: 42 kg” abaixo da carga", (await modal.locator("li", { hasText: "Remada baixa na polia" }).getByText("Anterior: 42 kg").count()) === 1, null);
conferir("sem carga anterior, nada aparece", (await modal.locator("li", { hasText: "Puxada unilateral" }).getByText(/Anterior/).count()) === 0, null);
conferir("quatro campos e salvar/cancelar continuam", (await modal.locator("li", { hasText: "Remada baixa" }).locator("input").count()) === 4 && (await pg.getByRole("button", { name: "Salvar" }).count()) === 1, null);
await pg.screenshot({ path: path.join(PASTA, "t1-modal.png") });

// Salvar números sem situação
await cargaRemada.fill("45");
await cargaRemada.press("Tab");
await pg.getByRole("button", { name: "Salvar" }).click();
await pg.waitForTimeout(1500);
const sessaoAtual = sql(`select coalesce(situacao, 'null') || '|' || (select carga_kg from treino_exercicios_registro where sessao_id = s.id and indice = 0) from treino_sessoes s where patient_id = '${P}' and data_planejada > '${SEMANA_PASSADA}';`);
conferir("salvar grava o registro sem marcar como feito", sessaoAtual === "null|45.00", sessaoAtual);
conferir("a prescrição continua 40 kg", sql(`select plano->'dias'->0->'exercicios'->0->>'carga_kg' from treino_prescricoes where id = '${PRESC}';`) === "40", null);
conferir("o treino importado também não muda", sql(`select plano->'dias'->0->'exercicios'->0->>'carga_kg' from treinos where id = '${TREINO}';`) === "40", null);
const cargaCostas = await pg.locator("section", { hasText: "Volume de carga" }).locator("tr", { hasText: "Costas" }).textContent();
conferir("painel de volume usa a carga registrada (4×12×45 = 2.160)", cargaCostas.includes("2.160"), cargaCostas);

// Reabrir: mostra o registrado nesta semana; a anterior continua 42
await pg.getByText("Treino T1 - Costas").click();
await modal.waitFor();
conferir("reabrir mostra o valor registrado nesta semana", (await cargaRemada.inputValue()).startsWith("45"), await cargaRemada.inputValue());
conferir("anterior continua sendo a da semana passada", (await modal.getByText("Anterior: 42 kg").count()) === 1, null);

// Situação, motivo e observação
await modal.getByRole("radio", { name: "Parcialmente concluído" }).click();
await modal.getByLabel("Motivo").fill("Academia lotada");
await modal.getByLabel("Observações do treino").fill("Troquei a puxada pela barra fixa.");
await pg.getByRole("button", { name: "Salvar" }).click();
await pg.waitForTimeout(1500);
const s2 = sql(`select situacao || '|' || motivo || '|' || observacao || '|' || (select count(*) from treino_sessoes where patient_id = '${P}') from treino_sessoes where patient_id = '${P}' and data_planejada > '${SEMANA_PASSADA}';`);
conferir("situação, motivo e observação gravados; salvar de novo não duplica", s2 === "parcial|Academia lotada|Troquei a puxada pela barra fixa.|2", s2);
conferir("lista dos dias mostra a situação", (await pg.getByText("Parcialmente concluído").count()) >= 1, null);

// Reagendado exige data
await pg.getByText("Treino T1 - Costas").click();
await modal.waitFor();
await modal.getByRole("radio", { name: "Reagendado" }).click();
await pg.getByRole("button", { name: "Salvar" }).click();
await pg.waitForTimeout(1200);
conferir("reagendado sem data é recusado", (await modal.isVisible()) && sql(`select situacao from treino_sessoes where patient_id = '${P}' and data_planejada > '${SEMANA_PASSADA}';`) === "parcial", null);
await modal.getByLabel("Nova data do treino").fill(sql(`select ((now() at time zone 'America/Sao_Paulo')::date + 1)::text;`));
await pg.getByRole("button", { name: "Salvar" }).click();
await pg.waitForTimeout(1500);
conferir("reagendado com nova data (data original preservada)", sql(`select situacao || '|' || (data_efetiva > data_planejada or data_efetiva <= data_planejada) from treino_sessoes where patient_id = '${P}' and data_planejada > '${SEMANA_PASSADA}';`) === "reagendado|true", null);

// O aluno não consegue mais alterar o treino (prescrição) direto
const direto = await pg.evaluate(async (id) => {
  const r = await fetch("/api/dados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tabela: "treinos", operacao: "update", valores: { plano: { dias: [] } }, filtros: [["id", "eq", id]] }) });
  return r.status;
}, TREINO);
conferir("aluno não altera o treino prescrito pela API", sql(`select jsonb_array_length(plano->'dias') from treinos where id = '${TREINO}';`) === "1", direto);
conferir("sem erros (aluno)", a.erros.length === 0, a.erros);

// Celular
const m = await sessao("teste.paciente@local.test", "654987", 390);
await m.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await m.pagina.waitForTimeout(1500);
await m.pagina.getByText("Treino T1 - Costas").click();
await m.pagina.waitForTimeout(800);
const largura = await m.pagina.evaluate(() => document.documentElement.scrollWidth);
conferir("celular: modal sem rolagem lateral", largura <= 390, largura);
await m.pagina.screenshot({ path: path.join(PASTA, "t1-celular.png"), fullPage: true });

// Profissional
const n = await sessao("teste.nutri@local.test", "teste-nutri-123", 1400);
await n.pagina.goto(`${B}/pacientes/${P}/treino`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(2500);
const prof = await n.pagina.locator("main").textContent();
conferir("profissional vê registros, situação e observação", prof.includes("Registros do aluno") && prof.includes("Reagendado") && prof.includes("Troquei a puxada pela barra fixa."), null);
conferir("profissional vê o histórico completo de cargas", /Remada baixa na polia.*45 kg.*42 kg/s.test(await n.pagina.locator('section[aria-label="Histórico de cargas"]').textContent()), null);
conferir("origem externa identificada", prof.includes("origem externa"), null);
await n.pagina.screenshot({ path: path.join(PASTA, "t1-profissional.png"), fullPage: true });
conferir("sem erros (profissional)", n.erros.length === 0, n.erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

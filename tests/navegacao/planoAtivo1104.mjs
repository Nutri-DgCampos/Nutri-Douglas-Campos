// Correção do plano com o ciclo ativo (SPEC Plano Ativo, 04/11/2026; Opção B,
// S9–S12). Usa o paciente de teste da clínica e o ciclo ativo dele: guarda o
// estado do ciclo, monta três semanas vencidas e restaura tudo no fim.
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
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 600)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();

const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const CICLO = sql(`select id from diet_cycles where patient_id = '${P}' and status = 'ativo';`);
const hoje = sql("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD');");
// Segunda desta semana; ciclo começando 3 semanas antes: vencidos 3, o mais recente nesta segunda.
const SEG = sql(`select to_char(date_trunc('week', '${hoje}'::date)::date, 'YYYY-MM-DD');`);
const naJanela = ["1", "2"].includes(sql(`select extract(isodow from '${hoje}'::date);`));
const original = sql(`select start_date || '|' || end_date || '|' || followup_frequency || '|' || (select plan from patients where id = '${P}') from diet_cycles where id = '${CICLO}';`).split("|");

function limpar() {
  sql(`delete from patient_reports where cycle_id = '${CICLO}' and general_notes = 'Teste plano ativo';
       delete from patient_reports where cycle_id = '${CICLO}' and created_at > now() - interval '1 hour';
       delete from notification_queue where patient_id = '${P}' and dedup_key like 'relatorio_liberado:%';
       delete from plano_alteracoes where patient_id = '${P}';`);
}
function restaurar() {
  limpar();
  sql(`update diet_cycles set start_date = '${original[0]}', end_date = '${original[1]}', followup_frequency = '${original[2]}',
         relatorio_liberado_semana = null, relatorio_liberado_ate = null where id = '${CICLO}';
       update patients set plan = '${original[3]}' where id = '${P}';`);
}
limpar();
// Restaura o ciclo do paciente de teste mesmo se o teste quebrar no meio.
let restaurado = false;
process.on("exit", () => {
  if (!restaurado) restaurar();
});
// Cenário: cadastrado como mensal; 3 semanas vencidas no semanal.
sql(`update diet_cycles set start_date = '${SEG}'::date - 21, end_date = '${SEG}'::date - 21 + 33, followup_frequency = 'Mensal',
       relatorio_liberado_semana = null, relatorio_liberado_ate = null where id = '${CICLO}';
     update patients set plan = 'Mensal' where id = '${P}';`);

async function sessao(email, senha, largura = 1400) {
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
const api = (pagina, url, metodo = "GET", corpo) =>
  pagina.evaluate(
    async ([u, m, c]) => {
      const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: c ? JSON.stringify(c) : undefined });
      return { status: r.status, corpo: await r.json().catch(() => null) };
    },
    [url, metodo, corpo]
  );
const relatoriosDoCiclo = () => sql(`select count(*) from patient_reports where cycle_id = '${CICLO}';`);
const avisos = () => sql(`select count(*) from notification_queue where patient_id = '${P}' and dedup_key = 'relatorio_liberado:${CICLO}:${SEG}';`);

async function enviarRelatorio(pagina) {
  await pagina.goto(`${B}/area-paciente/acompanhamento`, { waitUntil: "networkidle" });
  await pagina.getByPlaceholder("Conte qualquer outra informação que considere importante nesta semana.").fill("Teste plano ativo");
  await pagina.getByRole("button", { name: "Enviar relatório" }).click();
  await pagina.waitForTimeout(2500);
}

const a = await sessao("teste.paciente@local.test", "654987", 420);
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");

// --- Antes da correção: ciclo mensal, nada aberto ------------------------------------
await a.pagina.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
conferir("antes: o paciente não tem relatório disponível", (await a.pagina.getByText("Nenhum relatório disponível no momento").count()) === 1, null);
if (!naJanela) {
  await enviarRelatorio(a.pagina);
  conferir("antes, fora de segunda e terça: o envio é recusado", relatoriosDoCiclo() === "0", null);
}

// --- Permissão ------------------------------------------------------------------------
conferir("o paciente não altera o plano", (await api(a.pagina, `/api/pacientes/${P}/plano`, "POST", { plano: "Semanal" })).status === 403, null);
conferir("plano inválido é recusado", (await api(n.pagina, `/api/pacientes/${P}/plano`, "POST", { plano: "Diário" })).status === 400, null);

// --- Mensal → semanal pela tela (CA-01, CA-12, CA-14) ----------------------------------
await n.pagina.goto(`${B}/pacientes/${P}/editar`, { waitUntil: "networkidle" });
await n.pagina.getByText("Plano contratado").waitFor({ timeout: 20000 });
await n.pagina.getByText("Plano contratado", { exact: true }).locator("xpath=..").locator(".p-dropdown").click();
await n.pagina.getByRole("option", { name: "Semanal", exact: true }).click();
await n.pagina.getByRole("button", { name: "Salvar alterações" }).click();
const dialogo = n.pagina.getByRole("dialog");
await dialogo.waitFor({ timeout: 20000 });
const texto = await dialogo.innerText();
conferir(
  "confirmação mostra anterior → novo, ciclo, periodicidade e o relatório que será liberado (RF-11)",
  /Mensal → Semanal/.test(texto) && /As datas, os pagamentos e a dieta não mudam/.test(texto) && /4 relatórios, um por semana/.test(texto) && /relatório 3/i.test(texto) && /Semanas anteriores não são regularizadas/.test(texto),
  texto
);
await n.pagina.screenshot({ path: path.join(PASTA, "plano-ativo-confirmacao.png") });
await dialogo.getByRole("button", { name: "Confirmar" }).click();
await n.pagina.waitForURL(`${B}/pacientes/${P}`, { timeout: 20000 }).catch(() => undefined);

const ciclo = sql(`select followup_frequency || '|' || start_date || '|' || end_date || '|' || coalesce(to_char(relatorio_liberado_semana, 'YYYY-MM-DD'), '-') || '|' || coalesce(to_char(relatorio_liberado_ate, 'YYYY-MM-DD'), '-') from diet_cycles where id = '${CICLO}';`).split("|");
conferir("cadastro e ciclo ficam semanais; datas do ciclo não mudam (CA-07, CA-13)", sql(`select plan from patients where id = '${P}';`) === "Semanal" && ciclo[0] === "Semanal" && ciclo[1] === sql(`select to_char('${SEG}'::date - 21, 'YYYY-MM-DD');`), ciclo);
conferir(
  naJanela ? "segunda ou terça: vale a janela normal (S12)" : "fora da janela: só a semana mais recente é liberada, até hoje (S11, CA-12)",
  naJanela ? ciclo[3] === "-" : ciclo[3] === SEG && ciclo[4] === hoje,
  ciclo
);
conferir("um único aviso na fila, do tipo do relatório (D3)", avisos() === "1" && sql(`select notification_type || '|' || target_url from notification_queue where dedup_key = 'relatorio_liberado:${CICLO}:${SEG}';`) === "relatorio|/area-paciente/acompanhamento", null);
const registro = sql(`select plano_anterior || '|' || plano_novo || '|' || frequencia_ciclo_anterior || '|' || coalesce(to_char(relatorio_liberado_semana, 'YYYY-MM-DD'), '-') || '|' || aviso_enfileirado || '|' || (alterado_por is not null) from plano_alteracoes where patient_id = '${P}';`);
conferir("alteração registrada: quem, anterior, novo, ciclo e o que foi liberado (RF-08)", registro === `Mensal|Semanal|Mensal|${SEG}|true|true`, registro);
conferir("nenhum relatório é criado pela correção (só o paciente cria ao responder)", relatoriosDoCiclo() === "0", null);

// --- Salvar de novo o mesmo plano (CA-04, RF-07) ----------------------------------------
const deNovo = await api(n.pagina, `/api/pacientes/${P}/plano`, "POST", { plano: "Semanal" });
conferir("salvar de novo: sem aviso duplicado", deNovo.status === 200 && deNovo.corpo.avisoEnfileirado === false && avisos() === "1", deNovo.corpo);
conferir("paciente sem aparelho inscrito: a tela avisa (CA-05)", deNovo.corpo.semAparelho === true, deNovo.corpo);

// --- O paciente vê e responde hoje (CA-14) -----------------------------------------------
await a.pagina.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
await a.pagina.getByText("Relatório nutricional disponível para preenchimento").waitFor({ timeout: 15000 }).catch(() => undefined);
conferir("o paciente vê o relatório disponível hoje", (await a.pagina.getByText("Relatório nutricional disponível para preenchimento").count()) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "plano-ativo-paciente.png"), fullPage: true });
await enviarRelatorio(a.pagina);
const enviado = sql(`select coalesce(to_char(scheduled_week_start, 'YYYY-MM-DD'), '-') || '|' || cycle_report_number from patient_reports where cycle_id = '${CICLO}';`);
conferir("o paciente responde o relatório liberado, da semana mais recente", enviado === `${SEG}|3`, enviado);
await enviarRelatorio(a.pagina);
conferir("não envia o mesmo relatório duas vezes", relatoriosDoCiclo() === "1", null);

// --- Já respondido: nada é liberado (CA-11) ----------------------------------------------
const respondido = await api(n.pagina, `/api/pacientes/${P}/plano`, "POST", { plano: "Semanal" });
conferir("mais recente já respondido: nada é liberado, nem a semana anterior", respondido.corpo.liberado === null, respondido.corpo);

// --- Semanal → mensal (CA-03, RF-06) ------------------------------------------------------
const mensal = await api(n.pagina, `/api/pacientes/${P}/plano`, "POST", { plano: "Mensal" });
conferir("semanal → mensal: sem relatório devido agora; o respondido continua", mensal.status === 200 && mensal.corpo.liberado === null && relatoriosDoCiclo() === "1", mensal.corpo);
await a.pagina.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
conferir("no mensal, nada aberto para o paciente", (await a.pagina.getByText("Nenhum relatório disponível no momento").count()) === 1, null);

// --- Cadastro semanal, ciclo mensal: reaplicar (CA-15, RF-12) ----------------------------
sql(`delete from patient_reports where cycle_id = '${CICLO}' and general_notes = 'Teste plano ativo';
     update patients set plan = 'Semanal' where id = '${P}';
     update diet_cycles set followup_frequency = 'Mensal' where id = '${CICLO}';`);
await n.pagina.goto(`${B}/pacientes/${P}/editar`, { waitUntil: "networkidle" });
const reaplicar = n.pagina.getByRole("button", { name: "Reaplicar o plano ao acompanhamento atual" });
await reaplicar.waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("a tela mostra a divergência e o botão de reaplicar", (await reaplicar.count()) === 1, null);
await reaplicar.click();
await n.pagina.getByRole("dialog").waitFor({ timeout: 20000 });
await n.pagina.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
await n.pagina.waitForTimeout(2000);
conferir("reaplicado: ciclo semanal sem alternar o plano, sem aviso duplicado", sql(`select followup_frequency from diet_cycles where id = '${CICLO}';`) === "Semanal" && avisos() === "1", null);
conferir("o botão some depois de reaplicar", (await reaplicar.count()) === 0, null);

// --- Pagamentos e acesso não mudam (CA-07) -----------------------------------------------
conferir("nenhum pagamento criado ou alterado pela correção", sql(`select count(*) from payments where patient_id = '${P}' and (created_at > now() - interval '1 hour');`) === "0", null);

const erros = [...n.erros, ...a.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
restaurar();
restaurado = true;
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

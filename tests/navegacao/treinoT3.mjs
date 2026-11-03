// Módulo de Treino, etapa T3: relatório semanal, devolutiva, atraso e lista
// de atenção. Ver LEIA-ME.md para rodar (com --limpar).
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
const literal = (o) => `'${JSON.stringify(o).replace(/'/g, "''")}'::jsonb`;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const NOME_P = sql(`select name from patients where id = '${P}';`);
const NUTRI = sql("select id from users where email = 'teste.nutri@local.test';");
const TITULO = "Treino T3 - Semana";

// Semanas de domingo a sábado (Brasília): S2 = última fechada, S1 = anterior.
const HOJE = sql("select (now() at time zone 'America/Sao_Paulo')::date::text;");
const S2 = sql(`select ('${HOJE}'::date - extract(dow from '${HOJE}'::date)::int - 7)::text;`);
const S1 = sql(`select ('${S2}'::date - 7)::text;`);
const dia = (domingo, n) => sql(`select ('${domingo}'::date + ${n})::text;`);

const plano = {
  dias: [
    { dia: "seg", titulo: TITULO, kcal_estimadas: null, exercicios: [{ nome: "Remada baixa", grupo: "Costas", series: 3, repeticoes: 12, carga_kg: 40, descanso_segundos: 60, observacao: null }] },
    { dia: "qua", titulo: "Treino T3 - B", kcal_estimadas: null, exercicios: [{ nome: "Agachamento", grupo: "Quadríceps", series: 4, repeticoes: 10, carga_kg: 60, descanso_segundos: 90, observacao: null }] },
    { dia: "sex", titulo: "Treino T3 - C", kcal_estimadas: null, exercicios: [{ nome: "Supino reto", grupo: "Peito", series: 4, repeticoes: 10, carga_kg: 30, descanso_segundos: 90, observacao: null }] },
  ],
};

function limpar() {
  sql(`delete from notification_queue where patient_id = '${P}' and notification_type = 'devolutiva_treino';
       delete from treino_relatorios where patient_id = '${P}';
       delete from treino_metas where patient_id = '${P}';
       delete from treino_pausas where patient_id = '${P}';
       delete from treino_acompanhamentos where patient_id = '${P}';
       delete from treino_desconfortos where patient_id = '${P}' and comentario = 'TESTE T3';
       delete from treino_sessoes where prescricao_id in (select id from treino_prescricoes where patient_id = '${P}' and plano->'dias'->0->>'titulo' = '${TITULO}');
       delete from treino_prescricoes where patient_id = '${P}' and plano->'dias'->0->>'titulo' = '${TITULO}';`);
}
limpar();

// Prescrição vigente nas duas semanas (publicada antes de S1).
const PRESCRICAO = sql(
  `insert into treino_prescricoes (patient_id, origem, plano, publicada_em) values ('${P}', 'externa', ${literal(plano)}, ('${S1}'::date - 1)::timestamp at time zone 'America/Sao_Paulo') returning id;`
).split("\n")[0];
function sessao(domingo, diaDaSemana, n, situacao, extra = "") {
  const id = sql(
    `insert into treino_sessoes (patient_id, prescricao_id, dia, data_planejada, situacao, data_efetiva, observacao)
     values ('${P}', '${PRESCRICAO}', '${diaDaSemana}', '${dia(domingo, n)}', ${situacao ? `'${situacao}'` : "null"}, ${situacao === "reagendado" ? `'${dia(domingo, n + 1)}'` : "null"}, ${extra ? `'${extra}'` : "null"}) returning id;`
  ).split("\n")[0];
  return id;
}
// S1: concluído (remada 45 kg, prescrito 40) + parcial + sexta sem registro → 1,5 de 3 = 50%.
const s1seg = sessao(S1, "seg", 1, "concluido", "Troquei de academia.");
sql(`insert into treino_exercicios_registro (sessao_id, indice, nome, chave, series, repeticoes, carga_kg) values ('${s1seg}', 0, 'Remada baixa', 'remada baixa', 3, 12, 45);`);
sessao(S1, "qua", 3, "parcial");
// S2: não concluído + reagendado para a mesma semana (R4: planejado, ainda
// não feito) + concluído → 1 de 3 = 33,3%.
sessao(S2, "seg", 1, "nao_concluido");
sessao(S2, "qua", 3, "reagendado");
sessao(S2, "sex", 5, "concluido");
sql(`insert into treino_desconfortos (patient_id, prescricao_id, dia, data, regiao, intensidade, conduta, comentario, chave_cliente)
     values ('${P}', '${PRESCRICAO}', 'sex', '${dia(S2, 5)}', 'Lombar', 4, 'continuei', 'TESTE T3', gen_random_uuid());`);

async function entrar(email, senha, largura) {
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

// --- Profissional ativa o acompanhamento e cadastra uma meta ----------------
const n = await entrar("teste.nutri@local.test", "teste-nutri-123", 1400);
await n.pagina.goto(`${B}/treino/alunos/${P}`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
const acompanhamento = n.pagina.locator('section[aria-label="Acompanhamento semanal"]');
conferir("aluno sem acompanhamento não gera relatório (B3)", (await acompanhamento.getByText("Sem acompanhamento", { exact: false }).count()) === 1, null);
await acompanhamento.getByRole("button", { name: "Ativar acompanhamento semanal" }).click();
await n.pagina.waitForTimeout(1000);
conferir("acompanhamento ativado com 60% de mínimo (B4)", sql(`select ativo || '|' || adesao_minima from treino_acompanhamentos where patient_id = '${P}' and profissional_id = '${NUTRI}';`) === "true|60", null);
await acompanhamento.getByRole("textbox", { name: "Nova meta" }).fill("Treinar 3 vezes na semana");
await acompanhamento.getByRole("button", { name: "Adicionar meta" }).click();
await n.pagina.waitForTimeout(1000);
conferir("meta em texto livre cadastrada (B5)", (await acompanhamento.getByText("Treinar 3 vezes na semana").count()) === 1, null);
conferir("sem relatório antes do domingo seguinte", sql(`select count(*) from treino_relatorios where patient_id = '${P}';`) === "0", null);

// Simula o acompanhamento desde S1 (a meta também já existia).
sql(`update treino_acompanhamentos set inicio = '${S1}' where patient_id = '${P}';
     update treino_metas set criada_em = ('${S1}'::date)::timestamp at time zone 'America/Sao_Paulo' where patient_id = '${P}';`);

// --- Painel: fechamento das semanas, atraso e lista de atenção ---------------
await n.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(2000);
const relatorios = sql(`select to_char(semana_inicio, 'YYYY-MM-DD') || '|' || adesao || '|' || sem_registros from treino_relatorios where patient_id = '${P}' order by semana_inicio;`);
conferir("duas semanas fechadas: 50% (parcial = meia) e 33,3% (reagendado na mesma semana conta como planejado, R4)", relatorios === `${S1}|50.0|false\n${S2}|33.3|false`, relatorios);
const pendentes = n.pagina.locator('section[aria-label="Relatórios semanais pendentes"]');
conferir("2 relatórios sem resposta acusam atraso do profissional", (await pendentes.getByText("2 pendentes · atraso").count()) === 1 && (await pendentes.getByText("Devolutiva atrasada para 1 aluno", { exact: false }).count()) === 1, await pendentes.textContent());
const atencao = n.pagina.locator('section[aria-label="Lista de atenção"]');
conferir("lista de atenção: 2 semanas com baixa adesão", (await atencao.getByText(NOME_P).count()) === 1 && (await atencao.getByText("2 semanas seguidas com baixa adesão", { exact: false }).count()) === 1, await atencao.textContent());
await n.pagina.screenshot({ path: path.join(PASTA, "t3-painel.png"), fullPage: true });
await n.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
conferir("abrir o painel de novo não duplica relatórios", sql(`select count(*) from treino_relatorios where patient_id = '${P}';`) === "2", null);
conferir("nutricionista vê os pendentes do Treino na tela Relatórios (D1)", await (async () => {
  await n.pagina.goto(`${B}/relatorios`, { waitUntil: "networkidle" });
  await n.pagina.waitForTimeout(1500);
  return (await n.pagina.locator('section[aria-label="Relatórios semanais pendentes"]').getByText(NOME_P).count()) === 1;
})(), null);

// --- Relatório da semana S1: carga e observação --------------------------------
const R1 = sql(`select id from treino_relatorios where patient_id = '${P}' and semana_inicio = '${S1}';`);
const R2 = sql(`select id from treino_relatorios where patient_id = '${P}' and semana_inicio = '${S2}';`);
await n.pagina.goto(`${B}/treino/relatorios/${R1}`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
const texto1 = await n.pagina.locator("main").textContent();
conferir("relatório: carga registrada × prescrita (+5 kg, +12,5%)", texto1.includes("+5 kg (+12,5%)"), null);
conferir("relatório: observação do aluno e dia sem registro", texto1.includes("Troquei de academia.") && texto1.includes("Sem registro"), null);

// --- Relatório S2: reagendado, desconforto, meta, IA e envio ------------------
await n.pagina.goto(`${B}/treino/relatorios/${R2}`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
const texto2 = await n.pagina.locator("main").textContent();
conferir("reagendado aparece sem confirmação; desconforto da semana listado", texto2.includes("Reagendado (sem confirmação)") && texto2.includes("Lombar"), null);
await n.pagina.locator('section[aria-label="Metas da semana"]').getByRole("button", { name: "Não atingida" }).click();
await n.pagina.waitForTimeout(800);
conferir("meta marcada como não atingida", sql(`select atingida from treino_metas_semana where relatorio_id = '${R2}';`) === "f", null);
const devolutiva = n.pagina.locator('section[aria-label="Devolutiva"]');
await devolutiva.getByRole("button", { name: "Gerar rascunho com IA" }).click();
await n.pagina.waitForTimeout(2500);
const caixa = devolutiva.getByRole("textbox", { name: "Texto da devolutiva" });
conferir("IA gera o rascunho (B9)", (await caixa.inputValue()).includes("Devolutiva de treino simulada"), await caixa.inputValue());
await caixa.fill("Boa semana! Vamos focar em completar os treinos de segunda.");
await n.pagina.waitForTimeout(1800);
conferir("rascunho salvo automaticamente", sql(`select rascunho from treino_relatorios where id = '${R2}';`) === "Boa semana! Vamos focar em completar os treinos de segunda.", null);
conferir("aluno ainda não vê o rascunho", sql(`select coalesce(devolutiva, '-') from treino_relatorios where id = '${R2}';`) === "-", null);
await n.pagina.screenshot({ path: path.join(PASTA, "t3-relatorio.png"), fullPage: true });
await devolutiva.getByRole("button", { name: "Enviar devolutiva ao aluno" }).click();
await n.pagina.getByRole("button", { name: "Confirmar" }).click();
await n.pagina.waitForTimeout(1500);
conferir("devolutiva enviada", sql(`select devolutiva from treino_relatorios where id = '${R2}';`) === "Boa semana! Vamos focar em completar os treinos de segunda.", null);
const push = sql(`select title from notification_queue where patient_id = '${P}' and notification_type = 'devolutiva_treino';`);
conferir("push ao aluno com o texto do cartão (B10)", push === "Chegou a devolutiva do seu Personal Trainer", push);
conferir("devolutiva enviada não muda (trava no banco)", (() => {
  try {
    sql(`update treino_relatorios set devolutiva = 'outra' where id = '${R2}';`);
    return false;
  } catch {
    return true;
  }
})(), null);
conferir("reenviar não duplica", (await api(n.pagina, `/api/treino/relatorios/${R2}`, "POST", { acao: "enviar", texto: "de novo" })).status === 404, null);

// --- Pausa registrada depois tira a semana da lista de atenção (B6) ------------
await n.pagina.goto(`${B}/treino/alunos/${P}`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
await acompanhamento.getByRole("textbox", { name: "Início da pausa" }).fill(S1);
await acompanhamento.getByRole("textbox", { name: "Fim da pausa" }).fill(dia(S1, 6));
await acompanhamento.getByRole("textbox", { name: "Motivo da pausa" }).fill("Viagem");
await acompanhamento.getByRole("button", { name: "Registrar pausa" }).click();
await n.pagina.waitForTimeout(1000);
conferir("pausa registrada pelo profissional", sql(`select motivo from treino_pausas where patient_id = '${P}';`) === "Viagem", null);
await n.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
conferir("com a pausa, o aluno sai da lista de atenção", (await atencao.getByText(NOME_P).count()) === 0, await atencao.textContent());
conferir("atraso some com 1 pendente", (await pendentes.getByText("1 pendente").count()) === 1 && (await pendentes.getByText("atraso").count()) === 0, await pendentes.textContent());
conferir("sem erros (profissional)", n.erros.length === 0, n.erros);

// --- Aluno: cartão Relatórios e leitura -----------------------------------------
const a = await entrar("teste.paciente@local.test", "654987", 390);
await a.pagina.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(2000);
conferir("cartão Relatórios: “Chegou a devolutiva do seu Personal Trainer”", (await a.pagina.getByText("Chegou a devolutiva do seu Personal Trainer").count()) >= 1, null);
await a.pagina.goto(`${B}/area-paciente/relatorios`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(2000);
const devolutivaDoAluno = a.pagina.locator('section[aria-label^="Relatório do treino"]', { hasText: "Vamos focar" });
conferir("devolutiva identificada como Treino na tela Relatórios", (await devolutivaDoAluno.getByText("Treino", { exact: true }).count()) === 1 && (await devolutivaDoAluno.getByText("Vamos focar", { exact: false }).count()) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "t3-aluno-relatorios.png"), fullPage: true });
await esperar(800);
conferir("abrir a tela marca como lida", sql(`select lida_em is not null from treino_relatorios where id = '${R2}';`) === "t", null);
conferir("aluno não acessa o relatório do profissional", (await api(a.pagina, `/api/treino/relatorios/${R2}`)).status === 403, null);
// Desde a T3b o aluno vê o relatório completo (Q6); o rascunho nunca.
conferir("aluno vê o consolidado, nunca o rascunho", JSON.stringify((await api(a.pagina, "/api/area-paciente/treino/relatorios")).corpo).includes('"rascunho"') === false, null);
await a.pagina.goto(`${B}/area-paciente`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(2000);
conferir("depois de lida, o cartão volta ao normal", (await a.pagina.getByText("Chegou a devolutiva do seu Personal Trainer").count()) === 0, null);
const largura = await a.pagina.evaluate(() => document.documentElement.scrollWidth);
conferir("celular: sem rolagem lateral", largura <= 390, largura);
conferir("sem erros (aluno)", a.erros.length === 0, a.erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

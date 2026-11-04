// Módulo de Treino, etapa T5: uso sem internet (resposta R5). O aluno abre
// o "Meu treino" com sinal; a internet cai (modo offline do navegador); ele
// recarrega a página, registra o treino, uma corrida e um desconforto; a
// internet volta e tudo é enviado sozinho, sem duplicar, com a data real.
// Também confere o registro que o servidor recusa (semana fechada).
// Ver LEIA-ME.md para rodar (com --limpar).
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
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const HOJE = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(`${HOJE}T12:00:00Z`).getUTCDay()];

const EMAIL_EDUCADOR = "teste.educador.t5@local.test";
const EMAIL_ALUNO = "teste.aluno.t5@local.test";

function limpar() {
  sql(`delete from notification_queue where patient_id in (select id from patients where name like 'Aluno Teste T5%');
       delete from notificacoes_profissionais where patient_id in (select id from patients where name like 'Aluno Teste T5%');
       delete from treino_desconfortos where patient_id in (select id from patients where name like 'Aluno Teste T5%');
       delete from patients where name like 'Aluno Teste T5%';
       delete from users where email in ('${EMAIL_ALUNO}', '${EMAIL_EDUCADOR}');`);
}
limpar();

async function sessao(email, senha, largura = 420) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: "pt-BR" });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(e.message));
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

// --- Preparação: educador, aluno próprio, treino de hoje ---------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123", 1400);
await api(n.pagina, "/api/treino/educadores", "POST", { nome: "Educador Teste T5", email: EMAIL_EDUCADOR, senha: "inicial-123" });
sql(`update users set must_change_password = false where email = '${EMAIL_EDUCADOR}';`);
const e = await sessao(EMAIL_EDUCADOR, "inicial-123", 1400);
const ALUNO = (await api(e.pagina, "/api/treino/alunos", "POST", { nome: "Aluno Teste T5", email: EMAIL_ALUNO, senha: "aluno-123" })).corpo.id;
sql(`update users set must_change_password = false where email = '${EMAIL_ALUNO}';`);
const prog = (await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "vazio" })).corpo.programaId;
await api(e.pagina, `/api/treino/programas/${prog}`, "PUT", {
  titulo: "Treino T5",
  objetivo: "",
  revisao: 0,
  plano: { dias: [{ dia: DIA, titulo: "Treino de hoje", exercicios: [{ nome: "Supino reto com barra", grupo: "Peito", series: 3, repeticoes: 10, carga_kg: 40 }] }] },
});
await api(e.pagina, `/api/treino/programas/${prog}`, "PATCH", { acao: "enviar", revisao: 1 });

// --- Aluno abre com internet (guarda a página e os dados) ---------------------
const a = await sessao(EMAIL_ALUNO, "aluno-123");
await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await a.pagina.evaluate(() => navigator.serviceWorker.ready);
// Segunda visita: a página já passa pelo service worker e fica guardada.
await a.pagina.reload({ waitUntil: "networkidle" });
await a.pagina.getByRole("button", { name: /Treino de hoje/ }).waitFor({ timeout: 20000 });
await esperar(1500);

// --- A internet cai -------------------------------------------------------------
await a.contexto.setOffline(true);
await a.pagina.reload({ waitUntil: "load" }).catch(() => undefined);
await a.pagina.getByText("Sem internet: mostrando o treino salvo no aparelho", { exact: false }).waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("sem internet, a página abre com o treino guardado", (await a.pagina.getByText("Sem internet: mostrando o treino salvo no aparelho", { exact: false }).count()) === 1, await a.pagina.locator("main").textContent().catch(() => null));
conferir("sem internet não volta para o login", a.pagina.url().endsWith("/area-paciente/treino"), a.pagina.url());

// Registro do treino de hoje.
await a.pagina.getByRole("button", { name: /Treino de hoje/ }).click();
const modal = a.pagina.locator(".p-dialog", { hasText: "Treino de hoje" });
await modal.locator(".p-inputnumber input").nth(2).fill("45");
await modal.getByRole("radio", { name: "Concluído", exact: true }).click();
await modal.getByRole("button", { name: "Salvar" }).click();
await esperar(1200);
conferir("registro guardado no aparelho (aparece já como concluído)", (await a.pagina.getByText("Concluído").count()) >= 1, null);

// Relato de desconforto forte.
await a.pagina.getByRole("button", { name: /Treino de hoje/ }).click();
await a.pagina.getByRole("button", { name: "Relatar desconforto" }).click();
const relato = a.pagina.getByRole("dialog", { name: "Relatar desconforto" });
await relato.locator(".p-dropdown").first().click();
await a.pagina.getByRole("option", { name: "Ombro" }).click();
await relato.getByRole("radio", { name: "Intensidade 8" }).click();
await relato.getByRole("radio", { name: "Incômodo mais acentuado: parei o exercício" }).click();
await relato.getByRole("button", { name: "Enviar relato" }).click();
await esperar(1000);
conferir("relato sem internet: avisa que ainda NÃO chegou ao profissional", (await relato.getByText("ainda NÃO chegou ao seu profissional", { exact: false }).count()) === 1, await relato.textContent());
await relato.getByRole("button", { name: "Fechar" }).click();
await a.pagina.keyboard.press("Escape");
await esperar(500);

// Corrida sem internet.
await a.pagina.getByRole("button", { name: "Registrar corrida" }).click();
const corrida = a.pagina.getByRole("dialog", { name: "Registrar corrida" });
await corrida.getByLabel("Distância").fill("7");
await corrida.getByLabel("Minutos").fill("40");
await corrida.getByLabel("Observações").click();
await corrida.getByRole("button", { name: "Salvar" }).click();
await esperar(1200);
const fila = await a.pagina.locator('[role="status"]').allTextContents();
conferir("três registros aguardando conexão", fila.some((t) => t.includes("3 registros aguardando conexão")), fila);
conferir("nada chegou ao servidor ainda", sql(`select (select count(*) from treino_sessoes where patient_id = '${ALUNO}') + (select count(*) from treino_atividades where patient_id = '${ALUNO}') + (select count(*) from treino_desconfortos where patient_id = '${ALUNO}');`) === "0", null);
await a.pagina.screenshot({ path: path.join(PASTA, "t5-sem-internet.png"), fullPage: true });

// --- A internet volta: envio sozinho -------------------------------------------
await a.contexto.setOffline(false);
await a.pagina.evaluate(() => window.dispatchEvent(new Event("online")));
for (let i = 0; i < 30 && sql(`select count(*) from treino_desconfortos where patient_id = '${ALUNO}';`) === "0"; i++) await esperar(1000);
await esperar(2000);
conferir(
  "tudo enviado: sessão com carga 45 e hora real, corrida, desconforto com a data do aparelho",
  sql(`select (select count(*) from treino_sessoes s join treino_exercicios_registro r on r.sessao_id = s.id where s.patient_id = '${ALUNO}' and r.carga_kg = 45 and s.registrada_em is not null and s.situacao = 'concluido')
          || '|' || (select count(*) from treino_atividades where patient_id = '${ALUNO}' and distancia_km = 7)
          || '|' || (select count(*) from treino_desconfortos where patient_id = '${ALUNO}' and registrado_em is not null and data = '${HOJE}');`) === "1|1|1",
  null
);
conferir("aviso ao profissional saiu quando o relato chegou (intensidade 8)", sql(`select count(*) from notificacoes_profissionais where patient_id = '${ALUNO}' and tipo = 'desconforto';`) === "1", null);
conferir("fila vazia depois do envio", !(await a.pagina.locator('[role="status"]').allTextContents()).some((t) => t.includes("aguardando conexão")), null);

// Reenvio da mesma corrida (mesma chave): não duplica.
const atividade = (await api(a.pagina, "/api/area-paciente/treino/atividades")).corpo.atividades[0];
await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { ...atividade });
await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { ...atividade });
conferir("reenvio da mesma corrida não duplica", sql(`select count(*) from treino_atividades where patient_id = '${ALUNO}';`) === "1", null);

// Registro antigo que o servidor recusa (semana fechada): vai para "não enviados".
const prescricao = sql(`select id from treino_prescricoes where programa_id = '${prog}' and status = 'publicada';`);
await a.pagina.evaluate(async ([prescricaoId, dia]) => {
  const db = await new Promise((resolver) => {
    const p = indexedDB.open("treino-offline", 1);
    p.onsuccess = () => resolver(p.result);
  });
  await new Promise((resolver) => {
    const t = db.transaction("fila", "readwrite");
    t.objectStore("fila").put({
      id: crypto.randomUUID(),
      tipo: "registro_musculacao",
      url: "/api/area-paciente/treino",
      metodo: "PUT",
      corpo: { prescricaoId, dia, dataPlanejada: "2026-01-05", situacao: "concluido", exercicios: [] },
      descricao: "treino antigo",
      criado_em: new Date().toISOString(),
    });
    t.oncomplete = resolver;
  });
  db.close();
  window.dispatchEvent(new Event("online"));
}, [prescricao, "seg"]);
await esperar(3000);
const recusados = await a.pagina.locator('[role="status"]').allTextContents();
conferir("registro recusado aparece como não enviado, com o motivo", recusados.some((t) => t.includes("Não foi possível enviar “treino antigo”")), recusados);

const erros = [...a.erros.filter((x) => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED/i.test(x))];
conferir("sem erros de página", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

// Módulo de Treino, etapa T4c: editores de corrida (VIS-04) e ciclismo
// (VIS-05). O educador monta a planilha pela tela, ajusta o volume, informa
// as zonas (Coggan no ciclismo), envia ao aluno; o aluno vê as sessões da
// semana no "Meu treino" e registra a partir delas. Confere os totais
// corrigidos dos mockups (34 km; 230 km, TSS 415, 2.150 m), PDF, IA
// simulada, importação, modelos e permissões.
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
const HOJE = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const DOMINGO = (() => {
  const d = new Date(`${HOJE}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
})();

const EMAIL_EDUCADOR = "teste.educador.t4c@local.test";
const EMAIL_OUTRO = "teste.outro.t4c@local.test";
const EMAIL_ALUNO = "teste.aluno.t4c@local.test";

function limpar() {
  sql(`delete from notification_queue where patient_id in (select id from patients where name like 'Aluno Teste T4c%');
       delete from treino_modelos where criado_por in (select id from users where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}'));
       delete from patients where name like 'Aluno Teste T4c%';
       delete from users where email in ('${EMAIL_ALUNO}', '${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}');`);
}
limpar();

async function sessao(email, senha, largura = 1440) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: "pt-BR" });
  const pagina = await contexto.newPage();
  const erros = [];
  pagina.on("pageerror", (e) => erros.push(e.message));
  pagina.on("console", (m) => m.type() === "error" && /same key|unique "key"/.test(m.text()) && erros.push(m.text().slice(0, 200)));
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
      const tipo = r.headers.get("content-type") ?? "";
      return { status: r.status, tipo, corpo: tipo.includes("json") ? await r.json().catch(() => null) : null };
    },
    [url, metodo, corpo]
  );

// --- Preparação ------------------------------------------------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
for (const [nome, email] of [["Educador Teste T4c", EMAIL_EDUCADOR], ["Outro Educador T4c", EMAIL_OUTRO]]) await api(n.pagina, "/api/treino/educadores", "POST", { nome, email, senha: "inicial-123" });
sql(`update users set must_change_password = false where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}');`);
const e = await sessao(EMAIL_EDUCADOR, "inicial-123");
const ALUNO = (await api(e.pagina, "/api/treino/alunos", "POST", { nome: "Aluno Teste T4c", email: EMAIL_ALUNO, senha: "aluno-123" })).corpo.id;
sql(`update users set must_change_password = false where email = '${EMAIL_ALUNO}';`);

// --- Corrida pela tela ------------------------------------------------------
await e.pagina.goto(`${B}/treino/alunos/${ALUNO}`, { waitUntil: "networkidle" });
await e.pagina.waitForTimeout(1500);
await e.pagina.getByRole("button", { name: "Elaborar Corrida" }).click();
await e.pagina.getByText("Nenhum treino elaborado para este aluno.").waitFor({ timeout: 20000 });
await e.pagina.getByRole("button", { name: "Novo treino" }).first().click();
await e.pagina.waitForURL(/programa=/, { timeout: 20000 });
await e.pagina.getByLabel("Título da planilha").waitFor({ timeout: 20000 });
const CORRIDA = new URL(e.pagina.url()).searchParams.get("programa");
conferir("planilha de corrida criada, ciclo começando no domingo desta semana", sql(`select plano->'ciclo'->>'inicio' from treino_prescricoes where programa_id = '${CORRIDA}' and status = 'rascunho';`) === DOMINGO, null);

await e.pagina.getByLabel("Título da planilha").fill("Ciclo 1 – Base aeróbia");
await e.pagina.getByLabel("Objetivo").fill("Performance (10 km)");
for (const [dia, desc, km, min] of [["Dom", "Trote leve", "6", "35"], ["Ter", "Aquecimento 10 min + 6 × 400 m forte", "5", "30"]]) {
  await e.pagina.getByRole("button", { name: "Adicionar treino (dia)" }).click();
  await e.pagina.waitForTimeout(300);
}
const linhas = e.pagina.locator('tbody tr:has([aria-label^="Descrição da sessão"])');
// Primeira sessão: domingo (para o aluno poder registrar hoje).
await e.pagina.locator('.p-dropdown:has([aria-label="Dia da sessão 1"])').click();
await e.pagina.getByRole("option", { name: "Dom" }).click();
await e.pagina.waitForTimeout(300);
await e.pagina.getByLabel("Descrição da sessão 1").fill("Trote leve");
await e.pagina.getByLabel("Distância da sessão 1").fill("6");
await e.pagina.getByLabel("Tempo da sessão 1").fill("35");
await e.pagina.getByLabel("Descrição da sessão 2").fill("Aquecimento 10 min + 6 × 400 m forte");
await e.pagina.getByLabel("Distância da sessão 2").fill("5");
await e.pagina.getByLabel("Tempo da sessão 2").fill("30");
await e.pagina.getByLabel("Ritmo alvo da sessão 2").fill("4:20–4:40");
await e.pagina.waitForTimeout(3000);
conferir("total da semana calculado das linhas (11 km)", (await e.pagina.getByText("Total da semana:").locator("..").textContent())?.includes("11 km"), await e.pagina.getByText("Total da semana:").locator("..").textContent());
conferir("duas sessões na grade", (await linhas.count()) === 2, await linhas.count());

// Ajustar volume com prévia.
await e.pagina.getByRole("button", { name: "Ajustar volume" }).click();
const ajuste = e.pagina.locator(".p-dialog", { hasText: "Ajustar volume" });
conferir("prévia do ajuste (11 → 9,9 km)", (await ajuste.getByText("11 → 9,9 km").count()) === 1, await ajuste.textContent());
await ajuste.getByRole("button", { name: "Aplicar no rascunho" }).click();
await e.pagina.waitForTimeout(3000);
const plano = JSON.parse(sql(`select plano::text from treino_prescricoes where programa_id = '${CORRIDA}' and status = 'rascunho';`));
const kms = plano.semanas[0].sessoes.map((s) => s.distancia_km).sort();
conferir("ajuste gravado no rascunho (5,4 e 4,5 km)", JSON.stringify(kms) === JSON.stringify([4.5, 5.4]), plano.semanas[0].sessoes);
await e.pagina.screenshot({ path: path.join(PASTA, "t4c-corrida.png"), fullPage: true });

// Zonas de FC (informadas) e ritmo.
await e.pagina.getByRole("tab", { name: /Zonas e metas/ }).click();
await e.pagina.getByLabel("Mínimo da zona Z2 (bpm)").fill("140");
await e.pagina.getByLabel("Máximo da zona Z2 (bpm)").fill("155");
await e.pagina.getByLabel("Ritmo mais rápido da zona Z2").fill("5:30");
await e.pagina.getByRole("button", { name: "Salvar zonas" }).click();
await e.pagina.waitForTimeout(1500);
conferir("zonas salvas", sql(`select zonas->'fc'->1->>'min' || '|' || (zonas->'ritmo'->1->>'de') from treino_zonas where patient_id = '${ALUNO}' and modalidade = 'corrida';`) === "140|5:30", null);
await e.pagina.getByRole("tab", { name: /Planilha semanal/ }).click();
await e.pagina.waitForTimeout(800);

// Enviar.
await e.pagina.getByRole("button", { name: "Enviar ao paciente" }).click();
await e.pagina.waitForTimeout(800);
await e.pagina.locator(".p-confirm-dialog, .p-dialog").getByRole("button", { name: "Enviar ao paciente" }).last().click();
await e.pagina.waitForTimeout(3000);
conferir("corrida publicada (versão 1, modalidade corrida) e aviso ao aluno", sql(`select versao || '|' || modalidade from treino_prescricoes where programa_id = '${CORRIDA}' and status = 'publicada';`) === "1|corrida" && sql(`select count(*) from notification_queue where patient_id = '${ALUNO}' and notification_type = 'treino_novo';`) === "1", null);

// --- Ciclismo com os números do VIS-05 (API) ---------------------------------
const CICLISMO = (await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "vazio", modalidade: "ciclismo" })).corpo.programaId;
const linhasVis05 = [
  ["seg", "Recuperativo", 30, 30, 250],
  ["ter", "Intervalado", 45, 95, 450],
  ["qui", "Tempo", 50, 110, 520],
  ["sab", "Longo", 80, 160, 820],
  ["dom", "Recuperativo", 25, 20, 110],
];
const planoCiclismo = {
  ciclo: { fase: "Base", inicio: DOMINGO },
  semanas: [{ sessoes: linhasVis05.map(([dia, tipo, km, tss, alt]) => ({ dia, tipo, descricao: `${tipo} em estrada`, distancia_km: km, duracao_min: 60, tss, altimetria_m: alt, notas: "nota privada do pedal" })) }],
};
const salvo = await api(e.pagina, `/api/treino/programas/${CICLISMO}`, "PUT", { titulo: "Ciclo estrada", objetivo: "Resistência", plano: planoCiclismo, revisao: 0 });
conferir("planilha de ciclismo gravada", salvo.status === 200, salvo);
await e.pagina.goto(`${B}/treino/alunos/${ALUNO}/ciclismo?programa=${CICLISMO}`, { waitUntil: "networkidle" });
await e.pagina.getByText("TSS total:").waitFor({ timeout: 20000 });
const rodape = await e.pagina.getByText("TSS total:").locator("..").locator("..").textContent();
conferir("VIS-05 corrigido: 230 km, TSS 415 e 2.150 m", rodape.includes("230 km") && rodape.includes("415") && rodape.includes("2.150 m"), rodape);
await e.pagina.screenshot({ path: path.join(PASTA, "t4c-ciclismo.png"), fullPage: true });
await e.pagina.getByRole("tab", { name: /Zonas e métricas/ }).click();
await e.pagina.getByLabel("FTP").fill("250");
await e.pagina.getByLabel("FTP").press("Tab");
await e.pagina.getByRole("button", { name: "Calcular as zonas de Coggan" }).click();
await e.pagina.getByRole("button", { name: "Salvar zonas" }).click();
await e.pagina.waitForTimeout(1500);
conferir("zonas de Coggan pelo FTP 250 (Z2 140–188 W)", sql(`select zonas->'potencia'->1->>'min' || '–' || (zonas->'potencia'->1->>'max') from treino_zonas where patient_id = '${ALUNO}' and modalidade = 'ciclismo';`) === "140–188", null);
const envioCiclismo = await api(e.pagina, `/api/treino/programas/${CICLISMO}`, "PATCH", { acao: "enviar", revisao: 1 });
conferir("ciclismo publicado", envioCiclismo.status === 200, envioCiclismo);

// --- Validação, PDF, IA, importação, modelos, permissões --------------------
const outroDia = await api(e.pagina, `/api/treino/programas/${CICLISMO}`, "PUT", { titulo: "x", objetivo: "", plano: { ...planoCiclismo, ciclo: { inicio: HOJE === DOMINGO ? "2026-11-03" : HOJE } }, revisao: 1 });
conferir("início do ciclo fora do domingo é recusado", outroDia.status === 400, outroDia);
for (const [id, nome] of [[CORRIDA, "corrida"], [CICLISMO, "ciclismo"]]) {
  const pdf = await api(e.pagina, `/api/treino/programas/${id}/pdf?versao=1&detalhado=1`);
  conferir(`PDF detalhado da ${nome}`, pdf.status === 200 && pdf.tipo.includes("pdf"), pdf.status);
}
const ia = await api(e.pagina, `/api/treino/programas/${CORRIDA}/ia`, "POST", { pedido: "4 semanas de base" });
conferir("IA sugere planilha de corrida (sem TSS), com avisos", ia.status === 200 && ia.corpo.sugestao.plano.semanas[0].sessoes.length === 2 && ia.corpo.sugestao.avisos.length > 0, ia);
const importado = await e.pagina.evaluate(async (id) => {
  const dados = new FormData();
  dados.append("texto", "Seg: giro leve 30 km; Sáb: longo 80 km em Z2");
  const r = await fetch(`/api/treino/programas/${id}/importar`, { method: "POST", body: dados });
  return { status: r.status, corpo: await r.json() };
}, CICLISMO);
conferir("importação de ciclismo lida para revisão", importado.status === 200 && importado.corpo.plano.semanas.length >= 1, importado);
const modelo = await api(e.pagina, "/api/treino/modelos", "POST", { nome: "Modelo corrida T4c", modalidade: "corrida", plano, compartilhado: false });
conferir("modelo de corrida salvo sem a data do ciclo", modelo.status === 201 && sql(`select modalidade || '|' || coalesce(plano->'ciclo'->>'inicio', 'sem') from treino_modelos where id = '${modelo.corpo.id}';`) === "corrida|sem", modelo);
conferir("modelo de corrida não aparece na musculação", !(await api(e.pagina, "/api/treino/modelos?modalidade=musculacao")).corpo.modelos.some((m) => m.id === modelo.corpo.id), null);
const doModelo = await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "modelo", modeloId: modelo.corpo.id, modalidade: "corrida" });
conferir("planilha nova a partir do modelo", doModelo.status === 201, doModelo);
conferir("modelo de corrida não serve para ciclismo", (await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "modelo", modeloId: modelo.corpo.id, modalidade: "ciclismo" })).status === 400, null);
await api(e.pagina, `/api/treino/programas/${doModelo.corpo.programaId}`, "PATCH", { acao: "arquivar" });
const outro = await sessao(EMAIL_OUTRO, "inicial-123");
conferir("outro educador não vê nem altera as zonas", (await api(outro.pagina, `/api/treino/alunos/${ALUNO}/zonas?modalidade=corrida`)).status === 404 && (await api(outro.pagina, `/api/treino/alunos/${ALUNO}/zonas`, "PUT", { modalidade: "corrida", zonas: {} })).status === 404, null);
conferir("administrador não alcança a planilha do aluno próprio", (await api(n.pagina, `/api/treino/programas/${CORRIDA}`)).status === 404, null);

// --- Aluno: sessões da semana e registro a partir delas ----------------------
const a = await sessao(EMAIL_ALUNO, "aluno-123", 420);
const situacao = await api(a.pagina, "/api/area-paciente/treino/atividades");
const planejadas = situacao.corpo.planejadas;
conferir("aluno vê as sessões de corrida e ciclismo desta semana", planejadas.filter((p) => p.modalidade === "corrida").length === 2 && planejadas.filter((p) => p.modalidade === "ciclismo").length === 5, planejadas.map((p) => [p.modalidade, p.dia]));
conferir("aluno não recebe as notas privadas", !JSON.stringify(situacao.corpo).includes("nota privada"), null);
const deDomingo = planejadas.find((p) => p.modalidade === "corrida" && p.dia === "dom");
await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
conferir("Meu treino mostra o planejado da semana", (await a.pagina.getByText("Planejado para esta semana").count()) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "t4c-aluno.png"), fullPage: true });
const registro = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", {
  chave_cliente: crypto.randomUUID(),
  modalidade: "corrida",
  data: DOMINGO,
  prescricao_id: deDomingo.prescricao_id,
  sessao_indice: deDomingo.referencia,
  situacao: "concluido",
  distancia_km: 5.5,
  duracao_segundos: 2100,
  consumos: [],
});
conferir("registro ligado à sessão prescrita", registro.status === 200 && sql(`select count(*) from treino_atividades where patient_id = '${ALUNO}' and prescricao_id = '${deDomingo.prescricao_id}' and sessao_indice = ${deDomingo.referencia};`) === "1", registro);
const indiceErrado = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { chave_cliente: crypto.randomUUID(), modalidade: "corrida", data: DOMINGO, prescricao_id: deDomingo.prescricao_id, sessao_indice: 99, consumos: [] });
conferir("sessão prescrita inexistente é recusada", indiceErrado.status === 400, indiceErrado);
const modalidadeErrada = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { chave_cliente: crypto.randomUUID(), modalidade: "ciclismo", data: DOMINGO, prescricao_id: deDomingo.prescricao_id, sessao_indice: deDomingo.referencia, consumos: [] });
conferir("planilha de corrida não aceita registro de pedal", modalidadeErrada.status === 400, modalidadeErrada);

// Progressão do profissional mostra o registrado.
await e.pagina.goto(`${B}/treino/alunos/${ALUNO}/corrida?programa=${CORRIDA}`, { waitUntil: "networkidle" });
await e.pagina.waitForTimeout(1500);
await e.pagina.getByRole("tab", { name: /Progressão/ }).click();
await e.pagina.waitForTimeout(1500);
conferir("progressão: planejado 9,9 km × registrado 5,5 km", (await e.pagina.getByRole("cell", { name: "9,9" }).count()) === 1 && (await e.pagina.getByRole("cell", { name: "5,5" }).count()) === 1, await e.pagina.locator('section[aria-label="Progressão"]').textContent());

const erros = [...n.erros, ...e.erros, ...outro.erros, ...a.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

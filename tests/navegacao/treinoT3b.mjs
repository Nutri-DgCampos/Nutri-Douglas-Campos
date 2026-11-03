// Módulo de Treino, etapa T3b: relatório semanal por modalidade (Q5), nota
// 60/25/15 (Q1), pontos positivos e de atenção (Q3), regra do reagendado
// (R4/R4b), relatório completo na tela do aluno (Q6, C3), lista de atenção
// por modalidade e devolutiva.
// Monta duas semanas fechadas no banco (musculação e corrida) e confere o
// fechamento, a tela do profissional e a do aluno.
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
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 700)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();
const somar = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const HOJE = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const DOMINGO_ATUAL = somar(HOJE, -new Date(`${HOJE}T12:00:00Z`).getUTCDay());
const W1 = somar(DOMINGO_ATUAL, -7); // última semana fechada
const W0 = somar(W1, -7); // a anterior

const EMAIL_EDUCADOR = "teste.educador.t3b@local.test";
const EMAIL_ALUNO = "teste.aluno.t3b@local.test";

function limpar() {
  sql(`delete from notification_queue where patient_id in (select id from patients where name like 'Aluno Teste T3b%');
       delete from patients where name like 'Aluno Teste T3b%';
       delete from users where email in ('${EMAIL_ALUNO}', '${EMAIL_EDUCADOR}');`);
}
limpar();

async function sessao(email, senha, largura = 1400) {
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
      return { status: r.status, corpo: await r.json().catch(() => null) };
    },
    [url, metodo, corpo]
  );

// --- Preparação ------------------------------------------------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
await api(n.pagina, "/api/treino/educadores", "POST", { nome: "Educador Teste T3b", email: EMAIL_EDUCADOR, senha: "inicial-123" });
sql(`update users set must_change_password = false where email = '${EMAIL_EDUCADOR}';`);
const e = await sessao(EMAIL_EDUCADOR, "inicial-123");
const ALUNO = (await api(e.pagina, "/api/treino/alunos", "POST", { nome: "Aluno Teste T3b", email: EMAIL_ALUNO, senha: "aluno-123" })).corpo.id;
const EDUCADOR = sql(`select id from users where email = '${EMAIL_EDUCADOR}';`);
sql(`update users set must_change_password = false where email = '${EMAIL_ALUNO}';`);

// Musculação: seg, qua e sex.
const mus = (await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "vazio" })).corpo.programaId;
await api(e.pagina, `/api/treino/programas/${mus}`, "PUT", {
  titulo: "ABC",
  objetivo: "",
  revisao: 0,
  plano: { dias: ["seg", "qua", "sex"].map((dia) => ({ dia, titulo: `Treino ${dia}`, exercicios: [{ nome: "Agachamento livre", grupo: "Quadríceps", series: 3, repeticoes: 10, carga_kg: 50 }] })) },
});
await api(e.pagina, `/api/treino/programas/${mus}`, "PATCH", { acao: "enviar", revisao: 1 });
const PM = sql(`select id from treino_prescricoes where programa_id = '${mus}' and status = 'publicada';`);

// Corrida: 2 semanas a partir de W0, ter e qui.
const cor = (await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "vazio", modalidade: "corrida" })).corpo.programaId;
const semanaDeCorrida = { sessoes: [{ dia: "ter", tipo: "Fácil", descricao: "Leve", distancia_km: 5, duracao_min: 30 }, { dia: "qui", tipo: "Longo", descricao: "Longo", distancia_km: 6, duracao_min: 40 }] };
await api(e.pagina, `/api/treino/programas/${cor}`, "PUT", { titulo: "Base", objetivo: "", revisao: 0, plano: { ciclo: { fase: "Base", inicio: W0 }, semanas: [semanaDeCorrida, semanaDeCorrida] } });
await api(e.pagina, `/api/treino/programas/${cor}`, "PATCH", { acao: "enviar", revisao: 1 });
const PC = sql(`select id from treino_prescricoes where programa_id = '${cor}' and status = 'publicada';`);

// Datas no passado: publicação e metas antes das semanas.
sql(`update treino_prescricoes set publicada_em = '${W0}T08:00:00-03:00' where id in ('${PM}', '${PC}');`);
sql(`insert into treino_metas (patient_id, profissional_id, texto, modalidade, criada_em) values
       ('${ALUNO}', '${EDUCADOR}', 'Correr 2 vezes', 'corrida', '${W0}T08:00:00-03:00'),
       ('${ALUNO}', '${EDUCADOR}', 'Agachar com boa técnica', 'musculacao', '${W0}T08:00:00-03:00');`);

// Registros da semana W1 (musculação): seg concluído; qua reagendado para a
// semana seguinte (R4b: fora da conta); sex sem registro.
sql(`insert into treino_sessoes (patient_id, prescricao_id, dia, data_planejada, situacao, data_efetiva, kcal) values
       ('${ALUNO}', '${PM}', 'seg', '${somar(W1, 1)}', 'concluido', null, 300),
       ('${ALUNO}', '${PM}', 'qua', '${somar(W1, 3)}', 'reagendado', '${somar(W1, 9)}', null);
     insert into treino_exercicios_registro (sessao_id, indice, nome, chave, series, repeticoes, carga_kg)
       select id, 0, 'Agachamento livre', 'agachamento livre', 3, 10, 55 from treino_sessoes where patient_id = '${ALUNO}' and dia = 'seg';
     insert into treino_atividades (patient_id, modalidade, chave_cliente, prescricao_id, sessao_indice, data, situacao, distancia_km, duracao_segundos, fc_media, kcal) values
       ('${ALUNO}', 'corrida', gen_random_uuid(), '${PC}', 0, '${somar(W0, 2)}', 'concluido', 5, 1500, 150, 300),
       ('${ALUNO}', 'corrida', gen_random_uuid(), '${PC}', 100, '${somar(W1, 2)}', 'concluido', 5.5, 1650, 152, 330),
       ('${ALUNO}', 'corrida', gen_random_uuid(), null, null, '${somar(W1, 6)}', 'concluido', 3, 1200, null, null);`);
// Acompanhamento ativado por último: o fechamento só roda com os dados prontos.
sql(`insert into treino_acompanhamentos (patient_id, profissional_id, adesao_minima, inicio) values ('${ALUNO}', '${EDUCADOR}', 60, '${W0}');`);

// --- Fechamento e painel ------------------------------------------------------
const painel = await api(e.pagina, "/api/treino/relatorios");
const relatorios = sql(`select modalidade || '@' || to_char(semana_inicio, 'YYYY-MM-DD') || '=' || coalesce(adesao::text, 'null') from treino_relatorios where patient_id = '${ALUNO}' order by semana_inicio, modalidade;`).split("\n");
conferir(
  "um relatório por semana e modalidade (sem ciclismo: não há planilha nem pedal)",
  JSON.stringify(relatorios) === JSON.stringify([`corrida@${W0}=50.0`, `musculacao@${W0}=null`, `corrida@${W1}=50.0`, `musculacao@${W1}=50.0`]),
  relatorios
);
conferir(
  "lista de atenção conta cada modalidade separado (corrida: baixa adesão 2 semanas)",
  painel.corpo.atencao.length === 1 && painel.corpo.atencao[0].modalidade === "corrida" && painel.corpo.atencao[0].causas.includes("baixa_adesao"),
  painel.corpo.atencao
);
conferir("pendentes listam as modalidades", painel.corpo.pendentes[0]?.modalidades?.length === 2, painel.corpo.pendentes);

const RM = sql(`select id from treino_relatorios where patient_id = '${ALUNO}' and modalidade = 'musculacao' and semana_inicio = '${W1}';`);
const RC = sql(`select id from treino_relatorios where patient_id = '${ALUNO}' and modalidade = 'corrida' and semana_inicio = '${W1}';`);
const musc = (await api(e.pagina, `/api/treino/relatorios/${RM}`)).corpo.relatorio;
conferir(
  "musculação: reagendado para outra semana fica fora da conta (R4b), calorias informadas",
  musc.dados.contagem.planejadas === 2 && musc.dados.contagem.outra_semana === 1 && musc.dados.kcal === 300,
  musc.dados.contagem
);
conferir("musculação: só a meta da musculação", musc.dados.metas.length === 1 && musc.dados.metas[0].texto === "Agachar com boa técnica", musc.dados.metas);
conferir("pontos: carga acima da prescrita e adesão abaixo do mínimo", musc.pontos.atencao.some((p) => p.includes("Agachamento livre")) && musc.pontos.atencao.some((p) => p.includes("abaixo do mínimo")), musc.pontos);

let corrida = (await api(e.pagina, `/api/treino/relatorios/${RC}`)).corpo.relatorio;
const ses = corrida.dados.endurance.sessoes;
conferir(
  "corrida: ter registrada, qui sem registro, sábado como atividade extra fora da adesão",
  ses.length === 3 && ses[0].situacao === "concluido" && ses[1].situacao === "sem_registro" && ses[2].extra === true,
  ses.map((s) => [s.situacao, s.extra])
);
conferir("corrida: totais (11 km planejados, 8,5 km registrados)", corrida.dados.endurance.totais.planejado_km === 11 && corrida.dados.endurance.totais.registrado_km === 8.5, corrida.dados.endurance.totais);
conferir("nota N/A enquanto a meta não é avaliada", corrida.nota.nota === null && corrida.nota.partes.adesao === 50, corrida.nota);

// Marcar a meta pela tela e conferir a nota: 50×0,6 + 100×0,25 + 100×0,15 = 70.
await e.pagina.goto(`${B}/treino/relatorios/${RC}`, { waitUntil: "networkidle" });
await e.pagina.getByText("Pontos de atenção").waitFor({ timeout: 20000 });
await e.pagina.getByRole("button", { name: "Atingida", exact: true }).click();
await e.pagina.waitForTimeout(1500);
corrida = (await api(e.pagina, `/api/treino/relatorios/${RC}`)).corpo.relatorio;
conferir("nota 70 depois da meta atingida (adesão 50, metas 100, manteve a adesão)", corrida.nota.nota === 70, corrida.nota);
await e.pagina.reload({ waitUntil: "networkidle" });
await e.pagina.getByText("Atividade extra", { exact: false }).first().waitFor({ timeout: 20000 });
conferir("tela do profissional mostra nota, extra e pontos", (await e.pagina.getByText("Atividade extra", { exact: false }).count()) >= 1 && (await e.pagina.locator('section[aria-label="Resumo da semana"]').textContent()).includes("70"), null);
await e.pagina.screenshot({ path: path.join(PASTA, "t3b-profissional-corrida.png"), fullPage: true });

// Devolutiva com IA simulada e envio.
await api(e.pagina, `/api/treino/relatorios/${RC}`, "POST", { acao: "gerar" });
const enviada = await api(e.pagina, `/api/treino/relatorios/${RC}`, "POST", { acao: "enviar", texto: "Boa semana de corrida! Continue assim." });
conferir("devolutiva da corrida enviada (independente da musculação)", enviada.status === 200 && sql(`select count(*) from treino_relatorios where patient_id = '${ALUNO}' and devolutiva is not null;`) === "1", enviada.status);

// --- Aluno ------------------------------------------------------------------------
const a = await sessao(EMAIL_ALUNO, "aluno-123", 420);
const doAluno = await api(a.pagina, "/api/area-paciente/treino/relatorios");
const lista = doAluno.corpo.relatorios;
conferir("aluno vê os relatórios das duas modalidades, com nota e mínimo", lista.length === 4 && lista.some((r) => r.modalidade === "corrida" && r.nota.nota === 70 && r.adesao_minima === 60), lista.map((r) => [r.modalidade, r.nota.nota]));
conferir("aluno não recebe o rascunho", !JSON.stringify(doAluno.corpo).includes('"rascunho"'), null);
await a.pagina.goto(`${B}/area-paciente/relatorios`, { waitUntil: "networkidle" });
await a.pagina.getByText("Chegou a devolutiva do seu Personal Trainer").first().waitFor({ timeout: 20000 });
await a.pagina.getByRole("button", { name: "Ver o relatório completo" }).first().click();
await a.pagina.waitForTimeout(800);
conferir("aluno abre o relatório completo (metas e se foram atingidas)", (await a.pagina.getByText("Atingida", { exact: true }).count()) >= 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "t3b-aluno.png"), fullPage: true });

const erros = [...n.erros, ...e.erros, ...a.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

// Módulo de Treino, etapas T7a (educador físico e vínculos) e T2 (relato de
// desconforto com alerta ao profissional). Ver LEIA-ME.md para rodar.
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
const OUTRO = sql(`select id from patients where id <> '${P}' order by created_at limit 1;`);
const EMAIL = "teste.educador@local.test";
const NOME_EDUCADOR = "Educador Teste T2";

const plano = {
  dias: [
    {
      dia: "seg",
      titulo: "Treino T2 - Peito",
      kcal_estimadas: 300,
      exercicios: [{ nome: "Supino reto", grupo: "Peito", series: 4, repeticoes: 10, carga_kg: 30, descanso_segundos: 90, observacao: null }],
    },
  ],
};

function limpar() {
  sql(`delete from users where email = '${EMAIL}';
       delete from treino_desconfortos where patient_id = '${P}';
       delete from notificacoes_profissionais where patient_id = '${P}';
       delete from treino_sessoes where patient_id = '${P}';
       delete from treino_prescricoes where patient_id = '${P}' and plano->'dias'->0->>'titulo' = 'Treino T2 - Peito';
       delete from treinos where patient_id = '${P}' and texto_enviado = 'TESTE T2';`);
}
limpar();
const TREINO = sql(`insert into treinos (patient_id, texto_enviado, status, plano, analisado_em, created_at) values ('${P}', 'TESTE T2', 'concluido', ${literal(plano)}, now(), now() + interval '2 hours') returning id;`).split("\n")[0];
sql(`insert into treino_prescricoes (patient_id, origem, treino_id, plano, publicada_em) values ('${P}', 'externa', '${TREINO}', ${literal(plano)}, now() + interval '2 hours');`);

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

const api = (pagina, url, metodo = "GET", corpo) =>
  pagina.evaluate(
    async ([u, m, c]) => {
      const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: c ? JSON.stringify(c) : undefined });
      return { status: r.status, corpo: await r.json().catch(() => null) };
    },
    [url, metodo, corpo]
  );

// --- Administrador: cadastra o educador e vincula o aluno -------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123", 1400);
await n.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
conferir("menu do nutricionista tem o Módulo de Treino", (await n.pagina.locator(".menu-lateral").getByText("Módulo de Treino").count()) === 1, null);
conferir("administrador vê todos os alunos", (await n.pagina.locator('section[aria-label="Alunos"]').getByText(NOME_P).count()) >= 1, null);

await n.pagina.goto(`${B}/treino/educadores`, { waitUntil: "networkidle" });
await n.pagina.getByRole("button", { name: "Novo educador físico" }).click();
const dialogo = n.pagina.locator(".p-dialog", { hasText: "Novo educador físico" });
await dialogo.getByLabel("Nome").fill(NOME_EDUCADOR);
await dialogo.getByLabel("E-mail de acesso").fill(EMAIL);
await dialogo.getByLabel("CREF (opcional)").fill("000000-G/SP");
await dialogo.locator('input[aria-label="Senha inicial"]').fill("inicial-123");
await dialogo.getByRole("button", { name: "Salvar" }).click();
await n.pagina.waitForTimeout(1500);
conferir("educador cadastrado aparece na lista", (await n.pagina.getByText(NOME_EDUCADOR).count()) === 1, null);
const conta = sql(`select p.role || '|' || u.must_change_password from users u join profiles p on p.id = u.id where u.email = '${EMAIL}';`);
conferir("conta com papel educador_fisico e senha provisória", conta === "educador_fisico|true", conta);
const EDUCADOR = sql(`select id from users where email = '${EMAIL}';`);
const repetido = await api(n.pagina, "/api/treino/educadores", "POST", { nome: "Outro", email: EMAIL, senha: "123456" });
conferir("e-mail repetido é recusado", repetido.status === 409, repetido);

await n.pagina.goto(`${B}/treino/alunos/${P}`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
const secaoVinculo = n.pagina.locator('section[aria-label="Educadores físicos do aluno"]');
await secaoVinculo.locator(".p-dropdown").click();
await n.pagina.locator("li.p-dropdown-item", { hasText: NOME_EDUCADOR }).click();
await secaoVinculo.getByRole("button", { name: "Vincular" }).click();
await n.pagina.waitForTimeout(1200);
conferir("vínculo criado", sql(`select count(*) from treino_vinculos where patient_id = '${P}' and profissional_id = '${EDUCADOR}' and fim is null;`) === "1", null);
conferir("painel mostra o educador vinculado", (await secaoVinculo.getByText(NOME_EDUCADOR).count()) === 1, null);
await n.pagina.screenshot({ path: path.join(PASTA, "t2-admin-aluno.png"), fullPage: true });

// --- Educador: troca a senha provisória e vê só o Treino dos seus alunos ----
const e = await sessao(EMAIL, "inicial-123", 1400);
conferir("primeiro acesso pede a troca de senha", e.pagina.url().includes("/trocar-senha"), e.pagina.url());
await e.pagina.locator("#senha-atual").fill("inicial-123");
await e.pagina.locator("#nova-senha").fill("educador-456");
await e.pagina.locator("#confirmar-senha").fill("educador-456");
await e.pagina.getByRole("button", { name: /Criar senha e continuar|Alterar senha/ }).click();
await e.pagina.waitForTimeout(3000);
conferir("depois da troca, cai no Módulo de Treino", e.pagina.url().endsWith("/treino"), e.pagina.url());
const listaEducador = await e.pagina.locator('section[aria-label="Alunos"]').textContent();
conferir("educador vê o aluno vinculado", listaEducador.includes(NOME_P), listaEducador);
conferir("menu do educador sem a Nutrição", (await e.pagina.locator(".menu-lateral").getByText("Módulo de Nutrição").count()) === 0 && (await e.pagina.locator(".menu-lateral").getByText("Pacientes").count()) === 0, null);
await e.pagina.goto(`${B}/pacientes`, { waitUntil: "networkidle" });
conferir("tela de Pacientes redireciona para o Treino", e.pagina.url().endsWith("/treino"), e.pagina.url());
await e.pagina.goto(`${B}/nutricao/${P}`, { waitUntil: "networkidle" });
conferir("tela da Nutrição do aluno redireciona para o Treino", e.pagina.url().endsWith("/treino"), e.pagina.url());
const consulta = { tabela: "patients", acao: "select", colunas: "id, name", filtros: [], ordem: [], limite: null, deslocamento: null, contar: false, somenteContagem: false, formato: "lista", valores: null, conflito: null, ignorarDuplicados: false };
const dados = await api(e.pagina, "/api/dados", "POST", consulta);
conferir("API genérica não entrega pacientes ao educador", dados.status === 200 && Array.isArray(dados.corpo?.data) && dados.corpo.data.length === 0, dados);
conferir("aluno não vinculado: 404", (await api(e.pagina, `/api/treino/alunos/${OUTRO}`)).status === 404, null);
conferir("registros de aluno não vinculado: 404", (await api(e.pagina, `/api/treino/registros/${OUTRO}`)).status === 404, null);
conferir("cadastro de educadores: 403", (await api(e.pagina, "/api/treino/educadores")).status === 403, null);
conferir("vínculo pelo educador: 403", (await api(e.pagina, `/api/treino/alunos/${P}`, "POST", { acao: "vincular", educadorId: EDUCADOR })).status === 403, null);
conferir("rota da Nutrição: 403", (await api(e.pagina, "/api/nutricao/modelos")).status === 403, null);
const painelAluno = await api(e.pagina, `/api/treino/alunos/${P}`);
conferir("painel do aluno vinculado abre, sem dados da Nutrição", painelAluno.status === 200 && Object.keys(painelAluno.corpo.aluno).join() === "id,nome", painelAluno.corpo?.aluno);

// --- Aluno: relata desconforto pelo modal do dia ----------------------------
const a = await sessao("teste.paciente@local.test", "654987", 390);
await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
await a.pagina.getByText("Treino T2 - Peito").click();
const modal = a.pagina.locator(".p-dialog", { hasText: "Supino reto" });
await modal.waitFor();
await modal.getByRole("button", { name: "Relatar desconforto" }).click();
const relato = a.pagina.locator(".p-dialog", { has: a.pagina.locator(".p-dialog-title", { hasText: "Relatar desconforto" }) });
await relato.waitFor();
conferir("orientação de segurança aparece", (await relato.getByText("Incômodo mais acentuado: pare o exercício.").count()) === 1, null);
await relato.getByRole("button", { name: "Enviar relato" }).click();
conferir("sem região, não envia", (await relato.getByRole("alert").textContent())?.includes("região"), null);
await relato.locator(".p-dropdown").first().click();
await a.pagina.locator("li.p-dropdown-item", { hasText: "Ombro" }).click();
await relato.getByRole("radio", { name: "Intensidade 7" }).click();
await relato.locator(".p-dropdown").nth(1).click();
await a.pagina.locator("li.p-dropdown-item", { hasText: "Supino reto" }).click();
await relato.getByRole("radio", { name: /parei o exercício/ }).click();
await relato.getByLabel("Comentário do desconforto").fill("Pontada na descida da barra.");
await a.pagina.screenshot({ path: path.join(PASTA, "t2-relato-celular.png"), fullPage: true });
await relato.getByRole("button", { name: "Enviar relato" }).click();
await a.pagina.waitForTimeout(1500);
conferir("aluno vê que o relato foi enviado", (await relato.getByText("Relato registrado e enviado ao seu profissional.").count()) === 1, null);
const gravado = sql(`select regiao || '|' || intensidade || '|' || conduta || '|' || exercicio || '|' || dia || '|' || comentario from treino_desconfortos where patient_id = '${P}';`);
conferir("relato gravado com os dados", gravado === "Ombro|7|parei|Supino reto|seg|Pontada na descida da barra.", gravado);
await relato.getByRole("button", { name: "Fechar" }).click();
await a.pagina.waitForTimeout(500);
conferir("modal do dia continua aberto, sem perder o que foi digitado", await modal.isVisible(), null);
const largura = await a.pagina.evaluate(() => document.documentElement.scrollWidth);
conferir("celular: sem rolagem lateral", largura <= 390, largura);

const chave = sql(`select chave_cliente from treino_desconfortos where patient_id = '${P}';`);
const repeticao = await api(a.pagina, "/api/area-paciente/treino/desconforto", "POST", { chaveCliente: chave, dia: "seg", regiao: "Ombro", intensidade: 7, conduta: "parei" });
conferir("reenviar o mesmo relato não duplica", repeticao.status === 200 && repeticao.corpo.novo === false && sql(`select count(*) from treino_desconfortos where patient_id = '${P}';`) === "1", repeticao);
conferir("educador físico não usa a rota do aluno", (await api(e.pagina, "/api/area-paciente/treino/desconforto", "POST", { chaveCliente: crypto.randomUUID(), regiao: "x", intensidade: 1, conduta: "parei" })).status === 403, null);

await esperar(2000);
const avisos = sql(`select usuario_id || '|' || status from notificacoes_profissionais where patient_id = '${P}';`);
conferir("aviso só para o educador vinculado (sem aparelho: fica registrado)", avisos === `${EDUCADOR}|sem_dispositivo`, avisos);
const leve = await api(a.pagina, "/api/area-paciente/treino/desconforto", "POST", { chaveCliente: crypto.randomUUID(), dia: "seg", regiao: "Joelho", intensidade: 3, conduta: "continuei" });
await esperar(1000);
conferir("relato leve (continuou) é gravado, sem push", leve.status === 201 && sql(`select count(*) from notificacoes_profissionais where patient_id = '${P}';`) === "1", leve);
sql(`delete from treino_desconfortos where patient_id = '${P}' and conduta = 'continuei';`);
conferir("nada vai para a fila de push do paciente", sql(`select count(*) from notification_queue where patient_id = '${P}' and created_at > now() - interval '5 minutes';`) === "0", null);
conferir("sem erros (aluno)", a.erros.length === 0, a.erros);

// --- Educador vê o relato e marca como visto --------------------------------
await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await e.pagina.waitForTimeout(1500);
const secaoRelatos = e.pagina.locator('section[aria-label="Relatos de desconforto"]');
const textoRelato = await secaoRelatos.textContent();
conferir("relato aparece no painel do educador", textoRelato.includes(NOME_P) && textoRelato.includes("Ombro") && textoRelato.includes("parou o exercício"), textoRelato);
await e.pagina.screenshot({ path: path.join(PASTA, "t2-educador.png"), fullPage: true });
await secaoRelatos.getByRole("button", { name: "Marcar como visto" }).click();
await e.pagina.waitForTimeout(1200);
conferir("marcado como visto pelo educador", sql(`select visto_por from treino_desconfortos where patient_id = '${P}';`) === EDUCADOR, null);
conferir("some da lista de novos", (await secaoRelatos.getByText("Nenhum relato novo.").count()) === 1, null);
conferir("sem erros (educador)", e.erros.length === 0, e.erros);

// --- Administrador: histórico do relato e desativação -----------------------
await n.pagina.goto(`${B}/pacientes/${P}/treino`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(2000);
conferir("endereço antigo leva ao painel do aluno no Treino", n.pagina.url().includes(`/treino/alunos/${P}?de=ficha`) && (await n.pagina.getByText("Registros do aluno").count()) >= 1, n.pagina.url());
conferir("administrador vê o relato e quem viu", (await n.pagina.locator('section[aria-label="Relatos de desconforto do aluno"]').getByText(`visto por ${NOME_EDUCADOR}`, { exact: false }).count()) === 1, null);
conferir("voltar leva à ficha", (await n.pagina.getByRole("button", { name: "Voltar para o paciente" }).count()) === 1, null);

await n.pagina.goto(`${B}/treino/educadores`, { waitUntil: "networkidle" });
await n.pagina.locator("li", { hasText: NOME_EDUCADOR }).getByRole("button", { name: "Desativar" }).click();
await n.pagina.getByRole("button", { name: "Confirmar" }).click();
for (let i = 0; i < 20 && sql(`select ativo from educadores_fisicos where usuario_id = '${EDUCADOR}';`) !== "f"; i++) await esperar(300);
await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
conferir("educador desativado perde o acesso na hora", (await e.pagina.getByText("Seu acesso ao Módulo de Treino está desativado.").count()) === 1 && (await api(e.pagina, "/api/treino/alunos")).status === 403, null);
conferir("sem erros (administrador)", n.erros.length === 0, n.erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

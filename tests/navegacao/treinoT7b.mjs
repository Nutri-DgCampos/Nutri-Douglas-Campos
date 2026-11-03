// Módulo de Treino, etapa T7b: alunos próprios do educador físico (resposta
// A7). O educador cadastra o aluno; o nutricionista não vê esse aluno em
// nenhuma rota; o aluno entra na Área do Paciente vendo só o Treino.
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
  console.log(`${ok ? "OK   " : "FALHA"} ${nome}${ok ? "" : "\n        " + String(JSON.stringify(detalhe)).slice(0, 500)}`);
};
const sql = (q) => execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();
const sqlFalha = (q) => {
  try {
    execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8", stdio: "pipe" });
    return null;
  } catch (erro) {
    return String(erro.stderr ?? erro.message);
  }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const NOME_P = sql(`select name from patients where id = '${P}';`);
const EMAIL_EDUCADOR = "teste.educador.t7b@local.test";
const NOME_EDUCADOR = "Educador Teste T7b";
const EMAIL_ALUNO = "teste.aluno.t7b@local.test";
const NOME_ALUNO = "Aluno Próprio Teste T7b";

function limpar() {
  sql(`delete from notificacoes_profissionais where patient_id in (select id from patients where name like 'Aluno Próprio Teste T7b%');
       delete from blood_exams where patient_id in (select id from patients where name like 'Aluno Próprio Teste T7b%');
       delete from treino_desconfortos where patient_id in (select id from patients where name like 'Aluno Próprio Teste T7b%');
       delete from patients where name like 'Aluno Próprio Teste T7b%';
       delete from users where email in ('${EMAIL_ALUNO}', 'teste.aluno.t7b.novo@local.test', '${EMAIL_EDUCADOR}');`);
}
limpar();

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
const consulta = (tabela, extra = {}) => ({
  tabela,
  acao: "select",
  colunas: "id",
  filtros: [],
  ordem: [],
  limite: null,
  deslocamento: null,
  contar: false,
  somenteContagem: false,
  formato: "lista",
  valores: null,
  conflito: null,
  ignorarDuplicados: false,
  ...extra,
});

// --- Administrador cadastra o educador (senha já trocada) ------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123", 1400);
const criado = await api(n.pagina, "/api/treino/educadores", "POST", { nome: NOME_EDUCADOR, email: EMAIL_EDUCADOR, senha: "inicial-123" });
conferir("educador cadastrado", criado.status === 201 || criado.status === 200, criado);
sql(`update users set must_change_password = false where email = '${EMAIL_EDUCADOR}';`);
const EDUCADOR = sql(`select id from users where email = '${EMAIL_EDUCADOR}';`);
conferir("administrador não cadastra aluno próprio", (await api(n.pagina, "/api/treino/alunos", "POST", { nome: "X", email: "x@local.test", senha: "123456" })).status === 403, null);

// --- Educador cadastra o aluno próprio pela tela ----------------------------
const e = await sessao(EMAIL_EDUCADOR, "inicial-123", 1400);
await e.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await e.pagina.waitForTimeout(1200);
conferir("lista vazia explica como cadastrar", (await e.pagina.getByText("Cadastre seus alunos", { exact: false }).count()) === 1, null);
await e.pagina.getByRole("button", { name: "Cadastrar aluno" }).click();
const dialogo = e.pagina.locator(".p-dialog", { hasText: "Cadastrar aluno" });
await dialogo.getByLabel("Nome completo").fill(NOME_ALUNO);
await dialogo.getByLabel("Telefone (opcional)").fill("(14) 99999-0000");
await dialogo.getByLabel("E-mail de acesso").fill(EMAIL_ALUNO);
await dialogo.locator('input[aria-label="Senha provisória"]').fill("aluno-123");
await e.pagina.screenshot({ path: path.join(PASTA, "t7b-cadastro.png"), fullPage: true });
await dialogo.getByRole("button", { name: "Cadastrar" }).click();
await e.pagina.waitForTimeout(3000);
const ALUNO = sql(`select id from patients where name = '${NOME_ALUNO}';`);
conferir("aluno criado e ficha aberta", ALUNO.length === 36 && e.pagina.url().endsWith(`/treino/alunos/${ALUNO}`), e.pagina.url());
conferir(
  "aluno com dono, sem plano da Nutrição, vínculo e senha provisória",
  sql(`select p.educador_dono_id = '${EDUCADOR}', p.plan is null, pr.role, u.must_change_password,
              (select count(*) from treino_vinculos v where v.patient_id = p.id and v.profissional_id = '${EDUCADOR}' and v.fim is null)
         from patients p join users u on u.id = p.auth_user_id join profiles pr on pr.id = u.id where p.id = '${ALUNO}';`) === "t|t|paciente|t|1",
  null
);
const cartao = e.pagina.locator('section[aria-label="Cadastro do aluno"]');
conferir("ficha mostra o cadastro do aluno próprio", (await cartao.getByText(EMAIL_ALUNO).count()) === 1, null);
await e.pagina.screenshot({ path: path.join(PASTA, "t7b-ficha-educador.png"), fullPage: true });

const repetido = await api(e.pagina, "/api/treino/alunos", "POST", { nome: "Outro", email: EMAIL_ALUNO, senha: "123456" });
conferir("e-mail repetido: 409", repetido.status === 409, repetido);
conferir("dados inválidos: 400", (await api(e.pagina, "/api/treino/alunos", "POST", { nome: "A", email: "x", senha: "1" })).status === 400, null);
const alterado = await api(e.pagina, `/api/treino/alunos/${ALUNO}`, "PATCH", { nome: `${NOME_ALUNO} Editado`, telefone: "", email: EMAIL_ALUNO });
conferir("educador edita o cadastro", alterado.status === 200 && sql(`select name || '|' || coalesce(phone, '-') from patients where id = '${ALUNO}';`) === `${NOME_ALUNO} Editado|-`, alterado);
await api(e.pagina, `/api/treino/alunos/${ALUNO}`, "PATCH", { nome: NOME_ALUNO, telefone: "(14) 99999-0000", email: EMAIL_ALUNO });
conferir("educador não altera aluno da clínica", (await api(e.pagina, `/api/treino/alunos/${P}`, "PATCH", { nome: "X", email: "y@local.test" })).status === 404, null);
const lista = await api(e.pagina, "/api/treino/alunos");
conferir("lista do educador marca o aluno próprio", lista.corpo?.alunos?.some((a) => a.id === ALUNO && a.proprio), lista.corpo?.alunos);

// --- Nutricionista não alcança o aluno próprio -----------------------------
const naoAparece = (r) => r.status === 200 && !JSON.stringify(r.corpo).includes(ALUNO);
conferir("Treino do admin: fora da lista", naoAparece(await api(n.pagina, "/api/treino/alunos")), null);
conferir("Treino do admin: painel do aluno 404", (await api(n.pagina, `/api/treino/alunos/${ALUNO}`)).status === 404, null);
conferir("Treino do admin: registros 404", (await api(n.pagina, `/api/treino/registros/${ALUNO}`)).status === 404, null);
conferir("admin não edita o aluno próprio", (await api(n.pagina, `/api/treino/alunos/${ALUNO}`, "PATCH", { nome: "X", email: "y@local.test" })).status === 404, null);
const educadores = await api(n.pagina, "/api/treino/educadores");
conferir("contagem de alunos do educador sem o aluno próprio", educadores.corpo?.educadores?.find((x) => x.usuario_id === EDUCADOR)?.alunos === 0, educadores.corpo);
conferir("API genérica: pacientes sem o aluno", naoAparece(await api(n.pagina, "/api/dados", "POST", consulta("patients"))), null);
const porId = await api(n.pagina, "/api/dados", "POST", consulta("patients", { filtros: [{ coluna: "id", operador: "eq", valor: ALUNO }] }));
conferir("API genérica: busca pelo id volta vazia", porId.status === 200 && Array.isArray(porId.corpo?.data) && porId.corpo.data.length === 0, porId);
await api(n.pagina, "/api/dados", "POST", consulta("patients", { acao: "update", valores: { name: "Invadido" }, filtros: [{ coluna: "id", operador: "eq", valor: ALUNO }] }));
conferir("API genérica: não altera o aluno", sql(`select name from patients where id = '${ALUNO}';`) === NOME_ALUNO, null);
const ciclo = await api(n.pagina, "/api/dados", "POST", consulta("diet_cycles", { acao: "insert", valores: [{ patient_id: ALUNO, start_date: "2026-11-01", status: "ativo" }] }));
conferir("API genérica: não cria ciclo para o aluno", sql(`select count(*) from diet_cycles where patient_id = '${ALUNO}';`) === "0", ciclo);
const funcao = await api(n.pagina, "/api/dados/funcao", "POST", { nome: "iniciar_ciclo_dieta", argumentos: { p_patient_id: ALUNO, p_start_date: "2026-11-01", p_end_date: "2026-12-04", p_followup_frequency: "semanal" } });
conferir("função de ciclo recusa o aluno", funcao.status === 404, funcao);
conferir("consulta da Nutrição recusa o aluno", (await api(n.pagina, "/api/nutricao/consultas", "POST", { pacienteId: ALUNO, tipo: "primeira" })).status === 404, null);
conferir("exames da ficha: 404", (await api(n.pagina, `/api/nutricao/pacientes/${ALUNO}/exames`)).status === 404, null);
conferir("formulários da ficha: 404", (await api(n.pagina, `/api/nutricao/pacientes/${ALUNO}/formularios`)).status === 404, null);
conferir("link de formulários: 404", (await api(n.pagina, `/api/nutricao/pacientes/${ALUNO}/link-formularios`)).status === 404, null);
conferir("acesso do paciente: 404", (await api(n.pagina, `/api/pacientes/${ALUNO}/acesso`)).status === 404, null);
conferir("engajamento sem o aluno", naoAparece(await api(n.pagina, "/api/pacientes/engajamento")), null);
conferir("exclusão pela Nutrição: 404 e cadastro intacto", (await api(n.pagina, `/api/pacientes/${ALUNO}`, "DELETE")).status === 404 && sql(`select count(*) from patients where id = '${ALUNO}';`) === "1", null);
await n.pagina.goto(`${B}/pacientes`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(2000);
conferir("tela Pacientes sem o aluno", (await n.pagina.getByText(NOME_ALUNO).count()) === 0 && (await n.pagina.getByText(NOME_P).count()) >= 1, null);
await n.pagina.goto(`${B}/treino`, { waitUntil: "networkidle" });
await n.pagina.waitForTimeout(1500);
conferir("Módulo de Treino do admin sem o aluno", (await n.pagina.getByText(NOME_ALUNO).count()) === 0, null);
conferir("dono não muda no banco", (sqlFalha(`update patients set educador_dono_id = null where id = '${ALUNO}';`) ?? "").includes("não pode ser alterado"), null);
conferir("paciente da clínica não vira aluno próprio", (sqlFalha(`update patients set educador_dono_id = '${EDUCADOR}' where id = '${P}';`) ?? "").includes("não pode ser alterado"), null);
sql(`insert into blood_exams (patient_id, file_name, storage_path, lote_envio) values ('${ALUNO}', 't7b.pdf', '${ALUNO}/t7b.pdf', gen_random_uuid());`);
conferir("aviso ao nutricionista ignora o aluno próprio", sql(`select count(*) from notificacoes_profissionais where patient_id = '${ALUNO}';`) === "0", null);

// --- Aluno próprio: troca a senha e vê só o Treino --------------------------
const a = await sessao(EMAIL_ALUNO, "aluno-123", 390);
conferir("primeiro acesso pede a troca de senha", a.pagina.url().includes("/trocar-senha"), a.pagina.url());
await a.pagina.locator("#senha-atual").fill("aluno-123");
await a.pagina.locator("#nova-senha").fill("aluno-456");
await a.pagina.locator("#confirmar-senha").fill("aluno-456");
await a.pagina.getByRole("button", { name: /Criar senha e continuar|Alterar senha/ }).click();
await a.pagina.waitForTimeout(3500);
conferir("depois da troca, cai na Área do Paciente", a.pagina.url().endsWith("/area-paciente"), a.pagina.url());
const inicio = (await a.pagina.locator("main").textContent()) ?? "";
conferir("início só com o Treino", inicio.includes("Área do aluno") && inicio.includes("Meu treino") && !inicio.includes("nutricional") && !inicio.includes("Pagamentos") && !inicio.includes("Dieta"), inicio.slice(0, 400));
const menu = (await a.pagina.locator("nav.barra-inferior").textContent()) ?? "";
conferir("menu inferior: Início, Treino e Relatórios", menu.includes("Treino") && menu.includes("Relatórios") && !menu.includes("Dieta") && !menu.includes("Fotos") && !menu.includes("Pagamentos"), menu);
await a.pagina.screenshot({ path: path.join(PASTA, "t7b-inicio-aluno.png"), fullPage: true });
await a.pagina.goto(`${B}/area-paciente/dietas`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
conferir("tela da Dieta volta ao início", a.pagina.url().endsWith("/area-paciente"), a.pagina.url());
await a.pagina.goto(`${B}/area-paciente/relatorios`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
const relatorios = (await a.pagina.locator("main").textContent()) ?? "";
conferir("Relatórios só com o Treino", relatorios.includes("Personal Trainer") && !relatorios.includes("nutricionista"), relatorios.slice(0, 300));
await a.pagina.screenshot({ path: path.join(PASTA, "t7b-relatorios-aluno.png"), fullPage: true });
await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
conferir("Meu treino abre", a.pagina.url().endsWith("/area-paciente/treino") && (await a.pagina.getByText("Meu treino").count()) >= 1, a.pagina.url());
conferir("exames da Nutrição: 403", (await api(a.pagina, "/api/exames")).status === 403, null);
const renovacao = await api(a.pagina, "/api/dados", "POST", consulta("renewal_requests", { acao: "insert", valores: [{ patient_id: ALUNO, requested_plan: "Mensal" }] }));
conferir("não pede renovação da Nutrição", sql(`select count(*) from renewal_requests where patient_id = '${ALUNO}';`) === "0", renovacao);
const relato = await api(a.pagina, "/api/area-paciente/treino/desconforto", "POST", { chaveCliente: crypto.randomUUID(), dia: "seg", regiao: "Joelho", intensidade: 8, conduta: "parei" });
await esperar(1000);
conferir(
  "relato forte avisa só o educador dono",
  relato.status === 201 &&
    sql(`select string_agg(usuario_id::text, ',') from notificacoes_profissionais where patient_id = '${ALUNO}' and referencia_id = '${relato.corpo.id}';`) === EDUCADOR,
  relato
);

// --- Paciente da clínica continua igual -------------------------------------
conferir("paciente da clínica segue no Treino do admin", JSON.stringify((await api(n.pagina, "/api/treino/alunos")).corpo).includes(P), null);
conferir("sem erros (nutricionista)", n.erros.length === 0, n.erros);
conferir("sem erros (educador)", e.erros.length === 0, e.erros);
conferir("sem erros (aluno)", a.erros.length === 0, a.erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

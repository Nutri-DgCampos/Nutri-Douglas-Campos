// Módulo de Treino, etapa T4a: editor de musculação (VIS-03), biblioteca de
// exercícios, academias e modelos. O educador monta o treino na tela, envia
// ao aluno (versão imutável) e o aluno registra no "Meu treino" com a faixa
// de repetições. Confere permissões, revisão, PDF, IA simulada, importação,
// modelos, duplicação e arquivamento.
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
const sqlFalha = (q) => {
  try {
    execSync("docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -At -U nutri -d nutri", { input: q, encoding: "utf8", stdio: "pipe" });
    return null;
  } catch (erro) {
    return String(erro.stderr ?? erro.message);
  }
};

const EMAIL_EDUCADOR = "teste.educador.t4a@local.test";
const EMAIL_OUTRO = "teste.outro.t4a@local.test";
const EMAIL_ALUNO = "teste.aluno.t4a@local.test";
const NOME_ALUNO = "Aluno Teste T4a";

function limpar() {
  sql(`delete from notification_queue where patient_id in (select id from patients where name like 'Aluno Teste T4a%');
       delete from treino_modelos where criado_por in (select id from users where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}'));
       delete from treino_academia_do_aluno where patient_id in (select id from patients where name like 'Aluno Teste T4a%');
       delete from treino_academias where nome like 'Academia Teste T4a%';
       delete from treino_exercicios where nome like 'Exercício Teste T4a%';
       delete from patients where name like 'Aluno Teste T4a%';
       delete from users where email in ('${EMAIL_ALUNO}', '${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}');`);
}
limpar();

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
      const tipo = r.headers.get("content-type") ?? "";
      return { status: r.status, tipo, corpo: tipo.includes("json") ? await r.json().catch(() => null) : null };
    },
    [url, metodo, corpo]
  );

// --- Preparação: dois educadores e um aluno próprio do primeiro -------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
for (const [nome, email] of [["Educador Teste T4a", EMAIL_EDUCADOR], ["Outro Educador T4a", EMAIL_OUTRO]]) {
  const r = await api(n.pagina, "/api/treino/educadores", "POST", { nome, email, senha: "inicial-123", cref: "123456-G/SP" });
  conferir(`educador ${email} cadastrado`, r.status === 201 || r.status === 200, r);
}
sql(`update users set must_change_password = false where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}');`);

const e = await sessao(EMAIL_EDUCADOR, "inicial-123");
const novo = await api(e.pagina, "/api/treino/alunos", "POST", { nome: NOME_ALUNO, email: EMAIL_ALUNO, senha: "aluno-123" });
conferir("aluno próprio cadastrado", novo.status === 201, novo);
const ALUNO = novo.corpo?.id;
sql(`update users set must_change_password = false where email = '${EMAIL_ALUNO}';`);

// --- Biblioteca e academia ---------------------------------------------------
const lista = await api(e.pagina, "/api/treino/exercicios?q=agachamento");
conferir("biblioteca inicial com busca", lista.corpo?.exercicios?.some((x) => x.nome === "Agachamento livre" && x.base && !x.pode_alterar), lista.corpo?.exercicios?.map((x) => x.nome));
const base = lista.corpo.exercicios.find((x) => x.nome === "Agachamento livre");
conferir("educador não altera item da lista inicial", (await api(e.pagina, `/api/treino/exercicios/${base.id}`, "PATCH", { nome: "Agachamento alterado", grupo: "Peito" })).status === 404, null);
const criado = await api(e.pagina, "/api/treino/exercicios", "POST", { nome: "Exercício Teste T4a", grupo: "Glúteo", grupos_secundarios: ["Isquiotibiais"], equipamentos: ["Kettlebell"], video_url: "https://www.youtube.com/watch?v=teste" });
conferir("educador cadastra exercício", criado.status === 201, criado);
conferir("nome repetido é recusado", (await api(e.pagina, "/api/treino/exercicios", "POST", { nome: "exercicio teste t4a", grupo: "Glúteo" })).status === 400, null);
conferir("vídeo fora do YouTube é recusado", (await api(e.pagina, "/api/treino/exercicios", "POST", { nome: "Exercício Teste T4a 2", grupo: "Glúteo", video_url: "https://exemplo.com/v" })).status === 400, null);

const academia = await api(e.pagina, "/api/treino/academias", "POST", { nome: "Academia Teste T4a", equipamentos: ["Halteres", "Banco", "Cadeira extensora"] });
conferir("academia cadastrada", academia.status === 201, academia);
await e.pagina.goto(`${B}/treino/alunos/${ALUNO}`, { waitUntil: "networkidle" });
await e.pagina.waitForTimeout(1200);
await e.pagina.locator('section[aria-label="Academia do aluno"] .p-dropdown').click();
await e.pagina.getByRole("option", { name: "Academia Teste T4a" }).click();
await e.pagina.waitForTimeout(1200);
conferir("academia do aluno definida pela ficha", sql(`select a.nome from treino_academia_do_aluno x join treino_academias a on a.id = x.academia_id where x.patient_id = '${ALUNO}';`) === "Academia Teste T4a", null);

// --- Editor pela tela ----------------------------------------------------------
await e.pagina.getByRole("button", { name: "Elaborar Musculação" }).click();
await e.pagina.waitForTimeout(2000);
conferir(
  "editor vazio oferece novo, modelo e rotina",
  await e.pagina.getByText("Nenhum treino elaborado para este aluno.").waitFor({ timeout: 20000 }).then(() => true, () => false),
  null
);
await e.pagina.getByRole("button", { name: "Novo treino" }).first().click();
await e.pagina.waitForTimeout(2500);
const PROGRAMA = new URL(e.pagina.url()).searchParams.get("programa");
conferir("programa criado e aberto", /^[0-9a-f-]{36}$/.test(PROGRAMA ?? ""), e.pagina.url());

await e.pagina.getByLabel("Objetivo").fill("Hipertrofia");
await e.pagina.getByLabel("Título").fill("Treino A – Inferiores");
await e.pagina.getByRole("button", { name: "Adicionar treino (dia)" }).click();
await e.pagina.getByLabel("Nome da sessão").fill("Treino A – Membros inferiores");
await e.pagina.getByRole("button", { name: "Exercício", exact: true }).click();
const busca = e.pagina.locator(".p-autocomplete input").first();
await busca.fill("agacha");
await e.pagina.waitForTimeout(800);
await e.pagina.locator(".p-autocomplete-item", { hasText: "Agachamento livre" }).first().click();
await e.pagina.getByLabel("Séries do exercício 1").fill("4");
await e.pagina.getByLabel("Repetições (mínimo) do exercício 1").fill("8");
await e.pagina.getByLabel("Repetições (máximo da faixa) do exercício 1").fill("12");
await e.pagina.getByLabel("Carga do exercício 1").fill("70");
await e.pagina.getByLabel("Descanso do exercício 1").fill("90");
await e.pagina.getByRole("button", { name: "Exercício", exact: true }).click();
await e.pagina.locator(".p-autocomplete input").nth(1).fill("Cadeira exten");
await e.pagina.waitForTimeout(800);
await e.pagina.locator(".p-autocomplete-item", { hasText: "Cadeira extensora" }).first().click();
await e.pagina.getByLabel("Séries do exercício 2").fill("3");
await e.pagina.getByLabel("Repetições (mínimo) do exercício 2").fill("12");
await e.pagina.getByLabel("Carga do exercício 2").click();
await e.pagina.waitForTimeout(3500);
conferir(
  "aviso de equipamento que falta na academia",
  (await e.pagina.getByText("A academia do aluno não tem: Barra e anilhas").count()) === 1,
  null
);
conferir("volume da sessão calculado (4 + 3 = 7 séries)", (await e.pagina.getByText("7 séries").count()) >= 1, null);

// ≡ Detalhes: RPE, nota privada e Opção oculta ao aluno.
await e.pagina.getByLabel("Detalhes avançados do exercício 1").click();
const detalhes = e.pagina.locator(".p-dialog", { hasText: "Detalhes:" });
await detalhes.getByLabel("RPE").fill("8");
await detalhes.getByLabel("Notas privadas").fill("nota secreta do profissional");
await detalhes.getByLabel("Nome da opção").fill("Agachamento no Smith");
await detalhes.getByRole("checkbox", { name: "O aluno vê" }).uncheck();
await detalhes.getByRole("button", { name: "Aplicar" }).click();
await e.pagina.waitForTimeout(3500);
const rascunho = JSON.parse(sql(`select plano::text from treino_prescricoes where programa_id = '${PROGRAMA}' and status = 'rascunho';`));
const [ex1, ex2] = rascunho.dias[0].exercicios;
conferir(
  "rascunho gravado sozinho com faixa, detalhes e Opção",
  ex1.nome === "Agachamento livre" && ex1.repeticoes === 8 && ex1.repeticoes_max === 12 && ex1.carga_kg === 70 && ex1.avancado?.rpe === 8 && ex1.alternativa?.visivel === false && ex1.exercicio_id === base.id && ex2.series === 3,
  rascunho
);
conferir("nada publicado antes do envio", sql(`select count(*) from treino_prescricoes where programa_id = '${PROGRAMA}' and status = 'publicada';`) === "0", null);
await e.pagina.screenshot({ path: path.join(PASTA, "t4a-editor.png"), fullPage: true });

// Enviar ao paciente.
await e.pagina.getByRole("button", { name: "Enviar ao paciente" }).click();
await e.pagina.waitForTimeout(800);
await e.pagina.locator(".p-confirm-dialog, .p-dialog").getByRole("button", { name: "Enviar ao paciente" }).last().click();
await e.pagina.waitForTimeout(3000);
conferir(
  "versão 1 publicada e aviso ao aluno na fila",
  sql(`select versao || '|' || (select count(*) from notification_queue q where q.patient_id = '${ALUNO}' and q.notification_type = 'treino_novo')
         from treino_prescricoes where programa_id = '${PROGRAMA}' and status = 'publicada';`) === "1|1",
  null
);
conferir("selo mostra a versão enviada", (await e.pagina.getByText("Enviado: versão 1", { exact: false }).count()) >= 1, null);
const V1 = sql(`select id from treino_prescricoes where programa_id = '${PROGRAMA}' and status = 'publicada' and versao = 1;`);
conferir("versão publicada não muda no banco", Boolean(sqlFalha(`update treino_prescricoes set plano = '{"dias":[]}' where id = '${V1}';`)), null);

// Alterar depois do envio não muda a versão do aluno.
await e.pagina.getByLabel("Carga do exercício 1").fill("75");
await e.pagina.getByLabel("Descanso do exercício 1").click();
await e.pagina.waitForTimeout(3500);
conferir("selo indica alteração depois do envio", (await e.pagina.getByText("alterado depois", { exact: false }).count()) >= 1, null);

// --- Permissões e revisão -------------------------------------------------------
const outro = await sessao(EMAIL_OUTRO, "inicial-123");
conferir("outro educador não abre o programa", (await api(outro.pagina, `/api/treino/programas/${PROGRAMA}`)).status === 404, null);
conferir("outro educador não cria programa para o aluno", (await api(outro.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "vazio" })).status === 404, null);
conferir("administrador não alcança o aluno próprio", (await api(n.pagina, `/api/treino/alunos/${ALUNO}/programas`)).status === 404, null);
conferir("administrador não abre o programa", (await api(n.pagina, `/api/treino/programas/${PROGRAMA}/pdf?versao=1`)).status === 404, null);
const atual = (await api(e.pagina, `/api/treino/programas/${PROGRAMA}`)).corpo.programa;
const velho = await api(e.pagina, `/api/treino/programas/${PROGRAMA}`, "PUT", { titulo: "X", objetivo: "", plano: atual.plano, revisao: atual.revisao - 1 });
conferir("gravação com revisão antiga é recusada", velho.status === 409, velho);
const semTitulo = await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "vazio" });
const enviarVazio = await api(e.pagina, `/api/treino/programas/${semTitulo.corpo.programaId}`, "PATCH", { acao: "enviar", revisao: 0 });
conferir("envio sem título nem sessões é recusado", enviarVazio.status === 400 && enviarVazio.corpo.erro.includes("título"), enviarVazio);
await api(e.pagina, `/api/treino/programas/${semTitulo.corpo.programaId}`, "PATCH", { acao: "arquivar" });

// --- PDF, IA simulada, importação, modelos, duplicação ----------------------------
const pdf = await api(e.pagina, `/api/treino/programas/${PROGRAMA}/pdf?versao=1`);
conferir("PDF da versão 1", pdf.status === 200 && pdf.tipo.includes("pdf"), pdf.status);
const pdfDetalhado = await api(e.pagina, `/api/treino/programas/${PROGRAMA}/pdf?detalhado=1`);
conferir("PDF detalhado do rascunho", pdfDetalhado.status === 200 && pdfDetalhado.tipo.includes("pdf"), pdfDetalhado.status);
const ia = await api(e.pagina, `/api/treino/programas/${PROGRAMA}/ia`, "POST", { pedido: "Monte um treino AB" });
conferir("IA devolve sugestão com avisos, sem gravar", ia.status === 200 && ia.corpo.sugestao.plano.dias.length === 2 && ia.corpo.sugestao.avisos.length > 0, ia);
conferir("IA ligou a sugestão à biblioteca", ia.corpo?.sugestao.plano.dias[0].exercicios[0].exercicio_id === base.id, ia.corpo?.sugestao.plano.dias[0].exercicios[0]);
const importado = await e.pagina.evaluate(async (id) => {
  const dados = new FormData();
  dados.append("texto", "Treino A: agachamento 4x8-12, cadeira extensora 3x12");
  const r = await fetch(`/api/treino/programas/${id}/importar`, { method: "POST", body: dados });
  return { status: r.status, corpo: await r.json() };
}, PROGRAMA);
conferir("importação lida para revisão, com faixa", importado.status === 200 && importado.corpo.plano.dias[0].exercicios[0].repeticoes_max === 12, importado);
conferir("original da importação guardado", sql(`select importacao->>'origem' || '|' || (importacao->>'texto' like 'Treino A:%') from treino_prescricoes where programa_id = '${PROGRAMA}' and status = 'rascunho';`) === "texto|true", null);

const modelo = await api(e.pagina, "/api/treino/modelos", "POST", { nome: "Modelo Teste T4a", plano: atual.plano, compartilhado: false });
conferir("modelo salvo sem cargas nem notas", modelo.status === 201 && sql(`select plano::text not like '%nota secreta%' and plano::text not like '%"carga_kg": 70%' from treino_modelos where id = '${modelo.corpo.id}';`) === "t", modelo);
conferir("modelo privado não aparece para o outro educador", !(await api(outro.pagina, "/api/treino/modelos")).corpo.modelos.some((m) => m.id === modelo.corpo.id), null);
const doModelo = await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "modelo", modeloId: modelo.corpo.id });
conferir("programa criado a partir do modelo", doModelo.status === 201, doModelo);
const copia = await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "duplicar", programaId: PROGRAMA });
conferir("duplicar cria rascunho novo sem mexer no original", copia.status === 201 && sql(`select titulo from treino_prescricoes where programa_id = '${copia.corpo.programaId}' and status = 'rascunho';`) === "Treino A – Inferiores (cópia)", copia);
await api(e.pagina, `/api/treino/programas/${doModelo.corpo.programaId}`, "PATCH", { acao: "arquivar" });
await api(e.pagina, `/api/treino/programas/${copia.corpo.programaId}`, "PATCH", { acao: "arquivar" });

// --- Aluno: "Meu treino" com a faixa e sem os detalhes do editor -----------------
const a = await sessao(EMAIL_ALUNO, "aluno-123", 420);
const treinoDoAluno = await api(a.pagina, "/api/area-paciente/treino");
const exAluno = treinoDoAluno.corpo?.treino?.prescricao?.plano?.dias?.[0]?.exercicios?.[0];
conferir("aluno recebe a versão 1 (carga 70, não o rascunho)", exAluno?.carga_kg === 70 && exAluno?.repeticoes_max === 12, exAluno);
conferir("aluno não recebe detalhes, notas nem a Opção oculta", exAluno && exAluno.avancado === undefined && exAluno.alternativa === null && !JSON.stringify(treinoDoAluno.corpo).includes("nota secreta"), exAluno);
await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
const diaDoTreino = a.pagina.getByRole("button", { name: /Treino A – Membros inferiores/ });
await diaDoTreino.click();
await a.pagina.waitForTimeout(800);
const modal = a.pagina.locator(".p-dialog");
conferir("modal mostra a faixa de repetições", (await modal.getByText("Faixa: 8–12").count()) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "t4a-aluno-faixa.png"), fullPage: true });
await modal.locator(".p-inputnumber input").nth(1).fill("10");
await modal.getByRole("button", { name: "Salvar" }).click();
await a.pagina.waitForTimeout(2000);
conferir(
  "aluno registra as repetições feitas dentro da faixa",
  sql(`select e.repeticoes from treino_exercicios_registro e join treino_sessoes s on s.id = e.sessao_id where s.patient_id = '${ALUNO}' and e.indice = 0;`) === "10.0",
  null
);

// --- Arquivar tira o treino do aluno; reativar devolve ----------------------------
await api(e.pagina, `/api/treino/programas/${PROGRAMA}`, "PATCH", { acao: "arquivar" });
conferir("arquivado: o aluno fica sem treino vigente", (await api(a.pagina, "/api/area-paciente/treino")).corpo.treino === null, null);
const reativar = await api(e.pagina, `/api/treino/programas/${PROGRAMA}`, "PATCH", { acao: "reativar" });
conferir("reativado: a versão 1 volta a valer", reativar.status === 200 && (await api(a.pagina, "/api/area-paciente/treino")).corpo.treino?.prescricao?.versao === 1, null);

// --- Telas da biblioteca -------------------------------------------------------------
await e.pagina.goto(`${B}/treino/biblioteca`, { waitUntil: "networkidle" });
await e.pagina.waitForTimeout(1500);
conferir("biblioteca lista o exercício cadastrado", (await e.pagina.getByText("Exercício Teste T4a").count()) >= 1, null);
await e.pagina.screenshot({ path: path.join(PASTA, "t4a-biblioteca.png"), fullPage: true });
await e.pagina.getByRole("tab", { name: "Academias" }).click();
await e.pagina.waitForTimeout(1000);
conferir("aba de academias", (await e.pagina.getByText("Academia Teste T4a").count()) >= 1, null);

const erros = [...n.erros, ...e.erros, ...outro.erros, ...a.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

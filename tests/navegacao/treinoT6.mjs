// Módulo de Treino, etapa T6: anamnese do educador (R6), avaliação física
// compartilhada (R7/R7b) e identidade nos PDFs do educador (R8).
// Usa o paciente de teste da clínica, vinculado a um educador de teste
// (aluno compartilhado entre o nutricionista e o educador).
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

const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const EMAIL_EDUCADOR = "teste.educador.t6@local.test";
const EMAIL_OUTRO = "teste.outro.t6@local.test";
const NOME_EDUCADOR = "Educador Teste T6";

function limpar() {
  sql(`set session_replication_role = replica;
       delete from avaliacoes_fisicas where patient_id = '${P}' and (criada_por in (select id from users where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}')) or documento->>'observacoes' = 'Teste T6');
       set session_replication_role = origin;
       delete from treino_vinculos where profissional_id in (select id from users where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}'));
       delete from treino_anamneses where patient_id = '${P}';
       delete from users where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}');`);
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

// --- Preparação: educador vinculado ao paciente da clínica --------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
for (const [nome, email] of [[NOME_EDUCADOR, EMAIL_EDUCADOR], ["Outro Educador T6", EMAIL_OUTRO]]) {
  await api(n.pagina, "/api/treino/educadores", "POST", { nome, email, senha: "inicial-123", cref: "000111-G/SP" });
}
sql(`update users set must_change_password = false where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}');`);
const EDUCADOR = sql(`select id from users where email = '${EMAIL_EDUCADOR}';`);
const vinculo = await api(n.pagina, `/api/treino/alunos/${P}`, "POST", { acao: "vincular", educadorId: EDUCADOR });
conferir("educador vinculado ao paciente da clínica (aluno compartilhado)", vinculo.status === 200, vinculo);

// --- Educador entra; um rascunho dele serve de molde do documento -----------------
const e = await sessao(EMAIL_EDUCADOR, "inicial-123");
const molde = (await api(e.pagina, `/api/treino/alunos/${P}/avaliacoes`, "POST")).corpo.id;
const documento = JSON.stringify((await api(e.pagina, `/api/treino/avaliacoes/${molde}`)).corpo.avaliacao.documento).replace(/'/g, "''");
await api(e.pagina, `/api/treino/avaliacoes/${molde}`, "DELETE");

// Avaliações do nutricionista: uma finalizada (histórico) e um rascunho.
const NUTRI = sql(`select id from users where email = 'teste.nutri@local.test';`);
const AVAL_NUTRI = sql(`insert into avaliacoes_fisicas (patient_id, consulta_id, data, documento, criada_por)
  values ('${P}', null, current_date - 30, '${documento}'::jsonb || '{"observacoes": "Teste T6", "peso": 70}', '${NUTRI}') returning id;`).split("\n")[0];
const finalizadaPeloNutri = await api(n.pagina, `/api/nutricao/avaliacoes/${AVAL_NUTRI}`, "PATCH", { acao: "finalizar", revisao: Number(sql(`select revisao from avaliacoes_fisicas where id = '${AVAL_NUTRI}';`)) });
conferir("nutricionista finaliza a própria avaliação", finalizadaPeloNutri.status === 200, finalizadaPeloNutri);
const RASCUNHO_NUTRI = sql(`insert into avaliacoes_fisicas (patient_id, consulta_id, data, status, documento, criada_por)
  values ('${P}', null, current_date, 'rascunho', '${documento}'::jsonb || '{"observacoes": "Teste T6"}', '${NUTRI}') returning id;`).split("\n")[0];

// --- Anamnese simples antiga (R6): privada e só leitura desde 10/11 -----------------
// (a anamnese com modelos e link está em cadastroAnamnese1110.mjs)
sql(`insert into treino_anamneses (patient_id, profissional_id, respostas, revisao)
     values ('${P}', '${EDUCADOR}', '{"objetivo": "Ganhar força para correr melhor", "lesoes": "Entorse no tornozelo direito em 2024"}', 1);`);
await e.pagina.goto(`${B}/treino/alunos/${P}`, { waitUntil: "networkidle" });
await e.pagina.getByRole("region", { name: "Anamneses" }).waitFor({ timeout: 20000 });
await e.pagina.getByRole("button", { name: /Anamnese anterior \(só você vê\)/ }).click();
await e.pagina.getByText("Ganhar força para correr melhor").waitFor({ timeout: 10000 }).catch(() => undefined);
conferir("anamnese antiga do educador continua legível para ele", (await e.pagina.getByText("Ganhar força para correr melhor").count()) === 1, null);
const doAdmin = await api(n.pagina, `/api/treino/alunos/${P}/anamneses`);
conferir("anamnese antiga continua privada: o administrador não vê a do educador (F2)", doAdmin.status === 200 && !JSON.stringify(doAdmin.corpo).includes("tornozelo"), doAdmin.corpo?.antiga);
conferir("anamnese antiga não aceita mais gravação", (await api(e.pagina, `/api/treino/alunos/${P}/anamnese`, "PUT", { respostas: { objetivo: "x" }, revisao: 1 })).status === 410, null);

// --- Educador: avaliação física pela tela ---------------------------------------
const listaAntes = (await api(e.pagina, `/api/treino/alunos/${P}/avaliacoes`)).corpo.avaliacoes;
conferir("educador vê a avaliação finalizada do nutricionista, não o rascunho dele", listaAntes.some((a) => a.id === AVAL_NUTRI && !a.minha) && !listaAntes.some((a) => a.id === RASCUNHO_NUTRI), listaAntes);
await e.pagina.getByRole("button", { name: "Nova avaliação" }).click();
await e.pagina.waitForURL(/\/avaliacao\/[0-9a-f-]{36}$/, { timeout: 20000 });
const AVAL_EDU = e.pagina.url().split("/").pop();
await e.pagina.getByText("Avaliação física").first().waitFor({ timeout: 20000 });
await e.pagina.waitForTimeout(1500);
conferir("editor da Nutrição aberto no Treino, sem envio ao paciente nem leitura do PDF", (await e.pagina.getByRole("button", { name: "Anexar exame de bioimpedância" }).count()) === 0, null);
await e.pagina.screenshot({ path: path.join(PASTA, "t6-avaliacao-educador.png"), fullPage: true });

// Peso e finalização pela API do Treino (mesmo editor).
const lida = (await api(e.pagina, `/api/treino/avaliacoes/${AVAL_EDU}`)).corpo;
const salvo = await api(e.pagina, `/api/treino/avaliacoes/${AVAL_EDU}`, "PUT", { documento: { ...lida.avaliacao.documento, peso: 68.5, observacoes: "Teste T6" }, revisao: lida.avaliacao.revisao });
const fim = await api(e.pagina, `/api/treino/avaliacoes/${AVAL_EDU}`, "PATCH", { acao: "finalizar", revisao: salvo.corpo.revisao });
conferir(
  "avaliação do educador finalizada, sem consulta da Nutrição, com o autor",
  fim.status === 200 && sql(`select status || '|' || (consulta_id is null) || '|' || (criada_por = '${EDUCADOR}') from avaliacoes_fisicas where id = '${AVAL_EDU}';`) === "finalizada|true|true",
  fim
);
conferir("avaliação finalizada sem consulta não pode ser apagada no banco", (() => {
  try {
    sql(`delete from avaliacoes_fisicas where id = '${AVAL_EDU}';`);
    return false;
  } catch {
    return true;
  }
})(), null);
const resultados = await api(e.pagina, `/api/treino/avaliacoes/${AVAL_EDU}`);
conferir("histórico compartilhado inclui a do nutricionista e a do educador", resultados.corpo.historico.some((h) => h.id === AVAL_NUTRI) && resultados.corpo.historico.some((h) => h.id === AVAL_EDU), resultados.corpo.historico);

// --- Só o autor altera (R7b) -------------------------------------------------------
conferir("educador não altera a avaliação do nutricionista", (await api(e.pagina, `/api/treino/avaliacoes/${AVAL_NUTRI}`, "PATCH", { acao: "reabrir" })).status === 403, null);
conferir("educador não lê o rascunho do nutricionista", (await api(e.pagina, `/api/treino/avaliacoes/${RASCUNHO_NUTRI}`)).status === 404, null);
const naNutricao = await api(n.pagina, `/api/nutricao/avaliacoes/${AVAL_EDU}`);
conferir("nutricionista vê a avaliação do educador, com autor, só leitura", naNutricao.status === 200 && naNutricao.corpo.autor === NOME_EDUCADOR && naNutricao.corpo.pode_editar === false, naNutricao.corpo?.autor);
conferir(
  "nutricionista não reabre, não exclui e não envia a avaliação do educador",
  (await api(n.pagina, `/api/nutricao/avaliacoes/${AVAL_EDU}`, "PATCH", { acao: "reabrir" })).status === 403 &&
    (await api(n.pagina, `/api/nutricao/avaliacoes/${AVAL_EDU}`, "DELETE")).status === 403 &&
    (await api(n.pagina, `/api/nutricao/avaliacoes/${AVAL_EDU}/enviar`, "POST")).status === 403,
  null
);
const outro = await sessao(EMAIL_OUTRO, "inicial-123");
conferir("educador sem vínculo não vê as avaliações", (await api(outro.pagina, `/api/treino/alunos/${P}/avaliacoes`)).status === 404 && (await api(outro.pagina, `/api/treino/avaliacoes/${AVAL_EDU}`)).status === 404, null);

// --- Perfil e identidade nos PDFs (R8) ---------------------------------------------
await e.pagina.goto(`${B}/treino/perfil`, { waitUntil: "networkidle" });
await e.pagina.getByLabel("E-mail de contato").waitFor({ timeout: 20000 });
await e.pagina.getByLabel("Telefone").fill("(14) 98888-0000");
await e.pagina.getByLabel("E-mail de contato").fill("contato.t6@local.test");
await e.pagina.getByRole("button", { name: "Salvar" }).click();
await e.pagina.waitForTimeout(1200);
conferir("perfil do educador salvo", sql(`select telefone || '|' || email_contato from educadores_fisicos where usuario_id = '${EDUCADOR}';`) === "(14) 98888-0000|contato.t6@local.test", null);
// PNG de 1×1 px como logotipo.
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const envio = await e.pagina.evaluate(async (b64) => {
  const dados = new FormData();
  dados.append("arquivo", new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" }), "logo.png");
  return (await fetch("/api/treino/perfil/logo", { method: "POST", body: dados })).status;
}, png);
const logo = await api(e.pagina, "/api/treino/perfil/logo");
conferir("logotipo enviado e só o educador o vê", envio === 200 && logo.status === 200 && logo.tipo === "image/png" && (await api(n.pagina, "/api/treino/perfil/logo")).status === 403, { envio, logo: logo.status });
const pdf = await api(e.pagina, `/api/treino/avaliacoes/${AVAL_EDU}/pdf`);
conferir("PDF da avaliação do educador (com a identidade dele)", pdf.status === 200 && pdf.tipo.includes("pdf"), pdf.status);
await e.pagina.reload({ waitUntil: "networkidle" });
await e.pagina.screenshot({ path: path.join(PASTA, "t6-perfil.png"), fullPage: true });

// Resultados da avaliação do nutricionista na tela do educador (só leitura).
await e.pagina.goto(`${B}/treino/alunos/${P}/avaliacao/${AVAL_NUTRI}/resultados`, { waitUntil: "networkidle" });
await e.pagina.getByText("Avaliação feita por Nutricionista").waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("resultados da avaliação do nutricionista com o autor", (await e.pagina.getByText("Avaliação feita por Nutricionista").count()) === 1, null);

const erros = [...n.erros, ...e.erros, ...outro.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

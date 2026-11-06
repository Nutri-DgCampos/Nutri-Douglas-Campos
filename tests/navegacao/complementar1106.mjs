// SPEC complementar 06/11/2026: (1) treino enviado acessível ("Aluno não
// encontrado") e versão enviada só leitura; (2) observações do treino;
// (3) cronômetro de descanso; (4) hidratação pré-preenchida; (5) PDF de
// medicações com período e sem identificação do nutricionista.
// Precisa do pypdf no Python (extrai o texto do PDF). Ver LEIA-ME.md.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
const EMAIL_EDUCADOR = "teste.educador.c1106@local.test";
const EMAIL_ALUNO = "teste.aluno.c1106@local.test";
const NOME_ALUNO = "Aluno Próprio Teste C1106";
const HIDRATACAO =
  "A hidratação deve ser mantida de forma constante durante o dia. Evite permanecer muitas horas sem ingerir líquidos e, posteriormente, consumir grandes quantidades de água de uma só vez. Isso favorece uma melhor absorção e utilização dos líquidos pelo organismo.";

function limpar() {
  sql(`delete from patients where name like 'Aluno Próprio Teste C1106%';
       delete from users where email in ('${EMAIL_ALUNO}', '${EMAIL_EDUCADOR}');`);
}
limpar();

async function sessao(email, senha, largura = 1400, preparar) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: "pt-BR" });
  const pagina = await contexto.newPage();
  if (preparar) await preparar(pagina);
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
  await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }).catch(() => undefined);
  await pagina.waitForTimeout(1000);
  return { contexto, pagina, erros };
}
const api = (pagina, url, metodo = "GET", corpo) =>
  pagina.evaluate(
    async ([u, m, c]) => {
      const r = await fetch(u, { method: m, headers: { "Content-Type": "application/json" }, body: c ? JSON.stringify(c) : undefined });
      const tipo = r.headers.get("content-type") ?? "";
      return { status: r.status, corpo: tipo.includes("json") ? await r.json().catch(() => null) : null };
    },
    [url, metodo, corpo]
  );
// Texto do PDF (pypdf), para conferir o que sai impresso.
async function textoDoPdf(pagina, url) {
  const b64 = await pagina.evaluate(async (u) => {
    const r = await fetch(u);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }, url);
  const arquivo = path.join(os.tmpdir(), `c1106-${Date.now()}.pdf`);
  fs.writeFileSync(arquivo, Buffer.from(b64, "base64"));
  const texto = execSync(`python -c "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1]); print('\\n'.join(p.extract_text() for p in r.pages)); print('METADADOS', r.metadata)" "${arquivo}"`, { encoding: "utf8", env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  fs.rmSync(arquivo, { force: true });
  return texto;
}

// --- Preparação: educador e aluno próprio ---------------------------------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
await api(n.pagina, "/api/treino/educadores", "POST", { nome: "Educador Teste C1106", email: EMAIL_EDUCADOR, senha: "inicial-123", cref: "000444-G/SP" });
sql(`update users set must_change_password = false where email = '${EMAIL_EDUCADOR}';`);
const e = await sessao(EMAIL_EDUCADOR, "inicial-123");
const A = (await api(e.pagina, "/api/treino/alunos", "POST", { nome: NOME_ALUNO, email: EMAIL_ALUNO, senha: "inicial-123" })).corpo?.id;
sql(`update users set must_change_password = false where email = '${EMAIL_ALUNO}';`);

// =====================================================================================
// 1. Treino enviado acessível
// =====================================================================================
// Dois treinos enviados por arquivo (era o que quebrava a rota).
for (const dias of [2, 3]) sql(`insert into treino_prescricoes (patient_id, origem, plano, publicada_em) values ('${A}', 'externa', '{"dias": []}', now() - interval '${dias} day');`);
const programas = await api(e.pagina, `/api/treino/alunos/${A}/programas?modalidade=musculacao`);
conferir("1: com 2 treinos enviados por arquivo, a rota responde (antes: 500)", programas.status === 200 && programas.corpo.rotinas.length === 2, programas.status);
await e.pagina.goto(`${B}/treino/alunos/${A}/musculacao`, { waitUntil: "networkidle" });
await e.pagina.getByRole("heading", { name: "Elaboração de treino" }).waitFor({ timeout: 30000 }).catch(() => undefined);
conferir("1: \"Elaborar Musculação\" abre o editor do aluno, sem \"Aluno não encontrado\"", (await e.pagina.getByText("Aluno não encontrado").count()) === 0 && (await e.pagina.getByRole("heading", { name: "Elaboração de treino" }).count()) === 1, null);

await n.pagina.goto(`${B}/treino/alunos/${A}/musculacao`, { waitUntil: "networkidle" });
await n.pagina.getByText("Aluno não encontrado ou sem acesso").waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("1: sem acesso ao aluno, mensagem específica e caminho de volta", (await n.pagina.getByText("Aluno não encontrado ou sem acesso").count()) === 1 && (await n.pagina.getByRole("button", { name: "Ir para o Módulo de Treino" }).count()) === 1, null);
await e.pagina.goto(`${B}/treino/alunos/nao-existe/musculacao`, { waitUntil: "networkidle" });
await e.pagina.getByText("Aluno não encontrado ou sem acesso").waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("1: link com identificador inválido mostra a mensagem, sem erro", (await e.pagina.getByText("Aluno não encontrado ou sem acesso").count()) === 1, null);

// Programa com observação, enviado (v1); depois o rascunho muda.
const PROG = (await api(e.pagina, `/api/treino/alunos/${A}/programas`, "POST", { origem: "vazio", modalidade: "musculacao" })).corpo.programaId;
const exercicio = (nome) => ({ nome, grupo: "Peito", series: 3, repeticoes: 10, repeticoes_max: null, carga_kg: 20, descanso_segundos: 60, observacao: null, exercicio_id: null, video_url: null, alternativa: null, avancado: null });
const plano = (nomeDoExercicio, observacao) => ({
  dias: [{ dia: "seg", titulo: "Peito", kcal_estimadas: null, observacao: null, exercicios: [exercicio(nomeDoExercicio)] }],
  observacoes: [{ id: "obs-1", titulo: "Hidratar", texto: observacao }],
});
let lido = (await api(e.pagina, `/api/treino/programas/${PROG}`)).corpo.programa;
let salvo = await api(e.pagina, `/api/treino/programas/${PROG}`, "PUT", { titulo: "Treino C1106", objetivo: "", plano: plano("Supino reto", "Beba água entre as séries"), revisao: lido.revisao });
const v1 = await api(e.pagina, `/api/treino/programas/${PROG}`, "PATCH", { acao: "enviar", revisao: salvo.corpo.revisao });
conferir("2: treino com observação enviado (v1)", v1.status === 200, v1);
lido = (await api(e.pagina, `/api/treino/programas/${PROG}`)).corpo.programa;
salvo = await api(e.pagina, `/api/treino/programas/${PROG}`, "PUT", { titulo: "Treino C1106", objetivo: "", plano: plano("Supino alterado no rascunho", "Texto novo do rascunho"), revisao: lido.revisao });
conferir("1: salvar o rascunho não altera a versão enviada", sql(`select plano->'dias'->0->'exercicios'->0->>'nome' from treino_prescricoes where programa_id = '${PROG}' and status = 'publicada' and versao = 1;`) === "Supino reto", null);

await e.pagina.goto(`${B}/treino/alunos/${A}/musculacao?programa=${PROG}`, { waitUntil: "networkidle" });
const ver = e.pagina.getByRole("button", { name: "Ver versão enviada" });
await ver.waitFor({ timeout: 30000 }).catch(() => undefined);
await ver.click();
const janela = e.pagina.getByRole("dialog", { name: "Versão enviada ao aluno" });
await janela.getByText("Publicada · versão 1").waitFor({ timeout: 20000 }).catch(() => undefined);
await janela.getByText("Seg").first().click().catch(() => undefined);
await e.pagina.waitForTimeout(800);
const textoDaJanela = await e.pagina.locator("body").innerText();
conferir(
  "1: \"Ver versão enviada\" mostra a versão publicada (com a observação), não o rascunho",
  /Publicada · versão 1/.test(textoDaJanela) && /Beba água entre as séries/.test(textoDaJanela) && !/Texto novo do rascunho/.test(await janela.innerText()),
  textoDaJanela.slice(0, 300)
);
await e.pagina.screenshot({ path: path.join(PASTA, "c1106-versao-enviada.png") });
// Fecha a janela do dia e a da versão enviada.
for (let i = 0; i < 3 && (await e.pagina.locator(".p-dialog-mask").count()) > 0; i += 1) {
  await e.pagina.keyboard.press("Escape");
  await e.pagina.waitForTimeout(600);
}

// =====================================================================================
// 2. Observações do treino
// =====================================================================================
const ordem = await e.pagina.evaluate(() => {
  const botao = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("Adicionar treino (dia)"));
  const observacoes = document.querySelector('section[aria-label="Observações do treino"]');
  const volume = document.querySelector('section[aria-label="Volume semanal por grupo muscular"]');
  if (!botao || !observacoes || !volume) return "faltando";
  const depois = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  return depois(botao, observacoes) && depois(observacoes, volume) ? "ok" : "fora de ordem";
});
conferir("2: \"Observações do treino\" entre \"Adicionar treino (dia)\" e \"Volume semanal\"", ordem === "ok", ordem);
await e.pagina.locator('section[aria-label="Observações do treino"]').screenshot({ path: path.join(PASTA, "c1106-observacoes.png") });

// Guardar no catálogo e ver na Biblioteca.
await e.pagina.locator('section[aria-label="Observações do treino"]').getByRole("button", { name: "Guardar no catálogo" }).first().click();
await e.pagina.waitForTimeout(1500);
const catalogo = (await api(e.pagina, "/api/treino/observacoes?q=hidra")).corpo.observacoes;
conferir("2: observação guardada no catálogo do educador (busca sem acento)", catalogo.length === 1 && catalogo[0].titulo === "Hidratar", catalogo);
conferir("2: o catálogo é de cada profissional (o administrador não vê)", (await api(n.pagina, "/api/treino/observacoes")).corpo.observacoes.every((o) => o.titulo !== "Hidratar"), null);
await e.pagina.goto(`${B}/treino/biblioteca`, { waitUntil: "networkidle" });
await e.pagina.getByRole("tab", { name: "Observações" }).click();
await e.pagina.getByText("Hidratar").first().waitFor({ timeout: 15000 }).catch(() => undefined);
conferir("2: a Biblioteca tem a aba Observações com o catálogo", (await e.pagina.getByText("Beba água entre as séries").count()) >= 1 || (await e.pagina.getByText("Texto novo do rascunho").count()) >= 1, null);

// Nova versão não muda a anterior.
lido = (await api(e.pagina, `/api/treino/programas/${PROG}`)).corpo.programa;
const v2 = await api(e.pagina, `/api/treino/programas/${PROG}`, "PATCH", { acao: "enviar", revisao: lido.revisao });
conferir(
  "2: a v2 leva a observação nova; a v1 continua com a sua",
  v2.status === 200 &&
    sql(`select plano->'observacoes'->0->>'texto' from treino_prescricoes where programa_id = '${PROG}' and status = 'publicada' and versao = 1;`) === "Beba água entre as séries" &&
    sql(`select plano->'observacoes'->0->>'texto' from treino_prescricoes where programa_id = '${PROG}' and status = 'publicada' and versao = 2;`) === "Texto novo do rascunho",
  v2
);
const pdfDoTreino = await textoDoPdf(e.pagina, `/api/treino/programas/${PROG}/pdf?versao=2`);
conferir("2: o PDF do treino traz as observações", /Observações do treino/.test(pdfDoTreino) && /Texto novo do rascunho/.test(pdfDoTreino), pdfDoTreino.slice(0, 400));
conferir("2: o volume semanal não muda com observações", sql(`select jsonb_array_length(plano->'dias') from treino_prescricoes where programa_id = '${PROG}' and versao = 2;`) === "1", null);

// =====================================================================================
// 3. Cronômetro de descanso (aluno) — relógio controlado e vibração observada
// =====================================================================================
const a = await sessao(EMAIL_ALUNO, "inicial-123", 420, async (pagina) => {
  await pagina.clock.install();
  await pagina.addInitScript(() => {
    window.__vibracoes = [];
    navigator.vibrate = (padrao) => {
      window.__vibracoes.push(padrao);
      return true;
    };
  });
});
await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await a.pagina.getByText("Observações do treino").first().waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("2: o aluno vê as observações do treino", (await a.pagina.getByText("Texto novo do rascunho").count()) >= 1, null);
await a.pagina.getByRole("button", { name: /seg/i }).first().click();
const iniciar = a.pagina.getByRole("button", { name: "Iniciar descanso (01:00)" });
await iniciar.waitFor({ timeout: 15000 }).catch(() => undefined);
conferir("3: o exercício com descanso de 60 s oferece \"Iniciar descanso (01:00)\"", (await iniciar.count()) === 1, null);
await iniciar.click();
const relogio = a.pagina.getByRole("timer", { name: "Cronômetro de descanso" });
conferir("3: começa em 01:00", /01:00/.test(await relogio.innerText()), await relogio.innerText());
await a.pagina.clock.fastForward(20_000);
await a.pagina.waitForTimeout(300);
conferir("3: depois de 20 s mostra 00:40", /00:40/.test(await relogio.innerText()), await relogio.innerText());
await relogio.getByRole("button", { name: "Pausar" }).click();
await a.pagina.clock.fastForward(30_000);
await a.pagina.waitForTimeout(300);
conferir("3: pausado não anda", /00:40/.test(await relogio.innerText()) && /Pausado/.test(await relogio.innerText()), await relogio.innerText());
await relogio.getByRole("button", { name: "Retomar" }).click();
await relogio.getByRole("button", { name: "Reiniciar" }).click();
await a.pagina.waitForTimeout(300);
conferir("3: reiniciar volta a 01:00", /01:00/.test(await relogio.innerText()), await relogio.innerText());
await a.pagina.clock.fastForward(61_000);
await a.pagina.waitForTimeout(500);
const fim = await relogio.innerText();
const vibracoes = await a.pagina.evaluate(() => window.__vibracoes.length);
conferir("3: chega a 00:00 com aviso na tela e uma vibração", /00:00/.test(fim) && /Descanso concluído/.test(fim) && vibracoes === 1, { fim, vibracoes });
await a.pagina.clock.fastForward(10_000);
await a.pagina.waitForTimeout(300);
conferir("3: não vibra de novo", (await a.pagina.evaluate(() => window.__vibracoes.length)) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "c1106-cronometro.png") });
const descanso = await a.pagina.locator("label").filter({ hasText: "Descanso" }).locator("input").first().inputValue().catch(() => null);
conferir("3: o campo Descanso do exercício não muda", descanso === "60 s", descanso);
conferir("3: nada é registrado pelo cronômetro", sql(`select count(*) from treino_sessoes where patient_id = '${A}';`) === "0", null);

// =====================================================================================
// 4. Hidratação pré-preenchida (dieta nova)
// =====================================================================================
const CONSULTA = sql(`insert into consultas (patient_id, data, tipo) values ('${P}', current_date, 'retorno') returning id;`).split("\n")[0];
const dieta = await api(n.pagina, `/api/nutricao/consultas/${CONSULTA}/dietas`, "POST", { titulo: "Dieta C1106" });
const DIETA = dieta.corpo?.id ?? dieta.corpo?.dieta?.id;
const documento = sql(`select rascunho->'hidratacao'->>'observacoes' || '|' || coalesce(rascunho->'hidratacao'->>'mlPorKg', 'null') from dietas where id = '${DIETA}';`);
conferir("4: dieta nova já vem com a orientação exata, sem ml/kg padrão", documento === `${HIDRATACAO}|null`, { status: dieta.status, documento: documento.slice(0, 80) });

// =====================================================================================
// 5. PDF de medicações
// =====================================================================================
const semana = JSON.stringify({ dom: { quantidade: null, vezes: null }, seg: { quantidade: 1, vezes: 1 }, ter: { quantidade: 1, vezes: 1 }, qua: { quantidade: null, vezes: null }, qui: { quantidade: null, vezes: null }, sex: { quantidade: null, vezes: null }, sab: { quantidade: null, vezes: null } });
const med = (inicio, termino, ordem) =>
  sql(`insert into medicacoes (patient_id, consulta_id, ordem, status, dados) values ('${P}', '${CONSULTA}', ${ordem}, 'em_uso',
        '${JSON.stringify({ nome: "Remédio Teste", principioAtivo: "", apresentacao: "comprimidos", concentracao: null, unidadeAtivo: null, unidadeQuantidade: "comprimido", semana: JSON.parse(semana), frequenciaTexto: "", prescritor: "", inicio, termino, observacoes: "", receitas: [] })}'::jsonb) returning id;`).split("\n")[0];
med("2026-11-06", "2026-12-07", 1);
med("2026-12-08", "2027-01-01", 2);
med("2027-01-02", "2027-02-01", 3);
med("2026-11-06", null, 4);
med(null, null, 5);
const identidade = sql("select coalesce(nome_profissional, '') || '|' || coalesce(registro_profissional, '') from configuracoes_documentos where id = 1;").split("|");
const pdf = await textoDoPdf(n.pagina, `/api/nutricao/consultas/${CONSULTA}/medicacoes/pdf`);
conferir(
  "5: cada registro com o próprio período, sem misturar datas",
  /Período de uso: 06\/11\/2026 a 07\/12\/2026/.test(pdf) && /Período de uso: 08\/12\/2026 a 01\/01\/2027/.test(pdf) && /Período de uso: 02\/01\/2027 a 01\/02\/2027/.test(pdf),
  pdf.slice(0, 600)
);
conferir("5: só início: \"Início:\"; sem datas: nada inventado", /Início: 06\/11\/2026/.test(pdf) && (pdf.match(/Período de uso|Início:|Término:/g) ?? []).length === 4, (pdf.match(/Período de uso|Início:|Término:/g) ?? []).length);
conferir(
  "5: sem nome, título nem CRN do nutricionista (cabeçalho, rodapé e metadados)",
  !(identidade[0] && pdf.includes(identidade[0])) && !(identidade[1] && pdf.includes(identidade[1])) && !/CRN/i.test(pdf) && !/Nutri /.test(pdf),
  { identidade, pdf: pdf.slice(-300) }
);
conferir("5: paciente, consulta, emissão, tabela e aviso continuam", /Paciente:/.test(pdf) && /Consulta:/.test(pdf) && /Emitido em:/.test(pdf) && /Total semanal/.test(pdf) && /finalidade exclusivamente informativa/.test(pdf) && /1 \/ 1/.test(pdf), pdf.slice(0, 300));

const erros = [...n.erros, ...e.erros, ...a.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
sql(`delete from medicacoes where consulta_id = '${CONSULTA}';
     delete from dietas where consulta_id = '${CONSULTA}';
     delete from consultas where id = '${CONSULTA}';`);
if (process.argv.includes("--limpar")) {
  sql(`delete from patients where name like 'Aluno Próprio Teste C1106%'; delete from users where email in ('${EMAIL_ALUNO}', '${EMAIL_EDUCADOR}');`);
}
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

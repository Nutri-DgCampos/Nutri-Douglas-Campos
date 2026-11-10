// SPEC TMB e gasto energético (10/11/2026), decisões D1 a D12 aprovadas.
// Cobre: lembrete por fórmula e Tinsley só com MLG; modos "Fator de atividade"
// (FAO 2004 e tradicionais, um conjunto por vez), "Rotina semanal" (MET
// corrigido pela TMB, minutos fora do estilo de vida, média para a dieta) e
// DRIs; troca de modo sem soma e com rascunho preservado; finalização com
// premissas congeladas e PDF; rascunho antigo (TMB × NAF) intacto; avaliações
// finalizadas do paciente intactas. Ver LEIA-ME.md. Precisa do pypdf.
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
const MARCA = "TESTE TMB1110";
const alturaOriginal = sql(`select coalesce(height_cm::text, 'null') from patients where id = '${P}';`);

function limpar() {
  sql(`set session_replication_role = replica;
       create temp table cons_tmb as select distinct consulta_id as id from avaliacoes_fisicas where patient_id = '${P}' and documento->>'observacoes' like '${MARCA}%';
       delete from avaliacoes_envios where avaliacao_id in (select id from avaliacoes_fisicas where consulta_id in (select id from cons_tmb));
       delete from avaliacoes_fisicas where consulta_id in (select id from cons_tmb);
       delete from consultas where id in (select id from cons_tmb);
       set session_replication_role = origin;
       update patients set height_cm = ${alturaOriginal} where id = '${P}';`);
}
let limpo = false;
process.on("exit", () => {
  if (!limpo) limpar();
});
limpar();

// Avaliações finalizadas do paciente antes do teste: não podem mudar.
const assinatura = () => sql(`select coalesce(md5(string_agg(id::text || resultados::text, '' order by id)), '-') from avaliacoes_fisicas where patient_id = '${P}' and status = 'finalizada' and coalesce(documento->>'observacoes', '') not like '${MARCA}%';`);
const antes = assinatura();

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
  await pagina.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 }).catch(() => undefined);
  await pagina.waitForTimeout(800);
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
async function textoDoPdf(pagina, url) {
  const b64 = await pagina.evaluate(async (u) => {
    const r = await fetch(u);
    const bytes = new Uint8Array(await r.arrayBuffer());
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }, url);
  const arquivo = path.join(os.tmpdir(), `tmb1110-${Date.now()}.pdf`);
  fs.writeFileSync(arquivo, Buffer.from(b64, "base64"));
  const texto = execSync(`python -c "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1]); print('\\n'.join(p.extract_text() for p in r.pages))" "${arquivo}"`, {
    encoding: "utf8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  });
  fs.rmSync(arquivo, { force: true });
  return texto;
}
const kcal = (v) => Math.round(v).toLocaleString("pt-BR");

// --- Preparação: consulta, rascunho antigo (esquema 1) e avaliação nova ----------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
const pg = n.pagina;
const ANTIGO_DOC = {
  esquema: 1,
  peso: 70,
  alturaCm: 163.5,
  tmb: { protocolo: "mifflin_1990", manual: { valor: null, metodo: "", observacao: "" } },
  gasto: { metodo: "tmb_naf", categoria: null, naf: 1.6 },
  atividades: [],
  dobras: { protocolo: null, versaoSlaughter: "ts", maturacao: null, etnia: null, valores: {} },
  perimetria: {},
  bioimpedancia: { valores: {}, aguaUnidade: "L", gorduraVisceralEscala: "", massaVisceralUnidade: "kg", origem: {}, pdf: null },
  composicao: null,
  observacoes: `${MARCA} antigo`,
};
// Consulta e rascunho antigo num só comando: a marca da limpeza vem junto.
const [CONSULTA, ANTIGA] = sql(
  `with c as (insert into consultas (patient_id, data, tipo) values ('${P}', current_date, 'retorno') returning id),
        a as (insert into avaliacoes_fisicas (patient_id, consulta_id, data, documento, criada_por)
              select '${P}', c.id, current_date, '${JSON.stringify(ANTIGO_DOC)}'::jsonb, (select id from users where email = 'teste.nutri@local.test') from c returning id, consulta_id)
   select consulta_id || ' ' || id from a;`
)
  .split("\n")[0]
  .split(" ");

const criada = await api(pg, `/api/nutricao/consultas/${CONSULTA}/avaliacoes`, "POST");
const AV = criada.corpo?.id;
conferir("avaliação nova criada", criada.status === 200 || criada.status === 201, criada);
let dados = await api(pg, `/api/nutricao/avaliacoes/${AV}`);
const idade = dados.corpo.paciente.idade;
conferir("documento novo nasce no esquema 2, com os modos vazios", dados.corpo.avaliacao.documento.esquema === 2 && dados.corpo.avaliacao.documento.gasto.fator?.conjunto === null, dados.corpo.avaliacao.documento.gasto);
const doc = { ...dados.corpo.avaliacao.documento, peso: 70, alturaCm: 163.5, observacoes: MARCA };
doc.tmb = { ...doc.tmb, protocolo: "tinsley_2019" };
const gravou = await api(pg, `/api/nutricao/avaliacoes/${AV}`, "PUT", { documento: doc, revisao: dados.corpo.avaliacao.revisao, data: dados.corpo.avaliacao.data });
conferir("rascunho gravado pela API", gravou.status === 200, gravou);
const TMB = 10 * 70 + 6.25 * 163.5 - 5 * idade - 161;

// --- Tela: lembrete e Tinsley sem MLG -------------------------------------------------
const URL_AV = `${B}/nutricao/${P}/consultas/${CONSULTA}/avaliacao/${AV}`;
await pg.goto(URL_AV, { waitUntil: "networkidle" });
const secao = pg.locator('section[aria-label="Gasto energético"]');
await secao.waitFor();
// O "?" abre ao passar o mouse: afasta o mouse antes de cada clique.
const botao = async (nome) => {
  await pg.mouse.move(2, 2);
  await secao.getByRole("button", { name: nome }).click();
  await pg.mouse.move(2, 2);
};
const lembrete = secao.locator('[aria-label="Sobre a fórmula escolhida"]');
conferir("Tinsley: lembrete do público (fisiculturismo)", (await lembrete.textContent())?.includes("27 atletas de fisiculturismo"), await lembrete.textContent());
conferir("Tinsley sem MLG: não calcula e diz o que falta", (await secao.textContent()).includes("Falta: massa livre de gordura"), null);

await secao.locator(".p-dropdown").first().click();
await pg.getByRole("option", { name: "Mifflin-St Jeor (1990)", exact: true }).click();
await pg.waitForTimeout(300);
const textoLembrete = (await lembrete.textContent()) ?? "";
conferir("Mifflin: lembrete sem 'padrão-ouro' como qualidade, com dados e referência", textoLembrete.includes("Não é padrão-ouro") && textoLembrete.includes("Peso, altura, idade e sexo") && textoLembrete.includes("Frankenfield"), textoLembrete);
conferir("TMB Mifflin na tela", (await secao.textContent()).includes(`${kcal(TMB)} kcal/dia`), kcal(TMB));

// --- Fator de atividade ------------------------------------------------------------
await botao("Fator de atividade");
await botao("FAO 2004");
conferir("FAO: aviso de fundamentação", (await secao.locator('[aria-label="Sobre o conjunto de fatores"]').textContent())?.includes("FAO/OMS/UNU (2004)"), null);
await secao.locator('[aria-label="Nível de atividade"]').locator("xpath=ancestor-or-self::div[contains(@class,'p-dropdown')][1]").click();
await pg.locator("li.p-dropdown-item", { hasText: "Ativo ou moderadamente ativo" }).click();
await pg.waitForTimeout(300);
conferir("FAO ativo: GET = TMB × 1,76", (await secao.textContent()).includes(`${kcal(TMB * 1.76)} kcal/dia`), kcal(TMB * 1.76));
await secao.getByRole("textbox", { name: "Fator usado" }).fill("1,9");
await pg.waitForTimeout(300);
conferir("FAO ajustado dentro da faixa: TMB × 1,9", (await secao.textContent()).includes(`${kcal(TMB * 1.9)} kcal/dia`), kcal(TMB * 1.9));
await secao.getByRole("textbox", { name: "Fator usado" }).fill("2,1");
await pg.waitForTimeout(300);
conferir("FAO fora da faixa: não calcula", (await secao.textContent()).includes("Falta: fator entre 1,70 e 1,99"), null);

await botao("Fatores tradicionais");
await pg.waitForTimeout(300);
conferir("tradicionais: aviso de que não são da FAO", (await secao.locator('[aria-label="Sobre o conjunto de fatores"]').textContent())?.includes("Não são valores da FAO"), null);
conferir("trocar de conjunto limpa o nível (sem combinar)", (await secao.textContent()).includes("Falta: nível de atividade"), null);
await secao.locator('[aria-label="Nível de atividade"]').locator("xpath=ancestor-or-self::div[contains(@class,'p-dropdown')][1]").click();
await pg.locator("li.p-dropdown-item", { hasText: "Levemente ativo" }).click();
await pg.waitForTimeout(300);
conferir("tradicional 1,375: GET = TMB × 1,375", (await secao.textContent()).includes(`${kcal(TMB * 1.375)} kcal/dia`), kcal(TMB * 1.375));
conferir("no fator, a lista de atividades não aparece", (await secao.getByRole("button", { name: "Adicionar atividade" }).count()) === 0, null);

// --- Rotina semanal ----------------------------------------------------------------
await botao("Rotina semanal");
await pg.waitForTimeout(300);
conferir("rotina: premissas com a equação e as fontes", (await secao.locator('[aria-label="Premissas da rotina semanal"]').textContent())?.includes("Byrne"), null);
await secao.locator('[aria-label="Estilo de vida fora dos treinos"]').locator("xpath=ancestor-or-self::div[contains(@class,'p-dropdown')][1]").click();
await pg.locator("li.p-dropdown-item", { hasText: "Sentado a maior parte do dia" }).click();
await botao("Adicionar atividade");
await secao.getByRole("textbox", { name: "Minutos por sessão" }).fill("60");
await secao.getByRole("textbox", { name: "Vezes por semana" }).fill("3");
await pg.waitForTimeout(400);
// Atividade padrão: musculação leve (MET 3,5).
const r = TMB / 1440;
const semTreino = TMB * 1.4;
const acrescimo = (3.5 - 1.4) * r * 60;
const media = semTreino + (3 * acrescimo) / 7;
const textoRotina = (await secao.textContent()) ?? "";
conferir("rotina: média diária na tela", textoRotina.includes(`${kcal(media)} kcal/dia`), kcal(media));
conferir("rotina: dia sem treino e dia com treino separados", textoRotina.includes(`Dia sem treino: ${kcal(semTreino)} kcal`) && textoRotina.includes(`${kcal(semTreino + acrescimo)} kcal`), [kcal(semTreino), kcal(semTreino + acrescimo)]);
conferir("rotina: média não soma nem multiplica o fator", !textoRotina.includes(`${kcal(TMB * 1.375 + media)}`) && !textoRotina.includes(`${kcal(media * 1.375)}`), null);
await pg.screenshot({ path: path.join(PASTA, "tmb1110-rotina.png"), fullPage: true });

// Voltar ao fator: rascunho do fator preservado; rotina guardada.
await botao("Fator de atividade");
await pg.waitForTimeout(300);
conferir("voltar ao fator mantém o rascunho (tradicional 1,375)", (await secao.textContent()).includes(`${kcal(TMB * 1.375)} kcal/dia`), null);
await botao("DRIs 2023");
await pg.waitForTimeout(300);
conferir("DRIs continua como terceira opção", (await secao.textContent()).includes("Categoria de atividade"), null);
await botao("Rotina semanal");
await pg.waitForTimeout(2500); // salvamento automático
const gravado = JSON.parse(sql(`select documento::text from avaliacoes_fisicas where id = '${AV}';`));
conferir(
  "documento gravado com o modo escolhido e os rascunhos dos outros",
  gravado.gasto.metodo === "rotina" && gravado.gasto.fator.nivel === "trad_leve" && gravado.gasto.rotina.estilo === "sentado" && gravado.atividades.length === 1,
  gravado.gasto
);

// Celular: sem rolagem horizontal.
const cel = await n.contexto.newPage();
await cel.setViewportSize({ width: 390, height: 844 });
await cel.goto(URL_AV, { waitUntil: "networkidle" });
await cel.locator('section[aria-label="Gasto energético"]').waitFor();
const largos = await cel.evaluate(() => {
  const w = window.innerWidth;
  const fora = [...document.querySelectorAll("body *")]
    .filter((el) => el.getBoundingClientRect().right > w + 1 && el.getBoundingClientRect().width > 0)
    .map((el) => `${el.tagName}.${String(el.className).slice(0, 50)} ${Math.round(el.getBoundingClientRect().right)} ${(el.getAttribute("aria-label") || el.textContent || "").slice(0, 30)}`);
  return { cabe: document.documentElement.scrollWidth <= w + 1, fora: fora.slice(0, 8) };
});
conferir("celular: sem rolagem horizontal", largos.cabe, largos.fora);
await cel.locator('section[aria-label="Gasto energético"]').screenshot({ path: path.join(PASTA, "tmb1110-celular.png") });
await cel.close();

// --- Finalizar: premissas congeladas, dieta recebe a média, PDF ------------------------
dados = await api(pg, `/api/nutricao/avaliacoes/${AV}`);
const fim = await api(pg, `/api/nutricao/avaliacoes/${AV}`, "PATCH", { acao: "finalizar", revisao: dados.corpo.avaliacao.revisao });
conferir("finalizada", fim.status === 200, fim);
const congelado = JSON.parse(sql(`select resultados::text from avaliacoes_fisicas where id = '${AV}';`));
conferir(
  "resultados congelados: média como GET e detalhes da rotina",
  Math.abs(congelado.get.valor - media) < 0.01 && congelado.get.metodo === "rotina" && Math.abs(congelado.gastoDetalhe.rotina.semTreino - semTreino) < 0.01 && congelado.gastoDetalhe.rotina.atividades.length === 1,
  congelado.get
);
const paraDieta = Number(sql(`select (resultados->'get'->>'valor')::float from avaliacoes_fisicas where id = '${AV}';`));
conferir("a dieta recebe a média diária (mesma consulta da dieta)", Math.abs(paraDieta - media) < 0.01, paraDieta);
const pdf = await textoDoPdf(pg, `/api/nutricao/avaliacoes/${AV}/pdf`);
conferir("PDF: método, dia sem treino e dia com treino", pdf.includes("Rotina semanal") && pdf.includes("Dia sem treino") && pdf.includes("Dia com treinamento leve"), pdf.slice(0, 400));

// --- Rascunho antigo (esquema 1): mesmo NAF, mesmo resultado -------------------------
await pg.goto(`${B}/nutricao/${P}/consultas/${CONSULTA}/avaliacao/${ANTIGA}`, { waitUntil: "networkidle" });
const secaoAntiga = pg.locator('section[aria-label="Gasto energético"]');
await secaoAntiga.waitFor();
conferir("rascunho antigo: TMB × NAF mantido, com o NAF registrado", (await secaoAntiga.textContent()).includes("TMB × NAF (método anterior)") && (await secaoAntiga.textContent()).includes(`${kcal(TMB * 1.6)} kcal/dia`), kcal(TMB * 1.6));
await pg.waitForTimeout(1500);
const antigoDepois = JSON.parse(sql(`select documento::text from avaliacoes_fisicas where id = '${ANTIGA}';`));
conferir("abrir o rascunho antigo não regrava o documento", antigoDepois.esquema === 1 && antigoDepois.gasto.naf === 1.6 && antigoDepois.gasto.fator === undefined, antigoDepois.gasto);

conferir("avaliações finalizadas do paciente intactas", assinatura() === antes, null);
conferir("sem erros de página nem 500", n.erros.length === 0, n.erros);

// Limpeza pelo banco (a marca das avaliações localiza a consulta).
await navegador.close();
limpar();
limpo = true;
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

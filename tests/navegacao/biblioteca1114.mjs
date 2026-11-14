// Biblioteca Mestre V3 (14/11/2026), fase 1: código, situação "bloqueado",
// orientações ao profissional e importador. Cobre: pilotos importados pelo
// script (EMG-002, MUS-002, COR-001, CIC-001) aparecem na biblioteca; modelo
// bloqueado aparece com etiqueta, não pode ser usado (servidor recusa) até o
// nutricionista liberar; orientações ao nutricionista ficam só no modelo e não
// vão para a dieta do paciente; as orientações ao paciente vão; lista de
// modelos de treino traz código e orientações; celular sem rolagem lateral.
// Ver LEIA-ME.md. Os pilotos precisam estar importados (o teste importa se faltar).
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
const MARCA = "TESTE BIB1114";
const TST = "TST-901";
const SEGREDO = "ORIENTACAO-SO-DO-NUTRICIONISTA-1114";

function limpar() {
  sql(`set session_replication_role = replica;
       create temp table cons_bib as select distinct consulta_id as id from dietas where patient_id = '${P}' and rascunho->>'titulo' = '${MARCA}';
       delete from dietas where consulta_id in (select id from cons_bib);
       delete from consultas where id in (select id from cons_bib);
       delete from modelos_nutricao where codigo = '${TST}';
       update modelos_nutricao set usos = 0 where codigo = 'EMG-002';
       set session_replication_role = origin;`);
}
let limpo = false;
process.on("exit", () => {
  if (!limpo) limpar();
});
limpar();

// Pilotos: o importador é idempotente (pula o que já existe).
const saida = execSync("node --no-warnings scripts/biblioteca/biblioteca.mjs importar EMG-002 MUS-002 COR-001 CIC-001 --autor teste.nutri@local.test", {
  encoding: "utf8",
  env: process.env,
});
conferir("importador dos pilotos sem erro", /com erro 0/.test(saida), saida);
const EMG = sql("select id from modelos_nutricao where codigo = 'EMG-002';");

// Modelo bloqueado de teste: cópia do conteúdo do EMG-002.
const TST_ID = sql(
  `insert into modelos_nutricao (tipo, nome, conteudo, codigo, situacao, orientacoes_profissional)
   select 'dieta', '${TST} — ${MARCA} bloqueado', conteudo, '${TST}', 'bloqueado', '${SEGREDO}'
     from modelos_nutricao where codigo = 'EMG-002' returning id;`
).split("\n")[0];

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

const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
const pg = n.pagina;

// --- Biblioteca de dietas ------------------------------------------------------------------
const lista = await api(pg, "/api/nutricao/modelos?tipo=dieta");
const itemEmg = lista.corpo?.modelos?.find((m) => m.codigo === "EMG-002");
const itemTst = lista.corpo?.modelos?.find((m) => m.codigo === TST);
conferir("lista traz código e situação", itemEmg?.situacao === "liberado" && itemTst?.situacao === "bloqueado", { itemEmg, itemTst });

await pg.goto(`${B}/nutricao/configuracoes/dieta/modelos`, { waitUntil: "networkidle" });
await pg.waitForTimeout(1200);
conferir("modelo bloqueado com etiqueta na biblioteca", await pg.getByText("Bloqueado até revisão").first().isVisible().catch(() => false), null);
const bloqueados = Number(sql("select count(*) from modelos_nutricao where tipo = 'dieta' and situacao = 'bloqueado' and arquivado_em is null;"));
conferir("etiqueta só nos bloqueados", (await pg.getByText("Bloqueado até revisão").count()) === bloqueados, [await pg.getByText("Bloqueado até revisão").count(), bloqueados]);
// Biblioteca completa importada (fase 2 a 4): 161 liberadas + 15 bloqueadas + 40 treinos.
conferir(
  "biblioteca completa na base local",
  sql("select count(*) filter (where situacao = 'liberado') || ' ' || count(*) filter (where situacao = 'bloqueado') from modelos_nutricao where codigo ~ '^[A-Z]{3}(-[A-Z]{2,3})?-[0-9]{3}$' and codigo <> 'TST-901';") === "161 15" &&
    sql("select count(*) from treino_modelos where codigo is not null;") === "40",
  null
);
conferir(
  "clínicos, gestação e bariátricos bloqueados",
  sql("select count(*) from modelos_nutricao where codigo ~ '^(CLI|BAR)-' or codigo in ('MUL-005','MUL-006','MUL-007','MUL-008','MUL-009');") ===
    sql("select count(*) from modelos_nutricao where situacao = 'bloqueado' and codigo <> 'TST-901';"),
  null
);
conferir("piloto EMG-002 na biblioteca", await pg.getByText("EMG-002 — Emagrecimento e recomposição").first().isVisible().catch(() => false), null);
await pg.screenshot({ path: path.join(PASTA, "bib1114-biblioteca.png"), fullPage: true });

// --- Bloqueio no servidor --------------------------------------------------------------------
const DIETA = sql(
  `with c as (insert into consultas (patient_id, data, tipo) values ('${P}', current_date, 'retorno') returning id)
   insert into dietas (patient_id, consulta_id, rascunho, criada_por)
   select '${P}', c.id, jsonb_build_object('esquema', 1, 'titulo', '${MARCA}', 'objetivo', '', 'refeicoes', '[]'::jsonb, 'observacoes', '[]'::jsonb,
          'hidratacao', jsonb_build_object('mlPorKg', null, 'observacoes', ''), 'pesoReferencia', jsonb_build_object('valor', null, 'origem', null, 'data', null),
          'nutrientesAcompanhados', '[]'::jsonb), (select id from users where email = 'teste.nutri@local.test')
     from c returning id;`
).split("\n")[0];
const recusada = await api(pg, `/api/nutricao/dietas/${DIETA}/importar`, "POST", { origem: { tipo: "modelo", id: TST_ID }, modo: "nova" });
conferir("servidor recusa modelo bloqueado na dieta", recusada.status === 409, recusada);
conferir("uso recusado não conta", sql(`select usos from modelos_nutricao where id = '${TST_ID}';`) === "0", null);

// --- Dieta a partir do piloto: orientações ao paciente vão, ao nutricionista não ---------------
const usada = await api(pg, `/api/nutricao/dietas/${DIETA}/importar`, "POST", { origem: { tipo: "modelo", id: EMG }, modo: "nova" });
conferir("dieta criada a partir do EMG-002", usada.status === 200 || usada.status === 201, usada);
const nova = sql(`select rascunho::text from dietas where consulta_id = (select consulta_id from dietas where id = '${DIETA}') and id <> '${DIETA}';`);
conferir("orientações ao paciente copiadas", nova.includes("Como seguir o plano") && nova.includes("Quando procurar a equipe"), nova.slice(0, 300));
conferir("orientações ao nutricionista NÃO copiadas", !nova.includes("Perfil de aplicação") && !nova.includes("Referências técnicas"), null);
conferir("refeições sem horário", !/"horario":\s*"\d/.test(nova), null);
conferir("uso contado no piloto", sql("select usos from modelos_nutricao where codigo = 'EMG-002';") === "1", null);

// PDF da dieta feita a partir do modelo: orientações ao paciente sim, ao nutricionista não.
const NOVA_ID = sql(`select id from dietas where consulta_id = (select consulta_id from dietas where id = '${DIETA}') and id <> '${DIETA}' limit 1;`);
const b64 = await pg.evaluate(async (u) => {
  const r = await fetch(u);
  const bytes = new Uint8Array(await r.arrayBuffer());
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}, `/api/nutricao/dietas/${NOVA_ID}/pdf`);
const arquivoPdf = path.join(PASTA, "bib1114-dieta.pdf");
fs.writeFileSync(arquivoPdf, Buffer.from(b64, "base64"));
const textoPdf = execSync(`python -c "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1]); print(' '.join(p.extract_text() for p in r.pages))" "${arquivoPdf}"`, {
  encoding: "utf8",
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
}).replace(/\s+/g, " ");
conferir("PDF traz as orientações ao paciente", textoPdf.includes("Como seguir o plano") && textoPdf.includes("Goma de mandioca"), textoPdf.slice(0, 300));
conferir("PDF sem as orientações ao nutricionista", !textoPdf.includes("Perfil de aplicação") && !textoPdf.includes("Referências técnicas"), null);

// --- Editor do modelo bloqueado: aviso, orientações e liberação --------------------------------
await pg.goto(`${B}/nutricao/configuracoes/dieta/modelos/${TST_ID}`, { waitUntil: "networkidle" });
await pg.waitForTimeout(1500);
conferir("aviso de bloqueio no editor", await pg.getByText("Modelo da biblioteca bloqueado até a sua revisão").isVisible().catch(() => false), null);
const campo = pg.locator("textarea").filter({ hasText: SEGREDO });
conferir("orientações ao nutricionista carregadas", (await campo.count()) === 1, null);
await campo.fill(`${SEGREDO} revisado`);
await pg.getByRole("button", { name: "Salvar modelo" }).click();
await pg.waitForTimeout(1500);
conferir("orientações salvas", sql(`select orientacoes_profissional from modelos_nutricao where id = '${TST_ID}';`) === `${SEGREDO} revisado`, null);
await pg.screenshot({ path: path.join(PASTA, "bib1114-bloqueado.png"), fullPage: true });
await pg.getByRole("button", { name: "Liberar para uso" }).click();
await pg.waitForTimeout(600);
await pg.getByRole("button", { name: "Liberar", exact: true }).click();
await pg.waitForTimeout(1500);
conferir(
  "liberado pelo nutricionista",
  sql(`select situacao || ' ' || (liberado_por = (select id from users where email = 'teste.nutri@local.test'))::text from modelos_nutricao where id = '${TST_ID}';`) === "liberado true",
  null
);
conferir("aviso some depois de liberar", !(await pg.getByText("Modelo da biblioteca bloqueado até a sua revisão").isVisible().catch(() => false)), null);
const depois = await api(pg, `/api/nutricao/dietas/${DIETA}/importar`, "POST", { origem: { tipo: "modelo", id: TST_ID }, modo: "nova" });
conferir("modelo liberado pode ser usado", depois.status === 200 || depois.status === 201, depois);
conferir("liberar de novo é recusado", (await api(pg, `/api/nutricao/modelos/${TST_ID}`, "PATCH", { acao: "liberar" })).status === 404, null);

// --- Treino: lista de modelos com código e orientações ---------------------------------------
for (const [modalidade, codigo] of [["musculacao", "MUS-002"], ["corrida", "COR-001"], ["ciclismo", "CIC-001"]]) {
  const r = await api(pg, `/api/treino/modelos?modalidade=${modalidade}`);
  const m = r.corpo?.modelos?.find((x) => x.codigo === codigo);
  conferir(`${codigo} na lista de modelos de ${modalidade}`, Boolean(m?.orientacoes_profissional?.includes("Perfil e objetivo")), r.status);
}
const plano = sql("select plano::text from treino_modelos where codigo = 'MUS-002';");
conferir("musculação sem carga predefinida", !/"carga_kg":\s*\d/.test(plano), null);
conferir("musculação com orientações ao aluno no plano", plano.includes("Sinais de alerta"), null);
conferir("orientações ao educador fora do plano", !plano.includes("Perfil e objetivo"), null);

// --- Celular ---------------------------------------------------------------------------------
const cel = await sessao("teste.nutri@local.test", "teste-nutri-123", 390);
await cel.pagina.goto(`${B}/nutricao/configuracoes/dieta/modelos`, { waitUntil: "networkidle" });
await cel.pagina.waitForTimeout(1200);
const largura = await cel.pagina.evaluate(() => document.documentElement.scrollWidth);
conferir("biblioteca no celular sem rolagem lateral", largura <= 392, largura);
await cel.pagina.screenshot({ path: path.join(PASTA, "bib1114-celular.png"), fullPage: true });

conferir("sem erros de página ou 500", n.erros.length === 0 && cel.erros.length === 0, [...n.erros, ...cel.erros]);

await navegador.close();
limpar();
limpo = true;
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

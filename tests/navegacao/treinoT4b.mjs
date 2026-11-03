// Módulo de Treino, etapa T4b: o aluno registra corrida e pedal no "Meu
// treino", com tênis, bicicleta, consumo durante o treino e os números do
// relógio (nada estimado). Confere a quilometragem real dos equipamentos,
// a correção sem duplicar, a idempotência, os limites de data, as calorias
// informadas e a visão do profissional (com o limite de troca do tênis).
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
const hojeBr = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
const somar = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const HOJE = hojeBr();

const EMAIL_EDUCADOR = "teste.educador.t4b@local.test";
const EMAIL_ALUNO = "teste.aluno.t4b@local.test";
const EMAIL_OUTRO_ALUNO = "teste.outroaluno.t4b@local.test";

function limpar() {
  sql(`delete from notification_queue where patient_id in (select id from patients where name like 'Aluno Teste T4b%');
       delete from notificacoes_profissionais where patient_id in (select id from patients where name like 'Aluno Teste T4b%');
       delete from treino_desconfortos where patient_id in (select id from patients where name like 'Aluno Teste T4b%');
       delete from patients where name like 'Aluno Teste T4b%';
       delete from users where email in ('${EMAIL_ALUNO}', '${EMAIL_OUTRO_ALUNO}', '${EMAIL_EDUCADOR}');`);
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

// --- Preparação: educador, dois alunos próprios e um treino de musculação ---
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
await api(n.pagina, "/api/treino/educadores", "POST", { nome: "Educador Teste T4b", email: EMAIL_EDUCADOR, senha: "inicial-123" });
sql(`update users set must_change_password = false where email = '${EMAIL_EDUCADOR}';`);
const e = await sessao(EMAIL_EDUCADOR, "inicial-123");
const aluno = await api(e.pagina, "/api/treino/alunos", "POST", { nome: "Aluno Teste T4b", email: EMAIL_ALUNO, senha: "aluno-123" });
const outroAluno = await api(e.pagina, "/api/treino/alunos", "POST", { nome: "Aluno Teste T4b Outro", email: EMAIL_OUTRO_ALUNO, senha: "aluno-123" });
const ALUNO = aluno.corpo.id;
sql(`update users set must_change_password = false where email in ('${EMAIL_ALUNO}', '${EMAIL_OUTRO_ALUNO}');`);
const programa = (await api(e.pagina, `/api/treino/alunos/${ALUNO}/programas`, "POST", { origem: "vazio" })).corpo.programaId;
const diaDeHoje = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][new Date(`${HOJE}T12:00:00Z`).getUTCDay()];
await api(e.pagina, `/api/treino/programas/${programa}`, "PUT", {
  titulo: "Treino T4b",
  objetivo: "",
  revisao: 0,
  plano: { dias: [{ dia: diaDeHoje, titulo: "Treino A", exercicios: [{ nome: "Agachamento livre", grupo: "Quadríceps", series: 3, repeticoes: 10 }] }] },
});
const enviado = await api(e.pagina, `/api/treino/programas/${programa}`, "PATCH", { acao: "enviar", revisao: 1 });
conferir("preparação: treino de musculação enviado", enviado.status === 200, enviado);

// --- Aluno: cadastra o tênis e registra a corrida pela tela ------------------
const a = await sessao(EMAIL_ALUNO, "aluno-123", 420);
await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
conferir("Meu treino mostra corrida e ciclismo", (await a.pagina.getByRole("button", { name: "Registrar corrida" }).count()) === 1, null);
conferir("card de calorias informadas no lugar da estimativa", (await a.pagina.getByText("Calorias informadas na semana").count()) === 1, null);

await a.pagina.getByRole("button", { name: "Registrar corrida" }).click();
const janela = a.pagina.locator(".p-dialog", { hasText: "Registrar corrida" });
await janela.getByRole("button", { name: "Cadastrar tênis" }).click();
const cadastro = a.pagina.locator(".p-dialog", { hasText: "Cadastrar tênis" });
await cadastro.getByLabel("Nome do equipamento").fill("Tênis azul");
await cadastro.getByLabel("Marca").fill("Marca X");
await cadastro.getByLabel("Quilometragem inicial").fill("100");
await cadastro.getByRole("button", { name: "Salvar" }).click();
await a.pagina.waitForTimeout(1500);
await janela.getByLabel("Distância").fill("10");
await janela.getByLabel("Minutos").fill("50");
await janela.getByLabel("FC média").fill("150");
await janela.getByLabel("Calorias").fill("600");
await janela.getByLabel("Ganho de altitude").fill("80");
await janela.getByRole("button", { name: "Item" }).click();
await janela.getByLabel("Quantidade do item 1").fill("500");
await janela.getByLabel("Minuto de treino do item 1").fill("30");
await janela.getByLabel("Observações").click();
await a.pagina.waitForTimeout(400);
conferir("ritmo calculado do que o aluno informou", (await janela.getByText("5:00 /km").count()) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "t4b-registro-corrida.png"), fullPage: true });
await janela.getByRole("button", { name: "Salvar" }).click();
await a.pagina.waitForTimeout(2000);
const corrida = sql(`select a.distancia_km || '|' || a.duracao_segundos || '|' || a.kcal || '|' || a.elevacao_m || '|' || e.apelido || '|' || (select count(*) from treino_consumos c where c.atividade_id = a.id and c.removido_em is null)
                       from treino_atividades a join treino_equipamentos e on e.id = a.equipamento_id where a.patient_id = '${ALUNO}' and a.modalidade = 'corrida';`);
conferir("corrida gravada com tênis, números e consumo", corrida === "10.00|3000|600|80|Tênis azul|1", corrida);

const lista = await api(a.pagina, "/api/area-paciente/treino/atividades");
const tenis = lista.corpo.equipamentos.find((x) => x.apelido === "Tênis azul");
conferir("tênis: 100 km iniciais + 10 km registrados, limite padrão 500 km (R1)", tenis.km_total === 110 && tenis.alerta_km === 500, tenis);
const registrada = lista.corpo.atividades[0];

// Mesma chave do aparelho: atualiza, não duplica (base do T5).
const reenvio = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { ...registrada, distancia_km: 12 });
conferir("reenvio com a mesma chave atualiza sem duplicar", reenvio.status === 200 && sql(`select count(*) || '|' || max(distancia_km) from treino_atividades where patient_id = '${ALUNO}';`) === "1|12.00", reenvio.status);
conferir("quilometragem acompanha a correção (112 km)", reenvio.corpo.equipamentos.find((x) => x.id === tenis.id).km_total === 112, null);

// Trocar o tênis da atividade corrige as duas somas.
const tenis2 = await api(a.pagina, "/api/area-paciente/treino/equipamentos", "POST", { tipo: "tenis", apelido: "Tênis preto" });
const troca = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { ...registrada, distancia_km: 12, equipamento_id: tenis2.corpo.id });
const kms = Object.fromEntries(troca.corpo.equipamentos.map((x) => [x.apelido, x.km_total]));
conferir("trocar o tênis move os km, sem duplicar", kms["Tênis azul"] === 100 && kms["Tênis preto"] === 12, kms);

// Consumo corrigido: o anterior fica registrado como removido.
const comConsumo = troca.corpo.atividades[0];
await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { ...comConsumo, consumos: [{ ...comConsumo.consumos[0], quantidade: 600 }] });
conferir("correção do consumo fica registrada", sql(`select count(*) filter (where removido_em is null) || '|' || count(*) filter (where removido_em is not null) from treino_consumos c join treino_atividades a on a.id = c.atividade_id where a.patient_id = '${ALUNO}';`) === "1|1", null);

// Pedal com bicicleta, potência e TSS informados.
const bike = await api(a.pagina, "/api/area-paciente/treino/equipamentos", "POST", { tipo: "bicicleta", apelido: "Speed", categoria: "estrada" });
const pedal = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", {
  chave_cliente: crypto.randomUUID(),
  modalidade: "ciclismo",
  data: HOJE,
  situacao: "concluido",
  equipamento_id: bike.corpo.id,
  distancia_km: 45,
  duracao_segundos: 5400,
  potencia_media: 180,
  tss: 85,
  elevacao_m: 450,
  consumos: [
    { categoria: "isotonico", quantidade: 600, unidade: "mL", minuto: 45 },
    { categoria: "alimento", descricao: "Banana", quantidade: 1, unidade: "unidade", horario: "08:10" },
  ],
});
conferir("pedal gravado com bicicleta, potência, TSS e dois itens", pedal.status === 200 && pedal.corpo.equipamentos.find((x) => x.apelido === "Speed").km_total === 45, pedal);
conferir("bicicleta não tem aviso de desgaste", pedal.corpo.equipamentos.find((x) => x.apelido === "Speed").alerta_km === null, null);
const errado = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { chave_cliente: crypto.randomUUID(), modalidade: "corrida", data: HOJE, equipamento_id: bike.corpo.id, consumos: [] });
conferir("bicicleta não serve para corrida", errado.status === 400, errado);
conferir("data no futuro é recusada", (await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { chave_cliente: crypto.randomUUID(), modalidade: "corrida", data: somar(HOJE, 1), consumos: [] })).status === 400, null);
conferir("data de semanas fechadas é recusada", (await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { chave_cliente: crypto.randomUUID(), modalidade: "corrida", data: somar(HOJE, -20), consumos: [] })).status === 400, null);

// Outro aluno não usa o tênis nem a chave deste aluno.
const o = await sessao(EMAIL_OUTRO_ALUNO, "aluno-123", 420);
conferir("outro aluno não usa o tênis alheio", (await api(o.pagina, "/api/area-paciente/treino/atividades", "PUT", { chave_cliente: crypto.randomUUID(), modalidade: "corrida", data: HOJE, equipamento_id: tenis.id, consumos: [] })).status === 400, null);
conferir("outro aluno não sobrescreve pela chave alheia", (await api(o.pagina, "/api/area-paciente/treino/atividades", "PUT", { ...registrada, consumos: [] })).status === 400, null);
conferir("outro aluno não apaga a atividade alheia", (await api(o.pagina, `/api/area-paciente/treino/atividades/${registrada.id}`, "DELETE")).status === 404, null);
conferir("outro aluno não altera o tênis alheio", (await api(o.pagina, `/api/area-paciente/treino/equipamentos/${tenis.id}`, "PATCH", { apelido: "Meu" })).status === 404, null);

// Musculação: calorias informadas na sessão somam com corrida e pedal.
const meu = await api(a.pagina, "/api/area-paciente/treino");
const reg = await api(a.pagina, "/api/area-paciente/treino", "PUT", { prescricaoId: meu.corpo.treino.prescricao.id, dia: diaDeHoje, situacao: "concluido", kcal: 300, exercicios: [] });
conferir("calorias da semana = 300 (musculação) + 600 (corrida)", reg.status === 200 && reg.corpo.caloriasInformadas === 900, reg.corpo?.caloriasInformadas);

// --- Profissional vê os registros e muda o limite do tênis ----------------------
const registros = await api(e.pagina, `/api/treino/registros/${ALUNO}`);
conferir("profissional vê corridas, pedais e equipamentos", registros.corpo.atividades.length === 2 && registros.corpo.equipamentos.length === 3, registros.corpo?.atividades?.length);
conferir("profissional vê as calorias da sessão de musculação", registros.corpo.sessoes.some((s) => s.kcal === 300), null);
conferir("administrador não vê o aluno próprio", (await api(n.pagina, `/api/treino/registros/${ALUNO}`)).status === 404, null);
await e.pagina.goto(`${B}/treino/alunos/${ALUNO}`, { waitUntil: "networkidle" });
await e.pagina.waitForTimeout(2000);
const limite = e.pagina.getByLabel("Limite de troca do tênis Tênis preto");
await limite.fill("10");
await limite.press("Tab");
await e.pagina.locator("li", { hasText: "Tênis preto" }).getByRole("button", { name: "Salvar" }).click();
await e.pagina.waitForTimeout(1500);
conferir("profissional muda o limite do tênis", sql(`select alerta_km from treino_equipamentos where id = '${tenis2.corpo.id}';`) === "10.0", null);
await e.pagina.screenshot({ path: path.join(PASTA, "t4b-profissional.png"), fullPage: true });
conferir("limite inválido é recusado", (await api(e.pagina, `/api/treino/alunos/${ALUNO}/equipamentos/${tenis2.corpo.id}`, "PATCH", { alerta_km: 0 })).status === 400, null);
conferir("limite só vale para tênis", (await api(e.pagina, `/api/treino/alunos/${ALUNO}/equipamentos/${bike.corpo.id}`, "PATCH", { alerta_km: 100 })).status === 404, null);

await a.pagina.reload({ waitUntil: "networkidle" });
await a.pagina.waitForTimeout(1500);
conferir("aluno vê o aviso de troca do tênis", (await a.pagina.getByText("chegou a 12 km", { exact: false }).count()) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "t4b-aluno.png"), fullPage: true });

// Apagar um registro feito por engano tira os km.
await api(a.pagina, `/api/area-paciente/treino/atividades/${registrada.id}`, "DELETE");
const depois = await api(a.pagina, "/api/area-paciente/treino/atividades");
conferir("apagar a corrida tira os km do tênis", depois.corpo.equipamentos.find((x) => x.apelido === "Tênis preto").km_total === 0, null);

const erros = [...n.erros, ...e.erros, ...a.erros, ...o.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

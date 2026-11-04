// Módulo de Treino, etapa T8: planos e preços por profissional (G1), contrato
// e confirmação do pagamento (G2, G3), tolerância editável (G4), bloqueio do
// aluno com plano vencido (R9), pedido de renovação e desativar/excluir o
// aluno próprio (R10). Respostas S1–S8: bloqueio por profissional (S2) e
// profissional bloqueado sem alerta de desconforto (S7).
// Ver LEIA-ME.md para rodar (com --limpar). Com ARQUIVOS_DIR igual à do
// servidor, confere também a remoção do comprovante na exclusão.
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
const EMAIL_EDUCADOR = "teste.educador.t8@local.test";
const EMAIL_ALUNO = "teste.aluno.t8@local.test";
const NOME_ALUNO = "Aluno Próprio Teste T8";
const EMAIL_OUTRO = "teste.outro.t8@local.test";

function limpar() {
  sql(`delete from notificacoes_profissionais where usuario_id in (select id from users where email in ('${EMAIL_EDUCADOR}', '${EMAIL_OUTRO}'));
       delete from patients where name like 'Aluno Próprio Teste T8%';
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

const hoje = sql("select to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD');");

// --- Preparação: educador e aluno próprio ---------------------------------------
const n = await sessao("teste.nutri@local.test", "teste-nutri-123");
await api(n.pagina, "/api/treino/educadores", "POST", { nome: "Educador Teste T8", email: EMAIL_EDUCADOR, senha: "inicial-123", cref: "000222-G/SP" });
sql(`update users set must_change_password = false where email = '${EMAIL_EDUCADOR}';`);
const EDUCADOR = sql(`select id from users where email = '${EMAIL_EDUCADOR}';`);
const e = await sessao(EMAIL_EDUCADOR, "inicial-123");
const criado = await api(e.pagina, "/api/treino/alunos", "POST", { nome: NOME_ALUNO, email: EMAIL_ALUNO, senha: "inicial-123" });
const A = criado.corpo?.id;
sql(`update users set must_change_password = false where email = '${EMAIL_ALUNO}';`);
conferir("educador cadastra o aluno próprio", criado.status === 201 && Boolean(A), criado);

// --- Planos e tolerância (G1, G4) ------------------------------------------------
await e.pagina.goto(`${B}/treino/planos`, { waitUntil: "networkidle" });
await e.pagina.getByRole("button", { name: "Novo plano" }).click();
await e.pagina.getByLabel("Nome do plano").fill("Mensal Teste T8");
await e.pagina.getByLabel("Preço").fill("150");
await e.pagina.getByRole("button", { name: "Salvar" }).last().click();
await e.pagina.waitForTimeout(1500);
const plano = sql(`select id || '|' || preco_centavos || '|' || duracao_dias || '|' || array_to_string(modalidades, ',') from treino_planos where profissional_id = '${EDUCADOR}';`).split("|");
conferir("plano criado pela tela: R$ 150,00, 30 dias, musculação", plano[1] === "15000" && plano[2] === "30" && plano[3] === "musculacao", plano);
const PLANO = plano[0];
conferir("plano sem modalidade é recusado", (await api(e.pagina, "/api/treino/planos", "POST", { nome: "Sem nada", preco_centavos: 100, duracao_dias: 30, modalidades: [] })).status === 400, null);
conferir("tolerância fora de 0 a 60 é recusada", (await api(e.pagina, "/api/treino/planos", "PUT", { tolerancia: 99 })).status === 400, null);
const tol = await api(e.pagina, "/api/treino/planos", "PUT", { tolerancia: 5 });
conferir("tolerância do educador salva (5 dias)", tol.status === 200 && tol.corpo.tolerancia === 5, tol);
await e.pagina.reload({ waitUntil: "networkidle" });
await e.pagina.screenshot({ path: path.join(PASTA, "t8-planos.png"), fullPage: true });
conferir("o administrador não vê os planos do educador", !(await api(n.pagina, "/api/treino/planos")).corpo.planos.some((p) => p.id === PLANO), null);

// --- Aluno sem contrato: nada muda ----------------------------------------------
const a = await sessao(EMAIL_ALUNO, "inicial-123", 420);
const semContrato = await api(a.pagina, "/api/area-paciente/treino/plano");
conferir("aluno sem contrato: sem bloqueio (como antes da T8)", semContrato.status === 200 && semContrato.corpo.bloqueado === false && semContrato.corpo.contratos.length === 0, semContrato.corpo);

// --- Contrato pela ficha ------------------------------------------------------------
await e.pagina.goto(`${B}/treino/alunos/${A}`, { waitUntil: "networkidle" });
await e.pagina.getByRole("region", { name: "Plano e pagamento" }).waitFor({ timeout: 20000 });
await e.pagina.locator('section[aria-label="Plano e pagamento"]').getByRole("button", { name: "Novo contrato" }).click();
await e.pagina.getByRole("button", { name: "Criar contrato" }).click();
await e.pagina.waitForTimeout(1500);
const contrato = sql(`select id || '|' || to_char(inicio, 'YYYY-MM-DD') || '|' || (vencimento - inicio) || '|' || tolerancia_dias || '|' || preco_centavos || '|' || (confirmado_em is null)
                        from treino_contratos where patient_id = '${A}';`).split("|");
conferir("contrato criado pela ficha: hoje, 30 dias, tolerância 5, cópia do preço, sem confirmação", contrato[1] === hoje && contrato[2] === "29" && contrato[3] === "5" && contrato[4] === "15000" && contrato[5] === "true", contrato);
const C1 = contrato[0];
sql(`update treino_planos set preco_centavos = 18000 where id = '${PLANO}';`);
conferir("mudar o preço do plano não muda o contrato feito", sql(`select preco_centavos from treino_contratos where id = '${C1}';`) === "15000", null);

// --- Comprovante do aluno (G3) -----------------------------------------------------
const aguardando = (await api(a.pagina, "/api/area-paciente/treino/plano")).corpo;
conferir("aluno vê o contrato aguardando pagamento, sem bloqueio", aguardando.contratos[0]?.situacao === "aguardando_pagamento" && !aguardando.bloqueado, aguardando);
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const enviarComprovante = (contratoId) =>
  a.pagina.evaluate(
    async ([b64, id]) => {
      const dados = new FormData();
      dados.append("arquivo", new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" }), "comprovante.png");
      dados.append("contratoId", id);
      const r = await fetch("/api/area-paciente/treino/plano/comprovante", { method: "POST", body: dados });
      return { status: r.status, corpo: await r.json().catch(() => null) };
    },
    [png, contratoId]
  );
const envio = await enviarComprovante(C1);
conferir("aluno anexa o comprovante; continua sem confirmação", envio.status === 200 && envio.corpo.contratos[0].situacao === "comprovante_enviado", envio);
conferir("educador avisado do comprovante", sql(`select count(*) from notificacoes_profissionais where usuario_id = '${EDUCADOR}' and tipo = 'pagamento_treino';`) === "1", null);
const lista = (await api(e.pagina, "/api/treino/alunos")).corpo.alunos.find((x) => x.id === A);
conferir("lista de alunos marca o comprovante a conferir", lista?.pagamento?.comprovante === true, lista);
const comprovante = await api(e.pagina, `/api/treino/contratos/${C1}/comprovante`);
conferir("educador abre o comprovante; o administrador, não", comprovante.status === 200 && comprovante.tipo === "image/png" && (await api(n.pagina, `/api/treino/contratos/${C1}/comprovante`)).status === 404, comprovante.status);
conferir("o administrador não confirma o contrato do educador (G2)", (await api(n.pagina, `/api/treino/contratos/${C1}`, "PATCH", { acao: "confirmar_dinheiro" })).status === 404, null);
conferir("o administrador não alcança os contratos do aluno próprio", (await api(n.pagina, `/api/treino/alunos/${A}/contratos`)).status === 404, null);

await e.pagina.reload({ waitUntil: "networkidle" });
await e.pagina.getByRole("button", { name: "Confirmar pelo comprovante" }).click();
await e.pagina.getByRole("button", { name: "Confirmar", exact: true }).click();
await e.pagina.waitForTimeout(1500);
conferir("educador confirma pelo comprovante, pela tela", sql(`select forma_pagamento || '|' || (confirmado_por = '${EDUCADOR}') from treino_contratos where id = '${C1}';`) === "comprovante|true", null);
await e.pagina.screenshot({ path: path.join(PASTA, "t8-ficha-pago.png"), fullPage: true });
conferir("comprovante depois da confirmação é recusado", (await enviarComprovante(C1)).status === 400, null);

// --- Vencido além da tolerância, com dois profissionais (R9, S2, S7) ------------------
// Segundo educador vinculado ao aluno, sem contrato; cada um com um treino de
// musculação publicado (o do educador do contrato é o mais recente).
await api(n.pagina, "/api/treino/educadores", "POST", { nome: "Outro Educador T8", email: EMAIL_OUTRO, senha: "inicial-123", cref: "000333-G/SP" });
sql(`update users set must_change_password = false where email = '${EMAIL_OUTRO}';`);
const OUTRO = sql(`select id from users where email = '${EMAIL_OUTRO}';`);
sql(`insert into treino_vinculos (patient_id, profissional_id, criado_por) values ('${A}', '${OUTRO}', '${OUTRO}');`);
const plano1 = `{"dias": []}`;
const PE1 = sql(`insert into treino_prescricoes (patient_id, programa_id, origem, plano, criada_por, publicada_em) values ('${A}', gen_random_uuid(), 'profissional', '${plano1}', '${EDUCADOR}', now()) returning id;`).split("\n")[0];
const PE2 = sql(`insert into treino_prescricoes (patient_id, programa_id, origem, plano, criada_por, publicada_em) values ('${A}', gen_random_uuid(), 'profissional', '${plano1}', '${OUTRO}', now() - interval '1 day') returning id;`).split("\n")[0];
conferir("com os dois em dia, vale o treino mais recente (do educador do contrato)", (await api(a.pagina, "/api/area-paciente/treino")).corpo.treino?.prescricao.id === PE1, null);

sql(`update treino_contratos set inicio = current_date - 40, vencimento = current_date - 6 where id = '${C1}';`);
const tolerancia = (await api(a.pagina, "/api/area-paciente/treino/plano")).corpo;
conferir(
  "vencido há 6 dias com tolerância 5: só este educador bloqueado; o outro segue liberado (S2)",
  tolerancia.bloqueados.length === 1 && tolerancia.bloqueados[0] === EDUCADOR && tolerancia.bloqueado === false && tolerancia.contratos[0].situacao === "vencido",
  tolerancia
);
sql(`update treino_contratos set vencimento = current_date - 5 where id = '${C1}';`);
conferir("vencido há 5 dias: ainda na tolerância", (await api(a.pagina, "/api/area-paciente/treino/plano")).corpo.bloqueados.length === 0, null);
sql(`update treino_contratos set vencimento = current_date - 6 where id = '${C1}';`);

const parcial = await api(a.pagina, "/api/area-paciente/treino");
conferir("S2: o treino do educador vencido some e vale o do outro educador", parcial.corpo.treino?.prescricao.id === PE2 && parcial.corpo.bloqueado === false, parcial.corpo?.treino?.prescricao?.id);
const naSessaoBloqueada = await api(a.pagina, "/api/area-paciente/treino", "PUT", { dia: "seg", prescricaoId: PE1 });
conferir("S2: registro no treino do educador vencido é recusado", naSessaoBloqueada.status === 409, naSessaoBloqueada);
const avulsa = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { modalidade: "corrida", data: hoje });
conferir("S2: corrida avulsa não é bloqueada enquanto há profissional liberado", avulsa.status !== 409, avulsa);
const forte = await api(a.pagina, "/api/area-paciente/treino/desconforto", "POST", { chaveCliente: crypto.randomUUID(), regiao: "Ombro", intensidade: 8, conduta: "parei", comentario: "Teste T8" });
conferir(
  "S7: alerta de desconforto só ao educador liberado, não ao vencido",
  forte.status === 201 &&
    sql(`select count(*) from notificacoes_profissionais where usuario_id = '${OUTRO}' and tipo = 'desconforto';`) === "1" &&
    sql(`select count(*) from notificacoes_profissionais where usuario_id = '${EDUCADOR}' and tipo = 'desconforto';`) === "0",
  forte
);
const painelVencido = (await api(e.pagina, "/api/treino/alunos")).corpo.desconfortos;
conferir("S7: o relato não aparece nos alertas do educador vencido", !painelVencido.some((d) => d.patient_id === A), painelVencido.length);
conferir("S7: o relato fica no histórico do aluno", sql(`select count(*) from treino_desconfortos where patient_id = '${A}';`) === "1", null);

// Sem o outro educador: nenhum profissional liberado.
sql(`update treino_vinculos set fim = now() where patient_id = '${A}' and profissional_id = '${OUTRO}';
     update treino_prescricoes set arquivada_em = now() where id = '${PE2}';`);
const total = (await api(a.pagina, "/api/area-paciente/treino/plano")).corpo;
conferir("sem profissional liberado: bloqueio total, com a mensagem geral", total.bloqueado === true && /Seu plano do Treino venceu/.test(total.mensagem ?? ""), total);
const treino = await api(a.pagina, "/api/area-paciente/treino");
conferir("bloqueado: sem o treino da semana", treino.status === 200 && treino.corpo.bloqueado === true && treino.corpo.treino === null, treino.corpo);
const registro = await api(a.pagina, "/api/area-paciente/treino", "PUT", { dia: "seg", prescricaoId: PE1 });
conferir("bloqueado: registro de musculação recusado com a orientação", registro.status === 409 && /Fale com o seu profissional/.test(registro.corpo?.erro ?? ""), registro);
const atividade = await api(a.pagina, "/api/area-paciente/treino/atividades", "PUT", { modalidade: "corrida", data: hoje });
conferir("bloqueado: corrida nova recusada", atividade.status === 409, atividade);
const historico = await api(a.pagina, "/api/area-paciente/treino/atividades");
conferir("bloqueado: histórico de atividades segue, sem planejado", historico.status === 200 && historico.corpo.bloqueado === true && historico.corpo.planejadas.length === 0, historico.corpo?.bloqueado);
conferir("bloqueado: relatórios continuam disponíveis", (await api(a.pagina, "/api/area-paciente/treino/relatorios")).status === 200, null);
const desconforto = await api(a.pagina, "/api/area-paciente/treino/desconforto", "POST", { chaveCliente: crypto.randomUUID(), regiao: "Joelho", intensidade: 9, conduta: "parei", comentario: "Teste T8" });
conferir(
  "bloqueado: o relato é gravado, mas o educador vencido não recebe alerta (S7)",
  desconforto.status === 201 && sql(`select count(*) from notificacoes_profissionais where usuario_id = '${EDUCADOR}' and tipo = 'desconforto';`) === "0",
  desconforto
);

await a.pagina.goto(`${B}/area-paciente/treino`, { waitUntil: "networkidle" });
await a.pagina.getByText("Seu plano do Treino venceu").waitFor({ timeout: 20000 }).catch(() => undefined);
conferir("Meu treino mostra o aviso para falar com o profissional", (await a.pagina.getByText("Seu plano do Treino venceu").count()) === 1, null);
await a.pagina.screenshot({ path: path.join(PASTA, "t8-aluno-bloqueado.png"), fullPage: true });

// Pedido de renovação pela tela.
await a.pagina.getByRole("button", { name: "Pedir renovação" }).click();
await a.pagina.getByRole("button", { name: "Enviar pedido" }).click();
await a.pagina.waitForTimeout(1500);
conferir("aluno pede a renovação pela tela; educador avisado", sql(`select count(*) from treino_renovacoes where patient_id = '${A}' and atendida_em is null;`) === "1" && sql(`select count(*) from notificacoes_profissionais where usuario_id = '${EDUCADOR}' and tipo = 'renovacao_treino';`) === "1", null);
conferir("segundo pedido pendente é recusado", (await api(a.pagina, "/api/area-paciente/treino/plano", "POST", { planoId: PLANO })).status === 400, null);
const naLista = (await api(e.pagina, "/api/treino/alunos")).corpo.alunos.find((x) => x.id === A);
conferir("lista de alunos marca plano vencido e renovação pedida", naLista?.pagamento?.bloqueado === true && naLista?.pagamento?.renovacao === true, naLista);

// Renovação recebida em dinheiro.
const renovado = await api(e.pagina, `/api/treino/alunos/${A}/contratos`, "POST", { planoId: PLANO, inicio: hoje, pagoEmDinheiro: true });
conferir(
  "renovação em dinheiro: pago, preço novo do plano, pedido atendido",
  renovado.status === 200 && renovado.corpo.contratos[0].situacao === "em_dia" && renovado.corpo.contratos[0].preco_centavos === 18000 && renovado.corpo.renovacoes.length === 0 && renovado.corpo.bloqueado === false,
  renovado.corpo
);
conferir("aluno volta a ter o Treino", (await api(a.pagina, "/api/area-paciente/treino")).corpo.bloqueado === false, null);
await e.pagina.reload({ waitUntil: "networkidle" });
await e.pagina.screenshot({ path: path.join(PASTA, "t8-ficha-renovado.png"), fullPage: true });

// --- Desativar e reativar (R10) ----------------------------------------------------
const encerrar = await api(n.pagina, `/api/treino/educadores/${EDUCADOR}`, "PATCH", { ativo: false });
conferir("educador com aluno próprio ativo não tem a conta encerrada", encerrar.status === 400 && /aluno/.test(encerrar.corpo?.erro ?? ""), encerrar);

await e.pagina.getByRole("button", { name: "Desativar aluno" }).click();
await e.pagina.getByRole("button", { name: "Desativar", exact: true }).click();
await e.pagina.waitForTimeout(1500);
conferir("educador desativa o aluno pela tela; nada é apagado", sql(`select (desativado_em is not null) || '|' || (select count(*) from treino_contratos where patient_id = '${A}') from patients where id = '${A}';`) === "true|2", null);
conferir("acesso do aluno desativado cai na hora", (await api(a.pagina, "/api/area-paciente/treino")).status === 401, null);
const login = await a.pagina.evaluate(async (email) => {
  const r = await fetch("/api/auth/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha: "inicial-123" }) });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}, EMAIL_ALUNO);
conferir("aluno desativado não entra e recebe a orientação", login.status === 403 && /desativado/.test(login.corpo?.erro ?? ""), login);
const desativadoNaLista = (await api(e.pagina, "/api/treino/alunos")).corpo.alunos.find((x) => x.id === A);
conferir("lista de alunos marca o aluno desativado", desativadoNaLista?.desativado === true, desativadoNaLista);
const semAlunosAtivos = await api(n.pagina, `/api/treino/educadores/${EDUCADOR}`, "PATCH", { ativo: false });
conferir("sem alunos próprios ativos, a conta do educador pode ser encerrada", semAlunosAtivos.status === 200, semAlunosAtivos);
await api(n.pagina, `/api/treino/educadores/${EDUCADOR}`, "PATCH", { ativo: true });

conferir("educador reativa o aluno", (await api(e.pagina, `/api/treino/alunos/${A}`, "PATCH", { acao: "reativar" })).status === 200, null);
const a2 = await sessao(EMAIL_ALUNO, "inicial-123", 420);
conferir("aluno reativado entra de novo", (await api(a2.pagina, "/api/area-paciente/treino")).status === 200, null);

// --- Exclusão definitiva, só a pedido do aluno (R10) ---------------------------------
const USUARIO_ALUNO = sql(`select auth_user_id from patients where id = '${A}';`);
conferir("exclusão sem o pedido do aluno é recusada", (await api(e.pagina, `/api/treino/alunos/${A}`, "DELETE", { confirmacao: NOME_ALUNO })).status === 400, null);
conferir("exclusão com o nome errado é recusada", (await api(e.pagina, `/api/treino/alunos/${A}`, "DELETE", { pedidoDoAluno: true, confirmacao: "Outro nome" })).status === 400, null);
conferir("o administrador não exclui o aluno próprio do educador", (await api(n.pagina, `/api/treino/alunos/${A}`, "DELETE", { pedidoDoAluno: true, confirmacao: NOME_ALUNO })).status === 404, null);

await e.pagina.reload({ waitUntil: "networkidle" });
await e.pagina.getByRole("button", { name: "Excluir a pedido do aluno" }).click();
await e.pagina.getByText("O aluno pediu a exclusão definitiva dos dados dele.").click();
await e.pagina.getByLabel(`Digite o nome do aluno: ${NOME_ALUNO}`).fill(NOME_ALUNO);
await e.pagina.screenshot({ path: path.join(PASTA, "t8-exclusao.png") });
await e.pagina.getByRole("button", { name: "Excluir de vez" }).click();
await e.pagina.waitForURL(`${B}/treino`, { timeout: 20000 }).catch(() => undefined);
conferir(
  "aluno excluído pela tela: cadastro, contratos, pedidos e acesso",
  sql(`select (select count(*) from patients where id = '${A}') + (select count(*) from treino_contratos where patient_id = '${A}') + (select count(*) from treino_renovacoes where patient_id = '${A}') + (select count(*) from users where id = '${USUARIO_ALUNO}');`) === "0",
  null
);
if (process.env.ARQUIVOS_DIR) {
  conferir("comprovantes do aluno removidos do disco", !fs.existsSync(path.join(process.env.ARQUIVOS_DIR, "comprovantes", USUARIO_ALUNO)), null);
}

// --- Paciente da clínica sem contrato: nada muda ---------------------------------------
const clinica = await api(n.pagina, `/api/treino/alunos/${P}/contratos`);
conferir("paciente da clínica sem contrato do Treino, sem bloqueio", clinica.status === 200 && clinica.corpo.bloqueado === false, clinica.corpo);

const erros = [...n.erros, ...e.erros, ...a.erros, ...a2.erros];
conferir("sem erros de página nem 500", erros.length === 0, erros);

await navegador.close();
if (process.argv.includes("--limpar")) limpar();
console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

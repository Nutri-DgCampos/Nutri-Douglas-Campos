// Fumaça: as telas principais abrem sem erro de página nem erro 500 de API.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";

const B = "http://localhost:3100";
const P = "b95d6aa9-ea74-4584-9d7d-f22031b042a0";
const sql = (q) => execSync("docker exec -i nutri-postgres psql -At -U nutri -d nutri", { input: q, encoding: "utf8" }).trim();
const navegador = await chromium.launch({ channel: "msedge", headless: true });
let falhas = 0;

async function percorrer(email, senha, rotas, largura) {
  const contexto = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: "pt-BR" });
  const pagina = await contexto.newPage();
  let erros = [];
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
  for (const [rota, texto] of rotas) {
    erros = [];
    await pagina.goto(`${B}${rota}`, { waitUntil: "networkidle" });
    await pagina.waitForTimeout(1200);
    const ok = erros.length === 0 && (await pagina.getByText(texto, { exact: false }).count()) > 0;
    if (!ok) falhas += 1;
    console.log(`${ok ? "OK   " : "FALHA"} ${rota}${ok ? "" : ` ${JSON.stringify(erros).slice(0, 300)} (texto "${texto}")`}`);
  }
  await contexto.close();
}

const consulta = sql(`select id from consultas where patient_id = '${P}' order by data desc limit 1;`);
await percorrer("teste.nutri@local.test", "teste-nutri-123", [
  ["/", "Início"],
  ["/pacientes", "Pacientes"],
  [`/pacientes/${P}`, "Paciente Teste Dieta"],
  [`/pacientes/${P}/treino`, "Registros do aluno"],
  ["/treino", "Módulo de Treino"],
  [`/treino/alunos/${P}`, "Educadores físicos"],
  ["/treino/educadores", "Educadores físicos"],
  ["/nutricao", "Nutrição"],
  [`/nutricao/${P}`, "Paciente Teste Dieta"],
  ...(consulta ? [[`/nutricao/${P}/consultas/${consulta}`, "Dietas"], [`/nutricao/${P}/consultas/${consulta}/dietas`, "Elaboração de dietas"]] : []),
  ["/relatorios", "Relatórios"],
  ["/dietas", "Dietas"],
  ["/alertas", "Alertas"],
  ["/pagamentos", "Pagamentos"],
  ["/nutricao/configuracoes/alimentos", "Alimentos"],
], 1400);
await percorrer("teste.paciente@local.test", "654987", [
  ["/area-paciente", "Treino"],
  ["/area-paciente/treino", "Meu treino"],
  ["/area-paciente/dietas", "Meu plano"],
  ["/area-paciente/relatorios", "Relatórios"],
  ["/area-paciente/fotos", "Fotos"],
  ["/area-paciente/pagamentos", "Pagamentos"],
  ["/area-paciente/acompanhamento", "hormônios"],
], 390);

await navegador.close();
console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);

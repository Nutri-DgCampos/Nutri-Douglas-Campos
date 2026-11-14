// Biblioteca Mestre V3 — validação, ajuste, importação e reversão dos
// modelos de banco/biblioteca/modelos (um JSON por código).
//
// Uso (raiz do repositório, com DATABASE_URL do banco LOCAL):
//   node scripts/biblioteca/biblioteca.mjs validar  [CÓDIGOS... | --todos]
//   node scripts/biblioteca/biblioteca.mjs ajustar  [CÓDIGOS... | --todos]   (gramas → meta de energia)
//   node scripts/biblioteca/biblioteca.mjs importar [CÓDIGOS... | --todos] --autor email@do.profissional
//   node scripts/biblioteca/biblioteca.mjs reverter CÓDIGOS...
//
// Regras (SPEC V3 e decisões do nutricionista de 14/11/2026):
// - Cálculo com as funções reais do aplicativo (lib/nutricao/dieta.ts) e a
//   composição da base do banco; nada de composição inventada.
// - Alimentos: TACO pelo código de origem (os ids mudam entre bancos);
//   cadastros do nutricionista pelo id (iguais na produção e na base local).
// - Importação: uma transação por modelo; código já existente (ou modelo
//   protegido cadastrado à mão, com o código no início do nome) é ignorado
//   e informado. Nunca sobrescreve. Reverter só apaga modelo nunca usado.
// - Catálogo manda no bloqueio: GERAR_RASCUNHO_BLOQUEADO (e gestação/
//   lactação) entra sempre "bloqueado".
// - Banco que não seja local é recusado, salvo --producao com
//   BIBLIOTECA_PRODUCAO=CONFIRMO (só com autorização expressa do cliente).
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import {
  ORIENTACAO_HIDRATACAO_PADRAO,
  documentoParaModelo,
  documentoVazio,
  novaRefeicao,
  novoItem,
  totaisDaDieta,
  validarDocumento,
} from "../../lib/nutricao/dieta.ts";
import { validarPlanoDoEditor } from "../../lib/treinoEditor.ts";
import { validarPlanoEndurance } from "../../lib/treinoEndurance.ts";

const BIB = join(process.cwd(), "banco", "biblioteca");
const PASTA = join(BIB, "modelos");
const NUTRIENTES = ["kcal", "proteinas", "carboidratos", "lipidios", "fibras"];
const TERMOS_DE_RISCO = /diur[ée]tic|desidrata|corte (extremo|de [áa]gua)|restri[çc][ãa]o (h[íi]drica|de [áa]gua|de s[óo]dio)|laxante|deple[çc][ãa]o/i;

// ---------------------------------------------------------------------------
// Entrada

const [comando, ...resto] = process.argv.slice(2);
const opcoes = new Set(resto.filter((a) => a.startsWith("--")));
const valorDe = (nome) => {
  const i = resto.indexOf(nome);
  return i >= 0 ? resto[i + 1] : null;
};
const autorEmail = valorDe("--autor");
const listados = resto.filter((a, i) => !a.startsWith("--") && resto[i - 1] !== "--autor");

function lerCsv(caminho) {
  const texto = readFileSync(caminho, "utf8").replace(/^﻿/, "");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some((v) => v !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...dados] = linhas;
  return dados.map((l) => Object.fromEntries(cab.map((k, i) => [k, l[i] ?? ""])));
}

const catalogo = Object.fromEntries(lerCsv(join(BIB, "catalogo.csv")).map((l) => [l.codigo, l]));
const decisoes = JSON.parse(readFileSync(join(BIB, "decisoes.json"), "utf8"));

function codigosPedidos() {
  const existentes = readdirSync(PASTA).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  if (opcoes.has("--todos")) return existentes;
  if (!listados.length) throw new Error("Informe os códigos ou --todos.");
  return listados;
}

function hashDe(objeto) {
  const ordenar = (v) =>
    Array.isArray(v) ? v.map(ordenar) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenar(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(ordenar(objeto))).digest("hex");
}

function lerModelo(codigo) {
  const caminho = join(PASTA, `${codigo}.json`);
  if (!existsSync(caminho)) return null;
  return JSON.parse(readFileSync(caminho, "utf8"));
}

function gravarJsonAtomico(caminho, objeto) {
  const tmp = `${caminho}.tmp`;
  writeFileSync(tmp, JSON.stringify(objeto, null, 1) + "\n", "utf8");
  renameSync(tmp, caminho);
}

// ---------------------------------------------------------------------------
// Banco

function conectar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && !(opcoes.has("--producao") && process.env.BIBLIOTECA_PRODUCAO === "CONFIRMO")) {
    throw new Error(`Banco ${host} não é local. Importação fora da base local exige autorização expressa (--producao).`);
  }
  return new pg.Pool({ connectionString: url, max: 2 });
}

async function resolverAlimentos(pool, modelos) {
  const taco = new Set(), ids = new Set();
  for (const m of modelos) for (const r of m.refeicoes ?? []) for (const i of r.itens) {
    if (i.alimento.taco) taco.add(String(i.alimento.taco));
    if (i.alimento.id) ids.add(i.alimento.id);
  }
  const r = await pool.query(
    `select id, nome, fonte, codigo_origem, unidade_base, arquivado from public.alimentos
      where (fonte = 'taco' and codigo_origem = any($1::text[])) or id = any($2::uuid[])`,
    [[...taco], [...ids]]
  );
  const porTaco = {}, porId = {};
  for (const a of r.rows) {
    if (a.fonte === "taco") porTaco[a.codigo_origem] = a;
    porId[a.id] = a;
  }
  const comp = await pool.query(
    "select alimento_id, nutriente, valor, traco from public.alimentos_nutrientes where alimento_id = any($1::uuid[])",
    [r.rows.map((a) => a.id)]
  );
  const composicoes = Object.fromEntries(r.rows.map((a) => [a.id, {}]));
  for (const c of comp.rows) composicoes[c.alimento_id][c.nutriente] = { valor: c.valor === null ? null : Number(c.valor), traco: c.traco };
  const achar = (ref) => (ref.taco ? porTaco[String(ref.taco)] : porId[ref.id]) ?? null;
  return { achar, composicoes };
}

async function resolverExercicios(pool, nomes) {
  const r = await pool.query(
    `select n.nome as pedido, e.id, e.nome, e.grupo
       from unnest($1::text[]) as n(nome)
       left join public.treino_exercicios e
         on e.chave = public.normalizar_texto(n.nome) and e.arquivado_em is null and e.base`,
    [[...new Set(nomes)]]
  );
  return Object.fromEntries(r.rows.map((l) => [l.pedido, l.id ? l : null]));
}

// ---------------------------------------------------------------------------
// Montagem no formato do aplicativo

function montarDieta(m, achar) {
  const doc = documentoVazio(m.nome, m.objetivo);
  doc.refeicoes = m.refeicoes.map((r) => {
    const refeicao = novaRefeicao(r.nome);
    refeicao.observacao = r.observacao ?? null;
    refeicao.opcoes[0].itens = r.itens.map((i) => {
      const a = achar(i.alimento);
      return { ...novoItem(), alimentoId: a?.id ?? null, nomeOriginal: a?.nome ?? i.nome, unidade: a?.unidade_base ?? "g", quantidadeAjustada: i.gramas };
    });
    return refeicao;
  });
  doc.observacoes = m.orientacoes_paciente.map((o) => ({ id: randomUUID(), titulo: o.titulo, texto: o.texto }));
  doc.hidratacao = { mlPorKg: m.hidratacao_ml_kg ?? null, observacoes: m.hidratacao_observacoes || ORIENTACAO_HIDRATACAO_PADRAO };
  return doc;
}

function semReferencia(doc) {
  return { ...doc, refeicoes: doc.refeicoes.map((r) => ({ ...r, opcoes: r.opcoes.map((o) => ({ ...o, itens: o.itens.map((i) => ({ ...i, referencia: false })) })) })) };
}

function montarMusculacao(m, exercicios) {
  return {
    dias: m.dias.map((d) => ({
      dia: d.dia,
      titulo: d.titulo,
      kcal_estimadas: null,
      observacao: d.observacao ?? null,
      exercicios: d.exercicios.map((e) => {
        const x = exercicios[e.exercicio];
        return {
          nome: x?.nome ?? e.exercicio,
          grupo: x?.grupo ?? "Outro",
          series: e.series,
          repeticoes: e.repeticoes_min,
          repeticoes_max: e.repeticoes_max,
          carga_kg: null,
          descanso_segundos: e.descanso_segundos,
          observacao: e.observacao ?? null,
          exercicio_id: x?.id ?? null,
          video_url: null,
          alternativa: null,
          avancado: null,
        };
      }),
    })),
    observacoes: m.orientacoes_aluno.map((o) => ({ id: randomUUID(), titulo: o.titulo, texto: o.texto })),
  };
}

function montarEndurance(m) {
  return {
    ciclo: { fase: m.fase ?? null, inicio: null },
    semanas: m.semanas.map((w) => ({
      sessoes: w.sessoes.map((s) => ({
        dia: s.dia, tipo: s.tipo, descricao: s.descricao ?? "", distancia_km: null, duracao_min: s.duracao_min,
        zona: s.zona ?? null, ritmo_alvo: null, fc_alvo: null, potencia_alvo: null, tss: null, altimetria_m: null,
        terreno: null, percurso: null, rpe_alvo: null,
        blocos: s.blocos.map((b) => ({ tipo: b.tipo, descricao: b.descricao ?? "", repeticoes: b.repeticoes ?? null, duracao_min: b.duracao_min ?? null, distancia_km: null, intensidade: b.intensidade ?? null })),
        observacao: s.observacao ?? null, alternativa: null, notas: null,
      })),
    })),
  };
}

// Orientações ao profissional; em corrida e ciclismo (sem campo de
// observações gerais no plano) as do aluno vão junto, para repassar.
function orientacoesDoProfissional(m) {
  const partes = [m.orientacoes_profissional.trim()];
  if (m.tipo === "corrida" || m.tipo === "ciclismo") {
    partes.push("Para repassar ao aluno:\n" + m.orientacoes_aluno.map((o) => `• ${o.titulo}: ${o.texto}`).join("\n"));
  }
  if (m.referencias?.length) partes.push("Referências técnicas:\n" + m.referencias.map((r) => `• ${r}`).join("\n"));
  return partes.join("\n\n");
}

// ---------------------------------------------------------------------------
// Validação

function arred(v, casas = 0) {
  return v === null || v === undefined ? null : Math.round(v * 10 ** casas) / 10 ** casas;
}

function validar(codigo, m, ctx) {
  const erros = [], avisos = [], notas = [];
  const cat = catalogo[codigo];
  const resultado = { codigo, erros, avisos, notas };
  if (!m) return { ...resultado, erros: ["Arquivo do modelo não encontrado."] };
  if (m.codigo !== codigo) erros.push(`Código do arquivo (${m.codigo}) diferente do nome do arquivo.`);
  if (!cat) erros.push("Código fora do catálogo.");
  if (decisoes.protegidos.includes(codigo)) erros.push("Modelo protegido: não é importado (já existe, cadastrado à mão).");
  if (cat && cat.tipo !== m.tipo) erros.push(`Tipo ${m.tipo} diferente do catálogo (${cat.tipo}).`);
  if (!m.nome?.startsWith(`${codigo} — `)) erros.push("O nome deve começar pelo código.");
  if (!m.orientacoes_profissional?.trim()) erros.push("Faltam as orientações ao profissional.");
  const textos = JSON.stringify([m.orientacoes_paciente ?? m.orientacoes_aluno ?? [], m.orientacoes_profissional ?? ""]);

  if (m.tipo === "dieta") {
    const bloqueioCatalogo = cat?.acao === "GERAR_RASCUNHO_BLOQUEADO" || decisoes.mul_gestacao_lactacao.includes(codigo);
    if (bloqueioCatalogo && m.situacao !== "bloqueado") erros.push("O catálogo exige este modelo bloqueado até a revisão.");
    if (!m.orientacoes_paciente?.length) erros.push("Faltam as orientações ao paciente.");
    if (!m.refeicoes.length && m.situacao !== "bloqueado") erros.push("Dieta sem refeições.");
    for (const r of m.refeicoes) {
      if (!r.nome?.trim()) erros.push("Refeição sem nome.");
      if (r.horario) erros.push(`Refeição ${r.nome} com horário (não deve ter).`);
      for (const i of r.itens) {
        const a = ctx.achar(i.alimento);
        if (!a) erros.push(`Alimento não encontrado na base: ${i.nome} (${JSON.stringify(i.alimento)}).`);
        else if (a.arquivado) erros.push(`Alimento arquivado na base: ${a.nome}.`);
        if (!(i.gramas > 0)) erros.push(`Quantidade inválida em ${i.nome}.`);
        if (i.gramas > 400) avisos.push(`Porção grande: ${i.gramas} g de ${i.nome} (${r.nome}).`);
        for (const chave of [codigo.split("-")[0], codigo]) {
          const padrao = decisoes.proibidos?.[chave];
          if (a && padrao && new RegExp(padrao).test(a.nome)) erros.push(`${a.nome} não combina com a categoria (${chave}).`);
        }
      }
    }
    if (m.ajuste?.refeicoes_acrescentadas) avisos.push(`Refeições acrescentadas para a energia caber: ${m.ajuste.refeicoes_acrescentadas.join(", ")}.`);
    if (m.ajuste && (m.ajuste.fator < 0.6 || (m.ajuste.fatores?.energia ?? m.ajuste.fator) > 2)) {
      avisos.push(`Cardápio-base ajustado de ${m.ajuste.kcal_base ?? "?"} kcal com fatores ${JSON.stringify(m.ajuste.fatores ?? m.ajuste.fator)}: conferir se as porções cabem (considerar mais refeições).`);
    }
    const doc = montarDieta(m, ctx.achar);
    const v = validarDocumento(doc);
    if ("erro" in v) erros.push(`Documento recusado pelo aplicativo: ${v.erro}`);
    const totais = totaisDaDieta(doc, ctx.composicoes, NUTRIENTES);
    const calc = Object.fromEntries(NUTRIENTES.map((n) => [n, arred(totais[n].valor, 1)]));
    // Traço (Tr da TACO) não entra na soma, como no aplicativo, mas não é
    // falta de dado; avisa só alimento sem o valor cadastrado.
    for (const n of NUTRIENTES) {
      const sem = new Set();
      for (const r of m.refeicoes) for (const i of r.itens) {
        const a = ctx.achar(i.alimento);
        if (a && !ctx.composicoes[a.id]?.[n]) sem.add(a.nome);
      }
      if (sem.size) notas.push(`${n}: a base não informa o valor para ${[...sem].join(", ")}.`);
    }
    resultado.calculo = calc;
    if (m.meta_kcal_nominal && calc.kcal) {
      const desvio = (calc.kcal - m.meta_kcal_nominal) / m.meta_kcal_nominal;
      resultado.desvio_kcal_pct = arred(desvio * 100, 1);
      if (Math.abs(desvio) > 0.1) avisos.push(`Energia calculada ${arred(calc.kcal)} kcal, ${arred(desvio * 100, 1)}% da meta nominal (${m.meta_kcal_nominal}): revisar.`);
    }
    if (m.peso_referencia_kg && calc.proteinas) resultado.proteina_g_kg = arred(calc.proteinas / m.peso_referencia_kg, 2);
    // Prática de risco citada sem negação na mesma frase = aviso para revisão.
    const frases = JSON.parse(textos).flat().flatMap((t) => (typeof t === "string" ? t : `${t.titulo}. ${t.texto}`).split(/[.;:\n]+/));
    for (const frase of frases) {
      if (codigo.startsWith("FIS") && TERMOS_DE_RISCO.test(frase) && !/\b(n[ãa]o|nunca|sem|nem|evit\w*|perigos\w*)\b/i.test(frase)) {
        avisos.push(`Prática de risco citada sem proibição: “${frase.trim().slice(0, 120)}”.`);
      }
    }
    resultado.conteudo = v.documento ? semReferencia(documentoParaModelo(v.documento)) : null;
  } else if (m.tipo === "musculacao") {
    if (!m.orientacoes_aluno?.length) erros.push("Faltam as orientações ao aluno.");
    const dias = m.dias.map((d) => d.dia);
    if (new Set(dias).size !== dias.length) erros.push("Mais de uma sessão no mesmo dia.");
    for (const d of m.dias) for (const e of d.exercicios) {
      if (!ctx.exercicios[e.exercicio]) erros.push(`Exercício fora da biblioteca base: ${e.exercicio}.`);
      if (!(e.series > 0)) erros.push(`Séries inválidas em ${e.exercicio}.`);
      if (e.repeticoes_min > e.repeticoes_max) erros.push(`Faixa de repetições invertida em ${e.exercicio}.`);
      if (!(e.descanso_segundos > 0)) avisos.push(`Sem descanso em ${e.exercicio}.`);
      if ("carga" in e || "carga_kg" in e) erros.push(`Carga predefinida em ${e.exercicio} (deve ficar em branco).`);
    }
    const plano = montarMusculacao(m, ctx.exercicios);
    const v = validarPlanoDoEditor(plano);
    if ("erro" in v) erros.push(`Plano recusado pelo aplicativo: ${v.erro}`);
    else resultado.conteudo = v.plano;
    resultado.calculo = { sessoes: m.dias.length, exercicios: m.dias.reduce((s, d) => s + d.exercicios.length, 0), series: m.dias.reduce((s, d) => s + d.exercicios.reduce((t, e) => t + e.series, 0), 0) };
  } else {
    if (!m.orientacoes_aluno?.length) erros.push("Faltam as orientações ao aluno.");
    if (m.semanas.length !== m.duracao_semanas) erros.push(`Semanas (${m.semanas.length}) ≠ duração (${m.duracao_semanas}).`);
    if (![4, 8, 12].includes(m.duracao_semanas)) avisos.push(`Programa de ${m.duracao_semanas} semanas (a SPEC prevê 4, 8 ou 12).`);
    m.semanas.forEach((w, iw) => w.sessoes.forEach((s) => {
      const soma = s.blocos.reduce((t, b) => t + (b.duracao_min ?? 0) * (b.repeticoes ?? 1), 0);
      if (Math.abs(soma - s.duracao_min) > 0.5) erros.push(`Semana ${iw + 1} (${s.dia}): blocos somam ${soma} min, sessão tem ${s.duracao_min}.`);
      if (s.zona && !/^Z[1-5]([–-]Z[1-5])?$/.test(s.zona)) avisos.push(`Semana ${iw + 1} (${s.dia}): zona fora de Z1–Z5 (${s.zona}).`);
    }));
    const plano = montarEndurance(m);
    const v = validarPlanoEndurance(plano, m.tipo);
    if ("erro" in v) erros.push(`Plano recusado pelo aplicativo: ${v.erro}`);
    else resultado.conteudo = v.plano;
    resultado.calculo = { semanas: m.semanas.length, sessoes: m.semanas.reduce((t, w) => t + w.sessoes.length, 0), minutos: m.semanas.reduce((t, w) => t + w.sessoes.reduce((u, s) => u + s.duracao_min, 0), 0) };
  }
  resultado.hash = hashDe(m);
  return resultado;
}

async function preparar(pool, codigos) {
  const modelos = codigos.map((c) => [c, lerModelo(c)]);
  const presentes = modelos.map(([, m]) => m).filter(Boolean);
  const { achar, composicoes } = await resolverAlimentos(pool, presentes.filter((m) => m.tipo === "dieta"));
  const nomes = presentes.filter((m) => m.tipo === "musculacao").flatMap((m) => m.dias.flatMap((d) => d.exercicios.map((e) => e.exercicio)));
  const exercicios = nomes.length ? await resolverExercicios(pool, nomes) : {};
  const ctx = { achar, composicoes, exercicios };
  return modelos.map(([c, m]) => ({ m, v: validar(c, m, ctx) }));
}

function imprimir(v) {
  const calc = v.calculo ? " " + JSON.stringify(v.calculo) : "";
  const desvio = v.desvio_kcal_pct !== undefined ? ` desvio ${v.desvio_kcal_pct}%` : "";
  console.log(`${v.erros.length ? "ERRO " : "ok   "}${v.codigo}${calc}${desvio}${v.proteina_g_kg ? ` prot ${v.proteina_g_kg} g/kg` : ""}`);
  for (const e of v.erros) console.log(`       erro: ${e}`);
  for (const a of v.avisos) console.log(`       aviso: ${a}`);
  if (opcoes.has("--notas")) for (const n of v.notas ?? []) console.log(`       nota: ${n}`);
}

// ---------------------------------------------------------------------------
// Controle de progresso (gravação atômica)

function marcar(codigo, dados) {
  const caminho = join(BIB, "controle.json");
  const controle = JSON.parse(readFileSync(caminho, "utf8"));
  controle.modelos[codigo] = { ...controle.modelos[codigo], ...dados, atualizado_em: new Date().toISOString() };
  gravarJsonAtomico(caminho, controle);
}

// ---------------------------------------------------------------------------
// Comandos

async function cmdValidar(pool) {
  const r = await preparar(pool, codigosPedidos());
  r.forEach(({ v }) => imprimir(v));
  // Não rebaixa modelo já importado com o mesmo conteúdo (mesmo hash).
  const controle = JSON.parse(readFileSync(join(BIB, "controle.json"), "utf8"));
  for (const { v } of r) {
    if (v.erros.length) continue;
    const atual = controle.modelos[v.codigo];
    if (atual?.status === "importado_homologacao" && atual.hash === v.hash) continue;
    marcar(v.codigo, { status: "validado_tecnicamente", hash: v.hash, avisos: v.avisos.length });
  }
  console.log(`\n${r.filter(({ v }) => !v.erros.length).length} de ${r.length} sem erros.`);
}

// Ajuste à meta de energia (opção b do nutricionista: cardápio-base com as
// gramas ajustadas por objetivo). Não ajusta bloqueados (meta nominal não é
// meta obrigatória em clínicos/gestação) nem modelo sem meta.
// - Para baixo: todos os itens no mesmo fator.
// - Para cima: legumes e verduras ficam; fontes de proteína sobem no máximo
//   25%; as fontes de energia (cereais, tubérculos, pães, leguminosas, frutas,
//   azeite) completam a diferença. Evita multiplicar proteína e legumes em
//   cardápios de energia alta.
// Arredondamento de 5 g (1 g abaixo de 20 g); até 6 passos para ficar a 3%.
const GRUPO_LEGUMES = /^(Abobrinha|Abóbora|Brócolis|Cenoura|Chuchu|Tomate|Alface|Couve|Espinafre|Beterraba|Pepino|Repolho|Vagem|Berinjela)/;
const GRUPO_PROTEINA = /Frango|tilápia|Carne|bovina|Ovo|Salmão|Sardinha|Atum|Pescada|Merluza|tofu|^Queijo|Ricota|Iogurte|Leite|Soja, extrato/;
const LIMITE_PROTEINA = 1.25;

function grupoDoAlimento(nome) {
  if (GRUPO_LEGUMES.test(nome)) return "legumes";
  if (GRUPO_PROTEINA.test(nome)) return "proteina";
  return "energia";
}

const arredondarGramas = (g) => (g >= 20 ? Math.max(5, Math.round(g / 5) * 5) : Math.max(1, Math.round(g)));

async function cmdAjustar(pool) {
  for (const codigo of codigosPedidos()) {
    const m = lerModelo(codigo);
    if (!m || m.tipo !== "dieta") continue;
    // Bloqueado só é ajustado quando é rascunho novo (clinicos.json): a meta do
    // catálogo serve de ponto de partida, sem virar meta obrigatória.
    const rascunhoNovo = m.origem?.conteudo_base?.startsWith("rascunho novo");
    if ((m.situacao === "bloqueado" && !rascunhoNovo) || !m.meta_kcal_nominal || !m.refeicoes.length) {
      console.log(`${codigo}: não ajustado (${m.situacao === "bloqueado" ? "bloqueado" : "sem meta ou refeições"})`);
      continue;
    }
    const { achar, composicoes } = await resolverAlimentos(pool, [m]);
    // Energia alta para o cardápio-base: até duas refeições a mais (cópia do
    // lanche mais energético), em vez de inflar as porções.
    const kcalItem = (i) => {
      const a = achar(i.alimento);
      return a ? ((composicoes[a.id]?.kcal?.valor ?? 0) * i.gramas) / 100 : 0;
    };
    const fatorEnergia = () => {
      const k = { legumes: 0, proteina: 0, energia: 0 };
      for (const r of m.refeicoes) for (const i of r.itens) {
        const a = achar(i.alimento);
        k[a ? grupoDoAlimento(a.nome) : "energia"] += kcalItem(i);
      }
      const total = k.legumes + k.proteina + k.energia;
      if (m.meta_kcal_nominal <= total) return 0;
      const fp = Math.min(m.meta_kcal_nominal / total, decisoes.limite_aumento_proteina?.[codigo] ?? decisoes.limite_aumento_proteina?.[codigo.split("-")[0]] ?? LIMITE_PROTEINA);
      return k.energia > 0 ? (m.meta_kcal_nominal - k.legumes - k.proteina * fp) / k.energia : Infinity;
    };
    const acrescentadas = [];
    while (!rascunhoNovo && fatorEnergia() > 1.5 && acrescentadas.length < 2) {
      const kcalRef = (r) => r.itens.reduce((s, i) => s + kcalItem(i), 0);
      const fonte = m.refeicoes.filter((r) => /Lanche|Café/.test(r.nome)).sort((a, b) => kcalRef(b) - kcalRef(a))[0];
      if (!fonte) break;
      const temCeia = m.refeicoes.some((r) => r.nome === "Ceia");
      const nova = { nome: temCeia ? (m.refeicoes.some((r) => r.nome === "Lanche extra") ? "Lanche extra 2" : "Lanche extra") : "Ceia", itens: fonte.itens.map((i) => ({ ...i })) };
      if (temCeia) m.refeicoes.splice(m.refeicoes.findIndex((r) => r.nome === "Ceia"), 0, nova);
      else m.refeicoes.push(nova);
      acrescentadas.push(`${nova.nome} (cópia de ${fonte.nome})`);
    }
    const itens = m.refeicoes.flatMap((r) => r.itens);
    const info = itens.map((i) => {
      const a = achar(i.alimento);
      return { i, base: i.gramas, grupo: a ? grupoDoAlimento(a.nome) : "energia", kcal100: a ? composicoes[a.id]?.kcal?.valor ?? 0 : 0 };
    });
    const kcalDe = (lista, campo = "gramas") => lista.reduce((s, x) => s + (x.kcal100 * (campo === "base" ? x.base : x.i.gramas)) / 100, 0);
    const meta = m.meta_kcal_nominal;
    const inicial = kcalDe(info, "base");
    if (!inicial) { console.log(`${codigo}: não ajustado (sem energia calculada)`); continue; }
    const fatores = { legumes: 1, proteina: 1, energia: 1 };
    const subir = meta > inicial;
    if (!subir) {
      fatores.legumes = fatores.proteina = fatores.energia = meta / inicial;
    } else {
      const por = (g) => kcalDe(info.filter((x) => x.grupo === g), "base");
      const limiteProt = decisoes.limite_aumento_proteina?.[codigo] ?? decisoes.limite_aumento_proteina?.[codigo.split("-")[0]] ?? LIMITE_PROTEINA;
      fatores.proteina = Math.min(meta / inicial, limiteProt);
      const energia = por("energia");
      fatores.energia = energia > 0 ? (meta - por("legumes") - por("proteina") * fatores.proteina) / energia : meta / inicial;
    }
    for (const x of info) x.i.gramas = arredondarGramas(x.base * fatores[x.grupo]);
    // Correção fina do arredondamento: pequenos passos uniformes no grupo que mais varia.
    const alvo = subir ? "energia" : null;
    for (let passo = 0; passo < 6; passo++) {
      const kcal = kcalDe(info);
      const desvio = (kcal - meta) / meta;
      if (Math.abs(desvio) <= 0.03) break;
      const grupo = alvo ? info.filter((y) => y.grupo === alvo) : info;
      const f = 1 + (meta - kcal) / Math.max(1, kcalDe(grupo));
      for (const x of grupo) x.i.gramas = arredondarGramas(x.i.gramas * f);
    }
    // Piso de proteína por kg do peso de referência (decisoes.json): fontes de
    // proteína sobem até o piso e as fontes de energia compensam a energia.
    const piso = decisoes.proteina_minima_g_kg?.[codigo.split("-")[0]];
    let protFinal = null;
    if (piso && m.peso_referencia_kg) {
      for (const x of info) {
        const a = achar(x.i.alimento);
        x.prot100 = a ? composicoes[a.id]?.proteinas?.valor ?? 0 : 0;
      }
      const protDe = (lista) => lista.reduce((s, x) => s + (x.prot100 * x.i.gramas) / 100, 0);
      for (let passo = 0; passo < 6; passo++) {
        const alvoProt = piso * m.peso_referencia_kg;
        const atual = protDe(info);
        const fontes = info.filter((x) => x.grupo === "proteina");
        if (atual >= alvoProt * 0.98 || !fontes.length) break;
        const fp = 1 + (alvoProt - atual) / Math.max(1, protDe(fontes));
        for (const x of fontes) x.i.gramas = arredondarGramas(x.i.gramas * fp);
        const energia = info.filter((x) => x.grupo === "energia");
        const fe = 1 + (meta - kcalDe(info)) / Math.max(1, kcalDe(energia));
        for (const x of energia) x.i.gramas = arredondarGramas(x.i.gramas * fe);
      }
      protFinal = arred(protDe(info) / m.peso_referencia_kg, 2);
    }
    const kcal = kcalDe(info);
    m.ajuste = {
      ...(protFinal !== null ? { proteina_g_kg: protFinal, piso_proteina_g_kg: piso } : {}),
      ...(acrescentadas.length ? { refeicoes_acrescentadas: acrescentadas } : {}),
      metodo: subir ? "por grupo: legumes fixos, proteína até +25%, fontes de energia completam" : "fator único sobre as gramas do cardápio-base",
      fator: arred(meta / inicial, 3),
      fatores: { legumes: arred(fatores.legumes, 3), proteina: arred(fatores.proteina, 3), energia: arred(fatores.energia, 3) },
      kcal_base: arred(inicial),
      kcal_calculada: arred(kcal),
      em: new Date().toISOString().slice(0, 10),
    };
    gravarJsonAtomico(join(PASTA, `${codigo}.json`), m);
    const fora = Math.abs((kcal - meta) / meta) > 0.03 ? " (FORA de 3%)" : "";
    console.log(`${codigo}: ${arred(inicial)} → ${arred(kcal)} kcal (meta ${meta})${fora} fatores ${JSON.stringify(m.ajuste.fatores)}`);
  }
}

async function cmdImportar(pool) {
  const codigos = codigosPedidos();
  const r = await preparar(pool, codigos);
  let autorId = null;
  if (r.some(({ m }) => m && m.tipo !== "dieta")) {
    if (!autorEmail) throw new Error("Treinos precisam de --autor (e-mail do profissional dono dos modelos).");
    const u = await pool.query("select id from public.users where lower(email) = lower($1)", [autorEmail]);
    if (!u.rows[0]) throw new Error(`Usuário ${autorEmail} não encontrado.`);
    autorId = u.rows[0].id;
  }
  const resumo = { importados: [], ignorados: [], com_erro: [] };
  for (const { m, v } of r) {
    if (v.erros.length) { imprimir(v); resumo.com_erro.push(v.codigo); continue; }
    const tabela = m.tipo === "dieta" ? "modelos_nutricao" : "treino_modelos";
    const cliente = await pool.connect();
    try {
      await cliente.query("begin");
      const existe = await cliente.query(
        `select id, nome from public.${tabela} where codigo = $1 or nome like $2 limit 1`,
        [v.codigo, `${v.codigo} %`]
      );
      if (existe.rows[0]) {
        await cliente.query("rollback");
        console.log(`pulado ${v.codigo}: já existe (“${existe.rows[0].nome}”) — não sobrescrito`);
        resumo.ignorados.push(v.codigo);
        continue;
      }
      const biblioteca = {
        catalogo: "V3",
        hash: v.hash,
        calculo: v.calculo ?? null,
        desvio_kcal_pct: v.desvio_kcal_pct ?? null,
        meta_kcal_nominal: m.meta_kcal_nominal ?? null,
        peso_referencia_kg: m.peso_referencia_kg ?? null,
        avisos: v.avisos,
        notas: v.notas,
        referencias: m.referencias ?? [],
        ajuste: m.ajuste ?? null,
        importado_em: new Date().toISOString(),
      };
      const orientacoes = orientacoesDoProfissional(m);
      if (m.tipo === "dieta") {
        await cliente.query(
          `insert into public.modelos_nutricao (tipo, nome, conteudo, codigo, situacao, orientacoes_profissional, biblioteca)
           values ('dieta', $1, $2, $3, $4, $5, $6)`,
          [m.nome, JSON.stringify(v.conteudo), v.codigo, m.situacao, orientacoes, JSON.stringify(biblioteca)]
        );
      } else {
        await cliente.query(
          `insert into public.treino_modelos (nome, modalidade, plano, compartilhado, criado_por, codigo, orientacoes_profissional, biblioteca)
           values ($1, $2, $3, true, $4, $5, $6, $7)`,
          [m.nome.slice(0, 120), m.tipo, JSON.stringify(v.conteudo), autorId, v.codigo, orientacoes, JSON.stringify(biblioteca)]
        );
      }
      await cliente.query("commit");
      marcar(v.codigo, { status: "importado_homologacao", hash: v.hash, situacao: m.situacao ?? null, avisos: v.avisos.length });
      console.log(`importado ${v.codigo}${m.situacao === "bloqueado" ? " (bloqueado)" : ""}${v.avisos.length ? ` — ${v.avisos.length} aviso(s)` : ""}`);
      resumo.importados.push(v.codigo);
    } catch (erro) {
      await cliente.query("rollback").catch(() => {});
      console.log(`falhou ${v.codigo}: ${erro.message}`);
      resumo.com_erro.push(v.codigo);
    } finally {
      cliente.release();
    }
  }
  console.log(`\nimportados ${resumo.importados.length}, já existentes ${resumo.ignorados.length}, com erro ${resumo.com_erro.length}`);
}

async function cmdReverter(pool) {
  const codigos = codigosPedidos();
  const n = await pool.query("delete from public.modelos_nutricao where codigo = any($1) and usos = 0 returning codigo", [codigos]);
  const t = await pool.query("delete from public.treino_modelos where codigo = any($1) returning codigo", [codigos]);
  const usados = await pool.query("select codigo from public.modelos_nutricao where codigo = any($1)", [codigos]);
  for (const { codigo } of [...n.rows, ...t.rows]) marcar(codigo, { status: "revertido" });
  console.log(`removidos: ${[...n.rows, ...t.rows].map((l) => l.codigo).join(", ") || "nenhum"}`);
  if (usados.rows.length) console.log(`mantidos por já terem sido usados: ${usados.rows.map((l) => l.codigo).join(", ")}`);
}

// Relatório por código (V3, procedimentos de validação): todos os 220 do
// catálogo, com situação, destino, cálculo, avisos e hash. Grava
// banco/biblioteca/relatorio.md.
async function cmdRelatorio(pool) {
  const todos = Object.keys(catalogo).sort();
  const comArquivo = todos.filter((c) => existsSync(join(PASTA, `${c}.json`)));
  const r = Object.fromEntries((await preparar(pool, comArquivo)).map(({ m, v }) => [v.codigo, { m, v }]));
  const noBanco = new Set([
    ...(await pool.query("select codigo from public.modelos_nutricao where codigo is not null")).rows.map((l) => l.codigo),
    ...(await pool.query("select codigo from public.treino_modelos where codigo is not null")).rows.map((l) => l.codigo),
  ]);
  const linhas = [];
  const cont = { importado: 0, bloqueado: 0, protegido: 0, pendente: 0, erro: 0, avisos: 0 };
  for (const c of todos) {
    const cat = catalogo[c];
    if (decisoes.protegidos.includes(c)) {
      cont.protegido++;
      linhas.push(`| ${c} | protegido | já existe na produção (cadastro manual) | — | — |`);
      continue;
    }
    const item = r[c];
    if (!item) { cont.pendente++; linhas.push(`| ${c} | pendente | sem arquivo | — | — |`); continue; }
    const { m, v } = item;
    if (v.erros.length) cont.erro++;
    if (v.avisos.length) cont.avisos++;
    const importado = noBanco.has(c);
    if (importado) cont.importado++;
    if (m.situacao === "bloqueado") cont.bloqueado++;
    const situacao = v.erros.length ? "ERRO" : `${importado ? "importado (base local)" : "validado"}${m.situacao === "bloqueado" ? ", bloqueado" : ""}`;
    let calculo = "—";
    if (m.tipo === "dieta") {
      const k = v.calculo?.kcal;
      calculo = k ? `${Math.round(k)} kcal (meta ${m.meta_kcal_nominal ?? "—"}); P ${Math.round(v.calculo.proteinas)} g${v.proteina_g_kg ? ` = ${v.proteina_g_kg} g/kg` : ""}; fibras ${Math.round(v.calculo.fibras ?? 0)} g` : "sem cardápio (não prescritivo)";
    } else if (m.tipo === "musculacao") calculo = `${v.calculo.sessoes} sessões, ${v.calculo.exercicios} exercícios, ${v.calculo.series} séries`;
    else calculo = `${v.calculo.semanas} semanas, ${v.calculo.sessoes} sessões, ${v.calculo.minutos} min`;
    const obs = [...v.erros.map((e) => `ERRO: ${e}`), ...v.avisos].join(" · ").replace(/\|/g, "/") || "—";
    linhas.push(`| ${c} | ${situacao} | ${cat.titulo.replace(/\|/g, "/")} | ${calculo} | ${obs} |`);
  }
  const texto = [
    "# Biblioteca Mestre V3 — relatório por código",
    "",
    `Gerado em ${new Date().toISOString().slice(0, 10)} por \`node scripts/biblioteca/biblioteca.mjs relatorio\` (base local). Valores calculados pela base de alimentos do aplicativo. Validação técnica não é validação clínica: todos os modelos exigem revisão profissional e individualização antes do uso.`,
    "",
    `Catálogo: ${todos.length} códigos · importados na base local: ${cont.importado} (bloqueados: ${cont.bloqueado}) · protegidos (já na produção): ${cont.protegido} · pendentes: ${cont.pendente} · com erro: ${cont.erro} · com avisos: ${cont.avisos}.`,
    "",
    "| Código | Situação | Título do catálogo | Cálculo | Avisos |",
    "|---|---|---|---|---|",
    ...linhas,
    "",
  ].join("\n");
  writeFileSync(join(BIB, "relatorio.md"), texto, "utf8");
  console.log(`relatório gravado: ${JSON.stringify(cont)}`);
}

const COMANDOS = { validar: cmdValidar, ajustar: cmdAjustar, importar: cmdImportar, reverter: cmdReverter, relatorio: cmdRelatorio };
if (!COMANDOS[comando]) {
  console.log("Comandos: validar | ajustar | importar | reverter (veja o cabeçalho do arquivo).");
  process.exit(1);
}
const pool = conectar();
try {
  await COMANDOS[comando](pool);
} catch (erro) {
  console.error(erro.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}

// Gera o SQL de carga da TACO a partir dos 5 CSVs fornecidos pelo
// nutricionista, cruzando com a planilha oficial do NEPA/Unicamp para
// marcar os traços ("Tr"), que nos CSVs aparecem como 0.
//
// Uso (com a migration 008 aplicada e depois da aprovação do nutricionista):
//   node scripts/importar-taco.mjs <pasta dos CSVs> <planilha oficial .xlsx> > taco.sql
//   docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -U nutri -d nutri < taco.sql
//
// Regras:
// - Valores: os dos CSVs (por 100 g da parte comestível).
// - Campo vazio no CSV = dado não disponível (sem linha no banco), nunca zero.
// - "Tr" na planilha oficial = traço (traco = true, sem valor).
// - Zero no CSV com "NA" ou vazio na planilha = não disponível (não é zero real).
// - Número maior que zero no CSV com "NA" ou vazio na planilha = mantido, listado no relatório.
// - Pode rodar de novo: o que já foi importado é ignorado.
//
// O relatório de validação sai no stderr; o SQL, no stdout. Com divergências
// graves (colunas faltando, ids repetidos, texto onde deveria haver número),
// nada é gerado.

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const [pasta, planilha] = process.argv.slice(2);

if (!pasta || !planilha) {
  console.error("Uso: node scripts/importar-taco.mjs <pasta dos CSVs> <planilha oficial .xlsx>");
  process.exit(1);
}

// Colunas dos CSVs → códigos de nutriente (tabela public.nutrientes).
const NUTRIENTES = {
  "nutrients.csv": {
    moisture: "umidade", kcal: "kcal", kJ: "kj", protein: "proteinas", lipids: "lipidios",
    cholesterol: "colesterol", carbohydrates: "carboidratos", dietaryFiber: "fibras", ash: "cinzas",
    calcium: "calcio", magnesium: "magnesio", manganese: "manganes", phosphorus: "fosforo",
    iron: "ferro", sodium: "sodio", potassium: "potassio", copper: "cobre", zinc: "zinco",
    retinol: "retinol", re: "vitamina_a_re", rae: "vitamina_a_rae", thiamin: "tiamina",
    riboflavin: "riboflavina", pyridoxine: "piridoxina", niacin: "niacina", vitaminC: "vitamina_c",
  },
  "fatty-acids.csv": {
    saturated: "ag_saturados", monounsaturated: "ag_monoinsaturados", polyunsaturated: "ag_poliinsaturados",
    "12:0": "ag_12_0", "14:0": "ag_14_0", "16:0": "ag_16_0", "18:0": "ag_18_0", "20:0": "ag_20_0",
    "22:0": "ag_22_0", "24:0": "ag_24_0", "14:1": "ag_14_1", "16:1": "ag_16_1", "18:1": "ag_18_1",
    "20:1": "ag_20_1", "18:2n6": "ag_18_2_n6", "18:3n3": "ag_18_3_n3", "20:4": "ag_20_4",
    "20:5": "ag_20_5", "22:5": "ag_22_5", "22:6": "ag_22_6", "18:1t": "ag_18_1_trans", "18:2t": "ag_18_2_trans",
  },
  "amino-acids.csv": {
    tryptophan: "triptofano", threonine: "treonina", isoleucine: "isoleucina", leucine: "leucina",
    lysine: "lisina", methionine: "metionina", cystine: "cistina", phenylalanine: "fenilalanina",
    tyrosine: "tirosina", valine: "valina", arginine: "arginina", histidine: "histidina",
    alanine: "alanina", asparticAcid: "acido_aspartico", glutamicAcid: "acido_glutamico",
    glycine: "glicina", proline: "prolina", serine: "serina",
  },
};

// Colunas da planilha oficial (posição 1 = número do alimento) por aba.
// As colunas "Número do Alimento" repetidas no meio da aba são ignoradas.
const PLANILHA = {
  "nutrients.csv": {
    aba: 0,
    colunas: {
      3: "umidade", 4: "kcal", 5: "kj", 6: "proteinas", 7: "lipidios", 8: "colesterol",
      9: "carboidratos", 10: "fibras", 11: "cinzas", 12: "calcio", 13: "magnesio", 15: "manganes",
      16: "fosforo", 17: "ferro", 18: "sodio", 19: "potassio", 20: "cobre", 21: "zinco",
      22: "retinol", 23: "vitamina_a_re", 24: "vitamina_a_rae", 25: "tiamina", 26: "riboflavina",
      27: "piridoxina", 28: "niacina", 29: "vitamina_c",
    },
  },
  "fatty-acids.csv": {
    aba: 1,
    colunas: {
      3: "ag_saturados", 4: "ag_monoinsaturados", 5: "ag_poliinsaturados", 6: "ag_12_0", 7: "ag_14_0",
      8: "ag_16_0", 9: "ag_18_0", 10: "ag_20_0", 11: "ag_22_0", 12: "ag_24_0", 14: "ag_14_1",
      15: "ag_16_1", 16: "ag_18_1", 17: "ag_20_1", 18: "ag_18_2_n6", 19: "ag_18_3_n3", 20: "ag_20_4",
      21: "ag_20_5", 22: "ag_22_5", 23: "ag_22_6", 24: "ag_18_1_trans", 25: "ag_18_2_trans",
    },
  },
  "amino-acids.csv": {
    aba: 2,
    colunas: {
      3: "triptofano", 4: "treonina", 5: "isoleucina", 6: "leucina", 7: "lisina", 8: "metionina",
      9: "cistina", 10: "fenilalanina", 11: "tirosina", 13: "valina", 14: "arginina", 15: "histidina",
      16: "alanina", 17: "acido_aspartico", 18: "acido_glutamico", 19: "glicina", 20: "prolina", 21: "serina",
    },
  },
};

// ---------------------------------------------------------------------------
// Leitura

function lerCsv(arquivo) {
  const texto = fs.readFileSync(path.join(pasta, arquivo), "utf8").replace(/^﻿/, "");
  const linhas = [];
  let linha = [];
  let campo = "";
  let aspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }

  const validas = linhas.filter((l) => l.some((v) => v !== ""));
  return { cabecalho: validas[0], linhas: validas.slice(1) };
}

function valorDaCelula(celula) {
  const v = celula?.value;
  if (v === null || v === undefined || v === "") return { tipo: "vazio" };
  if (typeof v === "number") return { tipo: "numero", valor: v };
  if (typeof v === "object" && "result" in v && typeof v.result === "number") return { tipo: "numero", valor: v.result };
  const texto = String(typeof v === "object" && "richText" in v ? v.richText.map((t) => t.text).join("") : v).trim();
  if (texto === "Tr") return { tipo: "traco" };
  if (texto === "NA") return { tipo: "na" };
  if (texto === "*" || texto === "") return { tipo: "vazio" };
  return { tipo: "texto", texto };
}

async function lerPlanilha() {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.readFile(planilha);
  const abas = [];
  livro.eachSheet((aba) => abas.push(aba));

  const resultado = {};
  for (const [arquivo, { aba, colunas }] of Object.entries(PLANILHA)) {
    const mapa = new Map();
    abas[aba].eachRow((linha) => {
      const celulaId = valorDaCelula(linha.getCell(1));
      if (celulaId.tipo !== "numero") return;
      const id = Math.round(celulaId.valor);
      const valores = {};
      for (const [coluna, nutriente] of Object.entries(colunas)) {
        valores[nutriente] = valorDaCelula(linha.getCell(Number(coluna)));
      }
      mapa.set(String(id), valores);
    });
    resultado[arquivo] = mapa;
  }
  return resultado;
}

// ---------------------------------------------------------------------------
// Validação e cruzamento

const problemas = [];
const avisos = [];
const contagem = { alimentos: 0, categorias: 0, valores: 0, tracos: 0, zerosReais: 0, ausentes: 0, zerosSemRespaldo: 0 };

const categorias = lerCsv("categories.csv");
const alimentos = lerCsv("food.csv");

if (categorias.cabecalho.join(",") !== "id,name") problemas.push("categories.csv: cabeçalho inesperado");
if (alimentos.cabecalho.join(",") !== "id,categoryId,name") problemas.push("food.csv: cabeçalho inesperado");

const idsCategorias = new Set(categorias.linhas.map((l) => l[0]));
const idsAlimentos = new Set();
for (const [id, categoria, nome] of alimentos.linhas) {
  if (idsAlimentos.has(id)) problemas.push(`food.csv: alimento ${id} repetido`);
  idsAlimentos.add(id);
  if (!idsCategorias.has(categoria)) problemas.push(`food.csv: alimento ${id} com categoria ${categoria} inexistente`);
  if (!nome?.trim()) problemas.push(`food.csv: alimento ${id} sem nome`);
}

const oficial = await lerPlanilha();
const registros = []; // [codigo do alimento, nutriente, valor|null, traco]
// Os CSVs vêm arredondados como na TACO impressa; a planilha, sem
// arredondamento. Aceita a diferença de meia unidade da última casa do CSV.
function tolerancia(texto) {
  const casas = texto.includes(".") ? texto.split(".")[1].length : 0;
  return 0.5 * 10 ** -casas + 1e-6;
}

for (const [arquivo, mapa] of Object.entries(NUTRIENTES)) {
  const { cabecalho, linhas } = lerCsv(arquivo);
  if (cabecalho[0] !== "foodId") problemas.push(`${arquivo}: primeira coluna deveria ser foodId`);

  for (const coluna of Object.keys(mapa)) {
    if (!cabecalho.includes(coluna)) problemas.push(`${arquivo}: coluna ${coluna} ausente`);
  }

  const vistos = new Set();
  for (const linha of linhas) {
    const id = linha[0];
    if (vistos.has(id)) problemas.push(`${arquivo}: alimento ${id} repetido`);
    vistos.add(id);
    if (!idsAlimentos.has(id)) problemas.push(`${arquivo}: alimento ${id} não existe em food.csv`);

    const daPlanilha = oficial[arquivo].get(id);
    if (!daPlanilha) avisos.push(`${arquivo}: alimento ${id} não encontrado na planilha oficial`);

    for (const [coluna, nutriente] of Object.entries(mapa)) {
      const texto = linha[cabecalho.indexOf(coluna)] ?? "";
      const ref = daPlanilha?.[nutriente] ?? { tipo: "vazio" };

      if (texto === "") {
        if (ref.tipo === "numero") avisos.push(`${id}/${nutriente}: vazio no CSV, ${ref.valor} na planilha (mantido como não disponível)`);
        if (ref.tipo === "traco") { registros.push([id, nutriente, null, true]); contagem.tracos += 1; }
        else contagem.ausentes += 1;
        continue;
      }

      const numero = Number(texto);
      if (!Number.isFinite(numero) || numero < 0) {
        problemas.push(`${arquivo}: alimento ${id}, ${coluna} = "${texto}" não é número válido`);
        continue;
      }

      if (ref.tipo === "traco") {
        if (numero !== 0) avisos.push(`${id}/${nutriente}: ${numero} no CSV, "Tr" na planilha (mantido o valor do CSV)`);
        else { registros.push([id, nutriente, null, true]); contagem.tracos += 1; continue; }
      } else if (ref.tipo === "numero") {
        if (Math.abs(ref.valor - numero) > tolerancia(texto)) {
          avisos.push(`${id}/${nutriente}: ${numero} no CSV, ${ref.valor.toFixed(3)} na planilha`);
        }
      } else if (ref.tipo === "na" || ref.tipo === "vazio") {
        // Zero sem respaldo na planilha oficial não é tratado como zero real.
        if (numero === 0) {
          contagem.zerosSemRespaldo += 1;
          contagem.ausentes += 1;
          continue;
        }
        avisos.push(`${id}/${nutriente}: ${numero} no CSV, "${ref.tipo === "na" ? "NA" : "vazio"}" na planilha (mantido o valor do CSV)`);
      }

      if (numero === 0) contagem.zerosReais += 1;
      registros.push([id, nutriente, numero, false]);
      contagem.valores += 1;
    }
  }
}

contagem.categorias = categorias.linhas.length;
contagem.alimentos = alimentos.linhas.length;

console.error("Validação da TACO");
console.error(`- ${contagem.categorias} categorias, ${contagem.alimentos} alimentos`);
console.error(`- ${contagem.valores} valores (${contagem.zerosReais} zeros reais), ${contagem.tracos} traços, ${contagem.ausentes} dados não disponíveis`);
console.error(`- ${contagem.zerosSemRespaldo} zeros do CSV com célula vazia ou NA na planilha oficial: tratados como não disponíveis`);
console.error(`- ${avisos.length} aviso(s), ${problemas.length} problema(s)`);
for (const aviso of avisos.slice(0, process.env.TODOS_AVISOS ? avisos.length : 60)) console.error(`  aviso: ${aviso}`);
if (avisos.length > 60) console.error(`  ... e mais ${avisos.length - 60} aviso(s)`);

if (problemas.length > 0) {
  for (const problema of problemas) console.error(`  PROBLEMA: ${problema}`);
  console.error("Nada foi gerado.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// SQL

const texto = (v) => `'${String(v).replace(/'/g, "''")}'`;
const saida = ["BEGIN;"];

saida.push(
  "INSERT INTO public.alimentos_categorias (nome, fonte, codigo_origem) VALUES",
  categorias.linhas.map(([id, nome]) => `  (${texto(nome.trim())}, 'taco', ${texto(id)})`).join(",\n"),
  "ON CONFLICT (fonte, codigo_origem) DO NOTHING;"
);

saida.push(
  "INSERT INTO public.alimentos (nome, categoria_id, fonte, codigo_origem, unidade_base)",
  "SELECT v.nome, c.id, 'taco', v.codigo, 'g' FROM (VALUES",
  alimentos.linhas.map(([id, categoria, nome]) => `  (${texto(id)}, ${texto(categoria)}, ${texto(nome.trim())})`).join(",\n"),
  ") AS v(codigo, categoria, nome)",
  "JOIN public.alimentos_categorias c ON c.fonte = 'taco' AND c.codigo_origem = v.categoria",
  "ON CONFLICT (fonte, codigo_origem) DO NOTHING;"
);

for (let i = 0; i < registros.length; i += 2000) {
  const bloco = registros.slice(i, i + 2000);
  saida.push(
    "INSERT INTO public.alimentos_nutrientes (alimento_id, nutriente, valor, traco, fonte)",
    "SELECT a.id, v.nutriente, v.valor, v.traco, 'taco' FROM (VALUES",
    bloco.map(([id, nutriente, valor, traco]) => `  (${texto(id)}, ${texto(nutriente)}, ${valor === null ? "NULL::numeric" : valor}, ${traco})`).join(",\n"),
    ") AS v(codigo, nutriente, valor, traco)",
    "JOIN public.alimentos a ON a.fonte = 'taco' AND a.codigo_origem = v.codigo",
    "ON CONFLICT (alimento_id, nutriente) DO NOTHING;"
  );
}

saida.push("UPDATE public.alimentos_fontes SET importado_em = now() WHERE codigo = 'taco';");
saida.push(
  "DO $$ BEGIN RAISE NOTICE 'TACO: % alimentos, % valores no banco', " +
    "(SELECT count(*) FROM public.alimentos WHERE fonte = 'taco'), " +
    "(SELECT count(*) FROM public.alimentos_nutrientes WHERE fonte = 'taco'); END $$;"
);
saida.push("COMMIT;");

process.stdout.write(`${saida.join("\n")}\n`);

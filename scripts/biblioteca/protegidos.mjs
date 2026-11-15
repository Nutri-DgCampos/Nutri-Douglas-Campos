// Biblioteca Mestre V3 — ajuste dos 4 modelos que o nutricionista cadastrou à
// mão na produção (EMG-001 e FIS-BIK-007/008/009). Resposta 1 do nutricionista
// em 15/11/2026: "ajustar as porções para chegar ao valor do nome".
//
// Uso (raiz do repositório):
//   node scripts/biblioteca/protegidos.mjs preparar <copia-da-producao.json> <alimentos-da-producao.json>
//       Calcula com a composição da base LOCAL (TACO pelo código de origem,
//       cadastros manuais pelo id) e grava banco/biblioteca/protegidos/<CÓDIGO>.json
//       com o conteúdo original, o novo, o cálculo antes/depois e as mudanças.
//       Não grava em banco nenhum.
//   node scripts/biblioteca/protegidos.mjs aplicar   [--producao]
//   node scripts/biblioteca/protegidos.mjs restaurar [--producao]
//       aplicar: troca o conteúdo só se o modelo ainda estiver na revisão e com
//       o conteúdo da cópia (senão informa e não mexe); grava o código, soma 1
//       na revisão e registra o ajuste em "biblioteca". restaurar: volta ao
//       original se o conteúdo ainda for o ajustado.
//       Banco que não seja local exige --producao e BIBLIOTECA_PRODUCAO=CONFIRMO
//       (só com autorização expressa do cliente).
//
// Regra do ajuste (preserva as escolhas do nutricionista): proteínas, gorduras,
// legumes, laticínios e bebidas ficam como ele montou; só as fontes de
// carboidrato (≥ 50% da energia em carboidrato e ≥ 50 kcal/100 g) mudam, até a
// meta ±1,5%. Gramas em passos de 5 g; medida caseira em unidades inteiras.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import pg from "pg";
import { opcaoDeReferencia, quantidadeDoItem, totaisDaDieta, validarDocumento } from "../../lib/nutricao/dieta.ts";

const BIB = join(process.cwd(), "banco", "biblioteca");
const PASTA = join(BIB, "protegidos");
const decisoes = JSON.parse(readFileSync(join(BIB, "decisoes.json"), "utf8"));
const [comando, ...resto] = process.argv.slice(2);
const opcoes = new Set(resto.filter((a) => a.startsWith("--")));
const argumentos = resto.filter((a) => !a.startsWith("--"));
const NUTRIENTES = ["kcal", "proteinas", "carboidratos", "lipidios", "fibras"];
const TOLERANCIA = 0.015;

// Metas: EMG-001 pelo nome (1.300 kcal); FIS-BIK-007/008/009 pela resposta 3
// do nutricionista (14/11), registrada em decisoes.json.
const META = { "EMG-001": 1300, ...Object.fromEntries(Object.entries(decisoes.kcal_nominal ?? {}).filter(([c]) => decisoes.protegidos.includes(c))) };
const PESO_REFERENCIA = { "FIS-BIK-007": 60, "FIS-BIK-008": 60, "FIS-BIK-009": 60 }; // do nome do modelo

function conectar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida.");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (!local && !(opcoes.has("--producao") && process.env.BIBLIOTECA_PRODUCAO === "CONFIRMO")) {
    throw new Error(`Banco ${host} não é local. Alterar modelos fora da base local exige autorização expressa (--producao).`);
  }
  return new pg.Pool({ connectionString: url, max: 2 });
}

function gravarJsonAtomico(caminho, objeto) {
  writeFileSync(`${caminho}.tmp`, JSON.stringify(objeto, null, 1) + "\n", "utf8");
  renameSync(`${caminho}.tmp`, caminho);
}

const arred = (v, casas = 0) => (v === null || v === undefined ? null : Math.round(v * 10 ** casas) / 10 ** casas);
const codigoDoNome = (nome) => /^([A-Z]{3}(?:-[A-Z]{2,3})?-\d{3}) /.exec(nome)?.[1] ?? null;

// ---------------------------------------------------------------------------
// preparar

async function cmdPreparar() {
  const [arqModelos, arqAlimentos] = argumentos;
  if (!arqModelos || !arqAlimentos) throw new Error("Informe a cópia dos modelos e a lista de alimentos da produção.");
  const modelos = JSON.parse(readFileSync(arqModelos, "utf8"));
  const alimentosBrutos = JSON.parse(readFileSync(arqAlimentos, "utf8"));
  const alimentosProd = Array.isArray(alimentosBrutos) ? alimentosBrutos : alimentosBrutos.a;
  const prodPorId = Object.fromEntries(alimentosProd.map((a) => [a.i, a]));

  const pool = conectar();
  const locais = (await pool.query("select id, fonte, codigo_origem from public.alimentos")).rows;
  const localTaco = Object.fromEntries(locais.filter((a) => a.fonte === "taco").map((a) => [a.codigo_origem, a.id]));
  const localIds = new Set(locais.map((a) => a.id));
  const paraLocal = (idProd) => {
    const a = prodPorId[idProd];
    if (!a) return null;
    return a.f === "taco" ? localTaco[a.o] ?? null : localIds.has(idProd) ? idProd : null;
  };
  const comp = {};
  for (const c of (await pool.query("select alimento_id, nutriente, valor, traco from public.alimentos_nutrientes")).rows) {
    (comp[c.alimento_id] ??= {})[c.nutriente] = { valor: c.valor === null ? null : Number(c.valor), traco: c.traco };
  }
  await pool.end();

  mkdirSync(PASTA, { recursive: true });
  for (const m of modelos) {
    const codigo = codigoDoNome(m.n);
    if (!codigo || !decisoes.protegidos.includes(codigo)) continue;
    const meta = META[codigo];
    if (!meta) throw new Error(`${codigo}: sem meta de energia.`);

    // Cópia com ids locais só para o cálculo; o conteúdo novo mantém os ids da produção.
    const local = (doc) => {
      const d = structuredClone(doc);
      for (const r of d.refeicoes) for (const o of r.opcoes) for (const i of o.itens) if (i.alimentoId) i.alimentoId = paraLocal(i.alimentoId);
      return d;
    };
    const totais = (doc) => {
      const t = totaisDaDieta(local(doc), comp, NUTRIENTES);
      return Object.fromEntries(NUTRIENTES.map((n) => [n, arred(t[n].valor, 1)]));
    };
    const faltam = [];
    for (const r of m.c.refeicoes) for (const o of r.opcoes) for (const i of o.itens) {
      if (i.alimentoId && !paraLocal(i.alimentoId)) faltam.push(i.nomeOriginal);
      const x = comp[paraLocal(i.alimentoId)];
      if (i.alimentoId && (!x?.kcal || x.kcal.valor === null)) faltam.push(`${i.nomeOriginal} (sem kcal)`);
    }
    if (faltam.length) throw new Error(`${codigo}: alimentos sem composição na base local: ${faltam.join(", ")}`);

    const novo = structuredClone(m.c);
    const referencia = new Set(novo.refeicoes.map((r) => opcaoDeReferencia(r)?.id));
    const itens = novo.refeicoes.flatMap((r) => r.opcoes.flatMap((o) => o.itens.map((i) => ({ i, refeicao: r.nome, naReferencia: referencia.has(o.id) }))));
    const kcal100 = (i) => comp[paraLocal(i.alimentoId)]?.kcal?.valor ?? 0;
    const carbo100 = (i) => comp[paraLocal(i.alimentoId)]?.carboidratos?.valor ?? 0;
    const fonteDeCarboidrato = (i) => i.alimentoId && kcal100(i) >= 50 && (carbo100(i) * 4) / kcal100(i) >= 0.5;
    const porMedida = (i) => i.medida && i.numeroMedidas && i.quantidadeAjustada === null;
    const gramas = (i) => quantidadeDoItem(i).efetiva ?? 0;
    const definir = (i, g) => {
      if (porMedida(i)) i.numeroMedidas = Math.max(1, Math.round(g / i.medida.quantidade));
      else i.quantidadeAjustada = Math.max(5, Math.round(g / 5) * 5);
    };

    const antes = totais(m.c);
    const ajustaveis = itens.filter((x) => fonteDeCarboidrato(x.i));
    const original = new Map(ajustaveis.map((x) => [x.i.id, gramas(x.i)]));
    const kcalCarbo = ajustaveis.filter((x) => x.naReferencia).reduce((s, x) => s + (kcal100(x.i) * gramas(x.i)) / 100, 0);
    const fator = 1 + (meta - antes.kcal) / kcalCarbo;
    for (const x of ajustaveis) definir(x.i, original.get(x.i.id) * fator);
    // Correção fina: passos de 5 g na fonte em gramas que mais aproxima da meta.
    for (let passo = 0; passo < 40; passo++) {
      const kcal = totais(novo).kcal;
      if (Math.abs(kcal - meta) <= meta * TOLERANCIA) break;
      const sinal = kcal < meta ? 1 : -1;
      const candidatos = ajustaveis.filter((x) => x.naReferencia && !porMedida(x.i) && (sinal > 0 || x.i.quantidadeAjustada > 5));
      if (!candidatos.length) break;
      // Espalha a correção: sobe o que menos subiu (ou desce o que mais subiu).
      const razao = (x) => gramas(x.i) / original.get(x.i.id);
      const melhor = candidatos.sort((a, b) => sinal * (razao(a) - razao(b)))[0];
      melhor.i.quantidadeAjustada += 5 * sinal;
    }
    const depois = totais(novo);
    const valido = validarDocumento(novo);
    if ("erro" in valido) throw new Error(`${codigo}: documento inválido depois do ajuste: ${valido.erro}`);

    const texto = (i) => (porMedida(i) ? `${i.numeroMedidas} × ${i.medida.singular} (${gramas(i)} ${i.unidade})` : `${gramas(i)} ${i.unidade}`);
    const antesPorId = new Map(m.c.refeicoes.flatMap((r) => r.opcoes.flatMap((o) => o.itens.map((i) => [i.id, i]))));
    const mudancas = itens
      .filter((x) => gramas(x.i) !== gramas(antesPorId.get(x.i.id)))
      .map((x) => ({ refeicao: x.refeicao, alimento: x.i.nomeOriginal, antes: texto(antesPorId.get(x.i.id)), depois: texto(x.i) }));
    const peso = PESO_REFERENCIA[codigo];
    const porKg = (t) => (peso ? { proteina_g_kg: arred(t.proteinas / peso, 2), carboidrato_g_kg: arred(t.carboidratos / peso, 2) } : {});
    const desvio = arred(((depois.kcal - meta) / meta) * 100, 1);
    gravarJsonAtomico(join(PASTA, `${codigo}.json`), {
      codigo,
      nome: m.n,
      id_producao: m.id,
      revisao_esperada: m.r,
      usos_na_copia: m.u,
      atualizado_em_na_copia: m.a,
      meta_kcal: meta,
      regra: "Proteínas, gorduras, legumes, laticínios e bebidas mantidos; fontes de carboidrato ajustadas até a meta (±1,5%).",
      calculo: { antes: { ...antes, ...porKg(antes) }, depois: { ...depois, ...porKg(depois) }, desvio_percentual: desvio },
      mudancas,
      conteudo_original: m.c,
      conteudo_novo: valido.documento,
      preparado_em: new Date().toISOString().slice(0, 10),
    });
    console.log(`${codigo}: ${antes.kcal} → ${depois.kcal} kcal (meta ${meta}, desvio ${desvio}%) · P ${antes.proteinas}→${depois.proteinas} · C ${antes.carboidratos}→${depois.carboidratos} · L ${antes.lipidios}→${depois.lipidios} · ${mudancas.length} mudanças`);
  }
}

// ---------------------------------------------------------------------------
// aplicar / restaurar

function lerPreparados() {
  if (!existsSync(PASTA)) return [];
  return readdirSync(PASTA).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(PASTA, f), "utf8")));
}

async function trocar(de, para, rotulo, metaBiblioteca) {
  const pool = conectar();
  let feitos = 0;
  for (const p of lerPreparados()) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      const r = await c.query("select revisao, conteudo, codigo from public.modelos_nutricao where id = $1 for update", [p.id_producao]);
      const atual = r.rows[0];
      const origem = p[de], destino = p[para];
      if (!atual) {
        console.log(`${p.codigo}: modelo ${p.id_producao} não existe neste banco; nada feito.`);
      } else if (!isDeepStrictEqual(atual.conteudo, origem)) {
        console.log(`${p.codigo}: o conteúdo atual não é o esperado (alterado depois da cópia?); nada feito.`);
      } else if (rotulo === "aplicado" && atual.revisao !== p.revisao_esperada) {
        console.log(`${p.codigo}: revisão ${atual.revisao}, esperada ${p.revisao_esperada}; nada feito.`);
      } else {
        await c.query(
          `update public.modelos_nutricao
              set conteudo = $2::jsonb, revisao = revisao + 1, atualizado_em = now(),
                  codigo = coalesce(codigo, $3),
                  biblioteca = coalesce(biblioteca, '{}'::jsonb) || $4::jsonb
            where id = $1`,
          [p.id_producao, JSON.stringify(destino), p.codigo, JSON.stringify(metaBiblioteca(p))]
        );
        feitos++;
        console.log(`${p.codigo}: ${rotulo}.`);
      }
      await c.query("commit");
    } catch (erro) {
      await c.query("rollback").catch(() => {});
      console.log(`${p.codigo}: erro, nada feito (${erro.message}).`);
    } finally {
      c.release();
    }
  }
  await pool.end();
  console.log(`${feitos} de ${lerPreparados().length} ${rotulo}s.`);
}

const COMANDOS = {
  preparar: cmdPreparar,
  aplicar: () =>
    trocar("conteudo_original", "conteudo_novo", "aplicado", (p) => ({
      protegido: true,
      ajuste_protegido: { meta_kcal: p.meta_kcal, regra: p.regra, calculo: p.calculo, mudancas: p.mudancas, aplicado_em: new Date().toISOString() },
    })),
  restaurar: () =>
    trocar("conteudo_novo", "conteudo_original", "restaurado", () => ({ protegido: true, ajuste_protegido: { restaurado_em: new Date().toISOString() } })),
};

if (!COMANDOS[comando]) {
  console.log("Comandos: preparar | aplicar | restaurar (veja o cabeçalho do arquivo).");
  process.exit(1);
}
await COMANDOS[comando]();

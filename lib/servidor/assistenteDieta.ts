import {
  CONDICOES,
  ESQUEMA_DA_SAIDA,
  montarProposta,
  type CatalogoDaIa,
  type PedidoDaIa,
  type PropostaDaIa,
} from "@/lib/nutricao/assistente";
import { textoDaResposta, type Pergunta, type Respostas } from "@/lib/nutricao/anamnese";
import { alimentosDoDocumento, opcaoDeReferencia, quantidadeDoItem, totaisDosItens, type DocumentoDieta, type Refeicao, type Unidade } from "@/lib/nutricao/dieta";
import { idadeEm, rotuloDoSexo } from "@/lib/nutricao/paciente";
import type { ResponseInput } from "openai/resources/responses/responses";
import { obterPool } from "./banco";
import { composicoes } from "./alimentos";
import { dadosDoPaciente, dadosDosAlimentos, gastosDasAvaliacoes, pesoMaisRecente, type LinhaDieta } from "./dietas";
import { clienteDaIa, iaSimulada, modeloDoAssistente, registrarUsoDaIa } from "./ia";

// Assistente de IA do editor de dietas (Fase 7).
//
// O que vai para a IA (validação 7.2 a 7.4): sexo, idade, peso de referência,
// altura, TMB/GET da avaliação de referência, a dieta aberta, as metas e o
// pedido do nutricionista e, se ele quiser, o contexto da anamnese que ele
// revisou na tela. Nunca: nome, contato, data de nascimento, arquivos,
// observações profissionais. O catálogo de alimentos da base vai com códigos
// curtos; a resposta volta com esses códigos e é conferida aqui.

const MACROS = ["kcal", "proteinas", "carboidratos", "lipidios"] as const;

const INSTRUCOES = `
Você auxilia um nutricionista a elaborar dietas num sistema brasileiro. Sua proposta é apoio ao trabalho profissional, não uma prescrição validada: o nutricionista revisa tudo antes de usar.

Regras obrigatórias:
1. Use SOMENTE alimentos do CATÁLOGO abaixo, pelo código (ex.: "a12"). Nunca invente códigos. Se precisar de algo que não está no catálogo, use "alimento": null e escreva o alimento em "descricao"; o nutricionista escolherá na base.
2. Em "descricao", repita o nome do alimento (do catálogo ou o sugerido).
3. Medida caseira: use somente os códigos de medida listados para aquele alimento (ex.: "m3") e informe "numeroMedidas" (pode ser 0,5, 1, 1,5, 2...). Com medida, deixe "quantidade" null.
4. Sem medida listada para o alimento: "medida" null, "numeroMedidas" null e "quantidade" em gramas (ou mL quando a unidade do alimento for mL).
5. Use preparações prontas para consumo (cozido, assado, grelhado): nunca carnes, ovos, peixes, grãos ou tubérculos crus. Frutas, verduras e o que se come cru podem ser crus. Use porções realistas para uma pessoa.
6. Os valores por 100 g/mL do catálogo servem para você estimar. O sistema recalcula tudo pela base; não escreva totais nem afirme que a meta foi atingida exatamente.
7. Não inclua medicamentos, suplementos manipulados nem fórmulas.
8. Restrições, alergias e intolerâncias valem para TODOS os alimentos: confira cada item. Exemplos: "sem lactose" exclui leite, iogurte, queijos, requeijão, manteiga, creme de leite e preparações com eles (salvo versão sem lactose do catálogo); "sem glúten" exclui trigo, centeio, cevada, pães, massas e aveia comum. Na dúvida, não use o alimento. Respeite as preferências. Nunca presuma dados clínicos que não foram informados.
9. Metas: antes de responder, some as calorias e os macronutrientes de cada item (quantidade × valor por 100 g ÷ 100) e ajuste as porções para chegar perto das metas. Sem meta informada, use o GET ou o pedido como referência de energia.
10. Se faltar informação essencial ou houver conflito (por exemplo, meta incompatível com restrições), faça a melhor proposta possível e explique as limitações em "mensagem". Se não for possível propor nada com segurança, devolva "refeicoes" vazio e explique em "mensagem".
11. "mensagem": em português, curta (até 5 frases), para o nutricionista: o que foi feito, limitações e pontos para revisar.
12. Horário no formato "HH:MM" ou null. Nome da refeição em português (ex.: "Café da manhã").
13. A primeira opção de cada refeição é a principal. Só crie outras opções (no máximo 2 a mais) se o pedido pedir alternativas.
14. Observação da refeição: null, salvo quando útil (modo de preparo, orientação curta).
`.trim();

const INSTRUCOES_DO_ALCANCE = {
  refeicao: (codigo: string, nome: string) =>
    `ALCANCE: trabalhe SOMENTE na refeição ${codigo} (${nome}). Devolva só essa refeição, com "codigo": "${codigo}". Não mude as outras.`,
  dieta:
    'ALCANCE: a dieta inteira. Devolva TODAS as refeições como devem ficar, inclusive as que não mudam (iguais). Refeição existente mantém o "codigo" (r1, r2...); refeição nova usa "codigo": null. Refeição que não voltar na resposta será sugerida para remoção.',
  doZero:
    'ALCANCE: elaborar uma dieta completa do zero. Ignore a dieta aberta. Todas as refeições com "codigo": null.',
};

function numero(valor: number, casas = 1) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

// ---------------------------------------------------------------------------
// Dados do paciente sem identificação

export type ContextoDoPaciente = {
  sexo: string | null;
  idade: number | null;
  peso: number | null;
  altura: number | null;
  tmb: number | null;
  get: number | null;
  getMaisMets: number | null;
};

export async function contextoDoPaciente(dieta: LinhaDieta, documento: DocumentoDieta): Promise<ContextoDoPaciente> {
  const pool = obterPool();
  const [paciente, consulta, gastos, peso] = await Promise.all([
    dadosDoPaciente(dieta.patient_id),
    pool.query<{ data: string }>("select to_char(data, 'YYYY-MM-DD') as data from public.consultas where id = $1", [dieta.consulta_id]),
    documento.gastoReferencia === undefined ? gastosDasAvaliacoes(dieta.patient_id) : Promise.resolve([]),
    documento.pesoReferencia.valor ? Promise.resolve(null) : pesoMaisRecente(dieta.patient_id),
  ]);
  const gasto = documento.gastoReferencia === undefined ? gastos[0] ?? null : documento.gastoReferencia;
  return {
    sexo: rotuloDoSexo(paciente?.sex ?? null) ?? null,
    idade: idadeEm(paciente?.birth_date, consulta.rows[0]?.data),
    peso: documento.pesoReferencia.valor ?? peso?.valor ?? null,
    altura: paciente?.height_cm ?? null,
    tmb: gasto?.tmb ?? null,
    get: gasto?.get ?? null,
    getMaisMets: gasto?.getMaisMets ?? null,
  };
}

export function textoDoPaciente(c: ContextoDoPaciente) {
  const partes = [
    c.sexo ? `sexo ${c.sexo.toLowerCase()}` : "sexo não informado",
    c.idade !== null ? `${c.idade} anos` : "idade não informada",
    c.peso ? `peso de referência ${numero(c.peso)} kg` : "peso não informado",
    c.altura ? `altura ${numero(c.altura, 0)} cm` : "altura não informada",
  ];
  if (c.tmb) partes.push(`TMB ${numero(c.tmb, 0)} kcal`);
  if (c.get) partes.push(`GET ${numero(c.get, 0)} kcal`);
  if (c.getMaisMets) partes.push(`GET + METs ${numero(c.getMaisMets, 0)} kcal`);
  return partes.join("; ");
}

// ---------------------------------------------------------------------------
// Anamnese: alergias, restrições e preferências (sem identificação)

const PERGUNTA_DE_CONTEXTO =
  /alerg|intoler|restri|prefer|gosta|avers|evita|n[aã]o come|vegetar|vegan|religi|cel[ií]ac|lactose|gl[uú]ten|consome|h[aá]bito|suplement|patolog|doen[cç]a|diagn[oó]stic|medica/i;
const PERGUNTA_IDENTIFICADORA =
  /nome|cpf|\brg\b|telefone|celular|whats|e-?mail|endere[cç]o|\bcep\b|bairro|cidade|nascimento|instagram|contato|respons[aá]vel|emerg[eê]ncia/i;

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const VARIANTES: Record<string, string> = { a: "[aáàâãä]", e: "[eéèêë]", i: "[iíìîï]", o: "[oóòôõö]", u: "[uúùûü]", c: "[cç]", n: "[nñ]" };

// Tira do texto o nome do paciente e dados de contato que ele tenha escrito.
export function semIdentificacao(texto: string, nome: string) {
  let resultado = texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[e-mail]")
    .replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, "[documento]")
    .replace(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g, "[telefone]");
  const partes = semAcento(nome)
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((p) => p.length >= 3 && !/^(das|dos|del)$/.test(p));
  for (const parte of new Set(partes)) {
    // Cada letra aceita as versões acentuadas ("Jose" também pega "José").
    const padrao = [...parte].map((l) => VARIANTES[l] ?? l).join("");
    resultado = resultado.replace(new RegExp(`(?<!\\p{L})${padrao}(?!\\p{L})`, "giu"), "[paciente]");
  }
  return resultado;
}

export type AnamneseDoContexto = {
  id: string;
  titulo: string;
  data: string;
  contexto: string;
  resumo: string | null;
  resumoEm: string | null;
};

type LinhaAnamnese = { id: string; titulo: string; data: string; perguntas: Pergunta[]; respostas: Respostas; resumo_ia: string | null; resumo_ia_em: string | null };

async function anamneseMaisRecente(pacienteId: string): Promise<LinhaAnamnese | null> {
  const resultado = await obterPool().query<LinhaAnamnese>(
    `select a.id, a.titulo, to_char(coalesce(a.respondido_em, a.atualizado_em) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data,
            a.perguntas, a.respostas, a.resumo_ia, a.resumo_ia_em
       from public.anamneses a
      where a.patient_id = $1 and a.arquivado_em is null and a.respostas <> '{}'::jsonb
      order by coalesce(a.respondido_em, a.atualizado_em) desc
      limit 1`,
    [pacienteId]
  );
  return resultado.rows[0] ?? null;
}

function perguntasERespostas(a: LinhaAnamnese, filtro: (p: Pergunta) => boolean, nome: string) {
  return a.perguntas
    .filter((p) => !PERGUNTA_IDENTIFICADORA.test(p.texto) && filtro(p))
    .map((p) => {
      const resposta = textoDaResposta(p, a.respostas[p.id]).trim();
      return resposta ? `${p.texto.trim()}: ${semIdentificacao(resposta, nome)}` : null;
    })
    .filter((linha): linha is string => Boolean(linha));
}

export async function anamneseDoContexto(pacienteId: string): Promise<AnamneseDoContexto | null> {
  const [anamnese, paciente] = await Promise.all([anamneseMaisRecente(pacienteId), dadosDoPaciente(pacienteId)]);
  if (!anamnese) return null;
  const linhas = perguntasERespostas(anamnese, (p) => PERGUNTA_DE_CONTEXTO.test(p.texto), paciente?.name ?? "");
  return {
    id: anamnese.id,
    titulo: anamnese.titulo,
    data: anamnese.data,
    contexto: linhas.join("\n"),
    resumo: anamnese.resumo_ia,
    resumoEm: anamnese.resumo_ia_em,
  };
}

// Resumo da anamnese pela IA (validação 7.4, opção C): todas as respostas,
// menos as que identificam o paciente, e sem o nome.
export async function resumirAnamnese(anamneseId: string, usuarioId: string | null) {
  const pool = obterPool();
  const linha = await pool.query<LinhaAnamnese & { patient_id: string }>(
    `select id, patient_id, titulo, '' as data, perguntas, respostas, resumo_ia, resumo_ia_em
       from public.anamneses where id = $1`,
    [anamneseId]
  );
  const anamnese = linha.rows[0];
  if (!anamnese) return null;
  const paciente = await dadosDoPaciente(anamnese.patient_id);
  const respostas = perguntasERespostas(anamnese, () => true, paciente?.name ?? "");
  if (respostas.length === 0) throw new Error("A anamnese não tem respostas para resumir.");

  const instrucoes = `
Você resume, para um nutricionista, as respostas de uma anamnese nutricional (dados sem identificação do paciente).
Escreva em português, em tópicos curtos, só com o que está nas respostas: queixas e objetivo; histórico de saúde, doenças e medicamentos citados; alergias, intolerâncias e restrições; hábitos alimentares, preferências e aversões; rotina, sono, atividade física e hidratação; pontos de atenção para a dieta.
Não invente nem presuma informações; omita tópicos sem resposta. Não faça diagnóstico nem prescrição. No máximo 200 palavras.
`.trim();

  const modelo = modeloDoAssistente();
  let resumo: string;
  if (iaSimulada()) {
    resumo = `- Resumo simulado (testes): ${respostas.length} resposta(s).\n${respostas.map((r) => `- ${r}`).join("\n")}`;
    await registrarUsoDaIa({ recurso: "resumo_anamnese", modelo: "simulada", pacienteId: anamnese.patient_id, usuarioId });
  } else {
    try {
      const resposta = await clienteDaIa().responses.create({
        model: modelo,
        instructions: instrucoes,
        input: respostas.join("\n"),
      });
      await registrarUsoDaIa({ recurso: "resumo_anamnese", modelo, uso: resposta.usage, pacienteId: anamnese.patient_id, usuarioId });
      resumo = resposta.output_text.trim();
    } catch (erro) {
      await registrarUsoDaIa({ recurso: "resumo_anamnese", modelo, sucesso: false, pacienteId: anamnese.patient_id, usuarioId });
      throw erro;
    }
  }
  if (!resumo) throw new Error("A IA não devolveu o resumo.");

  const gravado = await pool.query<{ resumo_ia_em: string }>(
    "update public.anamneses set resumo_ia = $2, resumo_ia_em = now() where id = $1 returning resumo_ia_em",
    [anamneseId, resumo.slice(0, 5000)]
  );
  return { resumo: resumo.slice(0, 5000), em: gravado.rows[0].resumo_ia_em };
}

// ---------------------------------------------------------------------------
// Catálogo de alimentos da base

type LinhaDoCatalogo = { id: string; nome: string; unidade_base: Unidade };

async function montarCatalogo(documento: DocumentoDieta) {
  const pool = obterPool();
  const usados = alimentosDoDocumento(documento);
  const alimentos = await pool.query<LinhaDoCatalogo>(
    `select id, nome, unidade_base from public.alimentos
      where not arquivado or id = any($1::uuid[])
      order by nome`,
    [usados]
  );
  const ids = alimentos.rows.map((a) => a.id);
  const [composicao, medidas] = await Promise.all([
    composicoes(ids),
    pool.query<{ id: string; alimento_id: string; nome_singular: string; nome_plural: string; quantidade: number }>(
      `select id, alimento_id, nome_singular, nome_plural, quantidade::float as quantidade
         from public.medidas_caseiras where alimento_id = any($1::uuid[])
        order by padrao desc, ordem, created_at`,
      [ids]
    ),
  ]);

  const catalogo: CatalogoDaIa = { alimentos: {}, refeicoes: {} };
  const codigoDoAlimento: Record<string, string> = {};
  const codigoDaMedida: Record<string, string> = {};
  const linhas: string[] = [];
  let contadorDeMedidas = 0;

  alimentos.rows.forEach((alimento, n) => {
    const codigo = `a${n + 1}`;
    codigoDoAlimento[alimento.id] = codigo;
    const doAlimento = medidas.rows.filter((m) => m.alimento_id === alimento.id);
    const medidasDoCatalogo: CatalogoDaIa["alimentos"][string]["medidas"] = {};
    const textoDasMedidas = doAlimento.map((m) => {
      contadorDeMedidas += 1;
      const codigoMedida = `m${contadorDeMedidas}`;
      codigoDaMedida[m.id] = codigoMedida;
      medidasDoCatalogo[codigoMedida] = { id: m.id, singular: m.nome_singular, plural: m.nome_plural, quantidade: m.quantidade };
      return `${codigoMedida}: ${m.nome_singular} = ${numero(m.quantidade)} ${alimento.unidade_base === "ml" ? "mL" : "g"}`;
    });
    catalogo.alimentos[codigo] = { id: alimento.id, nome: alimento.nome, unidade: alimento.unidade_base, medidas: medidasDoCatalogo };

    const valores = MACROS.map((macro) => {
      const valor = composicao[alimento.id]?.[macro]?.valor;
      const rotulo = { kcal: "kcal", proteinas: "P", carboidratos: "C", lipidios: "G" }[macro];
      return valor === null || valor === undefined ? `${rotulo} ?` : `${rotulo} ${numero(valor)}`;
    }).join(", ");
    linhas.push(`${codigo} | ${alimento.nome} | ${alimento.unidade_base === "ml" ? "mL" : "g"} | ${valores}${textoDasMedidas.length ? ` | ${textoDasMedidas.join("; ")}` : ""}`);
  });

  return { catalogo, texto: linhas.join("\n"), codigoDoAlimento, codigoDaMedida };
}

// ---------------------------------------------------------------------------
// Dieta aberta, metas e pedido em texto

async function textoDaDieta(documento: DocumentoDieta, catalogo: CatalogoDaIa, codigoDoAlimento: Record<string, string>, codigoDaMedida: Record<string, string>) {
  const comp = await composicoes(alimentosDoDocumento(documento));
  const linhas = [`Título: ${documento.titulo || "(sem título)"}; objetivo: ${documento.objetivo || "(não informado)"}`];
  if (documento.refeicoes.length === 0) linhas.push("(dieta vazia)");

  documento.refeicoes.forEach((refeicao, n) => {
    const codigo = `r${n + 1}`;
    catalogo.refeicoes[codigo] = refeicao.id;
    const principal = opcaoDeReferencia(refeicao);
    const totais = totaisDosItens(principal?.itens ?? [], comp, [...MACROS]);
    const totalTexto = MACROS.map((m) => `${{ kcal: "kcal", proteinas: "P", carboidratos: "C", lipidios: "G" }[m]} ${totais[m]?.valor === null || totais[m]?.valor === undefined ? "?" : numero(totais[m].valor as number)}`).join(", ");
    linhas.push(`${codigo} | ${refeicao.nome || `Refeição ${n + 1}`} | ${refeicao.horario ?? "sem horário"} | total da opção principal: ${totalTexto}`);
    if (refeicao.observacao?.trim()) linhas.push(`  observação: ${refeicao.observacao.trim().slice(0, 300)}`);
    refeicao.opcoes.forEach((opcao, o) => {
      linhas.push(`  ${opcao.id === refeicao.opcaoReferencia ? "opção principal" : `opção ${o + 1}`}:`);
      for (const item of opcao.itens) {
        const q = quantidadeDoItem(item);
        const unidade = item.unidade === "ml" ? "mL" : "g";
        const medida = item.medida ? `${numero(item.numeroMedidas ?? 0, 2)} × ${codigoDaMedida[item.medida.id] ?? "medida"} (${item.medida.singular}) = ` : "";
        const quantidade = q.efetiva ? `${medida}${numero(q.efetiva)} ${unidade}` : "sem quantidade";
        const nome = item.alimentoId ? `${codigoDoAlimento[item.alimentoId] ?? "?"} ${item.nomeOriginal ?? ""}` : `(sem alimento) ${item.sugeridoIa ?? ""}`;
        linhas.push(`   - ${nome} | ${quantidade}${item.referencia ? " | não confirmado" : ""}`);
      }
    });
  });
  return linhas.join("\n");
}

async function textoDasMetas(pedido: PedidoDaIa) {
  const m = pedido.metas;
  const partes: string[] = [];
  if (m.kcal) partes.push(`energia ${numero(m.kcal, 0)} kcal`);
  if (m.proteinas) partes.push(`proteínas ${numero(m.proteinas)} g`);
  if (m.carboidratos) partes.push(`carboidratos ${numero(m.carboidratos)} g`);
  if (m.lipidios) partes.push(`gorduras ${numero(m.lipidios)} g`);
  if (m.parametros.length) {
    const nomes = await obterPool().query<{ codigo: string; nome: string; unidade: string }>(
      "select codigo, nome, unidade from public.nutrientes where codigo = any($1::text[])",
      [m.parametros.map((p) => p.nutriente)]
    );
    for (const p of m.parametros) {
      const n = nomes.rows.find((linha) => linha.codigo === p.nutriente);
      partes.push(`${n?.nome ?? p.nutriente} ${CONDICOES[p.condicao]} ${numero(p.valor)} ${n?.unidade ?? ""}`.trim());
    }
  }
  return partes.join("; ");
}

// ---------------------------------------------------------------------------
// Conferência das metas (valores calculados pela base, nunca pela IA)

// Tempo de cada chamada: as duas (proposta e ajuste) cabem nos 120 s do nginx.
const TEMPO_POR_CHAMADA = 55_000;
const TOLERANCIA = { kcal: 0.05, macros: 0.1 };
const ROTULOS: Record<string, string> = { kcal: "kcal", proteinas: "P", carboidratos: "C", lipidios: "G" };

async function conferirMetas(refeicoes: Refeicao[], pedido: PedidoDaIa): Promise<string | null> {
  const m = pedido.metas;
  const parametros = m.parametros.map((p) => p.nutriente);
  if (!m.kcal && !m.proteinas && !m.carboidratos && !m.lipidios && parametros.length === 0) return null;
  if (refeicoes.length === 0) return null;

  const itens = refeicoes.flatMap((r) => opcaoDeReferencia(r)?.itens ?? []);
  const comp = await composicoes([...new Set(itens.map((i) => i.alimentoId).filter((id): id is string => Boolean(id)))]);
  const codigos = [...MACROS, ...parametros];
  const total = totaisDosItens(itens, comp, codigos);
  const valor = (codigo: string) => total[codigo]?.valor ?? null;
  const texto = (v: number | null | undefined) => (v === null || v === undefined ? "?" : numero(v, 0));

  const fora: string[] = [];
  for (const macro of MACROS) {
    const meta = m[macro];
    const atual = valor(macro);
    if (!meta || atual === null) continue;
    const tolerancia = macro === "kcal" ? TOLERANCIA.kcal : TOLERANCIA.macros;
    if (Math.abs(atual - meta) / meta > tolerancia) fora.push(`${macro === "kcal" ? "energia" : macro}: ${numero(atual, 0)} (meta ${numero(meta, 0)})`);
  }
  for (const p of m.parametros) {
    const atual = valor(p.nutriente);
    if (atual === null) continue;
    const longe =
      (p.condicao === "min" && atual < p.valor) ||
      (p.condicao === "max" && atual > p.valor) ||
      (p.condicao === "alvo" && Math.abs(atual - p.valor) / p.valor > TOLERANCIA.macros);
    if (longe) fora.push(`${p.nutriente}: ${numero(atual)} (${CONDICOES[p.condicao]} ${numero(p.valor)})`);
  }
  if (fora.length === 0) return null;

  const porRefeicao = refeicoes.map((r) => {
    const t = totaisDosItens(opcaoDeReferencia(r)?.itens ?? [], comp, [...MACROS]);
    return `${r.nome}: ${MACROS.map((x) => `${ROTULOS[x]} ${texto(t[x]?.valor)}`).join(", ")}`;
  });
  return [
    "CONFERÊNCIA DO SISTEMA (calculado pela base de alimentos, com as quantidades que você propôs):",
    ...porRefeicao,
    `TOTAL: ${codigos.map((c) => `${ROTULOS[c] ?? c} ${texto(valor(c))}`).join(", ")}`,
    `FORA DA META: ${fora.join("; ")}.`,
    "Ajuste as quantidades (e, se preciso, troque alimentos) para a energia ficar a no máximo 5% da meta e os macronutrientes a no máximo 10%, mantendo todas as regras, restrições e o alcance. Devolva a proposta completa no mesmo formato.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Pedido ao assistente

export type ResultadoDoAssistente = {
  proposta: PropostaDaIa;
  base: Awaited<ReturnType<typeof dadosDosAlimentos>>;
};

export async function pedirAoAssistente(dieta: LinhaDieta, pedido: PedidoDaIa, usuarioId: string | null): Promise<ResultadoDoAssistente> {
  const documento = dieta.rascunho;
  const [{ catalogo, texto, codigoDoAlimento, codigoDaMedida }, paciente] = await Promise.all([
    montarCatalogo(documento),
    contextoDoPaciente(dieta, documento),
  ]);
  const dietaTexto = await textoDaDieta(documento, catalogo, codigoDoAlimento, codigoDaMedida);
  const metas = await textoDasMetas(pedido);

  const alvo = pedido.refeicaoId ? documento.refeicoes.findIndex((r) => r.id === pedido.refeicaoId) : -1;
  const alcance = pedido.doZero
    ? INSTRUCOES_DO_ALCANCE.doZero
    : pedido.alcance === "refeicao" && alvo >= 0
      ? INSTRUCOES_DO_ALCANCE.refeicao(`r${alvo + 1}`, documento.refeicoes[alvo].nome || `Refeição ${alvo + 1}`)
      : INSTRUCOES_DO_ALCANCE.dieta;

  const contexto = [
    `PACIENTE (sem identificação): ${textoDoPaciente(paciente)}.`,
    pedido.contextoAnamnese ? `ANAMNESE (alergias, restrições e preferências, revisado pelo nutricionista):\n${pedido.contextoAnamnese}` : null,
    pedido.objetivo ? `OBJETIVO: ${pedido.objetivo}` : null,
    metas ? `METAS: ${metas}` : null,
    pedido.numeroRefeicoes ? `NÚMERO DE REFEIÇÕES: ${pedido.numeroRefeicoes}` : null,
    pedido.horarios ? `HORÁRIOS: ${pedido.horarios}` : null,
    pedido.restricoes ? `RESTRIÇÕES: ${pedido.restricoes}` : null,
    pedido.preferencias ? `PREFERÊNCIAS: ${pedido.preferencias}` : null,
    pedido.doZero ? null : `DIETA ABERTA:\n${dietaTexto}`,
    alcance,
    `PEDIDO DO NUTRICIONISTA: ${pedido.pedido || "elaborar a dieta conforme as metas acima."}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const modelo = modeloDoAssistente();
  let saida: unknown;
  if (iaSimulada()) {
    saida = saidaSimulada(catalogo, documento, pedido);
    await registrarUsoDaIa({ recurso: "assistente_dieta", modelo: "simulada", pacienteId: dieta.patient_id, usuarioId });
  } else {
    const cliente = clienteDaIa();
    const uso = { input_tokens: 0, output_tokens: 0 };
    // Instruções e catálogo primeiro: o começo igual entre pedidos aproveita
    // o cache de prompt da OpenAI (mais barato e mais rápido).
    const instrucoes = `${INSTRUCOES}\n\nCATÁLOGO (código | nome | unidade | por 100 g ou mL: kcal, P = proteínas g, C = carboidratos g, G = gorduras g | medidas caseiras):\n${texto}`;
    const chamar = async (entrada: ResponseInput) => {
      const resposta = await cliente.responses.create(
        {
          model: modelo,
          instructions: instrucoes,
          input: entrada,
          reasoning: { effort: "low" },
          text: { format: { type: "json_schema", name: "proposta_de_dieta", strict: true, schema: ESQUEMA_DA_SAIDA } },
        },
        { timeout: TEMPO_POR_CHAMADA, maxRetries: 0 }
      );
      uso.input_tokens += resposta.usage?.input_tokens ?? 0;
      uso.output_tokens += resposta.usage?.output_tokens ?? 0;
      return resposta.output_text;
    };

    try {
      const inicio = Date.now();
      const entrada: ResponseInput = [{ role: "user", content: contexto }];
      const primeira = await chamar(entrada);
      saida = JSON.parse(primeira);

      // Conferência pelo sistema: longe das metas, a IA recebe os totais
      // calculados pela base e ajusta uma vez (se ainda houver tempo).
      const conferencia = await conferirMetas(montarProposta(saida, catalogo, pedido).refeicoes, pedido);
      if (conferencia && Date.now() - inicio < TEMPO_POR_CHAMADA) {
        try {
          saida = JSON.parse(await chamar([...entrada, { role: "assistant", content: primeira }, { role: "user", content: conferencia }]));
        } catch (erro) {
          // Fica a primeira proposta; a prévia mostra a diferença para a meta.
          console.error("Ajuste da proposta da IA não concluído:", erro);
        }
      }
      await registrarUsoDaIa({ recurso: "assistente_dieta", modelo, uso, pacienteId: dieta.patient_id, usuarioId });
    } catch (erro) {
      await registrarUsoDaIa({ recurso: "assistente_dieta", modelo, uso, sucesso: false, pacienteId: dieta.patient_id, usuarioId });
      throw erro;
    }
  }

  const montada = montarProposta(saida, catalogo, pedido);
  const proposta: PropostaDaIa = {
    id: globalThis.crypto.randomUUID(),
    criadaEm: new Date().toISOString(),
    pedido,
    ...montada,
  };
  const ids = montada.refeicoes.flatMap((r) => r.opcoes.flatMap((o) => o.itens.map((i) => i.alimentoId))).filter((id): id is string => Boolean(id));
  return { proposta, base: await dadosDosAlimentos(ids) };
}

// ---------------------------------------------------------------------------
// Resposta simulada (IA_SIMULADA=1, só testes): exercita a mesma conferência
// da resposta real — código inexistente, alimento fora da base, medida.

function saidaSimulada(catalogo: CatalogoDaIa, documento: DocumentoDieta, pedido: PedidoDaIa) {
  const codigoDe = (padrao: RegExp) => Object.entries(catalogo.alimentos).find(([, a]) => padrao.test(a.nome))?.[0] ?? null;
  const banana = codigoDe(/^Banana, prata, crua/i);
  const arroz = codigoDe(/^Arroz, tipo 1, cozido/i);
  const feijao = codigoDe(/^Feij[aã]o, carioca, cozido/i);
  const leite = codigoDe(/^Leite, de vaca, desnatado, UHT/i);
  const codigoDoAlimento = Object.fromEntries(Object.entries(catalogo.alimentos).map(([c, a]) => [a.id, c]));
  const codigoDaMedida = (alimento: string, id: string) => Object.entries(catalogo.alimentos[alimento]?.medidas ?? {}).find(([, m]) => m.id === id)?.[0] ?? null;

  if (pedido.doZero) {
    return {
      mensagem: "Proposta simulada do zero.",
      refeicoes: [
        { codigo: null, nome: "Café da manhã", horario: "07:00", observacao: null, opcoes: [{ itens: [{ alimento: banana, descricao: "Banana prata", medida: null, numeroMedidas: null, quantidade: 100 }] }] },
        {
          codigo: null,
          nome: "Almoço",
          horario: "12:00",
          observacao: null,
          opcoes: [{ itens: [{ alimento: arroz, descricao: "Arroz cozido", medida: null, numeroMedidas: null, quantidade: 150 }, { alimento: feijao, descricao: "Feijão carioca", medida: null, numeroMedidas: null, quantidade: 100 }] }],
        },
        { codigo: null, nome: "Jantar", horario: "19:30", observacao: null, opcoes: [{ itens: [{ alimento: "a99999", descricao: "Tapioca recheada", medida: null, numeroMedidas: null, quantidade: 80 }] }] },
      ],
    };
  }

  const transformar = (codigo: string, n: number) => {
    const refeicao = documento.refeicoes[n];
    const principal = opcaoDeReferencia(refeicao)?.itens ?? [];
    type ItemSimulado = { alimento: string | null; descricao: string; medida: string | null; numeroMedidas: number | null; quantidade: number | null };
    const itens: ItemSimulado[] = principal
      .filter((item) => item.alimentoId)
      .map((item, i) => {
        const alimento = codigoDoAlimento[item.alimentoId as string] ?? null;
        const medida = item.medida && alimento ? codigoDaMedida(alimento, item.medida.id) : null;
        const fator = i === 0 ? 1.5 : 1;
        return {
          alimento,
          descricao: item.nomeOriginal ?? "",
          medida,
          numeroMedidas: medida ? (item.numeroMedidas ?? 1) * fator : null,
          quantidade: medida ? null : (quantidadeDoItem(item).efetiva ?? 100) * fator,
        };
      });
    if (itens.length > 1) itens.pop();
    itens.push({ alimento: banana, descricao: "Banana prata", medida: null, numeroMedidas: null, quantidade: 86 });
    return { codigo, nome: refeicao.nome, horario: refeicao.horario, observacao: null, opcoes: [{ itens }] };
  };

  if (pedido.alcance === "refeicao") {
    const n = documento.refeicoes.findIndex((r) => r.id === pedido.refeicaoId);
    return { mensagem: "Proposta simulada para uma refeição.", refeicoes: [transformar(`r${n + 1}`, n)] };
  }
  return {
    mensagem: "Proposta simulada para a dieta inteira.",
    refeicoes: [
      ...documento.refeicoes.map((_, n) => transformar(`r${n + 1}`, n)),
      {
        codigo: null,
        nome: "Ceia",
        horario: "21:30",
        observacao: "Opcional.",
        opcoes: [{ itens: [{ alimento: leite, descricao: "Leite desnatado", medida: null, numeroMedidas: null, quantidade: 200 }, { alimento: null, descricao: "Chá de camomila", medida: null, numeroMedidas: null, quantidade: 200 }] }],
      },
    ],
  };
}

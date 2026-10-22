import type { PoolClient } from "pg";
import { WHATSAPP_NUTRICIONISTA } from "@/lib/contato";
import { classificacaoDoScore, pontosDoRelatorio } from "@/lib/relatorios/pontos";
import { obterPool } from "./banco";
import { clienteDaIa, iaSimulada, registrarUsoDaIa } from "./ia";

// Devolutiva do relatório semanal pela IA, com rascunho e versões.
//
// - Tudo o que vai para a IA é montado aqui, a partir do relatório gravado:
//   pontos de atenção sem os removidos pelo nutricionista, score corrigido,
//   variação de peso (regra da tela: último relatório enviado com peso ou, sem
//   ele, o peso inicial) e consumo de álcool. Do paciente, só o primeiro nome
//   (D6).
// - O rascunho é do nutricionista: o paciente só vê o texto enviado
//   (patient_reports.feedback_text). Nada é enviado daqui.
// - Cada geração da IA vira uma versão; o texto editado à mão é guardado como
//   versão antes de ser substituído. Versões nunca são apagadas.
// - "geracao" identifica a geração mais recente: uma resposta atrasada da IA
//   (de um pedido anterior) é descartada.

const MODELO = "gpt-5.4-mini";

const RODAPE = `

💚 Ficou com alguma dúvida sobre sua devolutiva ou precisa de alguma orientação? Estou à disposição!

📲 Fale comigo pelo WhatsApp:
https://wa.me/${WHATSAPP_NUTRICIONISTA}`;

const INSTRUCOES = `
Você é um assistente de um nutricionista e deve escrever uma devolutiva semanal para o paciente.

Use somente as informações fornecidas abaixo.
Não invente informações.
Não altere pontuações, classificações ou conclusões já calculadas pelo sistema.
Escreva em português do Brasil.
Use linguagem acolhedora, profissional, clara e objetiva.
Fale diretamente com o paciente.
Valorize os pontos positivos, mas dê atenção clara ao que precisa melhorar.
Quando houver relação útil entre diferentes informações, conecte-as de forma natural.
Considere a pontuação e a classificação geral para definir o tom da devolutiva.
Se a classificação indicar baixa adesão ou atenção, reconheça os acertos, mas deixe claro que o resultado geral da semana precisa melhorar.
Não minimize pontos de atenção apenas porque existem pontos positivos.
Comente somente os pontos de atenção listados abaixo; não traga outros problemas que não estejam na lista.
Ao relacionar fatores, use linguagem prudente, como "pode contribuir", "pode estar relacionado" ou "pode influenciar", evitando afirmar causalidade com certeza.
Quando houver refeição fora do plano e o paciente informar quais alimentos consumiu e suas quantidades, estime aproximadamente as calorias consumidas nessa refeição e deixe sempre explícito que o valor é apenas uma estimativa. Se as informações fornecidas forem insuficientes para uma estimativa razoável, não invente quantidades nem calorias. Quando a estimativa for inferior a 500 kcal, explique de forma tranquilizadora que, embora tenha sido uma refeição fora do planejamento, esse episódio isolado tende a ter impacto limitado no resultado geral quando o restante do plano é seguido adequadamente. Quando a estimativa for igual ou superior a 500 kcal, sinalize com prudência que esse consumo representa um aporte energético mais relevante e, especialmente se ocorrer com frequência, pode comprometer a evolução e os resultados do planejamento alimentar. Não trate 500 kcal como um limite clínico exato nem afirme que uma única refeição determina o resultado da semana.
Peso: mencione sempre a variação de peso informada abaixo, em kg, de forma factual (por exemplo, "a variação de peso em relação ao registro anterior foi de −0,5 kg"). Não classifique a variação como positiva ou negativa, boa ou ruim, nem presuma que ganhar ou perder peso é desejável. Se a variação não estiver disponível, diga de forma neutra que não foi possível determinar a variação nesta semana.
Bebidas alcoólicas: comente sempre, conforme a resposta informada abaixo. Se houve consumo, mencione-o de forma individualizada, factual e sem julgamento. Se não houve, reconheça naturalmente que não houve consumo na semana. Se não houver resposta, diga de forma neutra que não há informação suficiente. Não invente frequência, volume, diagnóstico ou dependência, nem faça recomendações que não se apoiem nos dados.
Não prometa que o nutricionista fará ajustes, mudanças ou intervenções futuras.
Não diga "vamos ajustar", "vou ajustar" ou expressões semelhantes.
Não faça diagnóstico médico.
Não prescreva medicamentos.
Não mencione que você é uma inteligência artificial.
Escreva uma mensagem curta, adequada para ser enviada por WhatsApp.
Não use título.
Não utilize formatação Markdown.
Não utilize asteriscos, hashtags ou símbolos para destacar palavras.
Escreva todo o conteúdo em texto simples, pronto para ser enviado ao paciente.
`.trim();

function kg(valor: number) {
  return `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${Math.abs(valor).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>;

export async function dadosDaDevolutiva(reportId: string) {
  const pool = obterPool();
  const resultado = await pool.query<Linha>(
    `select r.*, p.name as paciente_nome, p.initial_weight as peso_inicial
       from public.patient_reports r join public.patients p on p.id = r.patient_id
      where r.id = $1`,
    [reportId]
  );
  const r = resultado.rows[0];
  if (!r) return null;

  // Regra da tela "Responder relatório": último relatório enviado com peso
  // (antes deste) ou, sem ele, o peso inicial do cadastro.
  const anterior = await pool.query<{ weight: string }>(
    `select weight from public.patient_reports
      where patient_id = $1 and status = 'enviado' and weight is not null and id <> $2 and created_at < $3
      order by created_at desc limit 1`,
    [r.patient_id, r.id, r.created_at]
  );
  const pesoAnterior = anterior.rows[0]?.weight ?? r.peso_inicial;
  const variacao = r.weight != null && pesoAnterior != null ? Number(r.weight) - Number(pesoAnterior) : null;

  const alcool =
    r.alcohol_use == null || r.alcohol_use === ""
      ? "Sem resposta do paciente."
      : r.alcohol_use === "nao"
        ? "O paciente informou que não consumiu bebidas alcoólicas nesta semana."
        : String(r.alcohol_use).startsWith("sim - ")
          ? `O paciente informou consumo de bebidas alcoólicas nesta semana: ${String(r.alcohol_use).replace("sim - ", "")}.`
          : "O paciente informou que consumiu bebidas alcoólicas nesta semana, sem informar a quantidade.";

  const { positivos, atencao } = pontosDoRelatorio(r);
  const score = r.adherence_score ?? null;
  return {
    relatorio: r,
    primeiroNome: String(r.paciente_nome ?? "").trim().split(/\s+/)[0] || "Paciente",
    score,
    classificacao: classificacaoDoScore(score),
    positivos,
    atencao: atencao.map((p) => p.texto),
    variacao: variacao === null || !Number.isFinite(variacao) ? null : Math.round(variacao * 10) / 10,
    alcool,
  };
}

export function textoDoPedido(d: NonNullable<Awaited<ReturnType<typeof dadosDaDevolutiva>>>) {
  const r = d.relatorio;
  return `${INSTRUCOES}

Paciente: ${d.primeiroNome}
Pontuação de adesão: ${d.score ?? "não calculada"}/100
Classificação da adesão: ${d.classificacao}

Pontos positivos:
${d.positivos.length ? d.positivos.map((p) => `- ${p}`).join("\n") : "- Nenhum ponto positivo destacado pelo sistema."}

Pontos de atenção:
${d.atencao.length ? d.atencao.map((p) => `- ${p}`).join("\n") : "- Nenhum ponto de atenção destacado pelo sistema."}

Variação de peso em relação ao registro anterior: ${d.variacao === null ? "não disponível (sem peso atual ou anterior válido)" : kg(d.variacao)}

Bebidas alcoólicas: ${d.alcool}

Refeições fora do plano:
Quantidade: ${r.off_plan_count ?? "Não informado"}
Alimentos e quantidades informados: ${r.off_plan_foods || "Não informado"}

Observações escritas pelo paciente:
${r.general_notes || "Nenhuma observação adicional."}
`;
}

async function pedirTexto(d: NonNullable<Awaited<ReturnType<typeof dadosDaDevolutiva>>>, usuarioId: string | null) {
  if (iaSimulada()) {
    await registrarUsoDaIa({ recurso: "devolutiva", modelo: "simulada", pacienteId: d.relatorio.patient_id, usuarioId });
    if (process.env.IA_SIMULADA_FALHA === "1") throw new Error("Falha simulada da IA.");
    return [
      `Olá, ${d.primeiroNome}! Devolutiva simulada (testes). Score ${d.score}/100 (${d.classificacao}).`,
      `Variação de peso: ${d.variacao === null ? "não foi possível determinar" : kg(d.variacao)}.`,
      `Álcool: ${d.alcool}`,
      `Pontos de atenção: ${d.atencao.length ? d.atencao.join(" | ") : "nenhum"}.`,
    ].join("\n");
  }
  try {
    const resposta = await clienteDaIa().responses.create({ model: MODELO, input: textoDoPedido(d) }, { timeout: 90_000, maxRetries: 0 });
    await registrarUsoDaIa({ recurso: "devolutiva", modelo: MODELO, uso: resposta.usage, pacienteId: d.relatorio.patient_id, usuarioId });
    const texto = resposta.output_text.trim();
    if (!texto) throw new Error("A IA não devolveu texto.");
    return texto;
  } catch (erro) {
    await registrarUsoDaIa({ recurso: "devolutiva", modelo: MODELO, sucesso: false, pacienteId: d.relatorio.patient_id, usuarioId });
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Rascunho e versões

export type Rascunho = { texto: string; revisao: number; editado: boolean; desatualizada: boolean; atualizado_em: string | null };
export type Versao = { id: string; numero: number; texto: string; origem: "ia" | "manual" | "restaurada"; criada_em: string };

export async function lerRascunho(reportId: string, cliente?: PoolClient): Promise<Rascunho> {
  const linha = await (cliente ?? obterPool()).query<Rascunho>(
    "select texto, revisao, editado, desatualizada, atualizado_em from public.devolutivas_rascunho where report_id = $1",
    [reportId]
  );
  return linha.rows[0] ?? { texto: "", revisao: 0, editado: false, desatualizada: false, atualizado_em: null };
}

export async function lerVersoes(reportId: string): Promise<Versao[]> {
  const linhas = await obterPool().query<Versao>(
    "select id, numero, texto, origem, criada_em from public.devolutivas_versoes where report_id = $1 order by numero desc",
    [reportId]
  );
  return linhas.rows;
}

async function guardarVersao(cliente: PoolClient, reportId: string, texto: string, origem: Versao["origem"], usuarioId: string | null) {
  await cliente.query(
    `insert into public.devolutivas_versoes (report_id, numero, texto, origem, criada_por)
     values ($1, (select coalesce(max(numero), 0) + 1 from public.devolutivas_versoes where report_id = $1), $2, $3, $4)`,
    [reportId, texto, origem, usuarioId]
  );
}

async function travarRascunho(cliente: PoolClient, reportId: string) {
  await cliente.query("insert into public.devolutivas_rascunho (report_id) values ($1) on conflict (report_id) do nothing", [reportId]);
  const linha = await cliente.query<Rascunho & { geracao: number }>(
    "select texto, revisao, editado, desatualizada, atualizado_em, geracao from public.devolutivas_rascunho where report_id = $1 for update",
    [reportId]
  );
  return linha.rows[0];
}

// O texto editado à mão vira versão antes de ser substituído.
async function preservarEdicao(cliente: PoolClient, reportId: string, atual: Rascunho, usuarioId: string | null) {
  if (atual.editado && atual.texto.trim()) await guardarVersao(cliente, reportId, atual.texto, "manual", usuarioId);
}

export async function salvarEdicao(reportId: string, texto: string, revisao: number) {
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const atual = await travarRascunho(cliente, reportId);
    if (atual.revisao !== revisao) {
      await cliente.query("rollback");
      return { conflito: true as const, rascunho: await lerRascunho(reportId) };
    }
    const gravado = await cliente.query<Rascunho>(
      `update public.devolutivas_rascunho
          set texto = $2, revisao = revisao + 1, editado = true, atualizado_em = now()
        where report_id = $1 returning texto, revisao, editado, desatualizada, atualizado_em`,
      [reportId, texto]
    );
    await cliente.query("commit");
    return { conflito: false as const, rascunho: gravado.rows[0] };
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

export async function restaurarVersao(reportId: string, versaoId: string, usuarioId: string | null) {
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const versao = await cliente.query<{ texto: string }>(
      "select texto from public.devolutivas_versoes where id = $1 and report_id = $2",
      [versaoId, reportId]
    );
    if (!versao.rows[0]) {
      await cliente.query("rollback");
      return null;
    }
    const atual = await travarRascunho(cliente, reportId);
    await preservarEdicao(cliente, reportId, atual, usuarioId);
    await guardarVersao(cliente, reportId, versao.rows[0].texto, "restaurada", usuarioId);
    // A restauração também invalida uma geração da IA ainda em andamento.
    const gravado = await cliente.query<Rascunho>(
      `update public.devolutivas_rascunho
          set texto = $2, revisao = revisao + 1, editado = false, geracao = geracao + 1, atualizado_em = now()
        where report_id = $1 returning texto, revisao, editado, desatualizada, atualizado_em`,
      [reportId, versao.rows[0].texto]
    );
    await cliente.query("commit");
    return gravado.rows[0];
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

export type ResultadoDaGeracao =
  | { ok: true; rascunho: Rascunho }
  | { ok: false; motivo: "descartada" | "falha"; rascunho: Rascunho };

// Gera (ou regenera) a devolutiva. motivo "remocao": se a IA falhar, o
// rascunho fica marcado como desatualizado (a tela avisa).
export async function gerarDevolutiva(reportId: string, usuarioId: string | null, motivo: "pedido" | "remocao" = "pedido"): Promise<ResultadoDaGeracao> {
  const pool = obterPool();
  await pool.query("insert into public.devolutivas_rascunho (report_id) values ($1) on conflict (report_id) do nothing", [reportId]);
  const inicio = await pool.query<{ geracao: number }>(
    "update public.devolutivas_rascunho set geracao = geracao + 1 where report_id = $1 returning geracao",
    [reportId]
  );
  const geracao = inicio.rows[0].geracao;

  let texto: string;
  try {
    const dados = await dadosDaDevolutiva(reportId);
    if (!dados) throw new Error("Relatório não encontrado.");
    texto = (await pedirTexto(dados, usuarioId)) + RODAPE;
  } catch (erro) {
    console.error("Erro ao gerar devolutiva:", erro);
    if (motivo === "remocao") {
      await pool.query("update public.devolutivas_rascunho set desatualizada = true where report_id = $1 and geracao = $2", [reportId, geracao]);
    }
    return { ok: false, motivo: "falha", rascunho: await lerRascunho(reportId) };
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const atual = await travarRascunho(cliente, reportId);
    if (atual.geracao !== geracao) {
      // Outra geração (ou restauração) começou depois desta: descarta.
      await cliente.query("rollback");
      return { ok: false, motivo: "descartada", rascunho: await lerRascunho(reportId) };
    }
    await preservarEdicao(cliente, reportId, atual, usuarioId);
    await guardarVersao(cliente, reportId, texto, "ia", usuarioId);
    const gravado = await cliente.query<Rascunho>(
      `update public.devolutivas_rascunho
          set texto = $2, revisao = revisao + 1, editado = false, desatualizada = false, atualizado_em = now()
        where report_id = $1 returning texto, revisao, editado, desatualizada, atualizado_em`,
      [reportId, texto]
    );
    await cliente.query("commit");
    return { ok: true, rascunho: gravado.rows[0] };
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

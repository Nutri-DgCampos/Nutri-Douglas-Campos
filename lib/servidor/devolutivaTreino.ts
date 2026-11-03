import { DIAS } from "@/lib/treino";
import { ROTULO_DA_CAUSA, ROTULO_DA_MODALIDADE, causasDaSemana, diferencaDeCarga, foraDaSemana, type DadosDoRelatorio } from "@/lib/treinoRelatorio";
import { obterPool } from "./banco";
import { clienteDaIa, iaSimulada, registrarUsoDaIa } from "./ia";
import type { ProfissionalDeTreino } from "./treinoAcesso";
import { lerRelatorio, type RelatorioDoTreino } from "./treinoRelatorios";

// Rascunho da devolutiva semanal do Treino pela IA (resposta B9). O
// profissional sempre revisa e envia; nada vai ao aluno daqui.
//
// - A IA recebe só o relatório consolidado da semana (sem nome completo).
// - Não diagnostica, não prescreve tratamento e não muda o treino.
// - "rascunho_geracao" descarta uma resposta atrasada de um pedido anterior.

const MODELO = "gpt-5.4-mini";

const INSTRUCOES = `
Você é um assistente de um profissional de educação física e deve escrever um rascunho de devolutiva semanal para o aluno, a partir do relatório de treino abaixo.

Use somente as informações fornecidas. Não invente dados, cargas, medições ou motivos.
Diferencie "sem registro" (o aluno não registrou) de "não concluído" (o aluno informou que não concluiu). Nunca afirme que o aluno não treinou quando apenas não há registro.
Não faça diagnóstico, não prescreva tratamento e não altere o treino. Para desconfortos, reconheça o relato e oriente procurar o profissional ou atendimento de saúde se persistir ou piorar.
Não prometa ajustes futuros ("vamos ajustar", "vou mudar").
Comente a adesão da semana, as cargas que mudaram em relação ao prescrito, as observações do aluno e as metas, quando houver.
Valorize o que foi bem feito e seja claro sobre o que precisa melhorar.
Escreva em português do Brasil, falando diretamente com o aluno, em tom acolhedor e objetivo.
Mensagem curta, em texto simples, sem título, sem Markdown, sem asteriscos ou hashtags.
Não mencione que você é uma inteligência artificial.
`.trim();

const SITUACAO: Record<string, string> = {
  concluido: "concluído",
  parcial: "parcialmente concluído",
  nao_concluido: "não concluído",
  reagendado: "reagendado (sem confirmação de execução)",
  sem_situacao: "valores salvos, sem informar se concluiu",
  sem_registro: "sem registro",
};

const nomeDoDia = (dia: string) => DIAS.find((d) => d.chave === dia)?.nome ?? dia;
const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR"));

export function textoDoPedidoDeTreino(r: RelatorioDoTreino) {
  const d: DadosDoRelatorio = r.dados;
  const primeiroNome = r.paciente.trim().split(/\s+/)[0] || "Aluno";
  const semana = { inicio: r.semana_inicio, fim: r.semana_fim };
  // Corrida e ciclismo (T3b): sessões planejadas e atividades registradas.
  const sessoesDeEndurance = (d.endurance?.sessoes ?? []).map((s) => {
    const situacao = s.extra ? "atividade sem sessão planejada (fora da adesão)" : foraDaSemana(s, semana) ? "feita ou reagendada para outra semana (fora da conta)" : SITUACAO[s.situacao];
    const planejado = s.planejado ? `planejado ${num(s.planejado.distancia_km)} km / ${num(s.planejado.duracao_min)} min${s.planejado.zona ? ` (${s.planejado.zona})` : ""}` : "";
    const g = s.registrado;
    const registrado = g ? `registrado ${num(g.distancia_km)} km em ${g.duracao_segundos === null ? "—" : `${Math.round(g.duracao_segundos / 60)} min`}${g.fc_media !== null ? `, FC média ${g.fc_media}` : ""}${g.rpe !== null ? `, RPE ${num(g.rpe)}` : ""}` : "sem registro";
    const linhas = [`- ${s.data_planejada ?? g?.data ?? ""} ${s.tipo ?? ""}: ${situacao}; ${planejado} ${registrado}`.replace(/\s+/g, " ")];
    if (g?.consumos.length) linhas.push(`  Consumo informado: ${g.consumos.join("; ")}`);
    if (s.motivo) linhas.push(`  Motivo informado: ${s.motivo}`);
    if (s.observacao) linhas.push(`  Observação do aluno: ${s.observacao}`);
    return linhas.join("\n");
  });
  const sessoes = d.sessoes.map((s) => {
    const linhas = [`- ${nomeDoDia(s.dia)} (${s.data_planejada}): ${SITUACAO[s.situacao]}${s.data_efetiva ? `, nova data ${s.data_efetiva}` : ""}`];
    if (s.motivo) linhas.push(`  Motivo informado: ${s.motivo}`);
    if (s.observacao) linhas.push(`  Observação do aluno: ${s.observacao}`);
    for (const e of s.exercicios) {
      const dif = diferencaDeCarga(e);
      if (!e.registrado) continue;
      linhas.push(
        `  ${e.nome}: prescrito ${num(e.prescrito.series)}x${num(e.prescrito.repeticoes)} com ${num(e.prescrito.carga_kg)} kg; registrado ${num(e.registrado.series)}x${num(e.registrado.repeticoes)} com ${num(e.registrado.carga_kg)} kg${dif ? ` (diferença ${dif.kg > 0 ? "+" : ""}${num(dif.kg)} kg)` : ""}`
      );
    }
    return linhas.join("\n");
  });
  const metas = d.metas.map((m) => `- ${m.texto}: ${r.metas_marcadas[m.id] === undefined ? "não avaliada pelo profissional" : r.metas_marcadas[m.id] ? "atingida" : "não atingida"}`);
  const causas = causasDaSemana({ ...r, meta_nao_atingida: Object.values(r.metas_marcadas).includes(false) }).map((c) => ROTULO_DA_CAUSA[c].replace("2 semanas seguidas ", "nesta semana: "));

  return `${INSTRUCOES}

Aluno: ${primeiroNome}
Modalidade: ${ROTULO_DA_MODALIDADE[r.modalidade ?? "musculacao"]}
Semana: ${r.semana_inicio} a ${r.semana_fim}
Calorias informadas pelo aluno: ${d.kcal === null || d.kcal === undefined ? "não informado" : `${num(d.kcal)} kcal`}
${r.em_pausa ? "Semana com pausa autorizada pelo profissional.\n" : ""}${r.sem_registros ? "O aluno não fez nenhum registro nesta semana.\n" : ""}Adesão: ${r.adesao === null ? "não calculada" : `${num(r.adesao)}% (mínimo combinado: ${r.adesao_minima}%)`}
Adesão da semana anterior: ${r.adesao_anterior === null ? "não disponível" : `${num(r.adesao_anterior)}%`}
Sessões planejadas: ${d.contagem.planejadas}; concluídas: ${d.contagem.concluidas}; parciais: ${d.contagem.parciais}; não concluídas: ${d.contagem.nao_concluidas}; sem registro: ${d.contagem.sem_registro}; reagendadas: ${d.contagem.reagendadas}
Pontos de atenção do sistema: ${causas.length ? causas.join("; ") : "nenhum"}

Sessões:
${[...sessoes, ...sessoesDeEndurance].length ? [...sessoes, ...sessoesDeEndurance].join("\n") : "- Nenhuma sessão planejada."}

Desconfortos relatados:
${d.desconfortos.length ? d.desconfortos.map((x) => `- ${x.data}: ${x.regiao}, intensidade ${x.intensidade}/10, ${x.conduta === "parei" ? "parou o exercício" : "continuou"}${x.exercicio ? `, no ${x.exercicio}` : ""}${x.comentario ? `. Comentário: ${x.comentario}` : ""}`).join("\n") : "- Nenhum."}

Metas:
${metas.length ? metas.join("\n") : "- Nenhuma meta cadastrada."}
`;
}

async function pedirTexto(r: RelatorioDoTreino, usuarioId: string) {
  if (iaSimulada()) {
    await registrarUsoDaIa({ recurso: "devolutiva_treino", modelo: "simulada", pacienteId: r.patient_id, usuarioId });
    if (process.env.IA_SIMULADA_FALHA === "1") throw new Error("Falha simulada da IA.");
    return `Olá, ${r.paciente.split(/\s+/)[0]}! Devolutiva de treino simulada (testes). Adesão: ${r.adesao === null ? "não calculada" : `${num(r.adesao)}%`}. Desconfortos: ${r.dados.desconfortos.length}.`;
  }
  try {
    const resposta = await clienteDaIa().responses.create({ model: MODELO, input: textoDoPedidoDeTreino(r) }, { timeout: 90_000, maxRetries: 0 });
    await registrarUsoDaIa({ recurso: "devolutiva_treino", modelo: MODELO, uso: resposta.usage, pacienteId: r.patient_id, usuarioId });
    const texto = resposta.output_text.trim();
    if (!texto) throw new Error("A IA não devolveu texto.");
    return texto;
  } catch (erro) {
    await registrarUsoDaIa({ recurso: "devolutiva_treino", modelo: MODELO, sucesso: false, pacienteId: r.patient_id, usuarioId });
    throw erro;
  }
}

export async function gerarRascunhoDoTreino(profissional: ProfissionalDeTreino, id: string) {
  const relatorio = await lerRelatorio(profissional, id);
  if (!relatorio || !relatorio.pode_responder) return { ok: false as const, motivo: "nao_encontrado" as const };

  const pool = obterPool();
  const inicio = await pool.query<{ rascunho_geracao: number }>(
    "update public.treino_relatorios set rascunho_geracao = rascunho_geracao + 1 where id = $1 returning rascunho_geracao",
    [id]
  );
  const geracao = inicio.rows[0].rascunho_geracao;

  let texto: string;
  try {
    texto = await pedirTexto(relatorio, profissional.usuarioId);
  } catch (erro) {
    console.error("Erro ao gerar devolutiva do treino:", erro);
    return { ok: false as const, motivo: "falha" as const };
  }

  const gravado = await pool.query<{ rascunho: string; rascunho_revisao: number }>(
    `update public.treino_relatorios set rascunho = $2, rascunho_revisao = rascunho_revisao + 1
      where id = $1 and rascunho_geracao = $3 and devolutiva is null
      returning rascunho, rascunho_revisao`,
    [id, texto, geracao]
  );
  if (!gravado.rows[0]) return { ok: false as const, motivo: "descartada" as const };
  return { ok: true as const, ...gravado.rows[0] };
}

// Relatório semanal do Treino (T3): regras puras, sem banco.
//
// Respostas do cliente (01/11/2026):
// - B4: adesão = sessões feitas ÷ sessões planejadas. "Parcialmente
//   concluído" vale meia sessão. Baixa adesão abaixo do mínimo do aluno
//   (padrão 60%, editável).
// - Reagendado (R4 e R4b, 03/11/2026): só conta se for feito na mesma
//   semana. Reagendado para uma data da mesma semana: conta como planejado
//   e, até o aluno confirmar (concluído ou parcial), não feito. Reagendado
//   ou feito (data efetiva) em outra semana: fica fora da conta das duas
//   semanas e aparece como "feito em outra semana" / "reagendado para outra
//   semana", sem penalizar nem somar.
// - Dia planejado sem registro conta como planejado e não feito, mas aparece
//   como "sem registro", nunca como "não concluído".
// - Semana sem nenhum registro: sem adesão (nulo), indicada como "sem
//   registros", sem afirmar que o aluno não treinou.
// - Lista de atenção (B7): duas semanas seguidas com a mesma causa: sem
//   registros, baixa adesão ou meta não atingida. Semanas em pausa (B6) não
//   contam e interrompem a sequência.

import type { ChaveDia, SituacaoDaSessao } from "./treino.ts";

export const ADESAO_MINIMA_PADRAO = 60;

export type ValoresDoExercicio = { series: number | null; repeticoes: number | null; carga_kg: number | null; descanso_segundos: number | null };

export type ExercicioDoRelatorio = {
  nome: string;
  prescrito: ValoresDoExercicio;
  registrado: ValoresDoExercicio | null;
  // Última carga registrada antes desta semana (mesmo exercício).
  anterior_kg: number | null;
};

export type SessaoDoRelatorio = {
  dia: ChaveDia;
  data_planejada: string;
  // "sem_registro": dia planejado sem nada registrado pelo aluno.
  situacao: SituacaoDaSessao | "sem_situacao" | "sem_registro";
  data_efetiva: string | null;
  motivo: string | null;
  observacao: string | null;
  exercicios: ExercicioDoRelatorio[];
};

export type DesconfortoDoRelatorio = {
  data: string;
  regiao: string;
  intensidade: number;
  conduta: "continuei" | "parei";
  exercicio: string | null;
  comentario: string | null;
};

export type ContagemDaSemana = {
  planejadas: number;
  feitas: number;
  concluidas: number;
  parciais: number;
  nao_concluidas: number;
  reagendadas: number;
  sem_situacao: number;
  sem_registro: number;
  // Reagendadas ou feitas em outra semana (R4b): fora da conta.
  outra_semana?: number;
};

export type RegistroDeEndurance = {
  data: string;
  distancia_km: number | null;
  duracao_segundos: number | null;
  fc_media: number | null;
  fc_max: number | null;
  rpe: number | null;
  kcal: number | null;
  elevacao_m: number | null;
  potencia_media: number | null;
  potencia_normalizada: number | null;
  cadencia_media: number | null;
  tss: number | null;
  equipamento: string | null;
  consumos: string[];
};

// Corrida e ciclismo (T3b): sessão planejada (ou atividade avulsa, "extra")
// com o que o aluno registrou.
export type SessaoEnduranceDoRelatorio = {
  dia: ChaveDia | null;
  data_planejada: string | null;
  tipo: string | null;
  descricao: string | null;
  planejado: { distancia_km: number | null; duracao_min: number | null; zona: string | null } | null;
  situacao: SessaoDoRelatorio["situacao"];
  data_efetiva: string | null;
  motivo: string | null;
  observacao: string | null;
  // Atividade registrada sem sessão planejada nesta semana: aparece, mas não
  // entra na adesão.
  extra: boolean;
  registrado: RegistroDeEndurance | null;
};

export type TotaisDeEndurance = {
  planejado_km: number | null;
  planejado_min: number | null;
  registrado_km: number | null;
  registrado_segundos: number | null;
  kcal: number | null;
  elevacao_m: number | null;
  tss: number | null;
  fc_media: number | null;
  rpe_medio: number | null;
};

export type DadosDoRelatorio = {
  // Ausente nos relatórios antigos (T3): musculação.
  modalidade?: "musculacao" | "corrida" | "ciclismo";
  prescricao: { id: string; origem: "externa" | "profissional"; versao: number } | null;
  sessoes: SessaoDoRelatorio[];
  desconfortos: DesconfortoDoRelatorio[];
  contagem: ContagemDaSemana;
  metas: { id: string; texto: string }[];
  pausa: { inicio: string; fim: string; motivo: string | null } | null;
  // Calorias informadas pelo aluno na semana (C1).
  kcal?: number | null;
  endurance?: {
    sessoes: SessaoEnduranceDoRelatorio[];
    totais: TotaisDeEndurance;
    equipamentos: { apelido: string; tipo: "tenis" | "bicicleta"; km_total: number; alerta_km: number | null }[];
  };
};

const PESO: Partial<Record<SessaoDoRelatorio["situacao"], number>> = { concluido: 1, parcial: 0.5 };

// A sessão foi (ou será) feita fora da semana do relatório? (R4b)
export function foraDaSemana(s: Pick<SessaoDoRelatorio, "situacao" | "data_efetiva">, semana: { inicio: string; fim: string }) {
  return Boolean(s.data_efetiva) && s.situacao !== "sem_registro" && (s.data_efetiva! < semana.inicio || s.data_efetiva! > semana.fim);
}

// Contagem e adesão da semana. "temRegistro": o aluno registrou algo na
// semana (sessão ou relato de desconforto).
export function contarSemana(sessoes: Pick<SessaoDoRelatorio, "situacao" | "data_efetiva">[], semana: { inicio: string; fim: string }): ContagemDaSemana {
  const c: ContagemDaSemana = { planejadas: 0, feitas: 0, concluidas: 0, parciais: 0, nao_concluidas: 0, reagendadas: 0, sem_situacao: 0, sem_registro: 0, outra_semana: 0 };
  for (const s of sessoes) {
    if (foraDaSemana(s, semana)) {
      c.outra_semana! += 1;
      continue;
    }
    c.planejadas += 1;
    if (s.situacao === "reagendado") {
      // Para a mesma semana: planejada, ainda não feita.
      c.reagendadas += 1;
      continue;
    }
    c.feitas += PESO[s.situacao] ?? 0;
    if (s.situacao === "concluido") c.concluidas += 1;
    else if (s.situacao === "parcial") c.parciais += 1;
    else if (s.situacao === "nao_concluido") c.nao_concluidas += 1;
    else if (s.situacao === "sem_situacao") c.sem_situacao += 1;
    else c.sem_registro += 1;
  }
  return c;
}

export function adesaoDaSemana(contagem: ContagemDaSemana, temRegistro: boolean): number | null {
  if (!temRegistro || contagem.planejadas === 0) return null;
  return Math.round((contagem.feitas / contagem.planejadas) * 1000) / 10;
}

export function diferencaDeCarga(e: ExercicioDoRelatorio): { kg: number; pct: number | null } | null {
  const atual = e.registrado?.carga_kg;
  const base = e.prescrito.carga_kg;
  if (atual == null || base == null) return null;
  const kg = Math.round((atual - base) * 100) / 100;
  return { kg, pct: base > 0 ? Math.round((kg / base) * 1000) / 10 : null };
}

// ---------------------------------------------------------------------------
// Lista de atenção

export type CausaDeAtencao = "sem_registros" | "baixa_adesao" | "meta_nao_atingida";

export const ROTULO_DA_CAUSA: Record<CausaDeAtencao, string> = {
  sem_registros: "2 semanas seguidas sem registros",
  baixa_adesao: "2 semanas seguidas com baixa adesão",
  meta_nao_atingida: "2 semanas seguidas com meta não atingida",
};

export type SemanaParaAtencao = {
  semana_inicio: string;
  sem_registros: boolean;
  adesao: number | null;
  adesao_minima: number;
  em_pausa: boolean;
  // Alguma meta marcada como não atingida nesta semana.
  meta_nao_atingida: boolean;
};

export function causasDaSemana(s: SemanaParaAtencao): CausaDeAtencao[] {
  if (s.em_pausa) return [];
  const causas: CausaDeAtencao[] = [];
  if (s.sem_registros) causas.push("sem_registros");
  if (s.adesao !== null && s.adesao < s.adesao_minima) causas.push("baixa_adesao");
  if (s.meta_nao_atingida) causas.push("meta_nao_atingida");
  return causas;
}

// Causas presentes nas duas semanas fechadas mais recentes, que precisam ser
// consecutivas (sem semana faltando entre elas).
export function causasDeAtencao(semanas: SemanaParaAtencao[]): { causas: CausaDeAtencao[]; semanas: string[] } {
  const ordenadas = [...semanas].sort((a, b) => b.semana_inicio.localeCompare(a.semana_inicio));
  const [ultima, penultima] = ordenadas;
  if (!ultima || !penultima) return { causas: [], semanas: [] };
  const intervalo = (Date.parse(`${ultima.semana_inicio}T12:00:00Z`) - Date.parse(`${penultima.semana_inicio}T12:00:00Z`)) / 86_400_000;
  if (intervalo !== 7) return { causas: [], semanas: [] };
  const anteriores = new Set(causasDaSemana(penultima));
  const causas = causasDaSemana(ultima).filter((c) => anteriores.has(c));
  return { causas, semanas: causas.length ? [penultima.semana_inicio, ultima.semana_inicio] : [] };
}

// Atraso do profissional (SPEC): 2 ou mais relatórios do mesmo aluno sem
// devolutiva.
export const LIMITE_DE_ATRASO = 2;

// "2026-11-01" → "01/11".
export function diaMes(dataISO: string) {
  const [, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}`;
}

export function rotuloDaSemana(inicio: string, fim: string) {
  return `${diaMes(inicio)} a ${diaMes(fim)}`;
}

export function formatarAdesao(adesao: number | null) {
  return adesao === null ? "—" : `${adesao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

// ---------------------------------------------------------------------------
// Nota da semana (resposta Q1): 60% adesão, 25% metas e 15% manter ou
// evoluir em relação à semana anterior. Sem dado de alguma parte, a nota é
// "N/A" (null), nunca zero; as partes disponíveis aparecem separadas. Não é
// avaliação de saúde.

export const PESOS_DA_NOTA = { adesao: 60, metas: 25, evolucao: 15 } as const;

export type NotaDaSemana = {
  nota: number | null;
  partes: { adesao: number | null; metas: number | null; evolucao: number | null };
};

export function notaDaSemana(entrada: { adesao: number | null; metas: boolean[]; adesaoAnterior: number | null }): NotaDaSemana {
  const adesao = entrada.adesao === null ? null : Math.min(100, entrada.adesao);
  const metas = entrada.metas.length ? (entrada.metas.filter(Boolean).length / entrada.metas.length) * 100 : null;
  // Manter ou evoluir vale a parte inteira; cair, nada.
  const evolucao = entrada.adesao === null || entrada.adesaoAnterior === null ? null : entrada.adesao >= entrada.adesaoAnterior ? 100 : 0;
  const nota =
    adesao === null || metas === null || evolucao === null
      ? null
      : Math.round((adesao * PESOS_DA_NOTA.adesao + metas * PESOS_DA_NOTA.metas + evolucao * PESOS_DA_NOTA.evolucao) / 100);
  return { nota, partes: { adesao, metas: metas === null ? null : Math.round(metas), evolucao } };
}

// ---------------------------------------------------------------------------
// Pontos positivos e de atenção (resposta Q3): só fatos calculados, sem
// conclusões de saúde.

export type FatosDaSemana = {
  semRegistros: boolean;
  emPausa: boolean;
  adesao: number | null;
  adesaoMinima: number;
  adesaoAnterior: number | null;
  contagem: ContagemDaSemana;
  metas: { texto: string; atingida: boolean | undefined }[];
  desconfortos: DesconfortoDoRelatorio[];
  // Musculação: exercícios com carga registrada acima da prescrita.
  cargasAcima: string[];
  // Corrida e ciclismo: distância planejada e registrada (km).
  distancia?: { planejada: number | null; registrada: number | null };
};

export function pontosDaSemana(f: FatosDaSemana): { positivos: string[]; atencao: string[] } {
  const positivos: string[] = [];
  const atencao: string[] = [];
  const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (f.semRegistros) atencao.push("Sem registros na semana (não quer dizer que não treinou).");
  if (f.adesao !== null) {
    if (f.adesao >= f.adesaoMinima) positivos.push(`Adesão de ${pct(f.adesao)}, dentro do mínimo combinado (${f.adesaoMinima}%).`);
    else atencao.push(`Adesão de ${pct(f.adesao)}, abaixo do mínimo combinado (${f.adesaoMinima}%).`);
    if (f.adesaoAnterior !== null && f.adesao > f.adesaoAnterior) positivos.push(`Adesão maior que na semana anterior (${pct(f.adesaoAnterior)}).`);
  }
  if (f.contagem.planejadas > 0 && f.contagem.concluidas === f.contagem.planejadas) positivos.push("Todas as sessões planejadas foram concluídas.");
  if (f.contagem.nao_concluidas) atencao.push(`${f.contagem.nao_concluidas} ${f.contagem.nao_concluidas === 1 ? "sessão não concluída" : "sessões não concluídas"}.`);
  if (f.contagem.reagendadas) atencao.push(`${f.contagem.reagendadas} ${f.contagem.reagendadas === 1 ? "sessão reagendada" : "sessões reagendadas"} sem confirmação de execução.`);
  for (const m of f.metas) {
    if (m.atingida === true) positivos.push(`Meta atingida: ${m.texto}`);
    if (m.atingida === false) atencao.push(`Meta não atingida: ${m.texto}`);
  }
  if (f.desconfortos.length) {
    const maior = Math.max(...f.desconfortos.map((d) => d.intensidade));
    atencao.push(`${f.desconfortos.length} ${f.desconfortos.length === 1 ? "desconforto relatado" : "desconfortos relatados"} (maior intensidade ${maior}/10).`);
  }
  if (f.cargasAcima.length) atencao.push(`Carga registrada acima da prescrita: ${f.cargasAcima.join(", ")}.`);
  if (f.distancia?.planejada && f.distancia.registrada !== null) {
    const p = (f.distancia.registrada / f.distancia.planejada) * 100;
    const texto = `Distância registrada de ${f.distancia.registrada.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km para ${f.distancia.planejada.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km planejados (${pct(Math.round(p * 10) / 10)}).`;
    if (p >= 100) positivos.push(texto);
    else atencao.push(texto);
  }
  return { positivos, atencao };
}

export const ROTULO_DA_MODALIDADE: Record<"musculacao" | "corrida" | "ciclismo", string> = {
  musculacao: "Musculação",
  corrida: "Corrida",
  ciclismo: "Ciclismo",
};
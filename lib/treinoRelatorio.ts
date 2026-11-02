// Relatório semanal do Treino (T3): regras puras, sem banco.
//
// Respostas do cliente (01/11/2026):
// - B4: adesão = sessões feitas ÷ sessões planejadas. "Parcialmente
//   concluído" vale meia sessão. Baixa adesão abaixo do mínimo do aluno
//   (padrão 60%, editável).
// - Reagendado: conta como feito quando o aluno confirma a execução (muda a
//   situação para concluído ou parcial). Enquanto continua "reagendado", não
//   entra na conta (nem planejada nem feita) e aparece no relatório como
//   reagendado, sem confirmação.
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
};

export type DadosDoRelatorio = {
  prescricao: { id: string; origem: "externa" | "profissional"; versao: number } | null;
  sessoes: SessaoDoRelatorio[];
  desconfortos: DesconfortoDoRelatorio[];
  contagem: ContagemDaSemana;
  metas: { id: string; texto: string }[];
  pausa: { inicio: string; fim: string; motivo: string | null } | null;
};

const PESO: Partial<Record<SessaoDoRelatorio["situacao"], number>> = { concluido: 1, parcial: 0.5 };

// Contagem e adesão da semana. "temRegistro": o aluno registrou algo na
// semana (sessão ou relato de desconforto).
export function contarSemana(sessoes: Pick<SessaoDoRelatorio, "situacao">[]): ContagemDaSemana {
  const c: ContagemDaSemana = { planejadas: 0, feitas: 0, concluidas: 0, parciais: 0, nao_concluidas: 0, reagendadas: 0, sem_situacao: 0, sem_registro: 0 };
  for (const s of sessoes) {
    if (s.situacao === "reagendado") {
      c.reagendadas += 1;
      continue;
    }
    c.planejadas += 1;
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

// Cronômetro regressivo de descanso do aluno (SPEC complementar 06/11,
// item 3). Regras puras, sem tela.
//
// - O tempo restante sai do instante final (relógio), não de contagem de
//   ticks: trocar de aba ou a tela apagar por um tempo não atrasa nem
//   adianta a contagem.
// - Não grava nada: não é dado clínico nem registro de série.

export type Cronometro = {
  chave: string; // exercício (sessão + índice)
  totalMs: number;
  // Rodando: instante (ms) em que chega a zero. Pausado: null.
  fimEm: number | null;
  // Pausado: o que faltava ao pausar.
  restanteMs: number;
};

export const DESCANSO_MAXIMO_S = 900;

// Descanso prescrito em segundos, ou null quando vazio ou inválido (não se
// inventa um valor).
export function descansoValido(segundos: unknown): number | null {
  return typeof segundos === "number" && Number.isInteger(segundos) && segundos > 0 && segundos <= DESCANSO_MAXIMO_S ? segundos : null;
}

export function iniciar(chave: string, segundos: number, agora: number): Cronometro {
  const totalMs = segundos * 1000;
  return { chave, totalMs, fimEm: agora + totalMs, restanteMs: totalMs };
}

export function restante(c: Cronometro, agora: number) {
  return Math.max(0, c.fimEm === null ? c.restanteMs : c.fimEm - agora);
}

export const rodando = (c: Cronometro, agora: number) => c.fimEm !== null && restante(c, agora) > 0;
export const terminou = (c: Cronometro, agora: number) => restante(c, agora) === 0;

export function pausar(c: Cronometro, agora: number): Cronometro {
  return c.fimEm === null ? c : { ...c, fimEm: null, restanteMs: restante(c, agora) };
}

export function retomar(c: Cronometro, agora: number): Cronometro {
  if (c.fimEm !== null || c.restanteMs <= 0) return c;
  return { ...c, fimEm: agora + c.restanteMs };
}

// Volta ao tempo cheio e já começa a contar.
export function reiniciar(c: Cronometro, agora: number): Cronometro {
  return { ...c, fimEm: agora + c.totalMs, restanteMs: c.totalMs };
}

// Ajuste manual (ex.: +15 s / −15 s), sem mudar a prescrição.
export function ajustar(c: Cronometro, deltaMs: number, agora: number): Cronometro {
  const novo = Math.min(DESCANSO_MAXIMO_S * 1000, Math.max(0, restante(c, agora) + deltaMs));
  return c.fimEm === null ? { ...c, restanteMs: novo } : { ...c, fimEm: agora + novo };
}

// "mm:ss", arredondando para cima (01:00 até o último segundo cheio).
export function mmss(ms: number) {
  const s = Math.ceil(Math.max(0, ms) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

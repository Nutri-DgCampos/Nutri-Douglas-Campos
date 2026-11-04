// Contratos do Treino (T8): regras puras, sem banco.
//
// - Contrato cobre de "inicio" a "vencimento"; depois dele vale a
//   tolerância do profissional (G4).
// - Em dia: hoje dentro do contrato (com a tolerância) e pagamento
//   confirmado; sem confirmação, só até "inicio + tolerância" (o aluno tem o
//   mesmo prazo para pagar a primeira vez). Comprovante anexado não é
//   pagamento confirmado (SPEC 12).
// - Bloqueio (R9): o aluno tem contratos de Treino e nenhum está em dia.
//   Aluno sem contrato de Treino não é bloqueado (como antes da T8).

export type ContratoParaRegra = {
  inicio: string; // AAAA-MM-DD
  vencimento: string;
  tolerancia_dias: number;
  confirmado_em: string | null;
  comprovante_em?: string | null;
  cancelado_em: string | null;
};

export type SituacaoDoContrato =
  | "cancelado"
  | "futuro"
  | "em_dia"
  | "em_tolerancia"
  | "aguardando_pagamento"
  | "comprovante_enviado"
  | "vencido"
  | "sem_pagamento";

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export const limiteDoContrato = (c: ContratoParaRegra) => somarDias(c.vencimento, c.tolerancia_dias);
export const limiteDoPrimeiroPagamento = (c: ContratoParaRegra) => somarDias(c.inicio, c.tolerancia_dias);

export function situacaoDoContrato(c: ContratoParaRegra, hoje: string): SituacaoDoContrato {
  if (c.cancelado_em) return "cancelado";
  if (hoje < c.inicio) return c.confirmado_em ? "futuro" : c.comprovante_em ? "comprovante_enviado" : "aguardando_pagamento";
  if (c.confirmado_em) {
    if (hoje <= c.vencimento) return "em_dia";
    return hoje <= limiteDoContrato(c) ? "em_tolerancia" : "vencido";
  }
  if (hoje > limiteDoContrato(c)) return "vencido";
  if (hoje <= limiteDoPrimeiroPagamento(c)) return c.comprovante_em ? "comprovante_enviado" : "aguardando_pagamento";
  return "sem_pagamento";
}

// O contrato libera o Treino hoje?
export function liberaHoje(c: ContratoParaRegra, hoje: string) {
  const s = situacaoDoContrato(c, hoje);
  return s === "em_dia" || s === "em_tolerancia" || ((s === "aguardando_pagamento" || s === "comprovante_enviado") && hoje >= c.inicio);
}

export function acessoAoTreino(contratos: ContratoParaRegra[], hoje: string): { bloqueado: boolean } {
  const validos = contratos.filter((c) => !c.cancelado_em);
  if (!validos.length) return { bloqueado: false };
  return { bloqueado: !validos.some((c) => liberaHoje(c, hoje)) };
}

export const ROTULO_DA_SITUACAO: Record<SituacaoDoContrato, string> = {
  cancelado: "Cancelado",
  futuro: "Pago, começa depois",
  em_dia: "Em dia",
  em_tolerancia: "Vencido, dentro da tolerância",
  aguardando_pagamento: "Aguardando pagamento",
  comprovante_enviado: "Comprovante enviado, aguardando confirmação",
  vencido: "Vencido",
  sem_pagamento: "Pagamento não confirmado",
};

export function textoDoPreco(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export const DURACOES = [
  { dias: 30, rotulo: "Mensal (30 dias)" },
  { dias: 90, rotulo: "Trimestral (90 dias)" },
  { dias: 180, rotulo: "Semestral (180 dias)" },
  { dias: 365, rotulo: "Anual (365 dias)" },
];

export function rotuloDaDuracao(dias: number) {
  return DURACOES.find((d) => d.dias === dias)?.rotulo ?? `${dias} dias`;
}

// Vencimento de um contrato que começa em "inicio" com a duração do plano.
export const vencimentoDe = (inicio: string, duracaoDias: number) => somarDias(inicio, duracaoDias - 1);

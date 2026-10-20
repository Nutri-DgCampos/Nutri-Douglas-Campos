// Acesso dos pacientes ao aplicativo: indicador de interesse e retenção.
//
// Duas leituras independentes:
// - situação: tem acesso? recebe os avisos no celular?
// - dias sem abrir o app, em faixas de cor.

export type Engajamento = {
  id: string;
  tem_acesso: boolean;
  aparelhos: number;
  ultimo_acesso_em: string | null;
  app_instalado_em: string | null;
};

export type Situacao = "sem_acesso" | "sem_notificacoes" | "recebe_avisos";

export const SITUACOES: Record<Situacao, { rotulo: string; descricao: string; classe: string }> = {
  sem_acesso: {
    rotulo: "Sem acesso",
    descricao: "Ainda não tem login no aplicativo. Use “Criar acesso” na ficha.",
    classe: "bg-gray-100 text-gray-700",
  },
  sem_notificacoes: {
    rotulo: "Sem notificações",
    descricao: "Tem acesso, mas não ativou os avisos no celular.",
    classe: "bg-amber-100 text-amber-800",
  },
  recebe_avisos: {
    rotulo: "Recebe avisos",
    descricao: "Ativou os avisos em pelo menos um aparelho.",
    classe: "bg-primary-50 text-primary-800",
  },
};

export function situacaoDe(e: Pick<Engajamento, "tem_acesso" | "aparelhos">): Situacao {
  if (!e.tem_acesso) return "sem_acesso";
  return e.aparelhos > 0 ? "recebe_avisos" : "sem_notificacoes";
}

// Faixas de dias sem abrir o app. Até 7 dias é o esperado para quem envia
// relatório semanal; acima de 30, o paciente provavelmente se afastou.
export const FAIXAS = [
  { ate: 7, faixa: "em_dia", rotulo: "Em dia", classe: "bg-green-100 text-green-800", ponto: "bg-green-500" },
  { ate: 14, faixa: "atencao", rotulo: "Atenção", classe: "bg-yellow-100 text-yellow-800", ponto: "bg-yellow-400" },
  { ate: 30, faixa: "alerta", rotulo: "Afastando", classe: "bg-orange-100 text-orange-800", ponto: "bg-orange-500" },
  { ate: Infinity, faixa: "inativo", rotulo: "Inativo", classe: "bg-red-100 text-red-800", ponto: "bg-red-500" },
] as const;

export const SEM_REGISTRO = { faixa: "sem_registro", rotulo: "Sem registro", classe: "bg-gray-100 text-gray-600", ponto: "bg-gray-300" } as const;

export function diasSemAcesso(ultimoAcesso: string | null, agora = new Date()) {
  if (!ultimoAcesso) return null;
  return Math.max(0, Math.floor((agora.getTime() - new Date(ultimoAcesso).getTime()) / 86_400_000));
}

export function faixaDeAcesso(dias: number | null) {
  if (dias === null) return SEM_REGISTRO;
  return FAIXAS.find((f) => dias <= f.ate) ?? FAIXAS[FAIXAS.length - 1];
}

export function textoDosDias(dias: number | null) {
  if (dias === null) return "Nunca acessou";
  if (dias === 0) return "Acessou hoje";
  if (dias === 1) return "Acessou ontem";
  return `${dias} dias sem acessar`;
}

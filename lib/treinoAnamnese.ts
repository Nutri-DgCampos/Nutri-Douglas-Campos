// Anamnese do profissional do Treino (T6, resposta R6): perguntas abertas
// aprovadas, sem nota nem classificação automática. Cada profissional tem a
// própria anamnese do aluno, que os outros não veem (F2).

export const PERGUNTAS_DA_ANAMNESE = [
  { chave: "objetivo", pergunta: "Qual é o objetivo com o treino?" },
  { chave: "historico", pergunta: "Histórico de treino (o que já praticou, há quanto tempo, com que frequência)" },
  { chave: "lesoes", pergunta: "Lesões e cirurgias" },
  { chave: "medicamentos", pergunta: "Medicamentos em uso" },
  { chave: "liberacao_medica", pergunta: "Liberação médica para atividade física" },
  { chave: "disponibilidade", pergunta: "Disponibilidade semanal (dias e horários)" },
  { chave: "observacoes", pergunta: "Outras observações" },
] as const;

export type ChaveDaAnamnese = (typeof PERGUNTAS_DA_ANAMNESE)[number]["chave"];
export type RespostasDaAnamnese = Partial<Record<ChaveDaAnamnese, string>>;

export const LIMITE_DA_RESPOSTA = 2000;

export function validarRespostas(valor: unknown): { respostas: RespostasDaAnamnese } | { erro: string } {
  const d = (valor ?? {}) as Record<string, unknown>;
  const respostas: RespostasDaAnamnese = {};
  for (const { chave } of PERGUNTAS_DA_ANAMNESE) {
    const v = d[chave];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v !== "string") return { erro: "Resposta inválida." };
    const t = v.trim();
    if (t.length > LIMITE_DA_RESPOSTA) return { erro: `Resposta com mais de ${LIMITE_DA_RESPOSTA} caracteres.` };
    if (t) respostas[chave] = t;
  }
  return { respostas };
}

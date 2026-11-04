// Números do relatório semanal digitados pelo paciente (peso, água e sono).
//
// 04/11/2026: uma paciente digitou o peso "76500" (queria 76,5): o banco
// recusou (weight é numeric(6,2)) e a tela só disse "Erro ao salvar
// relatório". Agora o campo aceita vírgula ou ponto, e valores fora de uma
// faixa plausível são recusados antes do envio, com a explicação. Nada é
// corrigido sozinho: o paciente confere e digita de novo.

export function lerDecimal(texto: string): number | null | undefined {
  const limpo = texto.trim().replace(/\s/g, "");
  if (!limpo) return null;
  // Uma vírgula ou um ponto como separador decimal; nada de milhar.
  if (!/^\d+([.,]\d+)?$/.test(limpo)) return undefined;
  return Number(limpo.replace(",", "."));
}

const FAIXAS = {
  peso: { minimo: 20, maximo: 400, mensagem: "Confira o peso: informe em quilos, com vírgula nos decimais (ex.: 76,5)." },
  agua: { minimo: 0, maximo: 15, mensagem: "Confira a água: informe em litros, com vírgula nos decimais (ex.: 2,5)." },
  sono: { minimo: 0, maximo: 24, mensagem: "Confira as horas de sono: de 0 a 24, com vírgula nos decimais (ex.: 7,5)." },
} as const;

export type Medida = keyof typeof FAIXAS;

// Valor pronto para gravar (null quando vazio) ou a mensagem do problema.
export function conferirMedida(tipo: Medida, texto: string): { valor: number | null } | { erro: string } {
  const faixa = FAIXAS[tipo];
  const valor = lerDecimal(texto);
  if (valor === null) return { valor: null };
  if (valor === undefined || valor < faixa.minimo || valor > faixa.maximo) return { erro: faixa.mensagem };
  return { valor };
}

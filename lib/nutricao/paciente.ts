import { hojeNoBrasil } from "@/lib/cronograma";

// Dados do paciente usados pelo Módulo de Nutrição.

export const SEXOS = [
  { valor: "masculino", rotulo: "Masculino" },
  { valor: "feminino", rotulo: "Feminino" },
] as const;

export type Sexo = (typeof SEXOS)[number]["valor"];

export function rotuloDoSexo(sexo: string | null | undefined) {
  return SEXOS.find((item) => item.valor === sexo)?.rotulo ?? null;
}

// Idade em anos completos numa data (padrão: hoje). Datas "AAAA-MM-DD".
// Nunca é gravada: sempre calculada a partir da data de nascimento.
export function idadeEm(nascimento: string | null | undefined, referencia?: string) {
  if (!nascimento) return null;

  const [anoN, mesN, diaN] = nascimento.split("-").map(Number);
  const ref = referencia ?? hojeNoBrasil();
  const [anoR, mesR, diaR] = ref.split("-").map(Number);

  if (!anoN || !anoR) return null;

  let idade = anoR - anoN;
  if (mesR < mesN || (mesR === mesN && diaR < diaN)) idade -= 1;

  return idade >= 0 ? idade : null;
}

export const TIPOS_CONSULTA = [
  { valor: "primeira", rotulo: "Primeira consulta" },
  { valor: "retorno", rotulo: "Retorno" },
] as const;

export function rotuloDoTipo(tipo: string) {
  return TIPOS_CONSULTA.find((item) => item.valor === tipo)?.rotulo ?? tipo;
}

export function formatarData(dataISO: string | null | undefined) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

export const ORIGENS_DE_PESO: Record<string, string> = {
  cadastro: "Peso inicial (cadastro)",
  evolucao: "Evolução registrada",
  relatorio: "Relatório semanal",
  avaliacao: "Avaliação física",
};

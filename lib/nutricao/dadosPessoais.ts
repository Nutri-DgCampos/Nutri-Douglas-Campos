import { hojeNoBrasil } from "../cronograma.ts";
import { SEXOS } from "./paciente.ts";

// Dados pessoais comuns do cadastro (nascimento, sexo, altura e e-mail de
// contato): usados pela Nutrição e pelo Treino, nos cálculos e na avaliação
// física. Sem nada financeiro. Regras únicas para a tela e para o servidor
// (antes ficavam só em components/CamposComplementares.tsx).

export type DadosComplementares = {
  nascimento: string;
  sexo: string;
  altura: string;
  emailContato: string;
};

export const DADOS_VAZIOS: DadosComplementares = {
  nascimento: "",
  sexo: "",
  altura: "",
  emailContato: "",
};

export type LinhaDadosPessoais = {
  birth_date?: string | null;
  sex?: string | null;
  height_cm?: number | string | null;
  contact_email?: string | null;
};

export function dadosDoBanco(linha: LinhaDadosPessoais): DadosComplementares {
  return {
    nascimento: linha.birth_date ? String(linha.birth_date).slice(0, 10) : "",
    sexo: linha.sex ?? "",
    altura: linha.height_cm == null ? "" : String(linha.height_cm).replace(".", ","),
    emailContato: linha.contact_email ?? "",
  };
}

// Converte para as colunas do banco ou devolve a mensagem de erro.
export function dadosParaBanco(dados: DadosComplementares): { valores: Required<LinhaDadosPessoais> } | { erro: string } {
  const nascimento = (dados.nascimento ?? "").trim();

  if (nascimento && (!/^\d{4}-\d{2}-\d{2}$/.test(nascimento) || nascimento > hojeNoBrasil() || nascimento < "1900-01-02")) {
    return { erro: "Informe uma data de nascimento válida." };
  }

  // O sexo segue as opções da Nutrição e da avaliação física.
  const sexo = (dados.sexo ?? "").trim();
  if (sexo && !SEXOS.some((s) => s.valor === sexo)) {
    return { erro: "Escolha o sexo na lista." };
  }

  const alturaTexto = (dados.altura ?? "").trim().replace(",", ".");
  const altura = alturaTexto === "" ? null : Number(alturaTexto);

  if (altura !== null && (!Number.isFinite(altura) || altura <= 30 || altura >= 260)) {
    return { erro: "Informe a altura em centímetros (ex.: 165)." };
  }

  const email = (dados.emailContato ?? "").trim().toLowerCase();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erro: "Informe um e-mail de contato válido." };
  }

  return {
    valores: {
      birth_date: nascimento || null,
      sex: sexo || null,
      height_cm: altura === null ? null : Math.round(altura * 10) / 10,
      contact_email: email || null,
    },
  };
}

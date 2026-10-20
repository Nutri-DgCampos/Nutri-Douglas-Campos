"use client";

import { InputText } from "primereact/inputtext";
import Selecao from "@/components/Selecao";
import { hojeNoBrasil } from "@/lib/cronograma";
import { SEXOS, idadeEm } from "@/lib/nutricao/paciente";

// Dados usados pelo Módulo de Nutrição (cálculos, PDFs e envio da anamnese),
// nos formulários de novo paciente e de edição.

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

type Linha = {
  birth_date?: string | null;
  sex?: string | null;
  height_cm?: number | string | null;
  contact_email?: string | null;
};

export function dadosDoBanco(linha: Linha): DadosComplementares {
  return {
    nascimento: linha.birth_date ? String(linha.birth_date).slice(0, 10) : "",
    sexo: linha.sex ?? "",
    altura: linha.height_cm == null ? "" : String(linha.height_cm).replace(".", ","),
    emailContato: linha.contact_email ?? "",
  };
}

// Converte para as colunas do banco ou devolve a mensagem de erro.
export function dadosParaBanco(
  dados: DadosComplementares
): { valores: Required<Linha> } | { erro: string } {
  const nascimento = dados.nascimento.trim();

  if (nascimento && (nascimento > hojeNoBrasil() || nascimento < "1900-01-02")) {
    return { erro: "Informe uma data de nascimento válida." };
  }

  const alturaTexto = dados.altura.trim().replace(",", ".");
  const altura = alturaTexto === "" ? null : Number(alturaTexto);

  if (altura !== null && (!Number.isFinite(altura) || altura <= 30 || altura >= 260)) {
    return { erro: "Informe a altura em centímetros (ex.: 165)." };
  }

  const email = dados.emailContato.trim().toLowerCase();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { erro: "Informe um e-mail de contato válido." };
  }

  return {
    valores: {
      birth_date: nascimento || null,
      sex: dados.sexo || null,
      height_cm: altura === null ? null : Math.round(altura * 10) / 10,
      contact_email: email || null,
    },
  };
}

export default function CamposComplementares({
  valor,
  onChange,
}: {
  valor: DadosComplementares;
  onChange: (valor: DadosComplementares) => void;
}) {
  const alterar = (campo: keyof DadosComplementares, novo: string) =>
    onChange({ ...valor, [campo]: novo });

  const idade = idadeEm(valor.nascimento || null);

  return (
    <>
      <div>
        <label htmlFor="campo-nascimento" className="mb-2 block text-sm font-medium text-gray-700">
          Data de nascimento
          {idade !== null && <span className="ml-2 font-normal text-gray-500">({idade} anos)</span>}
        </label>
        <InputText
          id="campo-nascimento"
          type="date"
          value={valor.nascimento}
          max={hojeNoBrasil()}
          onChange={(e) => alterar("nascimento", e.target.value)}
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">Sexo</label>
        <Selecao value={valor.sexo} onChange={(e) => alterar("sexo", e.target.value)} className="w-full">
          <option value="">Não informado</option>
          {SEXOS.map((sexo) => (
            <option key={sexo.valor} value={sexo.valor}>
              {sexo.rotulo}
            </option>
          ))}
        </Selecao>
      </div>

      <div>
        <label htmlFor="campo-altura" className="mb-2 block text-sm font-medium text-gray-700">
          Altura (cm)
        </label>
        <InputText
          id="campo-altura"
          inputMode="decimal"
          value={valor.altura}
          placeholder="Ex.: 165"
          onChange={(e) => alterar("altura", e.target.value)}
          className="w-full"
        />
      </div>

      <div>
        <label htmlFor="campo-email-contato" className="mb-2 block text-sm font-medium text-gray-700">
          E-mail de contato
        </label>
        <InputText
          id="campo-email-contato"
          type="email"
          autoComplete="off"
          value={valor.emailContato}
          placeholder="Usado no envio da anamnese"
          onChange={(e) => alterar("emailContato", e.target.value)}
          className="w-full"
        />
      </div>
    </>
  );
}

"use client";

import { InputText } from "primereact/inputtext";
import Selecao from "@/components/Selecao";
import { hojeNoBrasil } from "@/lib/cronograma";
import type { DadosComplementares } from "@/lib/nutricao/dadosPessoais";
import { SEXOS, idadeEm } from "@/lib/nutricao/paciente";

// Dados pessoais usados pela Nutrição e pelo Treino (cálculos, PDFs, envio
// da anamnese e avaliação física), nos formulários de cadastro e de edição.
// Regras em lib/nutricao/dadosPessoais.ts (as mesmas no servidor).
export { DADOS_VAZIOS, dadosDoBanco, dadosParaBanco, type DadosComplementares } from "@/lib/nutricao/dadosPessoais";

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

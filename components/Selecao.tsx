"use client";

import { Children, isValidElement } from "react";
import { Dropdown } from "primereact/dropdown";

// Lista de seleção do PrimeReact com a mesma forma de uso de um <select>:
// recebe <option> como filhos e avisa a mudança em evento.target.value.
// A opção de valor vazio ("Selecione...") vira o texto de espera.

type Props = {
  value?: string | number | null;
  onChange?: (evento: { target: { value: string } }) => void;
  children?: React.ReactNode;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
};

type Opcao = { label: string; value: string };

function textoDe(conteudo: React.ReactNode): string {
  return Children.toArray(conteudo)
    .map((parte) =>
      typeof parte === "string" || typeof parte === "number" ? String(parte) : ""
    )
    .join("");
}

export default function Selecao({
  value,
  onChange,
  children,
  id,
  disabled,
  required,
  className,
  placeholder,
}: Props) {
  const opcoes: Opcao[] = [];
  let textoDeEspera = placeholder ?? "Selecione uma opção";

  Children.forEach(children, (filho) => {
    if (!isValidElement<{ value?: string | number; children?: React.ReactNode }>(filho)) {
      return;
    }

    const rotulo = textoDe(filho.props.children);
    const valor = String(filho.props.value ?? rotulo);

    if (valor === "") {
      textoDeEspera = rotulo || textoDeEspera;
      return;
    }

    opcoes.push({ label: rotulo, value: valor });
  });

  const atual = value === null || value === undefined || value === "" ? null : String(value);

  return (
    <Dropdown
      inputId={id}
      value={atual}
      options={opcoes}
      onChange={(evento) =>
        onChange?.({ target: { value: evento.value ?? "" } })
      }
      placeholder={textoDeEspera}
      disabled={disabled}
      required={required}
      className={className ?? "w-full"}
      // No celular a lista ocupa a largura do campo e não passa da tela.
      panelClassName="max-w-[calc(100vw-2rem)]"
      pt={{ item: { className: "whitespace-normal" } }}
    />
  );
}

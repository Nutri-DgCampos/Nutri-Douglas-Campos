"use client";

import { useState } from "react";
import { InputText } from "primereact/inputtext";

// Número positivo no padrão brasileiro (vírgula decimal). Enquanto a pessoa
// digita, o texto fica como está; o valor só é repassado quando é válido.
// Campo vazio repassa null (nunca zero).

function paraTexto(valor: number | null) {
  return valor === null ? "" : valor.toLocaleString("pt-BR", { maximumFractionDigits: 3, useGrouping: false });
}

export function lerNumero(texto: string) {
  const limpo = texto.trim().replace(/\s/g, "").replace(",", ".");
  if (!limpo) return null;
  if (!/^\d*\.?\d*$/.test(limpo)) return undefined;
  const numero = Number(limpo);
  return Number.isFinite(numero) && numero > 0 ? numero : undefined;
}

export default function CampoNumero({
  valor,
  onChange,
  id,
  ariaLabel,
  placeholder,
  className,
  disabled,
  maximo = 100_000,
}: {
  valor: number | null;
  onChange: (valor: number | null) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  maximo?: number;
}) {
  const [texto, setTexto] = useState(paraTexto(valor));
  const [invalido, setInvalido] = useState(false);
  const [valorAnterior, setValorAnterior] = useState(valor);

  // Valor alterado por fora (ex.: "usar o peso da medida"): atualiza o texto.
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    if (lerNumero(texto) !== valor) {
      setTexto(paraTexto(valor));
      setInvalido(false);
    }
  }

  return (
    <InputText
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      value={texto}
      placeholder={placeholder}
      disabled={disabled}
      invalid={invalido}
      className={className ?? "w-full"}
      onChange={(evento) => {
        const novo = evento.target.value;
        setTexto(novo);
        const numero = lerNumero(novo);
        const valido = numero !== undefined && (numero === null || numero <= maximo);
        setInvalido(!valido);
        if (valido && numero !== valor) onChange(numero);
      }}
      onBlur={() => {
        if (invalido) {
          setTexto(paraTexto(valor));
          setInvalido(false);
        }
      }}
    />
  );
}

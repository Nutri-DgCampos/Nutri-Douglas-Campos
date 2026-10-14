"use client";

import { Button } from "primereact/button";

// Volta para a tela anterior do fluxo (ex.: da edição para o paciente).
export default function BotaoVoltar({
  rotulo = "Voltar",
  onClick,
}: {
  rotulo?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      text
      size="small"
      severity="secondary"
      icon="pi pi-arrow-left"
      label={rotulo}
      onClick={onClick}
      className="-ml-3 mb-2"
    />
  );
}

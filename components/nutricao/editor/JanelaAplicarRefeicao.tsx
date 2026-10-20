"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { RadioButton } from "primereact/radiobutton";
import { nomeNaPrescricao, refeicaoTemConteudo, type Refeicao } from "@/lib/nutricao/dieta";

export type OpcoesDeAplicacao = {
  modo: "substituir" | "opcao";
  usarNomeEHorario: boolean;
  incorporarObservacao: boolean;
};

// Confirmação de "Colar refeição" e "Importar modelo de refeição": mostra o
// que vem e o que acontece com a refeição de destino. Nada muda sem Confirmar.
export default function JanelaAplicarRefeicao({
  titulo,
  origem,
  destino,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  origem: Refeicao;
  destino: Refeicao;
  onCancelar: () => void;
  onConfirmar: (opcoes: OpcoesDeAplicacao) => void;
}) {
  const ocupada = refeicaoTemConteudo(destino);
  const [modo, setModo] = useState<"substituir" | "opcao">(ocupada ? "opcao" : "substituir");
  const [usarNomeEHorario, setUsarNomeEHorario] = useState(false);
  const [incorporarObservacao, setIncorporarObservacao] = useState(false);

  const nomeDestino = `${destino.nome.trim() || "Refeição sem nome"}${destino.horario ? ` — ${destino.horario}` : ""}`;
  const alimentos = origem.opcoes.flatMap((o) => o.itens).filter((i) => i.alimentoId);

  return (
    <Dialog
      header={titulo}
      visible
      onHide={onCancelar}
      className="w-[min(34rem,calc(100vw-1rem))]"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={onCancelar} />
          <Button
            type="button"
            label="Confirmar"
            icon="pi pi-check"
            onClick={() => onConfirmar({ modo, usarNomeEHorario, incorporarObservacao })}
          />
        </div>
      }
    >
      <p className="text-sm text-gray-700">
        <strong>{origem.nome.trim() || "Refeição"}</strong>
        {origem.opcoes.length > 1 ? ` (${origem.opcoes.length} opções)` : ""}:{" "}
        {alimentos.length ? alimentos.slice(0, 6).map(nomeNaPrescricao).join(", ") : "sem alimentos"}
        {alimentos.length > 6 ? ` e mais ${alimentos.length - 6}` : ""}.
      </p>
      <p className="mt-2 text-sm text-gray-700">
        Destino: <strong>{nomeDestino}</strong>
      </p>

      {ocupada ? (
        <fieldset className="mt-3 space-y-2">
          <legend className="text-sm font-semibold text-gray-900">O destino já tem conteúdo</legend>
          <label className="flex items-start gap-2 text-sm">
            <RadioButton checked={modo === "opcao"} onChange={() => setModo("opcao")} />
            <span>
              Adicionar como nova opção
              <span className="block text-xs text-gray-500">Mantém o que já existe e acrescenta as opções copiadas.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <RadioButton checked={modo === "substituir"} onChange={() => setModo("substituir")} />
            <span>
              Substituir conteúdo
              <span className="block text-xs text-gray-500">Troca alimentos, opções, substituições e a observação do destino.</span>
            </span>
          </label>
        </fieldset>
      ) : null}

      <div className="mt-3 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={usarNomeEHorario} onChange={(e) => setUsarNomeEHorario(Boolean(e.checked))} />
          Usar também o nome e o horário da origem
        </label>
        {modo === "opcao" && origem.observacao?.trim() ? (
          <label className="flex items-center gap-2">
            <Checkbox checked={incorporarObservacao} onChange={(e) => setIncorporarObservacao(Boolean(e.checked))} />
            Incorporar a observação da origem à do destino
          </label>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-gray-500">Confira as quantidades: a refeição copiada não é ajustada automaticamente ao paciente.</p>
    </Dialog>
  );
}

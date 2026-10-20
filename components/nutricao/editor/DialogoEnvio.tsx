"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { RadioButton } from "primereact/radiobutton";
import { pendenciasDoEnvio, type DocumentoDieta } from "@/lib/nutricao/dieta";
import { formatarData } from "@/lib/nutricao/paciente";
import type { DadosDoEditor } from "./tipos";

export type OpcoesDoEnvio = { novoCiclo: boolean; modelo: "simples" | "detalhado" };

// Conferência antes de publicar: pendências, modelo do PDF e o ciclo de 33
// dias (novo ou o atual), sempre por escolha explícita do nutricionista.
export default function DialogoEnvio({
  visivel,
  documento,
  paciente,
  cicloAtivo,
  enviando,
  onFechar,
  onEnviar,
}: {
  visivel: boolean;
  documento: DocumentoDieta;
  paciente: string;
  cicloAtivo: DadosDoEditor["cicloAtivo"];
  enviando: boolean;
  onFechar: () => void;
  onEnviar: (opcoes: OpcoesDoEnvio) => void;
}) {
  // Outra dieta desta consulta já foi enviada neste ciclo: o padrão é
  // manter o ciclo (dieta complementar, como dias sem treino).
  const sugereManter = Boolean(cicloAtivo && cicloAtivo.enviadas_da_consulta > 0);
  const [novoCiclo, setNovoCiclo] = useState(!sugereManter);
  const [modelo, setModelo] = useState<"simples" | "detalhado">("simples");

  const pendencias = pendenciasDoEnvio(documento);

  return (
    <Dialog
      header="Enviar ao paciente"
      visible={visivel}
      onHide={onFechar}
      className="w-[min(36rem,calc(100vw-1rem))]"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={onFechar} disabled={enviando} />
          <Button
            type="button"
            label="Enviar ao paciente"
            icon="pi pi-send"
            loading={enviando}
            disabled={pendencias.length > 0}
            onClick={() => onEnviar({ novoCiclo, modelo })}
          />
        </div>
      }
    >
      <p className="text-gray-800">
        Publicar <strong>{documento.titulo || "a dieta"}</strong> para <strong>{paciente}</strong>?
      </p>
      <p className="mt-1 text-sm text-gray-600">
        O paciente passa a ver a dieta e o PDF na aba Dietas e recebe o aviso no celular. A versão enviada fica guardada e não
        muda depois; novas alterações geram uma nova versão.
      </p>

      {pendencias.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Corrija antes de enviar:</p>
          <ul className="mt-1 list-disc pl-5">
            {pendencias.slice(0, 12).map((p) => (
              <li key={p}>{p}</li>
            ))}
            {pendencias.length > 12 ? <li>e mais {pendencias.length - 12}.</li> : null}
          </ul>
        </div>
      ) : (
        <>
          <fieldset className="mt-4">
            <legend className="font-semibold text-gray-900">Ciclo de acompanhamento</legend>
            <label className="mt-2 flex items-start gap-2">
              <RadioButton checked={novoCiclo} onChange={() => setNovoCiclo(true)} />
              <span>
                Iniciar novo ciclo de 33 dias a partir de hoje
                <span className="block text-xs text-gray-500">Encerra o ciclo atual, se houver. Use para a dieta principal da consulta.</span>
              </span>
            </label>
            <label className="mt-2 flex items-start gap-2">
              <RadioButton checked={!novoCiclo} disabled={!cicloAtivo} onChange={() => setNovoCiclo(false)} />
              <span className={cicloAtivo ? "" : "text-gray-400"}>
                Manter o ciclo atual
                {cicloAtivo ? ` (${formatarData(cicloAtivo.inicio)} a ${formatarData(cicloAtivo.fim)})` : " (o paciente não tem ciclo ativo)"}
                <span className="block text-xs text-gray-500">Para dieta complementar (ex.: dias sem treino) ou revisão.</span>
              </span>
            </label>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="font-semibold text-gray-900">PDF enviado</legend>
            <div className="mt-2 flex flex-wrap gap-4">
              <label className="flex items-center gap-2">
                <RadioButton checked={modelo === "simples"} onChange={() => setModelo("simples")} />
                Simples
              </label>
              <label className="flex items-center gap-2">
                <RadioButton checked={modelo === "detalhado"} onChange={() => setModelo("detalhado")} />
                Detalhado (com kcal e macros)
              </label>
            </div>
          </fieldset>
        </>
      )}
    </Dialog>
  );
}

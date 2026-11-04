"use client";

import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";

// Confirmação da troca (ou reaplicação) do plano com o ciclo ativo
// (SPEC Plano Ativo, RF-11): plano anterior → novo, ciclo afetado,
// periodicidade futura e se um relatório será liberado agora.

export type PreviaDoPlano = {
  hoje: string;
  planoAtual: string | null;
  planoNovo: string;
  ciclo: { id: string; numero: number; inicio: string; fim: string; frequencia: string } | null;
  divergente: boolean;
  liberar: { numero: number; segunda: string; modo: "janela" | "liberacao" } | null;
};

const data = (iso: string) => iso.split("-").reverse().join("/");

const PERIODICIDADE: Record<string, string> = {
  semanal: "4 relatórios, um por semana",
  quinzenal: "2 relatórios, ao completar 2 e 4 semanas",
  mensal: "1 relatório, ao completar 4 semanas",
};

export default function ConfirmarPlano({
  previa,
  reaplicar,
  salvando,
  onConfirmar,
  onCancelar,
}: {
  previa: PreviaDoPlano | null;
  reaplicar: boolean;
  salvando: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const c = previa?.ciclo;
  return (
    <Dialog
      header={reaplicar ? "Reaplicar o plano ao acompanhamento atual" : "Corrigir o plano do acompanhamento atual"}
      visible={previa !== null}
      onHide={onCancelar}
      className="w-full max-w-lg"
      modal
    >
      {previa && c ? (
        <div className="space-y-3 text-sm text-gray-700">
          <dl className="space-y-2">
            <div>
              <dt className="font-semibold text-gray-900">Plano</dt>
              <dd>
                {reaplicar
                  ? `${previa.planoNovo} (o acompanhamento atual estava como ${c.frequencia})`
                  : `${previa.planoAtual ?? "—"} → ${previa.planoNovo}`}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-900">Acompanhamento afetado</dt>
              <dd>
                Ciclo {c.numero}, de {data(c.inicio)} a {data(c.fim)}. As datas, os pagamentos e a dieta não mudam.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-900">Daqui em diante</dt>
              <dd>{PERIODICIDADE[previa.planoNovo.toLowerCase()] ?? previa.planoNovo} neste ciclo.</dd>
            </div>
            <div>
              <dt className="font-semibold text-gray-900">Relatório agora</dt>
              <dd>
                {previa.liberar
                  ? previa.liberar.modo === "janela"
                    ? `O relatório ${previa.liberar.numero} (semana de ${data(previa.liberar.segunda)}) já está no prazo normal, até terça. O paciente recebe o aviso agora.`
                    : `O relatório ${previa.liberar.numero} (semana de ${data(previa.liberar.segunda)}) será liberado agora, só hoje até 23h59, e o paciente recebe o aviso.`
                  : "Nenhum relatório está devido agora: só o calendário dos próximos muda."}
              </dd>
            </div>
          </dl>
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            Semanas anteriores não são regularizadas: só o relatório mais recente já devido é liberado.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={onCancelar} />
            <Button type="button" label="Confirmar" icon="pi pi-check" loading={salvando} onClick={onConfirmar} />
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

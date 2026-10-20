"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { instalar, useSituacaoDaInstalacao } from "@/lib/instalacao";

const CHAVE = "aviso-instalacao-adiado";
const ADIAR_DIAS = 7;

function adiadoAte() {
  try {
    return Number(localStorage.getItem(CHAVE) ?? 0);
  } catch {
    return 0;
  }
}

// Convite para instalar o aplicativo na área do paciente. Some quando o app
// já está instalado (ou aberto pelo ícone) e pode ser adiado por 7 dias.
export default function AvisoDeInstalacao() {
  const situacao = useSituacaoDaInstalacao();
  const [adiado, setAdiado] = useState(() => adiadoAte() > Date.now());

  if (adiado || situacao === "instalado" || situacao === "indisponivel") return null;

  function adiar() {
    try {
      localStorage.setItem(CHAVE, String(Date.now() + ADIAR_DIAS * 24 * 60 * 60 * 1000));
    } catch {
      // Sem armazenamento: some só nesta visita.
    }
    setAdiado(true);
  }

  return (
    <section className="cartao mt-4 flex gap-3 border-primary-200 bg-primary-50 p-4" aria-label="Instalar o aplicativo">
      <i className="pi pi-mobile mt-0.5 text-2xl text-primary-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-gray-900">Instale o aplicativo</p>
        {situacao === "pode-instalar" ? (
          <p className="mt-0.5 text-sm text-gray-600">Acesse seu plano pela tela inicial do celular e receba os avisos do nutricionista.</p>
        ) : (
          <p className="mt-0.5 text-sm text-gray-600">
            No iPhone: toque em <strong>Compartilhar</strong> <i className="pi pi-upload text-xs" aria-hidden /> no Safari e depois em{" "}
            <strong>Adicionar à Tela de Início</strong>. Para receber os avisos, abra o app pelo ícone e ative as notificações.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {situacao === "pode-instalar" ? (
            <Button type="button" size="small" icon="pi pi-download" label="Instalar" onClick={() => void instalar()} />
          ) : null}
          <Button type="button" size="small" text label="Agora não" onClick={adiar} />
        </div>
      </div>
    </section>
  );
}

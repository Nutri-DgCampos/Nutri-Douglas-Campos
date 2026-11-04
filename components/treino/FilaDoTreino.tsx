"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { acompanharFila, descartarRecusado, sincronizar, type ItemDaFila, type ItemRecusado } from "@/lib/treinoOffline";

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

// Aviso discreto do uso sem internet (T5): cópia guardada no aparelho,
// registros aguardando conexão e os que o servidor não aceitou.
export default function FilaDoTreino({ copiaDe }: { copiaDe: string | null }) {
  const [pendentes, setPendentes] = useState<ItemDaFila[]>([]);
  const [recusados, setRecusados] = useState<ItemRecusado[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(
    () =>
      acompanharFila((e) => {
        setPendentes(e.pendentes);
        setRecusados(e.recusados);
        setEnviando(e.enviando);
      }),
    []
  );

  if (!copiaDe && !pendentes.length && !recusados.length) return null;

  return (
    <div className="space-y-2" role="status" aria-live="polite">
      {copiaDe ? (
        <p className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
          <i className="pi pi-wifi mr-1" aria-hidden />
          Sem internet: mostrando o treino salvo no aparelho em {hora(copiaDe)}. Você pode registrar normalmente.
        </p>
      ) : null}
      {pendentes.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-atencao-50 px-3 py-2 text-sm text-atencao-700">
          <i className="pi pi-clock" aria-hidden />
          <span className="min-w-0 flex-1">
            {pendentes.length === 1 ? "1 registro aguardando conexão" : `${pendentes.length} registros aguardando conexão`}: {pendentes.map((p) => p.descricao).join("; ")}.
            {pendentes.some((p) => p.tipo === "desconforto") ? " O profissional só é avisado do desconforto quando o relato chegar." : " Serão enviados sozinhos quando a internet voltar."}
          </span>
          <Button type="button" size="small" text label="Enviar agora" loading={enviando} onClick={() => void sincronizar()} />
        </div>
      ) : null}
      {recusados.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          <i className="pi pi-exclamation-circle" aria-hidden />
          <span className="min-w-0 flex-1">
            Não foi possível enviar “{r.descricao}”, feito em {hora(r.criado_em)}: {r.erro}
          </span>
          <Button type="button" size="small" text severity="danger" label="Descartar" onClick={() => void descartarRecusado(r.id)} />
        </div>
      ))}
    </div>
  );
}

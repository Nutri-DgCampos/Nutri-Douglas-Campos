"use client";

import { useEffect, useState } from "react";
import { rotuloDaSemana } from "@/lib/treinoRelatorio";

type Devolutiva = { id: string; semana_inicio: string; semana_fim: string; profissional: string; devolutiva: string; devolutiva_enviada_em: string; lida_em: string | null };

// Devolutivas do Treino na tela Relatórios do aluno, identificadas como
// "Treino" ao lado das devolutivas da Nutrição (D1). Abrir a tela marca como
// lidas. mostrarVazio: aviso quando ainda não há nenhuma (aluno que só usa o
// Treino).
export default function DevolutivasDoTreino({ mostrarVazio = false }: { mostrarVazio?: boolean }) {
  const [devolutivas, setDevolutivas] = useState<Devolutiva[] | null>(null);

  useEffect(() => {
    fetch("/api/area-paciente/treino/relatorios", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { devolutivas: [] }))
      .then((d: { devolutivas?: Devolutiva[] }) => {
        const lista = d.devolutivas ?? [];
        setDevolutivas(lista);
        if (lista.some((x) => !x.lida_em)) fetch("/api/area-paciente/treino/relatorios", { method: "POST" }).catch(() => undefined);
      })
      .catch(() => setDevolutivas([]));
  }, []);

  if (devolutivas === null) return null;
  if (!devolutivas.length) {
    return mostrarVazio ? (
      <div className="cartao p-6 text-center">
        <i className="pi pi-chart-bar text-3xl text-gray-400" aria-hidden />
        <p className="mt-3 font-semibold text-gray-900">Nenhuma devolutiva por enquanto.</p>
        <p className="mt-1 text-sm text-gray-500">Quando o seu Personal Trainer responder à semana de treino, a devolutiva aparece aqui.</p>
      </div>
    ) : null;
  }

  return (
    <>
      {devolutivas.map((d) => (
        <section key={d.id} className="cartao p-5" aria-label={`Devolutiva do treino, semana de ${rotuloDaSemana(d.semana_inicio, d.semana_fim)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary-700 px-2 py-0.5 text-xs font-bold text-white">Treino</span>
            {!d.lida_em ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Nova</span> : null}
          </div>
          <p className="mt-2 font-[family-name:var(--fonte-titulo)] text-lg font-bold text-gray-900">
            {d.lida_em ? "Devolutiva do seu Personal Trainer" : "Chegou a devolutiva do seu Personal Trainer"}
          </p>
          <p className="text-sm text-gray-500">Semana de {rotuloDaSemana(d.semana_inicio, d.semana_fim)}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{d.devolutiva}</p>
        </section>
      ))}
    </>
  );
}

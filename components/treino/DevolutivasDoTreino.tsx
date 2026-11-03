"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import RelatorioDaSemana, { type RelatorioNaTela } from "@/components/treino/RelatorioDaSemana";
import { ROTULO_DA_MODALIDADE, rotuloDaSemana } from "@/lib/treinoRelatorio";

type RelatorioDoAluno = RelatorioNaTela & {
  profissional: string;
  devolutiva: string | null;
  devolutiva_enviada_em: string | null;
  lida_em: string | null;
};

// Relatórios do Treino na tela Relatórios do aluno (T3b, REL-01/02/03),
// identificados como "Treino" ao lado das devolutivas da Nutrição (D1). Cada
// semana e modalidade mostra a nota, a adesão e o relatório completo, e a
// devolutiva quando enviada. Abrir a tela marca as devolutivas como lidas.
// mostrarVazio: aviso quando ainda não há nenhum (aluno que só usa o Treino).
export default function DevolutivasDoTreino({ mostrarVazio = false }: { mostrarVazio?: boolean }) {
  const [relatorios, setRelatorios] = useState<RelatorioDoAluno[] | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/area-paciente/treino/relatorios", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { relatorios: [] }))
      .then((d: { relatorios?: RelatorioDoAluno[] }) => {
        const lista = d.relatorios ?? [];
        setRelatorios(lista);
        if (lista.some((x) => x.devolutiva && !x.lida_em)) fetch("/api/area-paciente/treino/relatorios", { method: "POST" }).catch(() => undefined);
      })
      .catch(() => setRelatorios([]));
  }, []);

  if (relatorios === null) return null;
  if (!relatorios.length) {
    return mostrarVazio ? (
      <div className="cartao p-6 text-center">
        <i className="pi pi-chart-bar text-3xl text-gray-400" aria-hidden />
        <p className="mt-3 font-semibold text-gray-900">Nenhum relatório de treino por enquanto.</p>
        <p className="mt-1 text-sm text-gray-500">O relatório da semana aparece no domingo, a partir dos seus registros. Quando o seu Personal Trainer responder, a devolutiva aparece aqui.</p>
      </div>
    ) : null;
  }

  return (
    <>
      {relatorios.map((r) => {
        const nova = Boolean(r.devolutiva) && !r.lida_em;
        return (
          <section key={r.id} className="cartao p-5" aria-label={`Relatório do treino, ${ROTULO_DA_MODALIDADE[r.modalidade ?? "musculacao"]}, semana de ${rotuloDaSemana(r.semana_inicio, r.semana_fim)}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary-700 px-2 py-0.5 text-xs font-bold text-white">Treino</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">{ROTULO_DA_MODALIDADE[r.modalidade ?? "musculacao"]}</span>
              {nova ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Nova</span> : null}
              <span className="ml-auto text-sm text-gray-600">
                Nota: <strong>{r.nota.nota === null ? "N/A" : r.nota.nota}</strong> · adesão {r.sem_registros || r.adesao === null ? "—" : `${r.adesao.toLocaleString("pt-BR")}%`} (mínimo {r.adesao_minima}%)
              </span>
            </div>
            <p className="mt-2 font-[family-name:var(--fonte-titulo)] text-lg font-bold text-gray-900">
              {r.devolutiva ? (nova ? "Chegou a devolutiva do seu Personal Trainer" : "Devolutiva do seu Personal Trainer") : "Relatório da semana"}
            </p>
            <p className="text-sm text-gray-500">
              Semana de {rotuloDaSemana(r.semana_inicio, r.semana_fim)}
              {r.devolutiva ? "" : ` · aguardando a devolutiva de ${r.profissional}`}
            </p>
            {r.devolutiva ? <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{r.devolutiva}</p> : null}
            <Button
              type="button"
              text
              size="small"
              className="mt-2"
              icon={aberto === r.id ? "pi pi-chevron-up" : "pi pi-chevron-down"}
              label={aberto === r.id ? "Ocultar o relatório completo" : "Ver o relatório completo"}
              onClick={() => setAberto(aberto === r.id ? null : r.id)}
            />
            {aberto === r.id ? (
              <div className="mt-3">
                <RelatorioDaSemana relatorio={r} visaoDoAluno />
              </div>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

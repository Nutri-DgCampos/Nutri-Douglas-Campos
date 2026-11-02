"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ROTULO_DA_CAUSA, diaMes, type CausaDeAtencao } from "@/lib/treinoRelatorio";

type Painel = {
  pendentes: { patient_id: string; nome: string; pendentes: number; atraso: boolean; mais_antigo: string; relatorio_id: string }[];
  atencao: { patient_id: string; nome: string; causas: CausaDeAtencao[]; semanas: string[] }[];
};

// Relatórios semanais do profissional conectado (T3): pendentes de
// devolutiva, atraso (2 ou mais do mesmo aluno) e lista de atenção. Só no
// painel, sem push (B7 e B8). "somentePendentes": na tela Relatórios do
// nutricionista, ao lado dos relatórios da Nutrição (D1), só os pendentes.
export default function PainelDeRelatorios({ somentePendentes = false }: { somentePendentes?: boolean }) {
  const [painel, setPainel] = useState<Painel | null>(null);

  useEffect(() => {
    fetch("/api/treino/relatorios", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setPainel)
      .catch(() => setPainel(null));
  }, []);

  if (!painel || (somentePendentes && painel.pendentes.length === 0)) return null;
  const atrasos = painel.pendentes.filter((p) => p.atraso).length;

  return (
    <div className={somentePendentes ? "" : "grid gap-6 lg:grid-cols-2"}>
      <section className="cartao p-5" aria-label="Relatórios semanais pendentes">
        <h2 className="font-bold text-gray-900">
          Relatórios semanais <span className="ml-1 rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-800">Treino</span>
        </h2>
        {atrasos ? (
          <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm font-semibold text-red-800">
            <i className="pi pi-clock mr-1" aria-hidden />
            Devolutiva atrasada para {atrasos} {atrasos === 1 ? "aluno" : "alunos"} (2 ou mais relatórios sem resposta).
          </p>
        ) : null}
        {painel.pendentes.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhum relatório aguardando devolutiva.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {painel.pendentes.map((p) => (
              <li key={p.patient_id}>
                <Link href={`/treino/relatorios/${p.relatorio_id}`} className="flex items-center gap-3 py-2 hover:bg-primary-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gray-900">{p.nome}</span>
                    <span className="block text-xs text-gray-500">Desde a semana de {diaMes(p.mais_antigo)}</span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.atraso ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
                    {p.pendentes} {p.pendentes === 1 ? "pendente" : "pendentes"}
                    {p.atraso ? " · atraso" : ""}
                  </span>
                  <i className="pi pi-chevron-right text-gray-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {somentePendentes ? null : (
      <section className="cartao p-5" aria-label="Lista de atenção">
        <h2 className="font-bold text-gray-900">Lista de atenção</h2>
        <p className="text-xs text-gray-500">Duas semanas seguidas com a mesma causa. Semanas em pausa não contam.</p>
        {painel.atencao.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhum aluno na lista de atenção.</p>
        ) : (
          <ul className="mt-2 divide-y divide-gray-100">
            {painel.atencao.map((a) => (
              <li key={a.patient_id}>
                <Link href={`/treino/alunos/${a.patient_id}`} className="flex items-center gap-3 py-2 hover:bg-primary-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-gray-900">{a.nome}</span>
                    <span className="block text-xs text-gray-600">
                      {a.causas.map((c) => ROTULO_DA_CAUSA[c]).join(" · ")} (semanas de {a.semanas.map(diaMes).join(" e ")})
                    </span>
                  </span>
                  <i className="pi pi-chevron-right text-gray-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      )}
    </div>
  );
}

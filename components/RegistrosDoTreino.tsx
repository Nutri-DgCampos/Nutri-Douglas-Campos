"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "primereact/skeleton";
import { DIAS, SITUACOES, type ExercicioRegistrado, type SessaoRegistrada, type SituacaoDaSessao } from "@/lib/treino";

// Profissional: o que o aluno registrou (sessões da semana, situação,
// observações) e o histórico completo de cargas por exercício. O aluno vê
// só a carga anterior; o histórico fica aqui.

type Sessao = SessaoRegistrada & { nomes: Record<number, string> };
type Cargas = Record<string, { nome: string; pontos: { data: string; carga_kg: number; series: number | null; repeticoes: number | null }[] }>;

const ROTULOS = Object.fromEntries(SITUACOES.map((s) => [s.valor, s.rotulo])) as Record<SituacaoDaSessao, string>;
const NOME_DO_DIA = Object.fromEntries(DIAS.map((d) => [d.chave, d.nome]));

function data(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function numeros(e: ExercicioRegistrado) {
  const partes = [
    e.series !== null && e.repeticoes !== null ? `${e.series}×${e.repeticoes}` : e.series !== null ? `${e.series} séries` : null,
    e.carga_kg !== null ? `${e.carga_kg.toLocaleString("pt-BR")} kg` : null,
    e.descanso_segundos !== null ? `${e.descanso_segundos} s` : null,
  ].filter(Boolean);
  return partes.join(" · ") || "—";
}

export default function RegistrosDoTreino({ pacienteId }: { pacienteId: string }) {
  const [dados, setDados] = useState<{ sessoes: Sessao[]; cargas: Cargas; prescricao: { origem: string; versao: number; publicada_em: string } | null } | null>(null);

  useEffect(() => {
    fetch(`/api/treino/registros/${pacienteId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDados(d ?? { sessoes: [], cargas: {}, prescricao: null }))
      .catch(() => setDados({ sessoes: [], cargas: {}, prescricao: null }));
  }, [pacienteId]);

  if (dados === null) return <Skeleton height="10rem" borderRadius="16px" />;

  const cargas = Object.values(dados.cargas).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="space-y-4">
      {dados.prescricao ? (
        <p className="text-sm text-gray-600">
          Treino vigente:{" "}
          <span className="font-semibold">
            {dados.prescricao.origem === "externa" ? "enviado pelo aluno (origem externa)" : "prescrito no app"}
          </span>
          , versão {dados.prescricao.versao}, desde {data(dados.prescricao.publicada_em)}. Os números que o aluno registra não alteram o treino.
        </p>
      ) : null}

      <section className="cartao p-5" aria-label="Registros do aluno">
        <h2 className="font-bold text-gray-900">Registros do aluno</h2>
        {dados.sessoes.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">O aluno ainda não registrou nenhum treino.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {dados.sessoes.slice(0, 30).map((sessao) => (
              <li key={sessao.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-gray-900">
                    {NOME_DO_DIA[sessao.dia]}, {data(sessao.data_planejada)}
                  </span>
                  <span className={sessao.situacao ? "font-semibold text-primary-700" : "text-gray-500"}>
                    {sessao.situacao ? ROTULOS[sessao.situacao] : "Números salvos, sem situação informada"}
                    {sessao.situacao === "reagendado" && sessao.data_efetiva ? ` para ${data(sessao.data_efetiva)}` : ""}
                  </span>
                </div>
                {sessao.motivo ? <p className="text-gray-600">Motivo: {sessao.motivo}</p> : null}
                {sessao.observacao ? <p className="whitespace-pre-line text-gray-700">Observação: {sessao.observacao}</p> : null}
                {sessao.exercicios.length ? (
                  <ul className="mt-1 text-gray-600">
                    {sessao.exercicios.map((e) => (
                      <li key={e.indice}>
                        {sessao.nomes[e.indice]}: {numeros(e)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao p-5" aria-label="Histórico de cargas">
        <h2 className="font-bold text-gray-900">Histórico de cargas</h2>
        {cargas.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma carga registrada.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-3 font-semibold">Exercício</th>
                  <th className="py-2 font-semibold">Cargas registradas (mais recente primeiro)</th>
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) => (
                  <tr key={c.nome} className="border-b border-gray-100 align-top last:border-0">
                    <td className="py-2 pr-3 font-semibold text-gray-900">{c.nome}</td>
                    <td className="py-2 text-gray-700">
                      {c.pontos
                        .slice(0, 12)
                        .map((p) => `${data(p.data).slice(0, 5)}: ${p.carga_kg.toLocaleString("pt-BR")} kg`)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

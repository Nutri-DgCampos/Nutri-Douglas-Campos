"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { avisar } from "@/lib/avisos";

type Avaliacao = { id: string; data: string; status: "rascunho" | "finalizada"; autor: string; minha: boolean };

const dataBr = (iso: string) => iso.split("-").reverse().join("/");

// Avaliações físicas do aluno na ficha do Treino (T6, R7/R7b): todas as
// finalizadas, de qualquer profissional que o acompanha, com data e autor;
// os rascunhos só do próprio. Só o autor edita (os outros veem os
// resultados).
export default function AvaliacoesDoTreino({ alunoId }: { alunoId: string }) {
  const router = useRouter();
  const [lista, setLista] = useState<Avaliacao[] | null>(null);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    fetch(`/api/treino/alunos/${alunoId}/avaliacoes`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { avaliacoes: [] }))
      .then((d) => setLista(d.avaliacoes))
      .catch(() => setLista([]));
  }, [alunoId]);

  async function nova() {
    setCriando(true);
    const r = await fetch(`/api/treino/alunos/${alunoId}/avaliacoes`, { method: "POST" }).catch(() => null);
    setCriando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(d?.erro ?? "Não foi possível criar a avaliação.", "error");
      return;
    }
    router.push(`/treino/alunos/${alunoId}/avaliacao/${d.id}`);
  }

  if (lista === null) return null;

  return (
    <section className="cartao p-5" aria-label="Avaliações físicas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">Avaliações físicas</h2>
          <p className="text-sm text-gray-500">Mesmos métodos da Nutrição. Quem acompanha o aluno vê todas; só quem fez pode corrigir.</p>
        </div>
        <Button type="button" icon="pi pi-plus" label="Nova avaliação" outlined loading={criando} onClick={nova} />
      </div>
      {lista.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">Nenhuma avaliação física ainda.</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100">
          {lista.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => router.push(`/treino/alunos/${alunoId}/avaliacao/${a.id}${a.minha ? "" : "/resultados"}`)}
                className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-primary-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{dataBr(a.data)}</span>
                  <span className="block text-gray-500">
                    {a.minha ? "Feita por você" : `Feita por ${a.autor}`}
                    {a.minha ? "" : " · só leitura"}
                  </span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.status === "finalizada" ? "bg-primary-50 text-primary-800" : "bg-amber-100 text-amber-900"}`}>
                  {a.status === "finalizada" ? "Finalizada" : "Rascunho"}
                </span>
                <i className="pi pi-chevron-right text-gray-400" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

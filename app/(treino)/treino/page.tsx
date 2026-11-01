"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import AtivarAlertas from "@/components/treino/AtivarAlertas";
import ListaDeDesconfortos, { type DesconfortoNaTela } from "@/components/treino/ListaDeDesconfortos";

type Aluno = { id: string; nome: string; situacao: string; tem_treino: boolean; desconfortos_novos: number; educadores: string[] };

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Início do Módulo de Treino: relatos de desconforto ainda não vistos e os
// alunos do profissional (o administrador vê todos).
export default function TreinoPage() {
  const [dados, setDados] = useState<{ admin: boolean; alunos: Aluno[]; desconfortos: DesconfortoNaTela[] } | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/treino/alunos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDados(d ?? { admin: false, alunos: [], desconfortos: [] }))
      .catch(() => setDados({ admin: false, alunos: [], desconfortos: [] }));
  }, []);

  const alunos = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (dados?.alunos ?? []).filter((a) => !termo || semAcento(a.nome).includes(termo));
  }, [dados, busca]);

  function visto(id: string) {
    setDados((atual) =>
      atual
        ? {
            ...atual,
            desconfortos: atual.desconfortos.filter((d) => d.id !== id),
            alunos: atual.alunos.map((a) =>
              atual.desconfortos.some((d) => d.id === id && d.patient_id === a.id)
                ? { ...a, desconfortos_novos: Math.max(0, a.desconfortos_novos - 1) }
                : a
            ),
          }
        : atual
    );
  }

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <CabecalhoPagina
          titulo="Módulo de Treino"
          descricao={dados?.admin ? "Alunos, relatos de desconforto e educadores físicos." : "Seus alunos e os relatos de desconforto."}
          acao={
            dados?.admin ? (
              <Link href="/treino/educadores" className="p-button p-button-outlined flex gap-2 font-semibold">
                <i className="pi pi-id-card" aria-hidden />
                Educadores físicos
              </Link>
            ) : undefined
          }
        />

        <AtivarAlertas />

        {dados === null ? (
          <Skeleton height="16rem" borderRadius="16px" />
        ) : (
          <>
            <section className="cartao p-5" aria-label="Relatos de desconforto">
              <h2 className="font-bold text-gray-900">Relatos de desconforto</h2>
              {dados.desconfortos.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">Nenhum relato novo.</p>
              ) : (
                <div className="mt-2">
                  <ListaDeDesconfortos desconfortos={dados.desconfortos} mostrarAluno onVisto={visto} />
                </div>
              )}
            </section>

            <section className="cartao p-5" aria-label="Alunos">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold text-gray-900">
                  Alunos <span className="font-normal text-gray-500">({dados.alunos.length})</span>
                </h2>
                <IconField iconPosition="left" className="w-full sm:w-72">
                  <InputIcon className="pi pi-search" />
                  <InputText value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar aluno" className="w-full" aria-label="Buscar aluno" />
                </IconField>
              </div>

              {dados.alunos.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">
                  {dados.admin ? "Nenhum aluno cadastrado." : "Nenhum aluno vinculado a você ainda. O administrador faz o vínculo."}
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-gray-100">
                  {alunos.map((a) => (
                    <li key={a.id}>
                      <Link href={`/treino/alunos/${a.id}`} className="flex items-center gap-3 py-3 hover:bg-primary-50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-gray-900">{a.nome}</span>
                          <span className="block text-xs text-gray-500">
                            {a.tem_treino ? "Com treino" : "Sem treino"}
                            {dados.admin && a.educadores.length ? ` · ${a.educadores.join(", ")}` : ""}
                          </span>
                        </span>
                        {a.desconfortos_novos ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                            {a.desconfortos_novos} {a.desconfortos_novos === 1 ? "relato novo" : "relatos novos"}
                          </span>
                        ) : null}
                        <i className="pi pi-chevron-right text-gray-400" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

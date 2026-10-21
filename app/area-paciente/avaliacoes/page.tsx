"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { formatarData } from "@/lib/nutricao/paciente";

type Avaliacao = { id: string; avaliacao_id: string; numero: number; file_name: string; storage_path: string; data: string; nova: boolean };

export default function MinhasAvaliacoesPage() {
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[] | null>(null);

  useEffect(() => {
    fetch("/api/area-paciente/avaliacoes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { avaliacoes: [] }))
      .then((d) => {
        setAvaliacoes(d.avaliacoes ?? []);
        if ((d.avaliacoes ?? []).some((a: Avaliacao) => a.nova)) {
          fetch("/api/area-paciente/avaliacoes", { method: "POST" }).catch(() => undefined);
        }
      })
      .catch(() => setAvaliacoes([]));
  }, []);

  async function abrirPDF(caminho: string, nome: string) {
    const { data, error } = await api.storage.from("avaliacoes").createSignedUrl(caminho, 60);
    if (error || !data?.signedUrl) {
      avisar("Não foi possível abrir o PDF.");
      return;
    }
    abrirDocumento(data.signedUrl, nome);
  }

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina titulo="Avaliações físicas" descricao="Os resultados das suas avaliações enviados pelo nutricionista." />

        {avaliacoes === null ? (
          <div className="mt-6 space-y-4">
            <Skeleton height="6rem" borderRadius="16px" />
            <Skeleton height="6rem" borderRadius="16px" />
          </div>
        ) : avaliacoes.length === 0 ? (
          <div className="cartao mt-6 p-6 text-center">
            <i className="pi pi-chart-line text-3xl text-gray-400" aria-hidden />
            <p className="mt-3 font-semibold text-gray-900">Nenhuma avaliação recebida até o momento.</p>
            <p className="mt-1 text-sm text-gray-500">Quando o nutricionista enviar o resultado, ele aparece aqui.</p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {avaliacoes.map((a, i) => (
              <section key={a.id} className="cartao flex items-center gap-3 p-4">
                <i className="pi pi-file-pdf text-2xl text-primary-700" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-gray-900">Avaliação de {formatarData(a.data)}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {i === 0 ? <Tag value="Mais recente" severity="success" /> : null}
                    {a.nova ? <Tag value="Nova" severity="info" /> : null}
                    {a.numero > 1 ? <Tag value="Corrigida" severity="secondary" /> : null}
                  </div>
                </div>
                <Button type="button" label="Abrir PDF" size="small" onClick={() => abrirPDF(a.storage_path, a.file_name)} />
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

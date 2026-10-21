"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";

type Documento = { id: string; tipo: "solicitacao_exames" | "orientacao"; titulo: string; file_name: string; storage_path: string; enviado_em: string; novo: boolean };

const TIPOS = { solicitacao_exames: { rotulo: "Solicitação de exames", icone: "pi-file" }, orientacao: { rotulo: "Orientação", icone: "pi-comment" } };

export default function MeusDocumentosPage() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);

  useEffect(() => {
    fetch("/api/area-paciente/documentos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { documentos: [] }))
      .then((d) => {
        setDocumentos(d.documentos ?? []);
        if ((d.documentos ?? []).some((x: Documento) => x.novo)) fetch("/api/area-paciente/documentos", { method: "POST" }).catch(() => undefined);
      })
      .catch(() => setDocumentos([]));
  }, []);

  async function abrir(d: Documento) {
    const { data, error } = await api.storage.from("documentos").createSignedUrl(d.storage_path, 60);
    if (error || !data?.signedUrl) return avisar("Não foi possível abrir o documento.");
    abrirDocumento(data.signedUrl, d.file_name);
  }

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina titulo="Documentos" descricao="Solicitações de exames e orientações enviadas pelo nutricionista." />
        {documentos === null ? (
          <div className="mt-6 space-y-3">
            <Skeleton height="5rem" borderRadius="16px" />
          </div>
        ) : documentos.length === 0 ? (
          <div className="cartao mt-6 p-6 text-center">
            <i className="pi pi-folder-open text-3xl text-gray-400" aria-hidden />
            <p className="mt-3 font-semibold text-gray-900">Nenhum documento recebido até o momento.</p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {documentos.map((d) => (
              <li key={d.id} className="cartao flex items-center gap-3 p-4">
                <i className={`pi ${TIPOS[d.tipo].icone} text-2xl text-primary-700`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-gray-900">{d.titulo}</p>
                  <p className="text-xs text-gray-500">
                    {TIPOS[d.tipo].rotulo} · {new Date(d.enviado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                  </p>
                  {d.novo ? <Tag value="Novo" severity="info" className="mt-1" /> : null}
                </div>
                <Button type="button" label="Abrir" size="small" onClick={() => abrir(d)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";

// Seções "Fórmulas" e "Avaliações Físicas" da aba Dietas do paciente.
// Abrir um documento tira só o aviso dele; o paciente pode excluir um
// documento enviado por engano (some daqui; o nutricionista vê no histórico).

type Documento = {
  caminho: string;
  tipo: "formulas" | "avaliacao";
  bucket: "documentos" | "avaliacoes";
  titulo: string;
  file_name: string;
  enviado_em: string;
  novo: boolean;
};

const SECOES = [
  { tipo: "formulas", titulo: "Fórmulas", vazio: "Nenhuma fórmula recebida até o momento.", icone: "pi pi-box" },
  { tipo: "avaliacao", titulo: "Avaliações Físicas", vazio: "Nenhuma avaliação física recebida até o momento.", icone: "pi pi-chart-line" },
] as const;

function dataDoEnvio(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export default function DocumentosDaAbaDietas() {
  const [documentos, setDocumentos] = useState<Documento[] | null>(null);

  const carregar = useCallback(async () => {
    const resposta = await fetch("/api/area-paciente/publicacoes", { cache: "no-store" }).catch(() => null);
    const dados = resposta?.ok ? await resposta.json() : { documentos: [] };
    setDocumentos(dados.documentos ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function abrir(doc: Documento) {
    const { data, error } = await api.storage.from(doc.bucket).createSignedUrl(doc.caminho, 60);
    if (error || !data?.signedUrl) {
      avisar("Não foi possível abrir o PDF.");
      return;
    }
    abrirDocumento(data.signedUrl, doc.file_name);
    if (doc.novo) {
      await fetch("/api/area-paciente/publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminho: doc.caminho }),
      }).catch(() => undefined);
      setDocumentos((atuais) => atuais?.map((d) => (d.caminho === doc.caminho ? { ...d, novo: false } : d)) ?? null);
    }
  }

  async function excluir(doc: Documento) {
    const confirmado = await pedirConfirmacao(
      `Excluir “${doc.titulo}” da sua área? Use quando o documento foi enviado por engano. Ele deixa de aparecer para você.`,
      { aceitar: "Excluir documento", rejeitar: "Cancelar", titulo: "Excluir documento" }
    );
    if (!confirmado) return;
    const resposta = await fetch("/api/area-paciente/publicacoes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caminho: doc.caminho }),
    }).catch(() => null);
    if (!resposta?.ok) {
      avisar("Não foi possível excluir o documento.", "error");
      return;
    }
    avisar("Documento excluído.", "success");
    await carregar();
  }

  return (
    <>
      {SECOES.map((secao) => {
        const lista = documentos?.filter((d) => d.tipo === secao.tipo) ?? [];
        return (
          <section key={secao.tipo} className="mt-8" aria-label={secao.titulo}>
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              {secao.titulo}
              {lista.some((d) => d.novo) ? <span className="ponto-novidade" aria-hidden /> : null}
            </h2>
            {documentos === null ? (
              <Skeleton height="5rem" borderRadius="16px" className="mt-3" />
            ) : lista.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">{secao.vazio}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {lista.map((doc) => (
                  <li key={doc.caminho} className="cartao flex gap-3 p-4">
                    <i className={`${secao.icone} mt-0.5 text-xl text-primary-700`} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold text-gray-900">{doc.titulo}</p>
                      <p className="text-sm text-gray-500">Enviado em {dataDoEnvio(doc.enviado_em)}</p>
                      {doc.novo ? <Tag value="Novo documento disponível" severity="danger" className="mt-1" /> : null}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Button type="button" label="Abrir PDF" size="small" icon="pi pi-file-pdf" onClick={() => abrir(doc)} />
                        <Button
                          type="button"
                          icon="pi pi-trash"
                          label="Excluir"
                          text
                          size="small"
                          severity="danger"
                          aria-label={`Excluir ${doc.titulo}`}
                          onClick={() => excluir(doc)}
                        />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}

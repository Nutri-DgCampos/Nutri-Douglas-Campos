"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";

type Exame = {
  id: string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
  analysis_status: "pendente" | "processando" | "concluida" | "falhou";
  analysis_text: string | null;
  analysis_error: string | null;
  patients: { name: string } | null;
};

const SITUACAO: Record<Exame["analysis_status"], { rotulo: string; tipo: "success" | "warning" | "danger" | "info" }> = {
  pendente: { rotulo: "Aguardando análise", tipo: "info" },
  processando: { rotulo: "Analisando", tipo: "warning" },
  concluida: { rotulo: "Analisado", tipo: "success" },
  falhou: { rotulo: "Falha na análise", tipo: "danger" },
};

// Exames de sangue enviados pelos pacientes, com a análise da IA.
// A análise é só para o nutricionista: o paciente nunca a vê.
export default function ExamesPage() {
  const [exames, setExames] = useState<Exame[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [analisando, setAnalisando] = useState<string | null>(null);

  async function carregar() {
    const { data, error } = await api
      .from("blood_exams")
      .select("id, file_name, storage_path, uploaded_at, analysis_status, analysis_text, analysis_error, patients ( name )")
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar exames:", error);
      avisar("Não foi possível carregar os exames.", "error");
    } else {
      setExames(data ?? []);
    }

    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  // Enquanto houver análise em andamento, atualiza a lista sozinha.
  useEffect(() => {
    const emAndamento = exames.some(
      (exame) => exame.analysis_status === "pendente" || exame.analysis_status === "processando"
    );

    if (!emAndamento) return;

    const intervalo = setInterval(carregar, 8000);
    return () => clearInterval(intervalo);
  }, [exames]);

  async function abrirExame(caminho: string) {
    const { data, error } = await api.storage.from("exames").createSignedUrl(caminho, 60);

    if (error || !data?.signedUrl) {
      avisar("Não foi possível abrir o exame.", "error");
      return;
    }

    abrirDocumento(data.signedUrl);
  }

  async function analisarDeNovo(id: string) {
    setAnalisando(id);

    try {
      const resposta = await fetch(`/api/exames/${id}/analisar`, { method: "POST" });

      if (!resposta.ok) {
        avisar("Não foi possível analisar o exame.", "error");
      }
    } finally {
      setAnalisando(null);
      carregar();
    }
  }

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <CabecalhoPagina
          titulo="Exames de sangue"
          descricao="Exames enviados pelos pacientes, com os valores fora da referência destacados pela IA."
        />

        <p className="mt-3 flex items-start gap-2 text-sm text-gray-500">
          <i className="pi pi-lock mt-0.5" aria-hidden />
          A análise é visível somente para você; o paciente vê apenas que o exame foi enviado.
        </p>

        {carregando ? (
          <div className="mt-6 space-y-3">
            <Skeleton height="10rem" borderRadius="16px" />
          </div>
        ) : exames.length === 0 ? (
          <div className="cartao mt-6 p-6 text-center">
            <i className="pi pi-heart text-3xl text-gray-400" aria-hidden />
            <p className="mt-3 font-semibold text-gray-900">Nenhum exame enviado ainda.</p>
            <p className="mt-1 text-sm text-gray-500">
              Os exames que os pacientes anexarem pelo aplicativo aparecem aqui.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {exames.map((exame) => (
              <li key={exame.id} className="cartao p-5 lg:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-gray-900">
                      {exame.patients?.name ?? "Paciente"}
                    </h2>
                    <p className="text-sm text-gray-500">
                      Enviado em{" "}
                      {new Date(exame.uploaded_at).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>

                  <Tag
                    value={SITUACAO[exame.analysis_status].rotulo}
                    severity={SITUACAO[exame.analysis_status].tipo}
                    className="selo-status"
                  />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    icon="pi pi-file"
                    label="Abrir exame"
                    size="small"
                    outlined
                    onClick={() => abrirExame(exame.storage_path)}
                  />

                  {(exame.analysis_status === "concluida" || exame.analysis_status === "falhou") && (
                    <Button
                      type="button"
                      icon="pi pi-refresh"
                      label="Analisar novamente"
                      size="small"
                      text
                      loading={analisando === exame.id}
                      onClick={() => analisarDeNovo(exame.id)}
                    />
                  )}
                </div>

                {exame.analysis_status === "concluida" && exame.analysis_text && (
                  <div className="mt-4 rounded-xl bg-gray-50 p-4">
                    <p className="flex items-center gap-2 font-semibold text-gray-900">
                      <i className="pi pi-sparkles text-primary-600" aria-hidden />
                      Análise da IA
                    </p>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                      {exame.analysis_text}
                    </p>
                    <p className="mt-3 text-xs text-gray-500">
                      Gerada automaticamente a partir do laudo. Confira os valores no exame antes de usar.
                    </p>
                  </div>
                )}

                {(exame.analysis_status === "pendente" || exame.analysis_status === "processando") && (
                  <p className="mt-4 text-sm text-gray-500">
                    A IA está lendo o exame. A análise aparece aqui em alguns instantes.
                  </p>
                )}

                {exame.analysis_status === "falhou" && (
                  <p className="mt-4 text-sm text-red-700">
                    Não foi possível analisar: {exame.analysis_error ?? "erro desconhecido"}.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

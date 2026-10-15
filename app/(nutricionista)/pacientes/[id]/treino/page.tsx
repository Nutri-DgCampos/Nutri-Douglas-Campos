"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import PainelTreino from "@/components/PainelTreino";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import type { PlanoDeTreino } from "@/lib/treino";

type Treino = {
  id: string;
  status: "pendente" | "processando" | "concluido" | "falhou";
  erro: string | null;
  file_name: string | null;
  storage_path: string | null;
  texto_enviado: string | null;
  plano: PlanoDeTreino | null;
  comentario_ia: string | null;
  created_at: string;
  atualizado_em: string | null;
};

// Treino enviado pelo paciente, com volume, carga, gasto estimado e nível.
export default function TreinoDoPacientePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [treino, setTreino] = useState<Treino | null | undefined>(undefined);
  const [lendoDeNovo, setLendoDeNovo] = useState(false);

  const carregar = useCallback(async () => {
    const [paciente, ultimo] = await Promise.all([
      api.from("patients").select("name").eq("id", params.id).maybeSingle(),
      api
        .from("treinos")
        .select("id, status, erro, file_name, storage_path, texto_enviado, plano, comentario_ia, created_at, atualizado_em")
        .eq("patient_id", params.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    setNome(paciente.data?.name ?? "");
    setTreino((ultimo.data as Treino | null) ?? null);
  }, [params.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lendo = treino?.status === "pendente" || treino?.status === "processando";

  useEffect(() => {
    if (!lendo) return;

    const intervalo = setInterval(carregar, 4000);
    return () => clearInterval(intervalo);
  }, [lendo, carregar]);

  async function abrirOriginal() {
    if (!treino?.storage_path) return;

    const { data, error } = await api.storage.from("treinos").createSignedUrl(treino.storage_path, 300);

    if (error || !data) {
      avisar("Não foi possível abrir o arquivo.", "error");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener");
  }

  async function lerDeNovo() {
    if (!treino) return;

    setLendoDeNovo(true);
    const resposta = await fetch(`/api/treinos/${treino.id}/analisar`, { method: "POST" });
    setLendoDeNovo(false);

    if (!resposta.ok) {
      avisar("Não foi possível ler o treino novamente.", "error");
      return;
    }

    await carregar();
  }

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar para o paciente" onClick={() => router.push(`/pacientes/${params.id}`)} />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Treino</h1>
            <p className="mt-2 text-gray-600">{nome}</p>
          </div>

          {treino && (
            <div className="flex flex-wrap gap-2">
              {treino.storage_path && (
                <Button
                  type="button"
                  outlined
                  icon="pi pi-file"
                  label="Arquivo enviado"
                  onClick={abrirOriginal}
                />
              )}
              <Button
                type="button"
                outlined
                icon="pi pi-refresh"
                label="Ler novamente"
                loading={lendoDeNovo || lendo}
                disabled={lendo}
                onClick={lerDeNovo}
              />
            </div>
          )}
        </div>

        {treino === undefined ? (
          <Skeleton height="24rem" borderRadius="16px" />
        ) : treino === null ? (
          <div className="cartao p-6 text-center">
            <i className="pi pi-bolt text-3xl text-gray-400" aria-hidden />
            <p className="mt-3 font-semibold text-gray-900">O paciente ainda não enviou o treino.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Enviado em {new Date(treino.created_at).toLocaleDateString("pt-BR")}
              {treino.atualizado_em &&
                ` · ajustado pelo paciente em ${new Date(treino.atualizado_em).toLocaleDateString("pt-BR")}`}
            </p>

            {lendo && (
              <Message severity="info" text="A IA está lendo o treino. Aguarde alguns segundos." className="w-full justify-start" />
            )}

            {treino.status === "falhou" && (
              <Message
                severity="error"
                text={`Não foi possível ler o treino. ${treino.erro ?? ""}`}
                className="w-full justify-start"
              />
            )}

            {treino.comentario_ia && (
              <section className="cartao p-5">
                <h2 className="font-bold text-gray-900">Leitura da IA</h2>
                <p className="mt-2 whitespace-pre-line text-gray-700">{treino.comentario_ia}</p>
              </section>
            )}

            {treino.plano && <PainelTreino plano={treino.plano} />}

            {treino.texto_enviado && (
              <details className="cartao p-5">
                <summary className="cursor-pointer font-bold text-gray-900">Texto enviado pelo paciente</summary>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-gray-700">{treino.texto_enviado}</pre>
              </details>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

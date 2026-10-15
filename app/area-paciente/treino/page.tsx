"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import PainelTreino from "@/components/PainelTreino";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import type { PlanoDeTreino } from "@/lib/treino";

type Treino = { id: string; plano: PlanoDeTreino | null; analisado_em: string | null };

// Treino do paciente organizado por dia, com séries, repetições, carga e
// descanso editáveis.
export default function TreinoPacientePage() {
  const router = useRouter();
  const [treino, setTreino] = useState<Treino | null | undefined>(undefined);

  useEffect(() => {
    api
      .from("treinos")
      .select("id, plano, analisado_em")
      .eq("status", "concluido")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("Erro ao carregar treino:", error);
        setTreino((data as Treino | null) ?? null);
      });
  }, []);

  async function salvar(plano: PlanoDeTreino) {
    if (!treino) return false;

    const { error } = await api
      .from("treinos")
      .update({ plano, atualizado_em: new Date().toISOString() })
      .eq("id", treino.id);

    if (error) {
      console.error("Erro ao salvar treino:", error);
      avisar("Não foi possível salvar as alterações.", "error");
      return false;
    }

    setTreino({ ...treino, plano });
    avisar("Treino atualizado.", "success");
    return true;
  }

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md lg:max-w-5xl">
        <BotaoVoltar rotulo="Voltar para o início" onClick={() => router.push("/area-paciente")} />

        <CabecalhoPagina
          titulo="Meu treino"
          descricao="Toque em um dia para ver os exercícios e ajustar séries, repetições, carga e descanso."
        />

        <div className="mt-6">
          {treino === undefined ? (
            <Skeleton height="24rem" borderRadius="16px" />
          ) : !treino?.plano ? (
            <div className="cartao p-6 text-center">
              <i className="pi pi-bolt text-3xl text-gray-400" aria-hidden />
              <p className="mt-3 font-semibold text-gray-900">Nenhum treino organizado ainda.</p>
              <p className="mt-1 text-sm text-gray-500">Anexe seu treino na tela inicial.</p>
            </div>
          ) : (
            <PainelTreino plano={treino.plano} onSalvar={salvar} />
          )}
        </div>
      </div>
    </main>
  );
}

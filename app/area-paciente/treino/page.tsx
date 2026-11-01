"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import PainelTreino, { type RegistroDoDia } from "@/components/PainelTreino";
import { avisar } from "@/lib/avisos";
import { planoComRegistros, type ChaveDia, type RelatoDeDesconforto, type ExercicioRegistrado, type PlanoDeTreino, type SessaoRegistrada } from "@/lib/treino";

type Treino = {
  prescricao: { id: string; origem: "externa" | "profissional"; plano: PlanoDeTreino };
  datas: Record<ChaveDia, string>;
  sessoes: Partial<Record<ChaveDia, SessaoRegistrada>>;
  ultimos: Record<string, Record<number, ExercicioRegistrado>>;
  anteriores: Partial<Record<ChaveDia, Record<number, { carga_kg: number; data: string }>>>;
};

// Treino do aluno por dia: o que ele informa (séries, repetições, carga,
// descanso, situação e observação) é registrado na semana, sem alterar o
// treino prescrito.
export default function TreinoPacientePage() {
  const router = useRouter();
  const [treino, setTreino] = useState<Treino | null | undefined>(undefined);

  useEffect(() => {
    fetch("/api/area-paciente/treino", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { treino: null }))
      .then((dados) => setTreino(dados.treino ?? null))
      .catch(() => setTreino(null));
  }, []);

  async function registrar(registro: RegistroDoDia) {
    if (!treino) return false;
    const resposta = await fetch("/api/area-paciente/treino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registro, prescricaoId: treino.prescricao.id }),
    }).catch(() => null);
    const dados = await resposta?.json().catch(() => null);

    if (!resposta?.ok) {
      avisar(dados?.erro ?? "Não foi possível salvar. Confira a conexão e tente de novo.", "error");
      return false;
    }

    setTreino(dados.treino);
    avisar("Treino registrado.", "success");
    return true;
  }

  // Devolve null quando gravado; senão, a mensagem para o aluno. Sem
  // conexão, não afirma que o profissional foi avisado.
  async function relatarDesconforto(relato: RelatoDeDesconforto) {
    const resposta = await fetch("/api/area-paciente/treino/desconforto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(relato),
    }).catch(() => null);
    if (!resposta) return "Sem conexão: o relato ainda não foi enviado. Tente de novo quando a internet voltar.";
    if (!resposta.ok) return (await resposta.json().catch(() => null))?.erro ?? "Não foi possível enviar o relato. Tente de novo.";
    return null;
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
          ) : !treino ? (
            <div className="cartao p-6 text-center">
              <i className="pi pi-bolt text-3xl text-gray-400" aria-hidden />
              <p className="mt-3 font-semibold text-gray-900">Nenhum treino organizado ainda.</p>
              <p className="mt-1 text-sm text-gray-500">Anexe seu treino na tela inicial.</p>
            </div>
          ) : (
            <PainelTreino
              plano={planoComRegistros(treino.prescricao.plano, treino.ultimos)}
              prescricao={treino.prescricao.plano}
              sessoes={treino.sessoes}
              anteriores={treino.anteriores}
              datas={treino.datas}
              onRegistrar={registrar}
              onRelatarDesconforto={relatarDesconforto}
            />
          )}
        </div>
      </div>
    </main>
  );
}

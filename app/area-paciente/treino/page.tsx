"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import PainelTreino, { type RegistroDoDia } from "@/components/PainelTreino";
import AtividadesDoAluno from "@/components/treino/AtividadesDoAluno";
import { avisar } from "@/lib/avisos";
import { planoComRegistros, type ChaveDia, type RelatoDeDesconforto, type ExercicioRegistrado, type PlanoDeTreino, type SessaoRegistrada } from "@/lib/treino";

type Treino = {
  prescricao: { id: string; origem: "externa" | "profissional"; plano: PlanoDeTreino };
  datas: Record<ChaveDia, string>;
  sessoes: Partial<Record<ChaveDia, SessaoRegistrada>>;
  ultimos: Record<string, Record<number, ExercicioRegistrado>>;
  anteriores: Partial<Record<ChaveDia, Record<number, { carga_kg: number; data: string }>>>;
};

type Resposta = { treino: Treino | null; caloriasInformadas: number | null };

// Treino do aluno por dia: o que ele informa (séries, repetições, carga,
// descanso, situação, calorias e observação) é registrado na semana, sem
// alterar o treino prescrito. Corrida e ciclismo têm registro próprio (T4b).
export default function TreinoPacientePage() {
  const router = useRouter();
  const [dados, setDados] = useState<Resposta | null | undefined>(undefined);

  const buscar = useCallback(
    () =>
      fetch("/api/area-paciente/treino", { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Resposta>) : { treino: null, caloriasInformadas: null }))
        .catch(() => ({ treino: null, caloriasInformadas: null })),
    []
  );

  useEffect(() => {
    buscar().then(setDados);
  }, [buscar]);

  const treino = dados?.treino ?? null;

  async function registrar(registro: RegistroDoDia) {
    if (!treino) return false;
    const resposta = await fetch("/api/area-paciente/treino", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...registro, prescricaoId: treino.prescricao.id }),
    }).catch(() => null);
    const corpo = await resposta?.json().catch(() => null);

    if (!resposta?.ok) {
      avisar(corpo?.erro ?? "Não foi possível salvar. Confira a conexão e tente de novo.", "error");
      return false;
    }

    setDados(corpo);
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
          descricao="Toque em um dia para ver os exercícios e ajustar séries, repetições, carga e descanso. Corridas e pedais ficam logo abaixo."
        />

        <div className="mt-6 space-y-4">
          {dados === undefined ? (
            <Skeleton height="24rem" borderRadius="16px" />
          ) : !treino ? (
            <div className="cartao p-6 text-center">
              <i className="pi pi-bolt text-3xl text-gray-400" aria-hidden />
              <p className="mt-3 font-semibold text-gray-900">Nenhum treino de musculação organizado ainda.</p>
              <p className="mt-1 text-sm text-gray-500">Anexe seu treino na tela inicial ou aguarde o envio do seu profissional.</p>
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
              caloriasInformadas={dados?.caloriasInformadas ?? null}
            />
          )}

          {dados !== undefined ? <AtividadesDoAluno onRelatarDesconforto={relatarDesconforto} onAlterado={() => buscar().then(setDados)} /> : null}
        </div>
      </div>
    </main>
  );
}

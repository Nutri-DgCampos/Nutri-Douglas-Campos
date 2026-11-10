"use client";

import { useParams, useRouter } from "next/navigation";
import FichaDoFormulario from "@/components/nutricao/anamnese/FichaDoFormulario";

// Ficha de anamnese no Treino (SPEC 06/11, anamnese): a mesma da Nutrição,
// pela API do Treino. Só o autor altera; quem acompanha o aluno lê as
// preenchidas.
export default function AnamneseDoTreinoPage() {
  const { id, anamneseId } = useParams<{ id: string; anamneseId: string }>();
  const router = useRouter();
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-4xl">
        <FichaDoFormulario key={anamneseId} tipo="anamnese" id={anamneseId} treino rotuloVoltar="Voltar à ficha do aluno" voltar={() => router.push(`/treino/alunos/${id}`)} />
      </div>
    </main>
  );
}

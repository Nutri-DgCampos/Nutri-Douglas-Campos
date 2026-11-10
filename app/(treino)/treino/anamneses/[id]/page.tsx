"use client";

import { useParams } from "next/navigation";
import EditorDeModeloAnamnese from "@/components/nutricao/anamnese/EditorDeModeloAnamnese";

// Modelo de anamnese do Treino (SPEC 06/11, anamnese): o mesmo editor da
// Nutrição, com os modelos do próprio profissional.
export default function ModeloDeAnamneseDoTreinoPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <EditorDeModeloAnamnese key={id} id={id} treino />
      </div>
    </main>
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import FichaDoFormulario from "@/components/nutricao/anamnese/FichaDoFormulario";

// Anamnese preenchida no Módulo de Treino, vista pelo nutricionista (SPEC
// 06/11, anamnese): só leitura, sem as notas do educador.
export default function AnamneseDoTreinoNaNutricaoPage() {
  const { pacienteId, id } = useParams<{ pacienteId: string; id: string }>();
  const router = useRouter();
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-4xl">
        <FichaDoFormulario key={id} tipo="anamnese" id={id} rotuloVoltar="Voltar ao paciente" voltar={() => router.push(`/nutricao/${pacienteId}`)} />
      </div>
    </main>
  );
}

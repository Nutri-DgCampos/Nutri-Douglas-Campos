"use client";

import { useParams, useRouter } from "next/navigation";
import FichaDoFormulario from "@/components/nutricao/anamnese/FichaDoFormulario";

export default function FichaPage() {
  const { pacienteId, consultaId, id } = useParams<{ pacienteId: string; consultaId: string; id: string }>();
  const router = useRouter();
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-4xl">
        <FichaDoFormulario key={id} tipo="recordatorio" id={id} voltar={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}`)} />
      </div>
    </main>
  );
}

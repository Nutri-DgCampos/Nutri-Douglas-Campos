"use client";

import { useParams, useRouter } from "next/navigation";
import SolicitacaoDeExames from "@/components/nutricao/exames/SolicitacaoDeExames";

export default function SolicitacaoDeExamesPage() {
  const { pacienteId, consultaId, id } = useParams<{ pacienteId: string; consultaId: string; id: string }>();
  const router = useRouter();
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-3xl">
        <SolicitacaoDeExames key={id} id={id} voltar={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}`)} />
      </div>
    </main>
  );
}

"use client";

import { useParams, useRouter } from "next/navigation";
import ResultadosDaAvaliacao from "@/components/nutricao/avaliacao/ResultadosDaAvaliacao";

export default function ResultadosDaAvaliacaoPage() {
  const { pacienteId, consultaId, avaliacaoId } = useParams<{ pacienteId: string; consultaId: string; avaliacaoId: string }>();
  const router = useRouter();
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-3 text-2xl font-bold text-gray-900">Resultados da avaliação física</h1>
        <ResultadosDaAvaliacao avaliacaoId={avaliacaoId} voltar={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/avaliacao/${avaliacaoId}`)} />
      </div>
    </main>
  );
}

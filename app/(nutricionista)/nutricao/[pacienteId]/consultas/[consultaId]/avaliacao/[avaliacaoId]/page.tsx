"use client";

import { useParams, useRouter } from "next/navigation";
import BotaoVoltar from "@/components/BotaoVoltar";
import EditorDaAvaliacao from "@/components/nutricao/avaliacao/EditorDaAvaliacao";

export default function AvaliacaoFisicaPage() {
  const { pacienteId, consultaId, avaliacaoId } = useParams<{ pacienteId: string; consultaId: string; avaliacaoId: string }>();
  const router = useRouter();
  const consulta = `/nutricao/${pacienteId}/consultas/${consultaId}`;
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <BotaoVoltar rotulo="Voltar à consulta" onClick={() => router.push(consulta)} />
        <h1 className="mb-3 text-2xl font-bold text-gray-900">Avaliação física</h1>
        <EditorDaAvaliacao
          key={avaliacaoId}
          avaliacaoId={avaliacaoId}
          voltar={() => router.push(consulta)}
          resultadosHref={`${consulta}/avaliacao/${avaliacaoId}/resultados`}
        />
      </div>
    </main>
  );
}

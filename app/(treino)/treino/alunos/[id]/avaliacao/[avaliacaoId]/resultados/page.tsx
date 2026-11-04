"use client";

import { useParams, useRouter } from "next/navigation";
import BotaoVoltar from "@/components/BotaoVoltar";
import ResultadosDaAvaliacao from "@/components/nutricao/avaliacao/ResultadosDaAvaliacao";

// Resultados da avaliação física no Treino (T6): a de qualquer profissional
// que acompanha o aluno, com o autor; só o autor volta ao editor.
export default function ResultadosDaAvaliacaoNoTreinoPage() {
  const { id, avaliacaoId } = useParams<{ id: string; avaliacaoId: string }>();
  const router = useRouter();
  const ficha = `/treino/alunos/${id}`;
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <BotaoVoltar rotulo="Voltar para a ficha do aluno" onClick={() => router.push(ficha)} />
        <h1 className="mb-3 text-2xl font-bold text-gray-900">Resultados da avaliação física</h1>
        <ResultadosDaAvaliacao
          avaliacaoId={avaliacaoId}
          api="/api/treino/avaliacoes"
          rotuloVoltar="Abrir no editor (só quem fez)"
          voltar={() => router.push(`${ficha}/avaliacao/${avaliacaoId}`)}
        />
      </div>
    </main>
  );
}

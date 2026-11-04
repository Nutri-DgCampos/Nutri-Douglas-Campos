"use client";

import { useParams, useRouter } from "next/navigation";
import BotaoVoltar from "@/components/BotaoVoltar";
import EditorDaAvaliacao from "@/components/nutricao/avaliacao/EditorDaAvaliacao";

// Avaliação física feita no Módulo de Treino (T6, R7): o mesmo editor e os
// mesmos métodos da Nutrição, sem envio ao paciente e sem a leitura do PDF de
// bioimpedância pela IA.
export default function AvaliacaoDoTreinoPage() {
  const { id, avaliacaoId } = useParams<{ id: string; avaliacaoId: string }>();
  const router = useRouter();
  const ficha = `/treino/alunos/${id}`;
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <BotaoVoltar rotulo="Voltar para a ficha do aluno" onClick={() => router.push(ficha)} />
        <h1 className="mb-3 text-2xl font-bold text-gray-900">Avaliação física</h1>
        <EditorDaAvaliacao
          key={avaliacaoId}
          avaliacaoId={avaliacaoId}
          voltar={() => router.push(ficha)}
          resultadosHref={`${ficha}/avaliacao/${avaliacaoId}/resultados`}
          api="/api/treino/avaliacoes"
          comEnvio={false}
          comLeituraDePdf={false}
        />
      </div>
    </main>
  );
}

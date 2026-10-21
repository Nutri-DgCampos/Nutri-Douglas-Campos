"use client";

import { useParams, useRouter } from "next/navigation";
import BotaoVoltar from "@/components/BotaoVoltar";
import MedicacoesDaConsulta from "@/components/nutricao/medicacoes/MedicacoesDaConsulta";

export default function MedicacoesPage() {
  const { pacienteId, consultaId } = useParams<{ pacienteId: string; consultaId: string }>();
  const router = useRouter();
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar à consulta" onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}`)} />
        <MedicacoesDaConsulta pacienteId={pacienteId} consultaId={consultaId} />
      </div>
    </main>
  );
}

"use client";

import { Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import BotaoVoltar from "@/components/BotaoVoltar";
import FormulasDaConsulta from "@/components/nutricao/formulas/FormulasDaConsulta";

function Conteudo() {
  const { pacienteId, consultaId } = useParams<{ pacienteId: string; consultaId: string }>();
  const dieta = useSearchParams().get("dieta");
  const router = useRouter();
  return (
    <>
      <BotaoVoltar
        rotulo={dieta ? "Voltar à dieta" : "Voltar à consulta"}
        onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}${dieta ? `/dietas?dieta=${dieta}` : ""}`)}
      />
      <FormulasDaConsulta consultaId={consultaId} dietaInicial={dieta} />
    </>
  );
}

export default function FormulasPage() {
  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <Suspense>
          <Conteudo />
        </Suspense>
      </div>
    </main>
  );
}

"use client";

import CabecalhoPagina from "@/components/CabecalhoPagina";
import FormulariosDoPaciente from "@/components/nutricao/anamnese/FormulariosDoPaciente";

export default function MeusFormulariosPage() {
  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina titulo="Formulários" descricao="Anamnese e recordatório alimentar enviados pelo nutricionista." />
        <FormulariosDoPaciente base="/api/area-paciente/formularios" />
      </div>
    </main>
  );
}

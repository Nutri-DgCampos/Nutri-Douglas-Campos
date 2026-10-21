import type { Metadata } from "next";
import FormulariosDoPaciente from "@/components/nutricao/anamnese/FormulariosDoPaciente";

// Link individual do paciente: anamnese e recordatório sem login.
export const metadata: Metadata = {
  title: "Formulários do nutricionista",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function FormularioPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="min-h-full bg-gray-50 px-4 pb-8 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold text-primary-700">Douglas Campos · Acompanhamento nutricional</p>
        <FormulariosDoPaciente base={`/api/formulario/${encodeURIComponent(token)}`} saudacao />
        <p className="mt-8 text-center text-xs text-gray-400">
          Este link é só seu. Não compartilhe: ele dá acesso às suas respostas.
        </p>
      </div>
    </main>
  );
}

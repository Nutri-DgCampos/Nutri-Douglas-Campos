"use client";

import { useParams } from "next/navigation";
import EditorDaBiblioteca from "@/components/nutricao/EditorDaBiblioteca";
import ListaDeExames from "@/components/nutricao/exames/ListaDeExames";
import type { ExameDaLista } from "@/lib/nutricao/exames";

export default function ModeloDeExamesPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <EditorDaBiblioteca<ExameDaLista[]>
          key={id}
          tipo="exames"
          campo="exames"
          id={id}
          titulo="Modelo de solicitação de exames"
          rotuloNome="Título"
          voltarPara="/nutricao/configuracoes/exames"
          rotuloVoltar="Voltar aos modelos de exames"
        >
          {(exames, alterar) => (
            <section className="cartao p-4">
              <h2 className="mb-3 font-semibold text-gray-900">Exames</h2>
              <ListaDeExames exames={exames} onAlterar={alterar} />
            </section>
          )}
        </EditorDaBiblioteca>
      </div>
    </main>
  );
}

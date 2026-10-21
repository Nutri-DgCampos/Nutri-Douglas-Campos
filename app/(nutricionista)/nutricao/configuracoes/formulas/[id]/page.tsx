"use client";

import { useParams } from "next/navigation";
import EditorDaBiblioteca from "@/components/nutricao/EditorDaBiblioteca";
import EditorDeFormula from "@/components/nutricao/formulas/EditorDeFormula";
import type { Formula } from "@/lib/nutricao/formula";

export default function ModeloDeFormulaPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-4xl">
        <EditorDaBiblioteca<Formula>
          key={id}
          tipo="formulas"
          campo="conteudo"
          id={id}
          titulo="Modelo de fórmula"
          rotuloNome="Nome da fórmula"
          voltarPara="/nutricao/configuracoes/formulas"
          rotuloVoltar="Voltar às fórmulas"
        >
          {(formula, alterar) => (
            <section className="cartao p-4">
              <EditorDeFormula formula={formula} onAlterar={alterar} modelo />
            </section>
          )}
        </EditorDaBiblioteca>
      </div>
    </main>
  );
}

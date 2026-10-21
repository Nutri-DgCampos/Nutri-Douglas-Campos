"use client";

import { useParams } from "next/navigation";
import EditorDaBiblioteca from "@/components/nutricao/EditorDaBiblioteca";
import EditorDeBlocos from "@/components/nutricao/orientacoes/EditorDeBlocos";
import type { ConteudoOrientacao } from "@/lib/nutricao/orientacao";

export default function ModeloDeOrientacaoPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <EditorDaBiblioteca<ConteudoOrientacao>
          key={id}
          tipo="orientacoes"
          campo="conteudo"
          id={id}
          titulo="Modelo de orientação"
          rotuloNome="Título"
          voltarPara="/nutricao/configuracoes/orientacoes"
          rotuloVoltar="Voltar às orientações"
        >
          {(conteudo, alterar) => <EditorDeBlocos conteudo={conteudo} onAlterar={alterar} pasta="modelos" modelo />}
        </EditorDaBiblioteca>
      </div>
    </main>
  );
}

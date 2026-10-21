"use client";

import ListaDaBiblioteca from "@/components/nutricao/ListaDaBiblioteca";

export default function IngredientesPage() {
  return (
    <ListaDaBiblioteca
      tipo="ingredientes"
      titulo="Ingredientes"
      descricao="Nutrientes e ingredientes das fórmulas, com a dosagem de referência (sempre editável na fórmula)."
      rotuloNovo="Novo ingrediente"
      vazio="Nenhum ingrediente cadastrado."
      base="/nutricao/configuracoes/formulas/ingredientes"
      voltarPara="/nutricao/configuracoes/formulas"
      rotuloVoltar="Voltar às fórmulas"
      detalhe={(m) => [m.forma, m.dosagem ? `referência ${String(m.dosagem).replace(".", ",")} ${m.unidade ?? ""}` : null].filter(Boolean).join(" · ")}
    />
  );
}

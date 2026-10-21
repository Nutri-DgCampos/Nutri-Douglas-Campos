"use client";

import ListaDaBiblioteca from "@/components/nutricao/ListaDaBiblioteca";

export default function ModelosDeOrientacoesPage() {
  return (
    <ListaDaBiblioteca
      tipo="orientacoes"
      titulo="Orientações"
      descricao="Modelos de orientações nutricionais, com texto, imagens e assinatura."
      rotuloNovo="Nova orientação"
      vazio="Nenhuma orientação cadastrada. Clique em “Nova orientação” para criar a primeira."
      base="/nutricao/configuracoes/orientacoes"
      detalhe={(m) => (m.automatica ? "Incluída automaticamente em toda consulta" : "")}
    />
  );
}

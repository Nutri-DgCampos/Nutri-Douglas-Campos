"use client";

import ListaDaBiblioteca from "@/components/nutricao/ListaDaBiblioteca";

export default function ModelosDeExamesPage() {
  return (
    <ListaDaBiblioteca
      tipo="exames"
      titulo="Exames"
      descricao="Modelos de solicitação de exames laboratoriais."
      rotuloNovo="Novo modelo"
      vazio="Nenhum modelo de exames. Clique em “Novo modelo” para criar o primeiro."
      base="/nutricao/configuracoes/exames"
      detalhe={(m) => `${m.quantidade ?? 0} exame(s)`}
    />
  );
}

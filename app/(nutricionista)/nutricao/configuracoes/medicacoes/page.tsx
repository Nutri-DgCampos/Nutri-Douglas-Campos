"use client";

import ListaDaBiblioteca from "@/components/nutricao/ListaDaBiblioteca";

export default function MedicamentosPage() {
  return (
    <ListaDaBiblioteca
      tipo="medicamentos"
      titulo="Medicações"
      descricao="Biblioteca de medicamentos: dados básicos para preencher o registro nas consultas."
      rotuloNovo="Novo medicamento"
      vazio="Nenhum medicamento cadastrado. Também é possível salvar na biblioteca a partir da consulta."
      base="/nutricao/configuracoes/medicacoes"
      detalhe={(m) => [m.principio_ativo, m.apresentacao].filter(Boolean).join(" · ")}
    />
  );
}

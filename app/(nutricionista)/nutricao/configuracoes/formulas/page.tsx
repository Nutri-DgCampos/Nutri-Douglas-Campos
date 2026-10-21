"use client";

import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import ListaDaBiblioteca from "@/components/nutricao/ListaDaBiblioteca";

export default function ModelosDeFormulasPage() {
  const router = useRouter();
  return (
    <ListaDaBiblioteca
      tipo="formulas"
      titulo="Fórmulas"
      descricao="Modelos de fórmulas manipuladas (sem dados de paciente)."
      rotuloNovo="Nova fórmula"
      vazio="Nenhum modelo de fórmula. Crie aqui ou use “Salvar como modelo” numa consulta."
      base="/nutricao/configuracoes/formulas"
      detalhe={(m) => `${m.quantidade ?? 0} ingrediente(s)`}
      extra={<Button type="button" icon="pi pi-list" label="Ingredientes" outlined onClick={() => router.push("/nutricao/configuracoes/formulas/ingredientes")} />}
    />
  );
}

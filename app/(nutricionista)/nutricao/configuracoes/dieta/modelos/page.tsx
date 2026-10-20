"use client";

import { useRouter } from "next/navigation";
import ListaDeModelos from "@/components/nutricao/modelos/ListaDeModelos";

export default function ModelosDeDietaPage() {
  const router = useRouter();
  const base = "/nutricao/configuracoes/dieta/modelos";
  return (
    <ListaDeModelos
      tipo="dieta"
      titulo="Modelos de dieta"
      descricao="Planos alimentares completos para usar como base de novas dietas."
      rotuloNovo="Nova dieta"
      detalhe={(m) => `${m.resumo?.trim() || "Sem objetivo"} · ${m.quantidade ?? 0} refeição(ões)`}
      onNovo={() => router.push(`${base}/novo`)}
      onEditar={(id) => router.push(`${base}/${id}`)}
    />
  );
}

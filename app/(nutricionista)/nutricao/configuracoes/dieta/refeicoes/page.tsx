"use client";

import { useRouter } from "next/navigation";
import ListaDeModelos from "@/components/nutricao/modelos/ListaDeModelos";

export default function ModelosDeRefeicaoPage() {
  const router = useRouter();
  const base = "/nutricao/configuracoes/dieta/refeicoes";
  return (
    <ListaDeModelos
      tipo="refeicao"
      titulo="Modelos de refeição"
      descricao="Refeições completas para importar em qualquer refeição de uma dieta."
      rotuloNovo="Nova refeição"
      detalhe={(m) => `${m.resumo?.trim() || "Refeição sem nome"} · ${m.quantidade ?? 1} opção(ões)`}
      onNovo={() => router.push(`${base}/novo`)}
      onEditar={(id) => router.push(`${base}/${id}`)}
    />
  );
}

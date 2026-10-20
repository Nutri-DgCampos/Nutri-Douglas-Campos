"use client";

import { useParams } from "next/navigation";
import EditorDeModelo from "@/components/nutricao/modelos/EditorDeModelo";

export default function ModeloDeRefeicaoPage() {
  const { id } = useParams<{ id: string }>();
  return <EditorDeModelo key={id} tipo="refeicao" id={id} />;
}

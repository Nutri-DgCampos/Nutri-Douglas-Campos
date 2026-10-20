"use client";

import { useParams } from "next/navigation";
import EditorDeModelo from "@/components/nutricao/modelos/EditorDeModelo";

export default function ModeloDeDietaPage() {
  const { id } = useParams<{ id: string }>();
  return <EditorDeModelo key={id} tipo="dieta" id={id} />;
}

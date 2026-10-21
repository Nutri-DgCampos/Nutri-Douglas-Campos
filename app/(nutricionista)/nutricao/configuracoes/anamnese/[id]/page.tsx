"use client";

import { useParams } from "next/navigation";
import EditorDeModeloAnamnese from "@/components/nutricao/anamnese/EditorDeModeloAnamnese";

export default function ModeloDeAnamnesePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <EditorDeModeloAnamnese key={id} id={id} />
      </div>
    </main>
  );
}

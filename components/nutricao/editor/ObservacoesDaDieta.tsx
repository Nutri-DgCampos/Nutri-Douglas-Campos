"use client";

import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import type { DocumentoDieta } from "@/lib/nutricao/dieta";
import { pedirConfirmacao } from "@/lib/avisos";

// Observações gerais da dieta: várias, com título e texto, em ordem
// definida pelo nutricionista. Saem no PDF antes das trocas equivalentes.
// (A busca nos modelos de observação chega com a Fase 3.)
export default function ObservacoesDaDieta({
  documento,
  onAlterar,
}: {
  documento: DocumentoDieta;
  onAlterar: (alterar: (documento: DocumentoDieta) => void) => void;
}) {
  const lista = documento.observacoes;

  async function remover(indice: number) {
    const observacao = lista[indice];
    if (observacao.texto.trim() || observacao.titulo.trim()) {
      const confirmado = await pedirConfirmacao(`Remover a observação ${indice + 1} da dieta?`, {
        aceitar: "Remover observação",
        rejeitar: "Cancelar",
      });
      if (!confirmado) return;
    }
    onAlterar((d) => void d.observacoes.splice(indice, 1));
  }

  return (
    <section className="cartao p-3 sm:p-4" aria-label="Observações da dieta">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-gray-900">Observações da dieta</h2>
        <Button
          type="button"
          icon="pi pi-plus"
          label="Observação"
          text
          onClick={() => onAlterar((d) => void d.observacoes.push({ id: globalThis.crypto.randomUUID(), titulo: "", texto: "" }))}
        />
      </div>

      {lista.length === 0 ? <p className="mt-1 text-sm text-gray-500">Nenhuma observação (opcional).</p> : null}

      <ol className="mt-2 space-y-3">
        {lista.map((observacao, indice) => (
          <li key={observacao.id} className="flex items-start gap-2">
            <span className="mt-2 w-6 text-right text-sm font-semibold text-gray-500">{indice + 1}.</span>
            <div className="min-w-0 flex-1 space-y-1">
              <InputText
                aria-label={`Título da observação ${indice + 1}`}
                placeholder="Título (opcional)"
                value={observacao.titulo}
                className="w-full"
                onChange={(e) => onAlterar((d) => void (d.observacoes[indice].titulo = e.target.value))}
              />
              <InputTextarea
                aria-label={`Texto da observação ${indice + 1}`}
                placeholder="Orientação ao paciente"
                value={observacao.texto}
                autoResize
                rows={2}
                className="w-full"
                onChange={(e) => onAlterar((d) => void (d.observacoes[indice].texto = e.target.value))}
              />
            </div>
            <div className="flex flex-col">
              <Button
                type="button"
                icon="pi pi-angle-up"
                text
                aria-label="Subir observação"
                disabled={indice === 0}
                onClick={() =>
                  onAlterar((d) => {
                    [d.observacoes[indice - 1], d.observacoes[indice]] = [d.observacoes[indice], d.observacoes[indice - 1]];
                  })
                }
              />
              <Button
                type="button"
                icon="pi pi-angle-down"
                text
                aria-label="Descer observação"
                disabled={indice === lista.length - 1}
                onClick={() =>
                  onAlterar((d) => {
                    [d.observacoes[indice + 1], d.observacoes[indice]] = [d.observacoes[indice], d.observacoes[indice + 1]];
                  })
                }
              />
              <Button type="button" icon="pi pi-times" text severity="danger" aria-label="Remover observação" onClick={() => remover(indice)} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

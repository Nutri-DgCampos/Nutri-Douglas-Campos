"use client";

import { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";

export type AlimentoEncontrado = {
  id: string;
  nome: string;
  categoria: string | null;
  fonte: string;
  unidade_base: "g" | "ml";
  kcal: number | null;
};

// Campo de busca na base de alimentos (TACO + cadastro manual): busca por
// partes do nome, sem acento, com lista rolável e navegação pelo teclado.
export default function BuscaAlimento({
  onSelecionar,
  placeholder = "Buscar alimento",
  excluir = [],
  inputId,
}: {
  onSelecionar: (alimento: AlimentoEncontrado) => void;
  placeholder?: string;
  excluir?: string[];
  inputId?: string;
}) {
  const [texto, setTexto] = useState<string | AlimentoEncontrado>("");
  const [sugestoes, setSugestoes] = useState<AlimentoEncontrado[]>([]);

  async function buscar(consulta: string) {
    const resposta = await fetch(`/api/nutricao/alimentos?q=${encodeURIComponent(consulta)}&limite=40`, {
      cache: "no-store",
    });
    const dados = await resposta.json().catch(() => null);
    const lista = (dados?.alimentos ?? []) as AlimentoEncontrado[];
    setSugestoes(lista.filter((alimento) => !excluir.includes(alimento.id)));
  }

  return (
    <AutoComplete
      inputId={inputId}
      value={texto}
      suggestions={sugestoes}
      completeMethod={(evento) => buscar(evento.query)}
      field="nome"
      delay={250}
      minLength={2}
      placeholder={placeholder}
      showEmptyMessage
      emptyMessage="Nenhum alimento encontrado."
      scrollHeight="18rem"
      onChange={(evento) => setTexto(evento.value)}
      onSelect={(evento) => {
        onSelecionar(evento.value as AlimentoEncontrado);
        setTexto("");
      }}
      itemTemplate={(alimento: AlimentoEncontrado) => (
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate">{alimento.nome}</span>
            <span className="block text-xs text-gray-500">
              {alimento.fonte === "taco" ? "TACO" : "Cadastro próprio"}
              {alimento.categoria ? ` · ${alimento.categoria}` : ""}
            </span>
          </span>
          <span className="shrink-0 text-xs text-gray-500">
            {alimento.kcal === null ? "kcal —" : `${Math.round(alimento.kcal)} kcal/100 ${alimento.unidade_base}`}
          </span>
        </div>
      )}
      className="w-full"
      inputClassName="w-full"
    />
  );
}

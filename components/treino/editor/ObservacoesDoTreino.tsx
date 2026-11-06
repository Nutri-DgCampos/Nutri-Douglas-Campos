"use client";

import { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import type { PlanoDeTreino } from "@/lib/treino";
import { MAX_OBSERVACOES } from "@/lib/treinoEditor";

type DoCatalogo = { id: string; titulo: string; texto: string };

// Observações gerais do treino (SPEC complementar 06/11, item 2), no mesmo
// padrão das "Observações da dieta": busca no catálogo do profissional,
// inclusão (cópia editável) e "+ Observação" para escrever na hora. Ficam no
// plano: cada versão enviada guarda as suas, e o volume não muda.
export default function ObservacoesDoTreino({
  plano,
  somenteLeitura,
  onAlterar,
}: {
  plano: PlanoDeTreino;
  somenteLeitura: boolean;
  onAlterar: (alterar: (plano: PlanoDeTreino) => void) => void;
}) {
  const lista = plano.observacoes ?? [];
  const [busca, setBusca] = useState<string | DoCatalogo>("");
  const [sugestoes, setSugestoes] = useState<DoCatalogo[]>([]);
  const [guardando, setGuardando] = useState<string | null>(null);

  async function buscar(texto: string) {
    const r = await fetch(`/api/treino/observacoes?q=${encodeURIComponent(texto)}`, { cache: "no-store" }).catch(() => null);
    const dados = await r?.json().catch(() => null);
    setSugestoes(dados?.observacoes ?? []);
  }

  function adicionar(nova: { titulo: string; texto: string; modeloId?: string | null }) {
    if (lista.length >= MAX_OBSERVACOES) {
      avisar(`No máximo ${MAX_OBSERVACOES} observações no treino.`, "warn");
      return;
    }
    onAlterar((p) => void (p.observacoes = [...(p.observacoes ?? []), { id: globalThis.crypto.randomUUID(), ...nova }]));
  }

  function incluirDoCatalogo() {
    if (typeof busca === "string") return;
    if (lista.some((o) => o.modeloId === busca.id)) {
      avisar("Essa observação já está neste treino.", "warn");
      return;
    }
    adicionar({ titulo: busca.titulo, texto: busca.texto, modeloId: busca.id });
    setBusca("");
  }

  async function remover(indice: number) {
    const o = lista[indice];
    if ((o.titulo.trim() || o.texto.trim()) && !(await pedirConfirmacao(`Remover a observação ${indice + 1} do treino?`, { aceitar: "Remover", rejeitar: "Cancelar" }))) return;
    onAlterar((p) => void p.observacoes?.splice(indice, 1));
  }

  async function guardarNoCatalogo(indice: number) {
    const o = lista[indice];
    if (!o.titulo.trim()) {
      avisar("Dê um título à observação para guardá-la no catálogo.", "warn");
      return;
    }
    setGuardando(o.id);
    const r = await fetch("/api/treino/observacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: o.titulo, texto: o.texto }),
    }).catch(() => null);
    const dados = await r?.json().catch(() => null);
    setGuardando(null);
    if (!r?.ok) {
      avisar(dados?.erro ?? "Não foi possível guardar no catálogo.", "error");
      return;
    }
    onAlterar((p) => {
      if (p.observacoes?.[indice]) p.observacoes[indice].modeloId = dados.id;
    });
    avisar("Observação guardada no seu catálogo. Use a busca para incluí-la em outros treinos.", "success");
  }

  const mover = (de: number, para: number) =>
    onAlterar((p) => {
      const o = p.observacoes;
      if (o) [o[de], o[para]] = [o[para], o[de]];
    });

  return (
    <section className="cartao p-3 sm:p-4" aria-label="Observações do treino">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-gray-900">Observações do treino</h2>
        <Button type="button" icon="pi pi-plus" label="Observação" text disabled={somenteLeitura} onClick={() => adicionar({ titulo: "", texto: "" })} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <AutoComplete
          inputId="observacao-treino-busca"
          value={busca}
          suggestions={sugestoes}
          completeMethod={(e) => buscar(e.query)}
          field="titulo"
          delay={250}
          minLength={0}
          dropdown
          dropdownAriaLabel="Ver observações do catálogo"
          disabled={somenteLeitura}
          placeholder="Buscar observação cadastrada pelo título"
          onChange={(e) => setBusca(e.value)}
          showEmptyMessage
          emptyMessage="Nenhuma observação no seu catálogo. Escreva uma em “+ Observação” e guarde-a."
          itemTemplate={(o: DoCatalogo) => (
            <span className="block max-w-[32rem]">
              <span className="block">{o.titulo}</span>
              {o.texto ? <span className="block truncate text-xs text-gray-500">{o.texto}</span> : null}
            </span>
          )}
          className="min-w-0 flex-1"
          inputClassName="w-full"
        />
        <Button
          type="button"
          icon="pi pi-plus"
          aria-label="Incluir observação selecionada"
          tooltip="Incluir no treino"
          disabled={somenteLeitura || typeof busca === "string"}
          onClick={incluirDoCatalogo}
        />
      </div>

      {lista.length === 0 ? <p className="mt-2 text-sm text-gray-500">Nenhuma observação (opcional).</p> : null}

      <ol className="mt-2 space-y-3">
        {lista.map((observacao, indice) => (
          <li key={observacao.id} className="flex items-start gap-2">
            <span className="mt-2 w-6 text-right text-sm font-semibold text-gray-500">{indice + 1}.</span>
            <div className="min-w-0 flex-1 space-y-1">
              <InputText
                aria-label={`Título da observação ${indice + 1}`}
                placeholder="Título (opcional)"
                value={observacao.titulo}
                maxLength={120}
                disabled={somenteLeitura}
                className="w-full"
                onChange={(e) => onAlterar((p) => void (p.observacoes![indice].titulo = e.target.value))}
              />
              <InputTextarea
                aria-label={`Texto da observação ${indice + 1}`}
                placeholder="Orientação ao aluno"
                value={observacao.texto}
                maxLength={2000}
                autoResize
                rows={2}
                disabled={somenteLeitura}
                className="w-full"
                onChange={(e) => onAlterar((p) => void (p.observacoes![indice].texto = e.target.value))}
              />
            </div>
            <div className="flex flex-col">
              <Button type="button" icon="pi pi-angle-up" text aria-label="Subir observação" disabled={somenteLeitura || indice === 0} onClick={() => mover(indice, indice - 1)} />
              <Button
                type="button"
                icon="pi pi-angle-down"
                text
                aria-label="Descer observação"
                disabled={somenteLeitura || indice === lista.length - 1}
                onClick={() => mover(indice, indice + 1)}
              />
              {observacao.modeloId ? null : (
                <Button
                  type="button"
                  icon="pi pi-bookmark"
                  text
                  aria-label="Guardar no catálogo"
                  tooltip="Guardar no meu catálogo"
                  loading={guardando === observacao.id}
                  disabled={somenteLeitura}
                  onClick={() => guardarNoCatalogo(indice)}
                />
              )}
              <Button type="button" icon="pi pi-times" text severity="danger" aria-label="Remover observação" disabled={somenteLeitura} onClick={() => remover(indice)} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

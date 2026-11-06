"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Observacao = { id: string; titulo: string; texto: string };

// Catálogo de observações do treino do profissional (SPEC complementar
// 06/11, item 2), na Biblioteca do Treino. Mudar ou remover aqui não altera
// os treinos que já usaram a observação (cada treino guarda a sua cópia).
export default function CatalogoDeObservacoes() {
  const [lista, setLista] = useState<Observacao[] | null>(null);
  const [form, setForm] = useState<{ id: string | null; titulo: string; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/treino/observacoes", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    setLista(d?.observacoes ?? []);
  }, []);

  useEffect(() => {
    fetch("/api/treino/observacoes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setLista(d?.observacoes ?? []))
      .catch(() => setLista([]));
  }, []);

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    const r = await fetch(form.id ? `/api/treino/observacoes/${form.id}` : "/api/treino/observacoes", {
      method: form.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: form.titulo, texto: form.texto }),
    }).catch(() => null);
    setSalvando(false);
    if (!r?.ok) {
      avisar((await r?.json().catch(() => null))?.erro ?? "Não foi possível salvar.", "error");
      return;
    }
    avisar(form.id ? "Observação salva. Treinos que já a usaram não mudam." : "Observação cadastrada.", "success");
    setForm(null);
    void carregar();
  }

  async function remover(o: Observacao) {
    if (!(await pedirConfirmacao(`Remover "${o.titulo}" do catálogo? Os treinos que já a usaram continuam com ela.`, { aceitar: "Remover", rejeitar: "Cancelar" }))) return;
    const r = await fetch(`/api/treino/observacoes/${o.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) avisar("Não foi possível remover.", "error");
    void carregar();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Observações que você reutiliza nos treinos. No editor, busque pelo título e inclua.</p>
        <Button type="button" icon="pi pi-plus" label="Nova observação" onClick={() => setForm({ id: null, titulo: "", texto: "" })} />
      </div>

      {lista === null ? (
        <Skeleton height="8rem" borderRadius="16px" />
      ) : lista.length === 0 ? (
        <p className="cartao p-4 text-sm text-gray-500">Nenhuma observação cadastrada.</p>
      ) : (
        <ul className="cartao divide-y divide-gray-100">
          {lista.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{o.titulo}</p>
                {o.texto ? <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{o.texto}</p> : null}
              </div>
              <Button type="button" size="small" outlined icon="pi pi-pencil" label="Editar" onClick={() => setForm({ ...o })} />
              <Button type="button" size="small" text severity="danger" icon="pi pi-trash" label="Remover" onClick={() => remover(o)} />
            </li>
          ))}
        </ul>
      )}

      <Dialog header={form?.id ? "Editar observação" : "Nova observação"} visible={form !== null} onHide={() => setForm(null)} className="w-full max-w-lg" modal>
        {form ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Título</span>
              <InputText value={form.titulo} maxLength={120} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className="w-full" aria-label="Título" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Texto</span>
              <InputTextarea value={form.texto} maxLength={2000} rows={4} autoResize onChange={(e) => setForm({ ...form, texto: e.target.value })} className="w-full" aria-label="Texto" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setForm(null)} />
              <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} disabled={!form.titulo.trim()} onClick={salvar} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

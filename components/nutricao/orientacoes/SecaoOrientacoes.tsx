"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { Tag } from "primereact/tag";
import { avisar } from "@/lib/avisos";

type Dados = {
  orientacoes: { id: string; titulo: string; arquivada_em: string | null; enviada_em: string | null }[];
  modelos: { id: string; nome: string }[];
};

// Seção "Orientações" da consulta.
export default function SecaoOrientacoes({ pacienteId, consultaId }: { pacienteId: string; consultaId: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [nova, setNova] = useState(false);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/orientacoes`, { cache: "no-store" });
    setDados(resposta.ok ? await resposta.json() : { orientacoes: [], modelos: [] });
  }, [consultaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function criar() {
    setCriando(true);
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/orientacoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modeloId }),
    });
    const resultado = await resposta.json().catch(() => null);
    setCriando(false);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível criar a orientação.", "error");
    router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/orientacao/${resultado.id}`);
  }

  if (!dados) return <p className="mt-3 text-sm text-gray-500">Carregando…</p>;
  const ativas = dados.orientacoes.filter((o) => !o.arquivada_em);

  return (
    <>
      {ativas.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nenhuma orientação.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {ativas.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-2">
              <button
                type="button"
                className="min-w-0 truncate text-left text-primary-700 hover:underline"
                onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/orientacao/${o.id}`)}
              >
                {o.titulo}
              </button>
              <Tag value={o.enviada_em ? "Enviada" : "Não enviada"} severity={o.enviada_em ? "success" : "secondary"} className="shrink-0 text-[10px]" />
            </li>
          ))}
        </ul>
      )}
      <Button type="button" icon="pi pi-plus" label="Nova orientação" size="small" className="mt-3" onClick={() => setNova(true)} />

      <Dialog header="Nova orientação" visible={nova} onHide={() => setNova(false)} className="w-[min(30rem,calc(100vw-1rem))]">
        <Dropdown
          aria-label="Modelo de orientação"
          value={modeloId}
          options={[{ label: "Em branco", value: null }, ...dados.modelos.map((m) => ({ label: m.nome, value: m.id }))]}
          onChange={(e) => setModeloId(e.value)}
          placeholder="Escolha o modelo"
          filter
          className="w-full"
        />
        <p className="mt-2 text-xs text-gray-500">A orientação da consulta é uma cópia: pode ser personalizada sem mudar o modelo.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={() => setNova(false)} />
          <Button type="button" icon="pi pi-check" label="Criar" loading={criando} onClick={criar} />
        </div>
      </Dialog>
    </>
  );
}

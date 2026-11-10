"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Modelo = { id: string; nome: string; versao: number; compartilhado: boolean; arquivado_em: string | null; meu: boolean; autor: string; quantidade: number };

// Modelos de anamnese do Treino (SPEC 06/11, anamnese), na Biblioteca: os do
// profissional (privados por padrão) e os compartilhados por outros
// profissionais do Treino (só leitura; usar cria a ficha com cópia).
export default function CatalogoDeAnamneses() {
  const router = useRouter();
  const [lista, setLista] = useState<Modelo[] | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/treino/modelos-anamnese?arquivados=1", { cache: "no-store" }).catch(() => null);
    setLista(r?.ok ? (await r.json()).modelos : []);
  }, []);

  useEffect(() => {
    fetch("/api/treino/modelos-anamnese?arquivados=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { modelos: [] }))
      .then((d) => setLista(d.modelos))
      .catch(() => setLista([]));
  }, []);

  async function novo() {
    setCriando(true);
    const r = await fetch("/api/treino/modelos-anamnese", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Nova anamnese", perguntas: [] }) }).catch(() => null);
    setCriando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) return avisar(d?.erro ?? "Não foi possível criar o modelo.", "error");
    router.push(`/treino/anamneses/${d.id}`);
  }

  async function arquivar(m: Modelo) {
    const acao = m.arquivado_em ? "reativar" : "arquivar";
    if (acao === "arquivar" && !(await pedirConfirmacao(`Arquivar o modelo "${m.nome}"? As anamneses já feitas com ele não mudam.`, { aceitar: "Arquivar", rejeitar: "Cancelar" }))) return;
    const r = await fetch(`/api/treino/modelos-anamnese/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) }).catch(() => null);
    if (!r?.ok) avisar("Não foi possível alterar o modelo.", "error");
    void carregar();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Seus modelos de anamnese são privados. Marque &quot;Compartilhar&quot; no modelo para os outros profissionais do Treino usarem (só as perguntas).
        </p>
        <Button type="button" icon="pi pi-plus" label="Novo modelo" loading={criando} onClick={novo} />
      </div>
      {lista === null ? (
        <Skeleton height="8rem" borderRadius="16px" />
      ) : lista.length === 0 ? (
        <p className="cartao p-4 text-sm text-gray-500">Nenhum modelo.</p>
      ) : (
        <ul className="cartao divide-y divide-gray-100">
          {lista.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 p-4">
              <Link href={`/treino/anamneses/${m.id}`} className="min-w-0 flex-1">
                <span className="block font-semibold text-gray-900">{m.nome}</span>
                <span className="block text-xs text-gray-500">
                  {m.quantidade} {m.quantidade === 1 ? "pergunta" : "perguntas"} · versão {m.versao}
                  {m.meu ? "" : ` · de ${m.autor} (só leitura)`}
                </span>
              </Link>
              {m.meu && m.compartilhado ? <Tag value="Compartilhado" severity="info" /> : null}
              {m.arquivado_em ? <Tag value="Arquivado" severity="secondary" /> : null}
              {m.meu ? (
                <Button type="button" size="small" text icon={m.arquivado_em ? "pi pi-replay" : "pi pi-inbox"} label={m.arquivado_em ? "Reativar" : "Arquivar"} onClick={() => arquivar(m)} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

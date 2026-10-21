"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

export type ItemDaBiblioteca = { id: string; nome: string; usos: number; arquivado_em: string | null; atualizado_em: string } & Record<string, unknown>;

// Lista de uma biblioteca de Configurações (/api/nutricao/biblioteca/<tipo>):
// busca, novo, editar, excluir (nunca usado) ou arquivar, reativar.
export default function ListaDaBiblioteca({
  tipo,
  titulo,
  descricao,
  rotuloNovo,
  vazio,
  base,
  detalhe,
}: {
  tipo: string;
  titulo: string;
  descricao: string;
  rotuloNovo: string;
  vazio: string;
  // Rota das páginas de edição: `${base}/<id>`.
  base: string;
  detalhe?: (item: ItemDaBiblioteca) => string;
}) {
  const router = useRouter();
  const [itens, setItens] = useState<ItemDaBiblioteca[] | null>(null);
  const [busca, setBusca] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [criando, setCriando] = useState(false);
  const api = `/api/nutricao/biblioteca/${tipo}`;

  const carregar = useCallback(async () => {
    const resposta = await fetch(`${api}?q=${encodeURIComponent(busca)}${arquivados ? "&arquivados=1" : ""}`, { cache: "no-store" });
    const dados = await resposta.json().catch(() => null);
    setItens(dados?.modelos ?? []);
  }, [api, busca, arquivados]);

  useEffect(() => {
    const temporizador = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(temporizador);
  }, [carregar]);

  async function novo() {
    setCriando(true);
    const resposta = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "" }) });
    const resultado = await resposta.json().catch(() => null);
    setCriando(false);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível criar.", "error");
    router.push(`${base}/${resultado.id}`);
  }

  async function excluirOuArquivar(item: ItemDaBiblioteca) {
    const usado = item.usos > 0;
    const confirmado = await pedirConfirmacao(
      usado
        ? `“${item.nome}” já foi usado em atendimentos. Arquivar? Sai das buscas; o que já foi feito com ele não muda.`
        : `Excluir “${item.nome}”? Ele nunca foi usado.`,
      { aceitar: usado ? "Arquivar" : "Excluir", rejeitar: "Cancelar", titulo: usado ? "Arquivar" : "Excluir" }
    );
    if (!confirmado) return;
    const resposta = usado
      ? await fetch(`${api}/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "arquivar" }) })
      : await fetch(`${api}/${item.id}`, { method: "DELETE" });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível concluir.", "error");
    avisar(usado ? "Arquivado." : "Excluído.", "success");
    carregar();
  }

  async function reativar(item: ItemDaBiblioteca) {
    const resposta = await fetch(`${api}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "reativar" }),
    });
    if (!resposta.ok) return avisar("Não foi possível reativar.", "error");
    avisar("Reativado.", "success");
    carregar();
  }

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar às configurações" onClick={() => router.push("/nutricao/configuracoes")} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CabecalhoPagina titulo={titulo} descricao={descricao} />
          <Button type="button" icon="pi pi-plus" label={rotuloNovo} loading={criando} onClick={novo} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <InputText aria-label="Buscar" placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} className="min-w-0 flex-1" />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
            Mostrar arquivados
          </label>
        </div>

        <div className="cartao mt-4 overflow-hidden">
          {itens === null ? (
            <p className="p-5 text-gray-500">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="p-5 text-gray-500">{vazio}</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {itens.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => router.push(`${base}/${item.id}`)}>
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-gray-900">{item.nome}</span>
                      {item.arquivado_em ? <Tag value="Arquivado" severity="secondary" className="selo-status" /> : null}
                    </span>
                    {detalhe ? <span className="block truncate text-sm text-gray-500">{detalhe(item)}</span> : null}
                    <span className="block text-xs text-gray-400">
                      {item.usos ? `Usado ${item.usos} vez(es)` : "Nunca usado"} · atualizado em{" "}
                      {new Date(item.atualizado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </button>
                  <Button type="button" icon="pi pi-pencil" text rounded aria-label={`Editar ${item.nome}`} onClick={() => router.push(`${base}/${item.id}`)} />
                  {item.arquivado_em ? (
                    <Button type="button" icon="pi pi-replay" text rounded aria-label={`Reativar ${item.nome}`} tooltip="Reativar" onClick={() => reativar(item)} />
                  ) : (
                    <Button
                      type="button"
                      icon={item.usos ? "pi pi-inbox" : "pi pi-trash"}
                      text
                      rounded
                      severity="danger"
                      aria-label={`${item.usos ? "Arquivar" : "Excluir"} ${item.nome}`}
                      tooltip={item.usos ? "Arquivar" : "Excluir"}
                      onClick={() => excluirOuArquivar(item)}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Modelo = { id: string; nome: string; usos: number; versao: number; quantidade: number; arquivado_em: string | null; atualizado_em: string };

// Configurações → Anamnese: modelos ilimitados. Excluir só o que nunca foi
// usado; o que já foi usado se arquiva (fichas antigas continuam).
export default function ModelosDeAnamnesePage() {
  const router = useRouter();
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [busca, setBusca] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/modelos-anamnese?q=${encodeURIComponent(busca)}${arquivados ? "&arquivados=1" : ""}`, {
      cache: "no-store",
    });
    const dados = await resposta.json().catch(() => null);
    setModelos(dados?.modelos ?? []);
  }, [busca, arquivados]);

  useEffect(() => {
    const temporizador = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(temporizador);
  }, [carregar]);

  async function novo() {
    setCriando(true);
    const resposta = await fetch("/api/nutricao/modelos-anamnese", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: "", perguntas: [] }),
    });
    const resultado = await resposta.json().catch(() => null);
    setCriando(false);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível criar o modelo.", "error");
    router.push(`/nutricao/configuracoes/anamnese/${resultado.id}`);
  }

  async function excluirOuArquivar(m: Modelo) {
    const usado = m.usos > 0;
    const confirmado = await pedirConfirmacao(
      usado
        ? `“${m.nome}” já foi usado em anamneses. Arquivar? Ele deixa de aparecer para novas anamneses; as fichas já criadas continuam.`
        : `Excluir o modelo “${m.nome}”? Ele nunca foi usado.`,
      { aceitar: usado ? "Arquivar" : "Excluir", rejeitar: "Cancelar", titulo: usado ? "Arquivar modelo" : "Excluir modelo" }
    );
    if (!confirmado) return;
    const resposta = usado
      ? await fetch(`/api/nutricao/modelos-anamnese/${m.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "arquivar" }),
        })
      : await fetch(`/api/nutricao/modelos-anamnese/${m.id}`, { method: "DELETE" });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível concluir.", "error");
    avisar(usado ? "Modelo arquivado." : "Modelo excluído.", "success");
    carregar();
  }

  async function reativar(m: Modelo) {
    const resposta = await fetch(`/api/nutricao/modelos-anamnese/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "reativar" }),
    });
    if (!resposta.ok) return avisar("Não foi possível reativar o modelo.", "error");
    avisar("Modelo reativado.", "success");
    carregar();
  }

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar às configurações" onClick={() => router.push("/nutricao/configuracoes")} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CabecalhoPagina titulo="Anamnese" descricao="Modelos de anamnese usados nas consultas e enviados ao paciente." />
          <Button type="button" icon="pi pi-plus" label="Nova anamnese" loading={criando} onClick={novo} />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <InputText
            aria-label="Buscar modelo"
            placeholder="Buscar pelo nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="min-w-0 flex-1"
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
            Mostrar arquivados
          </label>
        </div>

        <div className="cartao mt-4 overflow-hidden">
          {modelos === null ? (
            <p className="p-5 text-gray-500">Carregando…</p>
          ) : modelos.length === 0 ? (
            <p className="p-5 text-gray-500">Nenhum modelo de anamnese. Clique em “Nova anamnese” para criar o primeiro.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {modelos.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => router.push(`/nutricao/configuracoes/anamnese/${m.id}`)}>
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-gray-900">{m.nome}</span>
                      {m.arquivado_em ? <Tag value="Arquivado" severity="secondary" className="selo-status" /> : null}
                    </span>
                    <span className="block text-sm text-gray-500">
                      {m.quantidade} pergunta(s) · versão {m.versao}
                    </span>
                    <span className="block text-xs text-gray-400">
                      {m.usos ? `Usado ${m.usos} vez(es)` : "Nunca usado"} · atualizado em{" "}
                      {new Date(m.atualizado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </button>
                  <Button
                    type="button"
                    icon="pi pi-pencil"
                    text
                    rounded
                    aria-label={`Editar ${m.nome}`}
                    onClick={() => router.push(`/nutricao/configuracoes/anamnese/${m.id}`)}
                  />
                  {m.arquivado_em ? (
                    <Button type="button" icon="pi pi-replay" text rounded aria-label={`Reativar ${m.nome}`} tooltip="Reativar" onClick={() => reativar(m)} />
                  ) : (
                    <Button
                      type="button"
                      icon={m.usos ? "pi pi-inbox" : "pi pi-trash"}
                      text
                      rounded
                      severity="danger"
                      aria-label={`${m.usos ? "Arquivar" : "Excluir"} ${m.nome}`}
                      tooltip={m.usos ? "Arquivar" : "Excluir"}
                      onClick={() => excluirOuArquivar(m)}
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

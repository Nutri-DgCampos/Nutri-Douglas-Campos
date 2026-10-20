"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

export type ResumoDoModelo = {
  id: string;
  nome: string;
  usos: number;
  arquivado_em: string | null;
  atualizado_em: string;
  resumo: string | null;
  quantidade: number | null;
};

// Lista de uma biblioteca de modelos (observações, refeições ou dietas):
// busca, editar, excluir (nunca usado) ou arquivar (já usado) e reativar.
export default function ListaDeModelos({
  tipo,
  titulo,
  descricao,
  rotuloNovo,
  detalhe,
  onNovo,
  onEditar,
  recarregar,
}: {
  tipo: "observacao" | "refeicao" | "dieta";
  titulo: string;
  descricao: string;
  rotuloNovo: string;
  detalhe: (modelo: ResumoDoModelo) => string;
  onNovo: () => void;
  onEditar: (id: string) => void;
  // Muda para pedir nova leitura (ex.: depois de salvar numa janela).
  recarregar?: number;
}) {
  const router = useRouter();
  const [modelos, setModelos] = useState<ResumoDoModelo[] | null>(null);
  const [busca, setBusca] = useState("");
  const [arquivados, setArquivados] = useState(false);

  const carregar = useCallback(async () => {
    const resposta = await fetch(
      `/api/nutricao/modelos?tipo=${tipo}&q=${encodeURIComponent(busca)}${arquivados ? "&arquivados=1" : ""}`,
      { cache: "no-store" }
    );
    const dados = await resposta.json().catch(() => null);
    setModelos(dados?.modelos ?? []);
  }, [tipo, busca, arquivados]);

  useEffect(() => {
    const temporizador = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(temporizador);
  }, [carregar, recarregar]);

  async function excluirOuArquivar(modelo: ResumoDoModelo) {
    if (modelo.usos > 0) {
      const confirmado = await pedirConfirmacao(
        `“${modelo.nome}” já foi usado em dietas. Arquivar? Ele sai das buscas; o que já foi feito com ele não muda.`,
        { aceitar: "Arquivar", rejeitar: "Cancelar", titulo: "Arquivar modelo" }
      );
      if (!confirmado) return;
      const resposta = await fetch(`/api/nutricao/modelos/${modelo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "arquivar" }),
      });
      if (!resposta.ok) return avisar("Não foi possível arquivar o modelo.", "error");
      avisar("Modelo arquivado.", "success");
    } else {
      const confirmado = await pedirConfirmacao(`Excluir o modelo “${modelo.nome}”? Ele nunca foi usado.`, {
        aceitar: "Excluir",
        rejeitar: "Cancelar",
        titulo: "Excluir modelo",
      });
      if (!confirmado) return;
      const resposta = await fetch(`/api/nutricao/modelos/${modelo.id}`, { method: "DELETE" });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível excluir o modelo.", "error");
      avisar("Modelo excluído.", "success");
    }
    carregar();
  }

  async function reativar(modelo: ResumoDoModelo) {
    const resposta = await fetch(`/api/nutricao/modelos/${modelo.id}`, {
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
        <BotaoVoltar rotulo="Voltar aos modelos da dieta" onClick={() => router.push("/nutricao/configuracoes/dieta")} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CabecalhoPagina titulo={titulo} descricao={descricao} />
          <Button type="button" icon="pi pi-plus" label={rotuloNovo} onClick={onNovo} />
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
            <p className="p-5 text-gray-500">Nenhum modelo encontrado.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {modelos.map((modelo) => (
                <li key={modelo.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEditar(modelo.id)}>
                    <span className="flex items-center gap-2">
                      <span className="truncate font-semibold text-gray-900">{modelo.nome}</span>
                      {modelo.arquivado_em ? <Tag value="Arquivado" severity="secondary" className="selo-status" /> : null}
                    </span>
                    <span className="block truncate text-sm text-gray-500">{detalhe(modelo)}</span>
                    <span className="block text-xs text-gray-400">
                      {modelo.usos ? `Usado ${modelo.usos} vez(es)` : "Nunca usado"} · atualizado em{" "}
                      {new Date(modelo.atualizado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </span>
                  </button>
                  <Button type="button" icon="pi pi-pencil" text rounded aria-label={`Editar ${modelo.nome}`} onClick={() => onEditar(modelo.id)} />
                  {modelo.arquivado_em ? (
                    <Button type="button" icon="pi pi-replay" text rounded aria-label={`Reativar ${modelo.nome}`} tooltip="Reativar" onClick={() => reativar(modelo)} />
                  ) : (
                    <Button
                      type="button"
                      icon={modelo.usos ? "pi pi-inbox" : "pi pi-trash"}
                      text
                      rounded
                      severity="danger"
                      aria-label={`${modelo.usos ? "Arquivar" : "Excluir"} ${modelo.nome}`}
                      tooltip={modelo.usos ? "Arquivar" : "Excluir"}
                      onClick={() => excluirOuArquivar(modelo)}
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

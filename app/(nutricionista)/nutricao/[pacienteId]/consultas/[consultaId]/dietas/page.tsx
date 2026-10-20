"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import BotaoVoltar from "@/components/BotaoVoltar";
import EditorDaDieta from "@/components/nutricao/editor/EditorDaDieta";
import { avisar } from "@/lib/avisos";

type Aba = {
  id: string;
  titulo: string | null;
  arquivada_em: string | null;
  versoes: number;
  alterada_desde_o_envio: boolean;
};

// Elaboração de dietas da consulta: uma aba por dieta (ex.: dias com treino
// e dias sem treino), cada uma com seus próprios dados e envio.
export default function DietasDaConsultaPage() {
  return (
    <Suspense fallback={<main className="flex-1 p-6 text-gray-500">Carregando…</main>}>
      <DietasDaConsulta />
    </Suspense>
  );
}

function DietasDaConsulta() {
  const { pacienteId, consultaId } = useParams<{ pacienteId: string; consultaId: string }>();
  const router = useRouter();
  const parametros = useSearchParams();
  const selecionada = parametros.get("dieta");

  const [abas, setAbas] = useState<Aba[] | null>(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [criando, setCriando] = useState(false);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [nomeando, setNomeando] = useState(false);

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/dietas`, { cache: "no-store" });
    if (!resposta.ok) {
      setAbas([]);
      return;
    }
    const dados = await resposta.json();
    setAbas(dados.dietas);
  }, [consultaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const visiveis = (abas ?? []).filter((aba) => verArquivadas || !aba.arquivada_em);
  const ativa = visiveis.find((aba) => aba.id === selecionada) ?? visiveis[0] ?? null;

  function abrir(id: string | null) {
    const destino = `/nutricao/${pacienteId}/consultas/${consultaId}/dietas${id ? `?dieta=${id}` : ""}`;
    router.replace(destino, { scroll: false });
  }

  async function criar() {
    if (criando) return;
    setCriando(true);
    try {
      const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/dietas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: novoTitulo }),
      });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        avisar(resultado?.erro ?? "Não foi possível criar a dieta.", "error");
        return;
      }
      setNomeando(false);
      setNovoTitulo("");
      await carregar();
      abrir(resultado.id);
    } finally {
      setCriando(false);
    }
  }

  function situacao(aba: Aba) {
    if (aba.arquivada_em) return "Arquivada";
    if (aba.versoes === 0) return "Em elaboração";
    return aba.alterada_desde_o_envio ? `Enviada (v${aba.versoes}) · alterada` : `Enviada (v${aba.versoes})`;
  }

  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-[110rem]">
        <BotaoVoltar rotulo="Voltar à consulta" onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}`)} />

        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Elaboração de dietas</h1>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={verArquivadas} onChange={(e) => setVerArquivadas(e.target.checked)} />
            Mostrar arquivadas
          </label>
        </div>

        <div role="tablist" aria-label="Dietas da consulta" className="mb-3 flex items-end gap-1 overflow-x-auto border-b border-gray-200">
          {visiveis.map((aba) => {
            const atual = aba.id === ativa?.id;
            return (
              <button
                key={aba.id}
                type="button"
                role="tab"
                aria-selected={atual}
                title={aba.titulo ?? ""}
                onClick={() => abrir(aba.id)}
                className={`max-w-[16rem] shrink-0 rounded-t-lg border border-b-0 px-3 py-2 text-left text-sm ${
                  atual ? "border-primary-300 bg-white font-semibold text-primary-800" : "border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <span className="block truncate">{aba.titulo?.trim() || "Sem título"}</span>
                <span className="block truncate text-xs font-normal text-gray-500">{situacao(aba)}</span>
              </button>
            );
          })}
          <Button
            type="button"
            icon="pi pi-plus"
            label="Nova dieta"
            text
            className="shrink-0"
            onClick={() => {
              setNovoTitulo(abas && abas.length ? "" : "Dieta");
              setNomeando(true);
            }}
          />
        </div>

        {abas === null ? (
          <p className="text-gray-500">Carregando…</p>
        ) : ativa ? (
          <EditorDaDieta
            key={ativa.id}
            dietaId={ativa.id}
            onAlterada={carregar}
            onRemovida={async () => {
              await carregar();
              abrir(null);
            }}
            onAbrirDieta={async (id) => {
              await carregar();
              abrir(id);
            }}
            onNovaDieta={() => {
              setNovoTitulo("");
              setNomeando(true);
            }}
          />
        ) : (
          <div className="cartao p-6 text-center">
            <p className="text-gray-700">Nenhuma dieta nesta consulta.</p>
            <Button type="button" className="mt-3" icon="pi pi-plus" label="Nova dieta" onClick={() => setNomeando(true)} />
          </div>
        )}
      </div>

      <Dialog
        header="Nova dieta"
        visible={nomeando}
        onHide={() => setNomeando(false)}
        className="w-[min(28rem,calc(100vw-1rem))]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setNomeando(false)} />
            <Button type="button" label="Criar" icon="pi pi-check" loading={criando} onClick={criar} />
          </div>
        }
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Título</span>
          <InputText
            autoFocus
            value={novoTitulo}
            placeholder="Ex.: Dieta para dias com treino"
            onChange={(e) => setNovoTitulo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && criar()}
            className="w-full"
          />
        </label>
        <p className="mt-2 text-sm text-gray-500">A dieta nasce em branco, só nesta consulta. Criar não envia nada ao paciente.</p>
      </Dialog>
    </main>
  );
}

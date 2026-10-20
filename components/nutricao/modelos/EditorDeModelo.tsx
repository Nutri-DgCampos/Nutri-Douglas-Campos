"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import { Totalizador } from "@/components/nutricao/editor/BlocoRefeicao";
import CampoNumero from "@/components/nutricao/editor/CampoNumero";
import ListaDeRefeicoes from "@/components/nutricao/editor/ListaDeRefeicoes";
import ObservacoesDaDieta from "@/components/nutricao/editor/ObservacoesDaDieta";
import type { BaseDosAlimentos, Nutriente } from "@/components/nutricao/editor/tipos";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { documentoVazio, novaRefeicao, totaisDaDieta, type DocumentoDieta, type Refeicao } from "@/lib/nutricao/dieta";

const MACROS = ["kcal", "carboidratos", "proteinas", "lipidios"];

// Editor de um modelo de refeição ou de dieta completa (Configurações →
// Dieta). Mesma estrutura do editor de dietas, sem paciente: nada de peso,
// envio ou PDF. Salvar vale só para usos futuros do modelo.
export default function EditorDeModelo({ tipo, id }: { tipo: "refeicao" | "dieta"; id: string }) {
  const router = useRouter();
  const novo = id === "novo";
  const lista = tipo === "refeicao" ? "/nutricao/configuracoes/dieta/refeicoes" : "/nutricao/configuracoes/dieta/modelos";

  const [carregado, setCarregado] = useState(novo);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState<DocumentoDieta>(() =>
    tipo === "refeicao" ? { ...documentoVazio(""), refeicoes: [novaRefeicao("")] } : documentoVazio("")
  );
  const [base, setBase] = useState<BaseDosAlimentos>({ alimentos: {}, composicoes: {} });
  const [nutrientes, setNutrientes] = useState<Nutriente[]>([]);
  const [revisao, setRevisao] = useState(0);
  const [pendente, setPendente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [usos, setUsos] = useState(0);
  const documentoRef = useRef(documento);

  const carregar = useCallback(async () => {
    if (novo) {
      const { data } = await api.from("nutrientes").select("codigo, nome, unidade, grupo, ordem").order("ordem", { ascending: true });
      setNutrientes((data ?? []) as Nutriente[]);
      return;
    }
    const resposta = await fetch(`/api/nutricao/modelos/${id}`, { cache: "no-store" });
    if (!resposta.ok) {
      avisar("Modelo não encontrado.", "error");
      router.push(lista);
      return;
    }
    const dados = await resposta.json();
    const doc: DocumentoDieta =
      tipo === "refeicao" ? { ...documentoVazio(""), refeicoes: [dados.modelo.conteudo as Refeicao] } : (dados.modelo.conteudo as DocumentoDieta);
    documentoRef.current = doc;
    setDocumento(doc);
    setNome(dados.modelo.nome);
    setRevisao(dados.modelo.revisao);
    setUsos(dados.modelo.usos);
    setNutrientes(dados.nutrientes);
    setBase({ alimentos: dados.alimentos, composicoes: dados.composicoes });
    setPendente(false);
    setCarregado(true);
  }, [id, novo, tipo, lista, router]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    if (!pendente) return;
    const aoSair = (evento: BeforeUnloadEvent) => evento.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [pendente]);

  const alterar = useCallback((mudanca: (doc: DocumentoDieta) => void) => {
    const copia = structuredClone(documentoRef.current);
    mudanca(copia);
    documentoRef.current = copia;
    setDocumento(copia);
    setPendente(true);
  }, []);

  async function salvar() {
    if (!nome.trim()) {
      avisar("Informe o nome do modelo.", "warn");
      return;
    }
    setSalvando(true);
    try {
      const conteudo = tipo === "refeicao" ? documentoRef.current.refeicoes[0] : documentoRef.current;
      const resposta = await fetch(novo ? "/api/nutricao/modelos" : `/api/nutricao/modelos/${id}`, {
        method: novo ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, nome, conteudo, revisao }),
      });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        avisar(resultado?.erro ?? "Não foi possível salvar o modelo.", "error");
        return;
      }
      setPendente(false);
      avisar("Modelo salvo.", "success");
      if (novo) router.replace(`${lista}/${resultado.id}`);
      else setRevisao(resultado.revisao);
    } finally {
      setSalvando(false);
    }
  }

  if (!carregado) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <Skeleton height="10rem" />
      </main>
    );
  }

  const totais = totaisDaDieta(documento, base.composicoes, MACROS);

  return (
    <main className="min-w-0 flex-1 p-3 lg:p-6">
      <div className="mx-auto max-w-6xl space-y-3">
        <BotaoVoltar rotulo="Voltar à lista" onClick={() => router.push(lista)} />
        <h1 className="text-2xl font-bold text-gray-900">
          {novo ? "Novo modelo de" : "Modelo de"} {tipo === "refeicao" ? "refeição" : "dieta"}
        </h1>

        <div className="cartao grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-gray-700">Nome do modelo</span>
            <InputText
              value={nome}
              placeholder={tipo === "refeicao" ? "Ex.: Café da manhã proteico" : "Ex.: Emagrecimento — 1.800 kcal"}
              onChange={(e) => {
                setNome(e.target.value);
                setPendente(true);
              }}
              className={`w-full ${nome.trim() ? "" : "p-invalid"}`}
            />
          </label>
          {tipo === "dieta" ? (
            <>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Objetivo</span>
                <InputText value={documento.objetivo} onChange={(e) => alterar((d) => void (d.objetivo = e.target.value))} className="w-full" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Título da dieta</span>
                <InputText value={documento.titulo} onChange={(e) => alterar((d) => void (d.titulo = e.target.value))} className="w-full" />
              </label>
            </>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
            <span className="text-xs text-gray-500">
              {pendente ? "Alterações não salvas." : novo ? "Ainda não salvo." : "Tudo salvo."}
              {usos ? ` Usado ${usos} vez(es): alterações valem só para os próximos usos.` : ""}
            </span>
            <div className="w-full max-w-[18rem]">
              <Totalizador totais={totais} />
            </div>
          </div>
        </div>

        <ListaDeRefeicoes
          documento={documento}
          base={base}
          onBase={setBase}
          alterar={alterar}
          nutrientes={nutrientes}
          mostrarNutrientes
          estruturaFixa={tipo === "refeicao"}
        />

        {tipo === "dieta" ? (
          <>
            <ObservacoesDaDieta documento={documento} onAlterar={alterar} />
            <section className="cartao p-3 sm:p-4">
              <h2 className="font-bold text-gray-900">Hidratação</h2>
              <div className="mt-2 flex items-center gap-2">
                <div className="relative w-28">
                  <CampoNumero
                    ariaLabel="Água em mL por kg"
                    valor={documento.hidratacao.mlPorKg}
                    maximo={500}
                    className="w-full pr-12"
                    onChange={(valor) => alterar((d) => void (d.hidratacao.mlPorKg = valor))}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">mL/kg</span>
                </div>
                <span className="text-sm text-gray-500">O volume diário é calculado com o peso do paciente, na dieta.</span>
              </div>
              <InputTextarea
                aria-label="Observações sobre hidratação"
                placeholder="Observações sobre hidratação"
                value={documento.hidratacao.observacoes}
                autoResize
                rows={2}
                className="mt-2 w-full"
                onChange={(e) => alterar((d) => void (d.hidratacao.observacoes = e.target.value))}
              />
            </section>
          </>
        ) : null}

        <div className="sticky bottom-0 z-10 flex gap-2 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
          <Button type="button" icon="pi pi-save" label="Salvar modelo" loading={salvando} onClick={salvar} />
          <Button type="button" label="Fechar" text onClick={() => router.push(lista)} />
        </div>
      </div>
    </main>
  );
}

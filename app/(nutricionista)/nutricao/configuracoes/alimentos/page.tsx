"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import Selecao from "@/components/Selecao";
import type { AlimentoEncontrado } from "@/components/nutricao/BuscaAlimento";
import { api } from "@/lib/api";

type Linha = AlimentoEncontrado & { arquivado: boolean };

// Base de alimentos: TACO e alimentos cadastrados pelo nutricionista.
export default function AlimentosPage() {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [categorias, setCategorias] = useState<{ id: number; nome: string }[]>([]);
  const [lista, setLista] = useState<Linha[] | null>(null);

  useEffect(() => {
    api
      .from("alimentos_categorias")
      .select("id, nome")
      .order("nome", { ascending: true })
      .then(({ data }) => setCategorias((data ?? []) as { id: number; nome: string }[]));
  }, []);

  useEffect(() => {
    const espera = setTimeout(async () => {
      const parametros = new URLSearchParams({ q: busca, limite: "100" });
      if (categoria) parametros.set("categoria", categoria);
      if (arquivados) parametros.set("arquivados", "1");

      const resposta = await fetch(`/api/nutricao/alimentos?${parametros}`, { cache: "no-store" });
      const dados = await resposta.json().catch(() => null);
      setLista((dados?.alimentos ?? []) as Linha[]);
    }, 250);

    return () => clearTimeout(espera);
  }, [busca, categoria, arquivados]);

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar às configurações" onClick={() => router.push("/nutricao/configuracoes")} />
        <CabecalhoPagina
          titulo="Alimentos"
          descricao="Base TACO e alimentos próprios, com medidas caseiras e substituições. Valores por 100 g."
          acao={
            <Button
              type="button"
              icon="pi pi-plus"
              label="Novo alimento"
              onClick={() => router.push("/nutricao/configuracoes/alimentos/novo")}
            />
          }
        />

        <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_16rem]">
          <IconField iconPosition="left">
            <InputIcon className="pi pi-search" />
            <InputText
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar por partes do nome (ex.: arroz cozido)"
              className="w-full"
              autoFocus
            />
          </IconField>
          <Selecao value={categoria} onChange={(evento) => setCategoria(evento.target.value)} className="w-full">
            <option value="">Todas as categorias</option>
            {categorias.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.nome}
              </option>
            ))}
          </Selecao>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <Checkbox checked={arquivados} onChange={(evento) => setArquivados(Boolean(evento.checked))} />
          Mostrar arquivados
        </label>

        <section className="cartao mt-4 overflow-hidden">
          {lista === null ? (
            <div className="space-y-2 p-4">
              <Skeleton height="2.5rem" />
              <Skeleton height="2.5rem" />
            </div>
          ) : lista.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">Nenhum alimento encontrado.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {lista.map((alimento) => (
                <li key={alimento.id}>
                  <Link
                    href={`/nutricao/configuracoes/alimentos/${alimento.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-primary-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold ${alimento.arquivado ? "text-gray-400 line-through" : "text-gray-900"}`}>
                        {alimento.nome}
                      </span>
                      <span className="block truncate text-sm text-gray-500">{alimento.categoria ?? "Sem categoria"}</span>
                    </span>
                    <span className="hidden shrink-0 text-sm tabular-nums text-gray-600 sm:block">
                      {alimento.kcal === null ? "kcal —" : `${Math.round(alimento.kcal)} kcal`}
                    </span>
                    <Tag
                      value={alimento.fonte === "taco" ? "TACO" : "Próprio"}
                      severity={alimento.fonte === "taco" ? "info" : "success"}
                      className="selo-status"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        {lista && lista.length === 100 && (
          <p className="mt-2 text-center text-xs text-gray-500">Mostrando os 100 primeiros. Refine a busca para ver outros.</p>
        )}
      </div>
    </main>
  );
}

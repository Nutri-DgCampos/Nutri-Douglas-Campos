"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { MultiSelect } from "primereact/multiselect";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import CatalogoDeAnamneses from "@/components/treino/CatalogoDeAnamneses";
import CatalogoDeObservacoes from "@/components/treino/CatalogoDeObservacoes";
import { avisar } from "@/lib/avisos";
import { GRUPOS, OUTROS_GRUPOS } from "@/lib/treino";
import { EQUIPAMENTOS } from "@/lib/treinoEditor";

// Biblioteca do Treino (T4a): exercícios (lista inicial C1 + os cadastrados
// pelos profissionais) e academias com equipamentos (C5). Nada se apaga:
// arquiva-se.

type Exercicio = {
  id: string;
  nome: string;
  grupo: string;
  grupos_secundarios: string[];
  equipamentos: string[];
  instrucoes: string | null;
  video_url: string | null;
  base: boolean;
  pode_alterar: boolean;
  arquivado_em: string | null;
};

type Academia = { id: string; nome: string; domestica: boolean; equipamentos: string[]; pode_alterar: boolean; arquivada_em: string | null };

async function enviar(url: string, metodo: string, corpo: unknown) {
  const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
  if (!r) {
    avisar("Sem conexão. Tente de novo.", "error");
    return false;
  }
  if (!r.ok) {
    avisar((await r.json().catch(() => null))?.erro ?? "Não foi possível salvar.", "error");
    return false;
  }
  return true;
}

type Aba = "exercicios" | "academias" | "observacoes" | "anamneses";
const ABAS: Record<Aba, string> = { exercicios: "Exercícios", academias: "Academias", observacoes: "Observações", anamneses: "Anamneses" };

export default function BibliotecaDoTreinoPage() {
  return (
    <Suspense>
      <Biblioteca />
    </Suspense>
  );
}

function Biblioteca() {
  const router = useRouter();
  const pedida = useSearchParams().get("aba");
  const [aba, setAba] = useState<Aba>(pedida && pedida in ABAS ? (pedida as Aba) : "exercicios");

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <BotaoVoltar rotulo="Voltar para o Módulo de Treino" onClick={() => router.push("/treino")} />
        <CabecalhoPagina titulo="Biblioteca do Treino" descricao="Exercícios usados no editor, academias com os equipamentos disponíveis, as suas observações de treino e os modelos de anamnese." />

        <div className="flex gap-1 border-b border-gray-200" role="tablist">
          {(Object.keys(ABAS) as Aba[]).map((a) => (
            <button
              key={a}
              type="button"
              role="tab"
              aria-selected={aba === a}
              onClick={() => setAba(a)}
              className={`-mb-px rounded-t-xl border px-4 py-2 text-sm font-semibold ${aba === a ? "border-gray-200 border-b-white bg-white text-primary-800" : "border-transparent text-gray-600"}`}
            >
              {ABAS[a]}
            </button>
          ))}
        </div>

        {aba === "exercicios" ? <Exercicios /> : aba === "academias" ? <Academias /> : aba === "observacoes" ? <CatalogoDeObservacoes /> : <CatalogoDeAnamneses />}
      </div>
    </main>
  );
}

const VAZIO: Omit<Exercicio, "id" | "base" | "pode_alterar" | "arquivado_em"> = {
  nome: "",
  grupo: "Peito",
  grupos_secundarios: [],
  equipamentos: [],
  instrucoes: null,
  video_url: null,
};

function Exercicios() {
  const [lista, setLista] = useState<Exercicio[] | undefined>(undefined);
  const [busca, setBusca] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [editando, setEditando] = useState<(typeof VAZIO & { id?: string }) | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/treino/exercicios?arquivados=${arquivados ? 1 : 0}&q=${encodeURIComponent(busca)}`, { cache: "no-store" }).catch(() => null);
    setLista(r?.ok ? (await r.json()).exercicios : []);
  }, [busca, arquivados]);

  useEffect(() => {
    const t = setTimeout(carregar, 250);
    return () => clearTimeout(t);
  }, [carregar]);

  async function salvar() {
    if (!editando) return;
    setSalvando(true);
    const { id, ...corpo } = editando;
    const ok = await enviar(id ? `/api/treino/exercicios/${id}` : "/api/treino/exercicios", id ? "PATCH" : "POST", corpo);
    setSalvando(false);
    if (!ok) return;
    avisar("Exercício salvo.", "success");
    setEditando(null);
    carregar();
  }

  async function arquivar(e: Exercicio) {
    if (await enviar(`/api/treino/exercicios/${e.id}`, "PATCH", { acao: e.arquivado_em ? "reativar" : "arquivar" })) carregar();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="p-input-icon-left min-w-0 flex-1">
          <InputText value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou grupo" className="w-full" aria-label="Buscar exercício" />
        </span>
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} />
          Mostrar arquivados
        </label>
        <Button type="button" icon="pi pi-plus" label="Novo exercício" onClick={() => setEditando({ ...VAZIO })} />
      </div>
      <p className="text-xs text-gray-500">
        A lista inicial (marcada como “lista inicial”) foi montada para revisão de vocês; só o administrador altera esses itens. Cada profissional altera os que cadastrou.
      </p>

      {lista === undefined ? (
        <Skeleton height="16rem" borderRadius="16px" />
      ) : lista.length === 0 ? (
        <div className="cartao p-6 text-center text-sm text-gray-500">Nenhum exercício encontrado.</div>
      ) : (
        <ul className="cartao divide-y divide-gray-100">
          {lista.map((e) => (
            <li key={e.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${e.arquivado_em ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">
                  {e.nome}
                  {e.base ? <span className="ml-2 text-xs font-normal text-gray-500">lista inicial</span> : null}
                  {e.arquivado_em ? <span className="ml-2 text-xs font-normal text-gray-500">arquivado</span> : null}
                </p>
                <p className="text-sm text-gray-500">
                  {e.grupo}
                  {e.grupos_secundarios.length ? ` (+ ${e.grupos_secundarios.join(", ")})` : ""} · {e.equipamentos.join(", ") || "Peso corporal"}
                  {e.video_url ? " · com vídeo" : ""}
                </p>
              </div>
              {e.pode_alterar ? (
                <span className="flex gap-1">
                  <Button
                    type="button"
                    size="small"
                    outlined
                    icon="pi pi-pencil"
                    label="Editar"
                    onClick={() =>
                      setEditando({ id: e.id, nome: e.nome, grupo: e.grupo, grupos_secundarios: e.grupos_secundarios, equipamentos: e.equipamentos, instrucoes: e.instrucoes, video_url: e.video_url })
                    }
                  />
                  <Button type="button" size="small" text severity={e.arquivado_em ? undefined : "danger"} label={e.arquivado_em ? "Reativar" : "Arquivar"} onClick={() => arquivar(e)} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog header={editando?.id ? "Editar exercício" : "Novo exercício"} visible={Boolean(editando)} onHide={() => setEditando(null)} className="w-full max-w-xl" modal>
        {editando ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Nome</span>
              <InputText value={editando.nome} maxLength={120} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className="w-full" aria-label="Nome do exercício" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Grupo principal</span>
                <Dropdown value={editando.grupo} options={[...GRUPOS, ...OUTROS_GRUPOS]} onChange={(e) => setEditando({ ...editando, grupo: e.value })} className="w-full" aria-label="Grupo principal" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Músculos secundários</span>
                <MultiSelect
                  value={editando.grupos_secundarios}
                  options={GRUPOS.filter((g) => g !== editando.grupo)}
                  onChange={(e) => setEditando({ ...editando, grupos_secundarios: e.value })}
                  display="chip"
                  className="w-full"
                  aria-label="Músculos secundários"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Equipamentos que o exercício exige</span>
              <MultiSelect
                value={editando.equipamentos}
                options={[...EQUIPAMENTOS]}
                onChange={(e) => setEditando({ ...editando, equipamentos: e.value })}
                display="chip"
                filter
                placeholder="Nenhum (peso corporal)"
                className="w-full"
                aria-label="Equipamentos"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Instruções (opcional)</span>
              <InputTextarea value={editando.instrucoes ?? ""} maxLength={2000} autoResize rows={3} onChange={(e) => setEditando({ ...editando, instrucoes: e.target.value || null })} className="w-full" aria-label="Instruções" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Vídeo de execução (YouTube, opcional)</span>
              <InputText value={editando.video_url ?? ""} maxLength={300} placeholder="https://www.youtube.com/watch?v=…" onChange={(e) => setEditando({ ...editando, video_url: e.target.value.trim() || null })} className="w-full" aria-label="Vídeo" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setEditando(null)} />
              <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvar} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

function Academias() {
  const [lista, setLista] = useState<Academia[] | undefined>(undefined);
  const [arquivadas, setArquivadas] = useState(false);
  const [editando, setEditando] = useState<{ id?: string; nome: string; domestica: boolean; equipamentos: string[] } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const buscar = useCallback(
    () =>
      fetch(`/api/treino/academias?arquivadas=${arquivadas ? 1 : 0}`, { cache: "no-store" })
        .then(async (r) => (r.ok ? ((await r.json()).academias as Academia[]) : []))
        .catch(() => [] as Academia[]),
    [arquivadas]
  );
  const carregar = useCallback(async () => setLista(await buscar()), [buscar]);

  useEffect(() => {
    buscar().then(setLista);
  }, [buscar]);

  async function salvar() {
    if (!editando) return;
    setSalvando(true);
    const { id, ...corpo } = editando;
    const ok = await enviar(id ? `/api/treino/academias/${id}` : "/api/treino/academias", id ? "PATCH" : "POST", corpo);
    setSalvando(false);
    if (!ok) return;
    avisar("Academia salva.", "success");
    setEditando(null);
    carregar();
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={arquivadas} onChange={(e) => setArquivadas(e.target.checked)} />
          Mostrar arquivadas
        </label>
        <Button type="button" icon="pi pi-plus" label="Nova academia" onClick={() => setEditando({ nome: "", domestica: false, equipamentos: [] })} />
      </div>

      {lista === undefined ? (
        <Skeleton height="12rem" borderRadius="16px" />
      ) : lista.length === 0 ? (
        <div className="cartao p-6 text-center text-sm text-gray-500">Nenhuma academia cadastrada.</div>
      ) : (
        <ul className="cartao divide-y divide-gray-100">
          {lista.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${a.arquivada_em ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">
                  {a.nome}
                  {a.domestica ? <span className="ml-2 text-xs font-normal text-gray-500">em casa</span> : null}
                  {a.arquivada_em ? <span className="ml-2 text-xs font-normal text-gray-500">arquivada</span> : null}
                </p>
                <p className="text-sm text-gray-500">{a.equipamentos.length ? a.equipamentos.join(", ") : "Nenhum equipamento cadastrado"}</p>
              </div>
              {a.pode_alterar ? (
                <span className="flex gap-1">
                  <Button type="button" size="small" outlined icon="pi pi-pencil" label="Editar" onClick={() => setEditando({ id: a.id, nome: a.nome, domestica: a.domestica, equipamentos: a.equipamentos })} />
                  <Button
                    type="button"
                    size="small"
                    text
                    severity={a.arquivada_em ? undefined : "danger"}
                    label={a.arquivada_em ? "Reativar" : "Arquivar"}
                    onClick={async () => {
                      if (await enviar(`/api/treino/academias/${a.id}`, "PATCH", { acao: a.arquivada_em ? "reativar" : "arquivar" })) carregar();
                    }}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog header={editando?.id ? "Editar academia" : "Nova academia"} visible={Boolean(editando)} onHide={() => setEditando(null)} className="w-full max-w-2xl" modal>
        {editando ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Nome</span>
              <InputText value={editando.nome} maxLength={120} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} className="w-full" aria-label="Nome da academia" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editando.domestica} onChange={(e) => setEditando({ ...editando, domestica: e.target.checked })} />
              Academia em casa / equipamentos próprios do aluno
            </label>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-gray-700">Equipamentos disponíveis</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {EQUIPAMENTOS.map((eq) => (
                  <label key={eq} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editando.equipamentos.includes(eq)}
                      onChange={(e) =>
                        setEditando({
                          ...editando,
                          equipamentos: e.target.checked ? [...editando.equipamentos, eq] : editando.equipamentos.filter((x) => x !== eq),
                        })
                      }
                    />
                    {eq}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setEditando(null)} />
              <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvar} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import EditorMusculacao from "@/components/treino/editor/EditorMusculacao";
import { JanelaModelos, JanelaRotina, type ModeloNaLista, type Rotina } from "@/components/treino/editor/JanelasDoEditor";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type ResumoDoPrograma = {
  programa_id: string;
  titulo: string | null;
  arquivada_em: string | null;
  versao: number | null;
  alterada: boolean;
  vigente: boolean;
};

type Dados = {
  aluno: { id: string; nome: string; idade: number | null; sexo: string | null };
  programas: ResumoDoPrograma[];
  rotinas: Rotina[];
  academia: { id: string; nome: string; domestica: boolean; equipamentos: string[] } | null;
  modelos: ModeloNaLista[];
};

// Elaboração de treino de musculação (VIS-03). Cada aba é um programa do
// profissional para este aluno; "Novo treino" cria outro, sem mexer nos
// existentes.
export default function MusculacaoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const busca = useSearchParams();
  const programaNaUrl = busca.get("programa");

  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [verArquivados, setVerArquivados] = useState(false);
  const [rotinas, setRotinas] = useState(false);
  const [modelos, setModelos] = useState(false);
  const [criando, setCriando] = useState(false);

  const buscar = useCallback(
    () =>
      fetch(`/api/treino/alunos/${params.id}/programas`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<Dados>) : null))
        .catch(() => null),
    [params.id]
  );
  const carregar = useCallback(async () => setDados(await buscar()), [buscar]);

  useEffect(() => {
    buscar().then(setDados);
  }, [buscar]);

  const abrir = useCallback((programaId: string) => router.replace(`/treino/alunos/${params.id}/musculacao?programa=${programaId}`), [router, params.id]);

  const ativos = dados?.programas.filter((p) => !p.arquivada_em) ?? [];
  const arquivados = dados?.programas.filter((p) => p.arquivada_em) ?? [];
  const selecionado = dados?.programas.find((p) => p.programa_id === programaNaUrl) ? programaNaUrl : ativos[0]?.programa_id ?? null;

  // Sem programa na URL: abre o primeiro ativo.
  useEffect(() => {
    if (dados && !programaNaUrl && selecionado) abrir(selecionado);
  }, [dados, programaNaUrl, selecionado, abrir]);

  async function criar(corpo: Record<string, unknown>) {
    setCriando(true);
    const r = await fetch(`/api/treino/alunos/${params.id}/programas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }).catch(() => null);
    const resposta = await r?.json().catch(() => null);
    setCriando(false);
    if (!r?.ok) {
      avisar(resposta?.erro ?? "Não foi possível criar o treino.", "error");
      return;
    }
    setRotinas(false);
    setModelos(false);
    await carregar();
    abrir(resposta.programaId);
  }

  async function arquivarModelo(m: ModeloNaLista) {
    if (!(await pedirConfirmacao(`Arquivar o modelo “${m.nome}”? Os treinos criados a partir dele não mudam.`, { aceitar: "Arquivar", rejeitar: "Cancelar" }))) return;
    const r = await fetch(`/api/treino/modelos/${m.id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) avisar("Não foi possível arquivar o modelo.", "error");
    await carregar();
  }

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <BotaoVoltar rotulo="Voltar para a ficha do aluno" onClick={() => router.push(`/treino/alunos/${params.id}`)} />

        {dados === undefined ? (
          <Skeleton height="24rem" borderRadius="16px" />
        ) : dados === null ? (
          <div className="cartao p-6 text-center">
            <p className="font-semibold text-gray-900">Aluno não encontrado.</p>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold text-gray-900">Elaboração de treino</h1>

            <div className="mt-4 flex flex-wrap items-end gap-1 border-b border-gray-200" role="tablist" aria-label="Treinos do aluno">
              {(verArquivados ? [...ativos, ...arquivados] : ativos).map((p) => {
                const ativo = p.programa_id === selecionado;
                return (
                  <button
                    key={p.programa_id}
                    type="button"
                    role="tab"
                    aria-selected={ativo}
                    onClick={() => abrir(p.programa_id)}
                    className={`-mb-px rounded-t-xl border px-3 py-2 text-left ${
                      ativo ? "border-gray-200 border-b-white bg-white" : "border-transparent text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span className="block max-w-[14rem] truncate text-sm font-semibold text-primary-800">{p.titulo || "Treino sem título"}</span>
                    <span className="block text-xs text-gray-500">
                      {p.arquivada_em
                        ? "Arquivado"
                        : p.versao
                          ? `Enviado (v${p.versao})${p.alterada ? " · alterado" : ""}${p.vigente ? " · vigente" : ""}`
                          : "Rascunho"}
                    </span>
                  </button>
                );
              })}
              <Button type="button" icon="pi pi-plus" label="Novo treino" text loading={criando} onClick={() => criar({ origem: "vazio" })} />
              {arquivados.length ? (
                <Button
                  type="button"
                  text
                  size="small"
                  severity="secondary"
                  label={verArquivados ? "Ocultar arquivados" : `Arquivados (${arquivados.length})`}
                  onClick={() => setVerArquivados((v) => !v)}
                  className="ml-auto"
                />
              ) : null}
            </div>

            <div className="cartao mt-3 flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 text-sm text-gray-700">
              <span className="font-semibold text-gray-900">{dados.aluno.nome}</span>
              {dados.aluno.idade !== null ? <span>{dados.aluno.idade} anos</span> : null}
              {dados.aluno.sexo ? <span>{dados.aluno.sexo}</span> : null}
              <span>
                Academia:{" "}
                {dados.academia ? (
                  `${dados.academia.nome}${dados.academia.domestica ? " (em casa)" : ""}`
                ) : (
                  <span className="text-gray-500">não informada (defina na ficha do aluno)</span>
                )}
              </span>
            </div>

            <div className="mt-3">
              {selecionado ? (
                <EditorMusculacao
                  key={selecionado}
                  programaId={selecionado}
                  aluno={dados.aluno}
                  equipamentosDaAcademia={dados.academia?.equipamentos ?? null}
                  onAlterado={carregar}
                  onNovoAPartirDe={(origem) => criar(origem)}
                  onAbrirImportarRotina={() => setRotinas(true)}
                  onAbrirModelos={() => setModelos(true)}
                  onModeloSalvo={carregar}
                />
              ) : (
                <div className="cartao p-8 text-center">
                  <i className="pi pi-bolt text-3xl text-gray-400" aria-hidden />
                  <p className="mt-3 font-semibold text-gray-900">Nenhum treino elaborado para este aluno.</p>
                  <p className="mt-1 text-sm text-gray-500">Comece do zero, a partir de um modelo ou do treino que o aluno já tem.</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <Button type="button" icon="pi pi-plus" label="Novo treino" loading={criando} onClick={() => criar({ origem: "vazio" })} />
                    <Button type="button" icon="pi pi-folder-open" label="Usar modelo" outlined onClick={() => setModelos(true)} />
                    <Button type="button" icon="pi pi-history" label="Importar rotina" outlined onClick={() => setRotinas(true)} />
                  </div>
                </div>
              )}
            </div>

            <JanelaRotina aberta={rotinas} rotinas={dados.rotinas} onFechar={() => setRotinas(false)} onEscolher={(r) => criar({ origem: "rotina", prescricaoId: r.id })} />
            <JanelaModelos
              aberta={modelos}
              modelos={dados.modelos}
              onFechar={() => setModelos(false)}
              onEscolher={(m) => criar({ origem: "modelo", modeloId: m.id })}
              onArquivar={arquivarModelo}
            />
          </>
        )}
      </div>
    </main>
  );
}

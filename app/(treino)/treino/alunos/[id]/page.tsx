"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import PainelTreino from "@/components/PainelTreino";
import RegistrosDoTreino from "@/components/RegistrosDoTreino";
import AcompanhamentoSemanal from "@/components/treino/AcompanhamentoSemanal";
import ListaDeDesconfortos, { type DesconfortoNaTela } from "@/components/treino/ListaDeDesconfortos";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";
import type { PlanoDeTreino } from "@/lib/treino";

type Treino = {
  id: string;
  status: "pendente" | "processando" | "concluido" | "falhou";
  erro: string | null;
  file_name: string | null;
  storage_path: string | null;
  texto_enviado: string | null;
  plano: PlanoDeTreino | null;
  comentario_ia: string | null;
  created_at: string;
  atualizado_em: string | null;
};

type Vinculo = { profissional_id: string; nome: string; ativo: boolean; inicio: string };

type Painel = {
  admin: boolean;
  aluno: { id: string; nome: string };
  treino: Treino | null;
  vinculos: Vinculo[];
  desconfortos: DesconfortoNaTela[];
  educadores: { usuario_id: string; nome: string }[] | null;
};

// Painel geral do aluno no Módulo de Treino: treino vigente, registros,
// relatos de desconforto e (administrador) educadores vinculados.
export default function AlunoNoTreinoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const daFicha = useSearchParams().get("de") === "ficha";

  const [painel, setPainel] = useState<Painel | null | undefined>(undefined);
  const [lendoDeNovo, setLendoDeNovo] = useState(false);
  const [educadorEscolhido, setEducadorEscolhido] = useState<string | null>(null);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);

  const buscar = useCallback(
    () => fetch(`/api/treino/alunos/${params.id}`, { cache: "no-store" }).then((r) => (r.ok ? (r.json() as Promise<Painel>) : null)),
    [params.id]
  );
  const carregar = useCallback(async () => setPainel(await buscar()), [buscar]);

  useEffect(() => {
    buscar()
      .then(setPainel)
      .catch(() => setPainel(null));
  }, [buscar]);

  const treino = painel?.treino ?? null;
  const lendo = treino?.status === "pendente" || treino?.status === "processando";

  useEffect(() => {
    if (!lendo) return;
    const intervalo = setInterval(carregar, 4000);
    return () => clearInterval(intervalo);
  }, [lendo, carregar]);

  async function abrirOriginal() {
    if (!treino?.storage_path) return;
    const { data, error } = await api.storage.from("treinos").createSignedUrl(treino.storage_path, 300);
    if (error || !data) {
      avisar("Não foi possível abrir o arquivo.", "error");
      return;
    }
    abrirDocumento(data.signedUrl);
  }

  async function lerDeNovo() {
    if (!treino) return;
    setLendoDeNovo(true);
    const resposta = await fetch(`/api/treinos/${treino.id}/analisar`, { method: "POST" });
    setLendoDeNovo(false);
    if (!resposta.ok) {
      avisar("Não foi possível ler o treino novamente.", "error");
      return;
    }
    await carregar();
  }

  async function alterarVinculo(acao: "vincular" | "desvincular", educadorId: string, nome?: string) {
    if (acao === "desvincular" && !(await pedirConfirmacao(`Encerrar o vínculo com ${nome}? O educador deixa de ver este aluno. O histórico fica guardado.`)))
      return;
    setSalvandoVinculo(true);
    const r = await fetch(`/api/treino/alunos/${params.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, educadorId }),
    });
    setSalvandoVinculo(false);
    if (!r.ok) {
      avisar((await r.json().catch(() => null))?.erro ?? "Não foi possível salvar o vínculo.", "error");
      return;
    }
    const { vinculos } = await r.json();
    setPainel((atual) => (atual ? { ...atual, vinculos } : atual));
    setEducadorEscolhido(null);
  }

  function visto(id: string) {
    setPainel((atual) =>
      atual
        ? { ...atual, desconfortos: atual.desconfortos.map((d) => (d.id === id ? { ...d, visto_em: new Date().toISOString(), visto_por_nome: null } : d)) }
        : atual
    );
  }

  const disponiveis = (painel?.educadores ?? []).filter((e) => !painel?.vinculos.some((v) => v.profissional_id === e.usuario_id));

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar
          rotulo={daFicha ? "Voltar para o paciente" : "Voltar para o Módulo de Treino"}
          onClick={() => router.push(daFicha ? `/pacientes/${params.id}` : "/treino")}
        />

        {painel === undefined ? (
          <Skeleton height="24rem" borderRadius="16px" />
        ) : painel === null ? (
          <div className="cartao p-6 text-center">
            <p className="font-semibold text-gray-900">Aluno não encontrado.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Treino</h1>
                <p className="mt-2 text-gray-600">{painel.aluno.nome}</p>
              </div>

              {treino && (
                <div className="flex flex-wrap gap-2">
                  {treino.storage_path && (
                    <Button type="button" outlined icon="pi pi-file" label="Arquivo enviado" onClick={abrirOriginal} />
                  )}
                  <Button
                    type="button"
                    outlined
                    icon="pi pi-refresh"
                    label="Ler novamente"
                    loading={lendoDeNovo || lendo}
                    disabled={lendo}
                    onClick={lerDeNovo}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4">
              {painel.desconfortos.length ? (
                <section className="cartao p-5" aria-label="Relatos de desconforto do aluno">
                  <h2 className="font-bold text-gray-900">Relatos de desconforto</h2>
                  <ListaDeDesconfortos desconfortos={painel.desconfortos} onVisto={visto} />
                </section>
              ) : null}

              <AcompanhamentoSemanal alunoId={painel.aluno.id} admin={painel.admin} />

              {painel.admin ? (
                <section className="cartao p-5" aria-label="Educadores físicos do aluno">
                  <h2 className="font-bold text-gray-900">Educadores físicos</h2>
                  {painel.vinculos.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">
                      Nenhum educador vinculado. Os alertas deste aluno vão para o administrador.
                    </p>
                  ) : (
                    <ul className="mt-2 divide-y divide-gray-100">
                      {painel.vinculos.map((v) => (
                        <li key={v.profissional_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <span>
                            <span className="font-semibold text-gray-900">{v.nome}</span>
                            <span className="text-gray-500">
                              {" "}
                              · desde {new Date(v.inicio).toLocaleDateString("pt-BR")}
                              {v.ativo ? "" : " · conta desativada"}
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="small"
                            text
                            severity="danger"
                            label="Encerrar vínculo"
                            disabled={salvandoVinculo}
                            onClick={() => alterarVinculo("desvincular", v.profissional_id, v.nome)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                  {disponiveis.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Dropdown
                        value={educadorEscolhido}
                        options={disponiveis.map((e) => ({ label: e.nome, value: e.usuario_id }))}
                        onChange={(e) => setEducadorEscolhido(e.value)}
                        placeholder="Escolha o educador físico"
                        aria-label="Educador físico"
                        className="w-full sm:w-72"
                      />
                      <Button
                        type="button"
                        icon="pi pi-link"
                        label="Vincular"
                        disabled={!educadorEscolhido}
                        loading={salvandoVinculo}
                        onClick={() => educadorEscolhido && alterarVinculo("vincular", educadorEscolhido)}
                      />
                    </div>
                  ) : painel.educadores?.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">Cadastre educadores físicos em Módulo de Treino › Educadores físicos.</p>
                  ) : null}
                </section>
              ) : null}

              {treino === null ? (
                <div className="cartao p-6 text-center">
                  <i className="pi pi-bolt text-3xl text-gray-400" aria-hidden />
                  <p className="mt-3 font-semibold text-gray-900">O aluno ainda não enviou o treino.</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-500">
                    Enviado em {new Date(treino.created_at).toLocaleDateString("pt-BR")}
                    {treino.atualizado_em &&
                      ` · ajustado pelo aluno em ${new Date(treino.atualizado_em).toLocaleDateString("pt-BR")}`}
                    {treino.storage_path || treino.texto_enviado ? " · treino de origem externa (enviado pelo aluno)" : ""}
                  </p>

                  {lendo && (
                    <Message severity="info" text="A IA está lendo o treino. Aguarde alguns segundos." className="w-full justify-start" />
                  )}

                  {treino.status === "falhou" && (
                    <Message severity="error" text={`Não foi possível ler o treino. ${treino.erro ?? ""}`} className="w-full justify-start" />
                  )}

                  {treino.comentario_ia && (
                    <section className="cartao p-5">
                      <h2 className="font-bold text-gray-900">Leitura da IA</h2>
                      <p className="mt-2 whitespace-pre-line text-gray-700">{treino.comentario_ia}</p>
                    </section>
                  )}

                  {treino.plano && <PainelTreino plano={treino.plano} />}

                  <RegistrosDoTreino pacienteId={params.id} />

                  {treino.texto_enviado && (
                    <details className="cartao p-5">
                      <summary className="cursor-pointer font-bold text-gray-900">Texto enviado pelo aluno</summary>
                      <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-gray-700">{treino.texto_enviado}</pre>
                    </details>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

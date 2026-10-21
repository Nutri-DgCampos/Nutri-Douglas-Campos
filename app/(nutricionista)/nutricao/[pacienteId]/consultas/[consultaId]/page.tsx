"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import SecaoAnamnese from "@/components/nutricao/anamnese/SecaoAnamnese";
import SecaoExames from "@/components/nutricao/exames/SecaoExames";
import SecaoOrientacoes from "@/components/nutricao/orientacoes/SecaoOrientacoes";
import Selecao from "@/components/Selecao";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { TIPOS_CONSULTA, formatarData, idadeEm, rotuloDoTipo } from "@/lib/nutricao/paciente";

type Consulta = {
  id: string;
  patient_id: string;
  data: string;
  tipo: string;
  status: string;
  created_at: string;
  finalizada_em: string | null;
};

type Alteracao = {
  id: string;
  acao: string;
  campo: string | null;
  valor_anterior: unknown;
  valor_novo: unknown;
  criado_em: string;
};

// Seções da consulta. Cada uma passa a listar seus registros na fase em que
// for implementada (Dietas: Fase 2); até lá, mostra que não há registros.
const SECOES = [
  { titulo: "Anamnese", icone: "pi-file-edit" },
  { titulo: "Avaliação física", icone: "pi-chart-line" },
  { titulo: "Dietas", icone: "pi-book" },
  { titulo: "Exames", icone: "pi-heart" },
  { titulo: "Fórmulas", icone: "pi-box" },
  { titulo: "Medicações", icone: "pi-plus-circle" },
  { titulo: "Orientações", icone: "pi-comment" },
];

const ACOES: Record<string, string> = {
  criacao: "Consulta criada",
  finalizacao: "Consulta finalizada",
  exclusao: "Consulta excluída",
};

const CAMPOS: Record<string, string> = { data: "Data", tipo: "Tipo" };

function textoDoValor(campo: string | null, valor: unknown) {
  if (valor === null || valor === undefined) return "—";
  if (campo === "data" && typeof valor === "string") return formatarData(valor);
  if (campo === "tipo" && typeof valor === "string") return rotuloDoTipo(valor);
  return String(valor);
}

export default function ConsultaPage() {
  const { pacienteId, consultaId } = useParams<{ pacienteId: string; consultaId: string }>();
  const router = useRouter();

  const [consulta, setConsulta] = useState<Consulta | null | undefined>(undefined);
  const [paciente, setPaciente] = useState<{ name: string; birth_date: string | null } | null>(null);
  const [alteracoes, setAlteracoes] = useState<Alteracao[]>([]);
  const [dietas, setDietas] = useState<{ id: string; titulo: string | null; versoes: number; arquivada_em: string | null }[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<{ id: string; data: string; status: string; envios: number }[]>([]);
  const [criandoAvaliacao, setCriandoAvaliacao] = useState(false);

  const [corrigindo, setCorrigindo] = useState(false);
  const [dataEditada, setDataEditada] = useState("");
  const [tipoEditado, setTipoEditado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const carregar = useCallback(async () => {
    const [dadosConsulta, dadosPaciente, historico, dadosDietas, dadosAvaliacoes] = await Promise.all([
      api
        .from("consultas")
        .select("id, patient_id, data, tipo, status, created_at, finalizada_em")
        .eq("id", consultaId)
        .maybeSingle(),
      api.from("patients").select("name, birth_date").eq("id", pacienteId).maybeSingle(),
      api
        .from("auditoria_clinica")
        .select("id, acao, campo, valor_anterior, valor_novo, criado_em")
        .eq("tabela", "consultas")
        .eq("registro_id", consultaId)
        .order("criado_em", { ascending: false }),
      fetch(`/api/nutricao/consultas/${consultaId}/dietas`, { cache: "no-store" })
        .then((resposta) => (resposta.ok ? resposta.json() : { dietas: [] }))
        .catch(() => ({ dietas: [] })),
      fetch(`/api/nutricao/consultas/${consultaId}/avaliacoes`, { cache: "no-store" })
        .then((resposta) => (resposta.ok ? resposta.json() : { avaliacoes: [] }))
        .catch(() => ({ avaliacoes: [] })),
    ]);

    const encontrada = dadosConsulta.data as Consulta | null;
    setConsulta(encontrada && encontrada.patient_id === pacienteId ? encontrada : null);
    setPaciente(dadosPaciente.data ?? null);
    setAlteracoes((historico.data ?? []) as Alteracao[]);
    setDietas(dadosDietas.dietas ?? []);
    setAvaliacoes(dadosAvaliacoes.avaliacoes ?? []);
  }, [consultaId, pacienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function enviar(metodo: "PATCH" | "DELETE", corpo?: object) {
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}`, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const resultado = await resposta.json().catch(() => null);
    return { ok: resposta.ok, erro: resultado?.erro as string | undefined };
  }

  async function salvarCorrecao() {
    if (!consulta) return;

    const corpo: Record<string, string> = {};
    if (dataEditada && dataEditada !== consulta.data) corpo.data = dataEditada;
    if (tipoEditado && tipoEditado !== consulta.tipo) corpo.tipo = tipoEditado;

    if (Object.keys(corpo).length === 0) {
      setCorrigindo(false);
      return;
    }

    setSalvando(true);
    const { ok, erro } = await enviar("PATCH", corpo);
    setSalvando(false);

    if (!ok) {
      avisar(erro ?? "Não foi possível salvar a correção.", "error");
      return;
    }

    setCorrigindo(false);
    avisar("Consulta corrigida. A alteração ficou registrada no histórico.", "success");
    carregar();
  }

  async function novaAvaliacao() {
    setCriandoAvaliacao(true);
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/avaliacoes`, { method: "POST" });
    const resultado = await resposta.json().catch(() => null);
    setCriandoAvaliacao(false);
    if (!resposta.ok || !resultado?.id) {
      avisar(resultado?.erro ?? "Não foi possível criar a avaliação.", "error");
      return;
    }
    router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/avaliacao/${resultado.id}`);
  }

  async function finalizar() {
    const confirmado = await pedirConfirmacao(
      "Finalizar a consulta? Ela continua disponível no histórico. Finalizar não envia dietas nem documentos ao paciente."
    );
    if (!confirmado) return;

    const { ok, erro } = await enviar("PATCH", { finalizar: true });

    if (!ok) {
      avisar(erro ?? "Não foi possível finalizar a consulta.", "error");
      return;
    }

    avisar("Consulta finalizada.", "success");
    carregar();
  }

  async function excluir() {
    setExcluindo(true);
    const { ok, erro } = await enviar("DELETE");
    setExcluindo(false);

    if (!ok) {
      avisar(erro ?? "Não foi possível excluir a consulta.", "error");
      setConfirmarExclusao(false);
      return;
    }

    avisar("Consulta excluída.", "success");
    router.push(`/nutricao/${pacienteId}`);
  }

  if (consulta === undefined) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton height="3rem" width="60%" />
          <Skeleton height="12rem" />
        </div>
      </main>
    );
  }

  const voltar = () => router.push(`/nutricao/${pacienteId}`);

  if (consulta === null) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <BotaoVoltar rotulo="Voltar ao paciente" onClick={voltar} />
          <h1 className="text-2xl font-bold text-gray-900">Consulta não encontrada</h1>
        </div>
      </main>
    );
  }

  const emAndamento = consulta.status === "em_andamento";
  const idade = idadeEm(paciente?.birth_date, consulta.data);

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar ao paciente" onClick={voltar} />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-700">{paciente?.name}</p>
            <h1 className="text-3xl font-bold text-gray-900">Consulta de {formatarData(consulta.data)}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span>{rotuloDoTipo(consulta.tipo)}</span>
              {idade !== null && <span>· {idade} anos na data da consulta</span>}
              <Tag
                value={emAndamento ? "Em andamento" : "Finalizada"}
                severity={emAndamento ? "info" : "success"}
                className="selo-status"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              outlined
              icon="pi pi-pencil"
              label="Corrigir data ou tipo"
              onClick={() => {
                setDataEditada(consulta.data);
                setTipoEditado(consulta.tipo);
                setCorrigindo(true);
              }}
            />
            {emAndamento && (
              <Button type="button" icon="pi pi-check" label="Finalizar consulta" onClick={finalizar} />
            )}
          </div>
        </div>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECOES.map((secao) => (
            <div key={secao.titulo} className="cartao p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <i className={`pi ${secao.icone}`} aria-hidden />
                </span>
                <h2 className="font-bold text-gray-900">{secao.titulo}</h2>
              </div>
              {secao.titulo === "Anamnese" ? (
                <SecaoAnamnese pacienteId={pacienteId} consultaId={consultaId} />
              ) : secao.titulo === "Fórmulas" ? (
                <>
                  <p className="mt-3 text-sm text-gray-500">Fórmulas manipuladas, modelos e PDF (Manipulados).</p>
                  <Button
                    type="button"
                    icon="pi pi-box"
                    label="Abrir fórmulas"
                    size="small"
                    className="mt-3"
                    onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/formulas`)}
                  />
                </>
              ) : secao.titulo === "Medicações" ? (
                <>
                  <p className="mt-3 text-sm text-gray-500">Medicamentos que o paciente usa, receitas e resumo semanal.</p>
                  <Button
                    type="button"
                    icon="pi pi-plus-circle"
                    label="Abrir medicações"
                    size="small"
                    className="mt-3"
                    onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/medicacoes`)}
                  />
                </>
              ) : secao.titulo === "Orientações" ? (
                <SecaoOrientacoes pacienteId={pacienteId} consultaId={consultaId} />
              ) : secao.titulo === "Exames" ? (
                <SecaoExames pacienteId={pacienteId} consultaId={consultaId} />
              ) : secao.titulo === "Avaliação física" ? (
                <>
                  {avaliacoes.length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">Nenhuma avaliação registrada.</p>
                  ) : (
                    <ul className="mt-3 space-y-1 text-sm">
                      {avaliacoes.map((a) => (
                        <li key={a.id} className="flex justify-between gap-2">
                          <button
                            type="button"
                            className="truncate text-left text-primary-700 hover:underline"
                            onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/avaliacao/${a.id}`)}
                          >
                            Avaliação de {formatarData(a.data)}
                          </button>
                          <span className="shrink-0 text-gray-500">
                            {a.status === "finalizada" ? (a.envios ? "Enviada" : "Finalizada") : "Rascunho"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    type="button"
                    icon="pi pi-plus"
                    label="Nova avaliação"
                    size="small"
                    className="mt-3"
                    loading={criandoAvaliacao}
                    onClick={novaAvaliacao}
                  />
                </>
              ) : secao.titulo === "Dietas" ? (
                <>
                  {dietas.filter((d) => !d.arquivada_em).length === 0 ? (
                    <p className="mt-3 text-sm text-gray-500">Nenhuma dieta elaborada.</p>
                  ) : (
                    <ul className="mt-3 space-y-1 text-sm">
                      {dietas
                        .filter((d) => !d.arquivada_em)
                        .map((d) => (
                          <li key={d.id} className="flex justify-between gap-2">
                            <button
                              type="button"
                              className="truncate text-left text-primary-700 hover:underline"
                              onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/dietas?dieta=${d.id}`)}
                            >
                              {d.titulo?.trim() || "Sem título"}
                            </button>
                            <span className="shrink-0 text-gray-500">{d.versoes ? `Enviada (v${d.versoes})` : "Em elaboração"}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                  <Button
                    type="button"
                    icon="pi pi-pencil"
                    label="Elaborar dietas"
                    size="small"
                    className="mt-3"
                    onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${consultaId}/dietas`)}
                  />
                </>
              ) : (
                <p className="mt-3 text-sm text-gray-500">Nenhum registro cadastrado.</p>
              )}
            </div>
          ))}
        </section>

        <section className="cartao mt-4 overflow-hidden">
          <h2 className="border-b border-gray-200 px-5 py-3 font-bold text-gray-900">Histórico de alterações</h2>
          {alteracoes.length === 0 ? (
            <p className="p-5 text-sm text-gray-500">Nenhuma alteração registrada.</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {alteracoes.map((alteracao) => (
                <li key={alteracao.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-3 text-sm">
                  <span className="text-gray-800">
                    {alteracao.acao === "alteracao"
                      ? `${CAMPOS[alteracao.campo ?? ""] ?? alteracao.campo}: ${textoDoValor(alteracao.campo, alteracao.valor_anterior)} → ${textoDoValor(alteracao.campo, alteracao.valor_novo)}`
                      : ACOES[alteracao.acao] ?? alteracao.acao}
                  </span>
                  <span className="text-gray-500">{new Date(alteracao.criado_em).toLocaleString("pt-BR")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {emAndamento && (
          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              severity="danger"
              outlined
              icon="pi pi-trash"
              label="Excluir consulta"
              onClick={() => setConfirmarExclusao(true)}
            />
          </div>
        )}
      </div>

      <Dialog
        header="Corrigir consulta"
        visible={corrigindo}
        onHide={() => !salvando && setCorrigindo(false)}
        className="w-[26rem] max-w-[calc(100vw-2rem)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" severity="secondary" outlined onClick={() => setCorrigindo(false)} />
            <Button type="button" label="Salvar correção" icon="pi pi-check" loading={salvando} onClick={salvarCorrecao} />
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="data-correcao" className="mb-2 block text-sm font-semibold text-gray-700">
              Data do atendimento
            </label>
            <InputText
              id="data-correcao"
              type="date"
              value={dataEditada}
              onChange={(evento) => setDataEditada(evento.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Tipo de consulta</label>
            <Selecao value={tipoEditado} onChange={(evento) => setTipoEditado(evento.target.value)} className="w-full">
              {TIPOS_CONSULTA.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.rotulo}
                </option>
              ))}
            </Selecao>
          </div>
          <p className="text-xs text-gray-500">A correção fica registrada no histórico de alterações.</p>
        </div>
      </Dialog>

      <Dialog
        header="Excluir consulta"
        visible={confirmarExclusao}
        onHide={() => !excluindo && setConfirmarExclusao(false)}
        className="w-[28rem] max-w-[calc(100vw-2rem)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label="Cancelar"
              severity="secondary"
              outlined
              disabled={excluindo}
              onClick={() => setConfirmarExclusao(false)}
            />
            <Button
              type="button"
              label="Confirmar exclusão"
              icon="pi pi-trash"
              severity="danger"
              loading={excluindo}
              onClick={excluir}
            />
          </div>
        }
      >
        <p className="text-gray-700">
          <strong>{paciente?.name}</strong> — consulta de <strong>{formatarData(consulta.data)}</strong>.
        </p>
        <p className="mt-2 text-gray-700">
          A consulta vigente será excluída. Consultas anteriores, dietas publicadas, relatórios e o histórico de peso
          não são afetados. Consultas com registros clínicos vinculados não podem ser excluídas.
        </p>
      </Dialog>
    </main>
  );
}

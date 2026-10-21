"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { avisar } from "@/lib/avisos";
import CampoNumero from "@/components/nutricao/editor/CampoNumero";
import {
  DIAS,
  STATUS,
  UNIDADES_DE_ATIVO,
  UNIDADES_DE_QUANTIDADE,
  calcularSemana,
  comUnidade,
  formatar,
  type DadosDaMedicacao,
  type StatusDaMedicacao,
} from "@/lib/nutricao/medicacao";

export type Medicacao = {
  id: string;
  medicamento_id: string | null;
  origem_id: string | null;
  ordem: number;
  status: StatusDaMedicacao;
  dados: DadosDaMedicacao;
  excluida_em: string | null;
  revisao: number;
};

export type Receita = { id: string; file_name: string; storage_path: string; prescritor: string };

const CORES: Record<StatusDaMedicacao, string> = {
  em_uso: "border-primary-200",
  suspenso: "border-gray-200 bg-gray-50",
  nao_confirmado: "border-dashed border-gray-300 bg-gray-50",
};

// Uma medicação da consulta: dados, semana (quantidade e vezes por dia),
// total semanal, receitas. Salva sozinha.
export default function CartaoDaMedicacao({
  medicacao,
  receitas,
  primeira,
  ultima,
  onMover,
  onAcao,
  onAbrirReceita,
  onAtualizada,
}: {
  medicacao: Medicacao;
  receitas: Receita[];
  primeira: boolean;
  ultima: boolean;
  onMover: (direcao: -1 | 1) => void;
  onAcao: (acao: "excluir" | "duplicar" | "salvar_na_biblioteca") => void;
  onAbrirReceita: (r: Receita) => void;
  // Avisa a tela (resumo e contadores) a cada alteração.
  onAtualizada: (dados: DadosDaMedicacao, status: StatusDaMedicacao) => void;
}) {
  const [dados, setDados] = useState(medicacao.dados);
  const [status, setStatus] = useState(medicacao.status);
  const [estado, setEstado] = useState<"salvo" | "pendente" | "salvando" | "erro">("salvo");
  const [aberto, setAberto] = useState(medicacao.status !== "suspenso");
  const atual = useRef({ dados: medicacao.dados, status: medicacao.status });
  const revisao = useRef(medicacao.revisao);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function gravar() {
    if (temporizador.current) clearTimeout(temporizador.current);
    setEstado("salvando");
    const resposta = await fetch(`/api/nutricao/medicacoes/${medicacao.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...atual.current, revisao: revisao.current }),
    }).catch(() => null);
    if (!resposta?.ok) {
      const resultado = await resposta?.json().catch(() => null);
      setEstado("erro");
      avisar(resultado?.erro ?? "Não foi possível salvar a medicação.", "error");
      return;
    }
    revisao.current = (await resposta.json()).revisao;
    setEstado("salvo");
  }

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  function alterar(mudanca: (d: DadosDaMedicacao) => void, novoStatus?: StatusDaMedicacao) {
    const copia = structuredClone(atual.current.dados);
    mudanca(copia);
    atual.current = { dados: copia, status: novoStatus ?? atual.current.status };
    onAtualizada(copia, atual.current.status);
    setDados(copia);
    if (novoStatus) setStatus(novoStatus);
    setEstado("pendente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void gravar(), novoStatus ? 50 : 1000);
  }

  const calculo = calcularSemana(dados);
  const vinculadas = dados.receitas.map((r) => ({ ...r, receita: receitas.find((x) => x.id === r.id) })).filter((r) => r.receita);
  const naoVinculadas = receitas.filter((r) => !dados.receitas.some((x) => x.id === r.id));
  const nomeVisivel = dados.nome.trim() || "Medicamento sem nome";

  return (
    <li className={`rounded-xl border bg-white p-3 ${CORES[status]}`} aria-label={nomeVisivel} data-status={status}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <Button type="button" icon="pi pi-angle-up" text size="small" className="h-5" aria-label={`Subir ${nomeVisivel}`} disabled={primeira} onClick={() => onMover(-1)} />
          <Button type="button" icon="pi pi-angle-down" text size="small" className="h-5" aria-label={`Descer ${nomeVisivel}`} disabled={ultima} onClick={() => onMover(1)} />
        </div>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
          <span className={`block truncate font-semibold ${status === "suspenso" ? "text-gray-400 line-through" : status === "nao_confirmado" ? "text-gray-500" : "text-gray-900"}`}>
            {nomeVisivel}
          </span>
          <span className="block text-xs text-gray-500">
            {[dados.principioAtivo, calculo.fisicoSemanal !== null ? `${comUnidade(calculo.fisicoSemanal, calculo.unidadeFisica)}/semana` : null, calculo.ativoSemanal !== null && calculo.unidadeAtivo !== calculo.unidadeFisica ? `${formatar(calculo.ativoSemanal)} ${calculo.unidadeAtivo}/semana` : null]
              .filter(Boolean)
              .join(" · ")}
            {medicacao.origem_id && status === "nao_confirmado" ? " · trazida da consulta anterior" : ""}
          </span>
        </button>
        {status === "nao_confirmado" ? (
          <Button type="button" icon="pi pi-check" label="Confirmar uso" size="small" outlined onClick={() => alterar(() => undefined, "em_uso")} />
        ) : null}
        <Dropdown
          aria-label={`Status de ${nomeVisivel}`}
          value={status}
          options={Object.entries(STATUS).map(([value, label]) => ({ label, value }))}
          onChange={(e) => alterar(() => undefined, e.value)}
          className="w-44"
        />
        <span className={`w-20 text-right text-xs ${estado === "erro" ? "text-red-700" : "text-gray-400"}`}>
          {{ salvo: "Salvo", pendente: "…", salvando: "Salvando…", erro: "Erro" }[estado]}
        </span>
        <Button type="button" icon="pi pi-copy" text rounded aria-label={`Duplicar ${nomeVisivel}`} tooltip="Duplicar" onClick={() => onAcao("duplicar")} />
        {!medicacao.medicamento_id ? (
          <Button type="button" icon="pi pi-bookmark" text rounded aria-label={`Salvar ${nomeVisivel} na biblioteca`} tooltip="Salvar também na biblioteca" onClick={() => onAcao("salvar_na_biblioteca")} />
        ) : null}
        <Button type="button" icon="pi pi-trash" text rounded severity="danger" aria-label={`Excluir ${nomeVisivel}`} tooltip="Excluir desta consulta" onClick={() => onAcao("excluir")} />
      </div>

      {aberto ? (
        <div className="mt-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Nome comercial</span>
              <InputText aria-label="Nome comercial" value={dados.nome} onChange={(e) => alterar((d) => void (d.nome = e.target.value))} className="w-full" maxLength={200} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Princípio ativo</span>
              <InputText aria-label="Princípio ativo" value={dados.principioAtivo} onChange={(e) => alterar((d) => void (d.principioAtivo = e.target.value))} className="w-full" maxLength={200} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Apresentação</span>
              <InputText aria-label="Apresentação" value={dados.apresentacao} placeholder="Ex.: ampola 1 mL" onChange={(e) => alterar((d) => void (d.apresentacao = e.target.value))} className="w-full" maxLength={200} />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label>
              <span className="mb-1 block text-xs font-semibold text-gray-600">Quantidade usada em</span>
              <Dropdown
                aria-label="Unidade da quantidade"
                value={dados.unidadeQuantidade}
                options={UNIDADES_DE_QUANTIDADE.map((u) => ({ label: u, value: u }))}
                onChange={(e) => alterar((d) => void (d.unidadeQuantidade = e.value))}
                placeholder="Unidade"
                className="w-36"
              />
            </label>
            {dados.unidadeQuantidade && !["mg", "mcg", "g", "UI"].includes(dados.unidadeQuantidade) ? (
              <label>
                <span className="mb-1 block text-xs font-semibold text-gray-600">Concentração</span>
                <span className="flex items-center gap-1">
                  <CampoNumero ariaLabel="Concentração" valor={dados.concentracao} maximo={1_000_000} className="w-24" onChange={(v) => alterar((d) => void (d.concentracao = v))} />
                  <Dropdown
                    aria-label="Unidade do princípio ativo"
                    value={dados.unidadeAtivo}
                    options={UNIDADES_DE_ATIVO.map((u) => ({ label: u, value: u }))}
                    onChange={(e) => alterar((d) => void (d.unidadeAtivo = e.value))}
                    placeholder="mg"
                    className="w-28"
                  />
                  <span className="text-sm text-gray-600">/ {dados.unidadeQuantidade}</span>
                </span>
              </label>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="text-xs text-gray-500">
                  <th className="w-24 text-left font-semibold" />
                  {DIAS.map(([dia, nome]) => (
                    <th key={dia} className="px-1 font-semibold">
                      {nome.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="pr-2 text-xs text-gray-600">Quantidade{dados.unidadeQuantidade ? ` (${dados.unidadeQuantidade})` : ""}</td>
                  {DIAS.map(([dia, nome]) => (
                    <td key={dia} className="px-0.5">
                      <CampoNumero
                        ariaLabel={`Quantidade de ${nome}`}
                        valor={dados.semana[dia].quantidade}
                        maximo={1_000_000}
                        className="w-full text-center"
                        onChange={(v) => alterar((d) => void (d.semana[dia].quantidade = v))}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="pr-2 text-xs text-gray-600">Vezes no dia</td>
                  {DIAS.map(([dia, nome]) => (
                    <td key={dia} className="px-0.5">
                      <CampoNumero
                        ariaLabel={`Vezes de ${nome}`}
                        valor={dados.semana[dia].vezes}
                        maximo={24}
                        placeholder={dados.semana[dia].quantidade ? "1" : ""}
                        className="w-full text-center"
                        onChange={(v) => alterar((d) => void (d.semana[dia].vezes = v))}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <p className={`rounded-lg p-2 text-sm ${calculo.fisicoSemanal === null ? "bg-amber-50 text-amber-900" : "bg-primary-50 text-primary-900"}`} role="status">
            {calculo.fisicoSemanal === null ? (
              <>Dados insuficientes para cálculo. Falta: {calculo.faltando.join(", ")}.</>
            ) : (
              <>
                Total semanal: <strong>{comUnidade(calculo.fisicoSemanal, calculo.unidadeFisica)}</strong>
                {calculo.ativoSemanal !== null && calculo.unidadeAtivo !== calculo.unidadeFisica ? (
                  <>
                    {" "}
                    · <strong>{formatar(calculo.ativoSemanal)} {calculo.unidadeAtivo}</strong> de princípio ativo
                  </>
                ) : null}
                {calculo.faltando.length ? <span className="block text-xs">Princípio ativo: falta {calculo.faltando.join(", ")}.</span> : null}
                {status !== "em_uso" ? <span className="block text-xs">Fora dos totais da consulta ({STATUS[status].toLowerCase()}).</span> : null}
              </>
            )}
          </p>

          <div className="grid gap-2 sm:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Frequência (texto, opcional)</span>
              <InputText
                aria-label="Frequência"
                value={dados.frequenciaTexto}
                placeholder="Ex.: a cada 10 dias (informe a semana acima para calcular)"
                onChange={(e) => alterar((d) => void (d.frequenciaTexto = e.target.value))}
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Início</span>
              <input type="date" aria-label="Início" value={dados.inicio ?? ""} onChange={(e) => alterar((d) => void (d.inicio = e.target.value || null))} className="p-inputtext w-full" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Término</span>
              <input type="date" aria-label="Término" value={dados.termino ?? ""} onChange={(e) => alterar((d) => void (d.termino = e.target.value || null))} className="p-inputtext w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Profissional prescritor</span>
              <InputText aria-label="Prescritor" value={dados.prescritor} onChange={(e) => alterar((d) => void (d.prescritor = e.target.value))} className="w-full" maxLength={200} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Observações</span>
              <InputTextarea aria-label="Observações da medicação" value={dados.observacoes} rows={1} autoResize onChange={(e) => alterar((d) => void (d.observacoes = e.target.value))} className="w-full" />
            </label>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-gray-600">Receitas</p>
            <ul className="space-y-1 text-sm">
              {vinculadas.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <button type="button" className="text-primary-700 hover:underline" onClick={() => onAbrirReceita(r.receita!)}>
                    <i className="pi pi-paperclip mr-1 text-xs" aria-hidden />
                    Visualizar receita: {r.receita!.file_name}
                  </button>
                  {r.receita!.prescritor ? <span className="text-xs text-gray-500">({r.receita!.prescritor})</span> : null}
                  <button
                    type="button"
                    className={`text-xs ${r.maisRecente ? "font-semibold text-amber-700" : "text-gray-500 underline"}`}
                    onClick={() => alterar((d) => d.receitas.forEach((x) => (x.maisRecente = x.id === r.id ? !r.maisRecente : false)))}
                  >
                    {r.maisRecente ? "★ Receita mais recente" : "Marcar como mais recente"}
                  </button>
                  <button type="button" className="text-xs text-gray-500 underline" onClick={() => alterar((d) => void (d.receitas = d.receitas.filter((x) => x.id !== r.id)))}>
                    Desvincular
                  </button>
                </li>
              ))}
            </ul>
            {naoVinculadas.length ? (
              <Dropdown
                aria-label={`Vincular receita a ${nomeVisivel}`}
                value={null}
                options={naoVinculadas.map((r) => ({ label: `${r.file_name}${r.prescritor ? ` (${r.prescritor})` : ""}`, value: r.id }))}
                onChange={(e) => alterar((d) => void d.receitas.push({ id: e.value, maisRecente: false }))}
                placeholder="Vincular receita anexada"
                className="mt-1 w-full max-w-sm"
              />
            ) : receitas.length === 0 ? (
              <p className="text-xs text-gray-500">Anexe a receita em “Receitas da consulta” e vincule aqui.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}

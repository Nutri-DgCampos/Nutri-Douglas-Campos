"use client";

import { useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import { hojeNoBrasil } from "@/lib/cronograma";
import { formatarNutriente } from "@/lib/nutricao/calculo";
import {
  formatarNumero,
  hidratacaoDiaria,
  indicadoresDoPainel,
  NUTRIENTES_DO_PAINEL,
  totaisDaDieta,
  type DocumentoDieta,
  type GastoDeReferencia,
  type Indicador,
  type Indicadores,
} from "@/lib/nutricao/dieta";
import { formatarData } from "@/lib/nutricao/paciente";
import CampoNumero from "./CampoNumero";
import JanelaDetalhes from "./JanelaDetalhes";
import type { BaseDosAlimentos, DietaAnterior, Nutriente } from "./tipos";

function texto(indicador: Indicador | undefined, casas: number, sufixo = "") {
  if (!indicador || indicador.valor === null) return <span title="Dado não disponível">—</span>;
  return (
    <span title={indicador.completo ? undefined : "Total parcial: algum alimento não tem este dado na base."}>
      {formatarNumero(indicador.valor, casas)}
      {sufixo}
      {indicador.completo ? "" : <span className="text-amber-600">*</span>}
    </span>
  );
}

function kcal(indicador: Indicador | undefined) {
  if (!indicador || indicador.valor === null) return <span title="Dado não disponível">—</span>;
  return (
    <span>
      {formatarNutriente("kcal", indicador.valor)}
      {indicador.completo ? "" : <span className="text-amber-600">*</span>}
    </span>
  );
}

function Linhas({ p }: { p: Indicadores | null }) {
  const vazio = <span className="text-gray-400">—</span>;
  const celula = (conteudo: React.ReactNode) => (p ? conteudo : vazio);
  const macro = (nome: "carboidratos" | "proteinas" | "lipidios") =>
    celula(
      <span className="flex justify-end gap-2">
        <span className="text-gray-500">{p ? texto(p.macros[nome].percentual, 0, "%") : null}</span>
        <span>{p ? texto(p.macros[nome].gramas, 1, " g") : null}</span>
      </span>
    );

  return [
    ["Kcal", celula(p ? kcal(p.kcal) : null)],
    ["CHO", macro("carboidratos")],
    ["PTN", macro("proteinas")],
    ["LIP", macro("lipidios")],
    ["Kcal/kg", celula(p ? texto(p.kcalPorKg, 1) : null)],
    ["gCHO/kg", celula(p ? texto(p.macros.carboidratos.porKg, 2) : null)],
    ["gPTN/kg", celula(p ? texto(p.macros.proteinas.porKg, 2) : null)],
    ["gLIP/kg", celula(p ? texto(p.macros.lipidios.porKg, 2) : null)],
    [
      "Kcal não ptn/gN",
      celula(
        p && p.kcalNaoProteicaPorGN.valor !== null ? (
          <span title="(kcal − proteína × 4) ÷ (proteína ÷ 6,25)">
            {formatarNumero(p.kcalNaoProteicaPorGN.valor, 0)}:1
            {p.kcalNaoProteicaPorGN.completo ? "" : <span className="text-amber-600">*</span>}
          </span>
        ) : (
          vazio
        )
      ),
    ],
    ["Fibras", celula(p ? texto(p.fibras, 1, " g") : null)],
    ["Fibras solúveis", celula(p ? texto(p.fibrasSoluveis, 1, " g") : null)],
    ["Fibras insolúveis", celula(p ? texto(p.fibrasInsoluveis, 1, " g") : null)],
  ] as const;
}

const CHAVE_COMPARACAO = "dieta-comparacao-";

export default function PainelNutricional({
  dietaId,
  documento,
  base,
  nutrientes,
  anteriores,
  pesoAtual,
  gastos,
  onAlterar,
}: {
  dietaId: string;
  documento: DocumentoDieta;
  base: BaseDosAlimentos;
  nutrientes: Nutriente[];
  anteriores: DietaAnterior[];
  pesoAtual: { valor: number; data: string; origem: string } | null;
  gastos: GastoDeReferencia[];
  onAlterar: (alterar: (documento: DocumentoDieta) => void) => void;
}) {
  const [detalhes, setDetalhes] = useState(false);

  // Referência padrão: a última versão enviada desta dieta; senão, a última
  // enviada com o mesmo título; senão, a última enviada ao paciente.
  const padrao = useMemo(() => {
    const titulo = documento.titulo.trim().toLowerCase();
    return (
      anteriores.find((a) => a.dieta_id === dietaId) ??
      anteriores.find((a) => (a.titulo ?? "").trim().toLowerCase() === titulo) ??
      anteriores[0] ??
      null
    );
    // O título muda a cada tecla; o padrão só precisa ser escolhido ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anteriores, dietaId]);

  // Escolha guardada neste navegador; sem ela, a referência padrão.
  const [guardada, setGuardada] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CHAVE_COMPARACAO + dietaId);
    } catch {
      return null;
    }
  });
  const comparacao =
    guardada && (guardada === "nenhuma" || anteriores.some((a) => a.id === guardada)) ? guardada : padrao?.id ?? "nenhuma";

  function escolherComparacao(valor: string) {
    setGuardada(valor);
    try {
      localStorage.setItem(CHAVE_COMPARACAO + dietaId, valor);
    } catch {
      // Preferência só desta tela.
    }
  }

  const peso = documento.pesoReferencia.valor;
  const totaisAtuais = totaisDaDieta(documento, base.composicoes, NUTRIENTES_DO_PAINEL);
  const atual = indicadoresDoPainel(totaisAtuais, peso);
  const escolhida = anteriores.find((a) => a.id === comparacao) ?? null;
  const anterior = escolhida ? indicadoresDoPainel(escolhida.totais, escolhida.peso) : null;

  // Gasto energético: a avaliação escolhida, ou a mais recente se não houve escolha.
  const gasto = documento.gastoReferencia === undefined ? gastos[0] ?? null : documento.gastoReferencia;
  const gastoAtualizado = gasto ? gastos.find((g) => g.avaliacaoId === gasto.avaliacaoId) : null;
  const kcalDieta = atual?.kcal?.valor ?? null;

  const linhasAtuais = Linhas({ p: atual });
  const linhasAnteriores = Linhas({ p: anterior });

  const micronutrientes = nutrientes.filter((n) => documento.nutrientesAcompanhados.includes(n.codigo));
  const totaisMicro = totaisDaDieta(documento, base.composicoes, micronutrientes.map((n) => n.codigo));
  const agua = hidratacaoDiaria(documento.hidratacao.mlPorKg, peso);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-semibold text-gray-900">Peso de referência</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="relative w-28">
            <CampoNumero
              ariaLabel="Peso de referência em kg"
              valor={peso}
              maximo={500}
              className="w-full pr-8"
              onChange={(valor) =>
                onAlterar((d) => {
                  d.pesoReferencia = { valor, origem: valor ? "Informado pelo nutricionista" : null, data: valor ? hojeNoBrasil() : null };
                })
              }
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">kg</span>
          </div>
          {pesoAtual && pesoAtual.valor !== peso ? (
            <Button
              type="button"
              size="small"
              text
              label={`Usar ${formatarNumero(pesoAtual.valor, 2)} kg`}
              tooltip={`${pesoAtual.origem}, ${formatarData(pesoAtual.data)}`}
              onClick={() =>
                onAlterar((d) => {
                  d.pesoReferencia = { valor: pesoAtual.valor, origem: pesoAtual.origem, data: pesoAtual.data };
                })
              }
            />
          ) : null}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {peso
            ? `${documento.pesoReferencia.origem ?? "Origem não informada"}${documento.pesoReferencia.data ? `, ${formatarData(documento.pesoReferencia.data)}` : ""}. Usado em todos os valores por kg e na hidratação.`
            : "Sem peso de referência: os valores por kg e a hidratação não são calculados."}
        </p>
      </div>

      <div>
        <p className="font-semibold text-gray-900">Gasto energético (avaliação física)</p>
        {gastos.length === 0 && !gasto ? (
          <p className="mt-1 text-xs text-gray-500">Nenhuma avaliação física finalizada para este paciente.</p>
        ) : (
          <>
            <Dropdown
              aria-label="Avaliação física de referência"
              value={gasto?.avaliacaoId ?? "nenhuma"}
              onChange={(e) =>
                onAlterar((d) => {
                  d.gastoReferencia = e.value === "nenhuma" ? null : gastos.find((g) => g.avaliacaoId === e.value) ?? null;
                })
              }
              options={[
                ...gastos.map((g, i) => ({ label: `Avaliação de ${formatarData(g.data)}${i === 0 ? " (mais recente)" : ""}`, value: g.avaliacaoId })),
                ...(gasto && !gastoAtualizado ? [{ label: `Avaliação de ${formatarData(gasto.data)} (não está mais finalizada)`, value: gasto.avaliacaoId }] : []),
                { label: "Sem referência", value: "nenhuma" },
              ]}
              className="mt-1 w-full"
              panelClassName="max-w-[calc(100vw-2rem)]"
            />
            {gasto ? (
              <table className="mt-2 w-full tabular-nums">
                <tbody>
                  {(
                    [
                      ["TMB", gasto.tmb],
                      ["GET", gasto.get],
                      ["GET + METs", gasto.getMaisMets],
                    ] as const
                  ).map(([rotulo, valor]) =>
                    rotulo === "GET + METs" && valor === null ? null : (
                      <tr key={rotulo} className="border-t border-gray-100">
                        <td className="py-1 pr-2 text-gray-600">{rotulo}</td>
                        <td className="py-1 pr-2 text-right">{valor === null ? "—" : `${formatarNumero(valor, 0)} kcal`}</td>
                        <td className="py-1 text-right text-xs text-gray-500">
                          {valor && kcalDieta !== null ? `dieta: ${formatarNumero((kcalDieta / valor) * 100, 0)}%` : null}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            ) : null}
            {gasto && gastoAtualizado && (gastoAtualizado.tmb !== gasto.tmb || gastoAtualizado.get !== gasto.get || gastoAtualizado.getMaisMets !== gasto.getMaisMets) ? (
              <Button
                type="button"
                size="small"
                text
                icon="pi pi-refresh"
                label="A avaliação foi corrigida: usar os valores atuais"
                onClick={() => onAlterar((d) => void (d.gastoReferencia = gastoAtualizado))}
              />
            ) : null}
            <p className="mt-1 text-xs text-gray-500">Valores da avaliação finalizada; a versão enviada guarda a referência usada.</p>
          </>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full tabular-nums">
          <thead>
            <tr className="text-left align-bottom">
              <th className="pb-1 pr-2 font-normal text-gray-500" />
              <th className="pb-1 pr-2 text-right font-semibold text-gray-900">Total da dieta atual</th>
              <th className="pb-1 text-right font-semibold text-gray-900">Total da dieta anterior</th>
            </tr>
          </thead>
          <tbody>
            {linhasAtuais.map(([rotulo, valor], indice) => (
              <tr key={rotulo} className="border-t border-gray-100">
                <td className="py-1 pr-2 text-gray-600">{rotulo}</td>
                <td className="py-1 pr-2 text-right">{valor}</td>
                <td className="py-1 text-right text-gray-600">{escolhida ? linhasAnteriores[indice][1] : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2">
          <Dropdown
            aria-label="Dieta anterior para comparação"
            value={comparacao}
            onChange={(e) => escolherComparacao(e.value)}
            options={[
              ...anteriores.map((a) => ({
                label: `${a.titulo || "Sem título"} — ${new Date(a.enviada_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}${a.numero > 1 ? ` (v${a.numero})` : ""}`,
                value: a.id,
              })),
              { label: "Sem comparação", value: "nenhuma" },
            ]}
            className="w-full"
            panelClassName="max-w-[calc(100vw-2rem)]"
            emptyMessage="Sem dieta anterior"
          />
          {anteriores.length === 0 ? <p className="mt-1 text-xs text-gray-500">Sem dieta anterior para comparação.</p> : null}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Só as opções de referência entram nos totais. * Total parcial: algum alimento não tem o dado na base. % pela energia
          registrada (4/4/9).
        </p>
      </div>

      <div>
        <p className="font-semibold text-gray-900">Vitaminas e minerais</p>
        {micronutrientes.length === 0 ? (
          <p className="mt-1 text-xs text-gray-500">Nenhum selecionado. Escolha em “Detalhes Nutrientes”.</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {micronutrientes.map((n) => {
              const t = totaisMicro[n.codigo];
              return (
                <li key={n.codigo} className="flex justify-between gap-2">
                  <span className="text-gray-600">{n.nome}</span>
                  <span className="tabular-nums">
                    {t?.valor === null || !t ? (
                      <span className="text-gray-400">Dado não disponível</span>
                    ) : (
                      <>
                        {formatarNutriente(n.codigo, t.valor)} {n.unidade}
                        {t.completo ? "" : <span className="text-amber-600" title="Total parcial">*</span>}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className="font-semibold text-gray-900">Hidratação</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="relative w-28">
            <CampoNumero
              ariaLabel="Água em mL por kg"
              valor={documento.hidratacao.mlPorKg}
              maximo={500}
              className="w-full pr-12"
              onChange={(valor) => onAlterar((d) => void (d.hidratacao.mlPorKg = valor))}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">mL/kg</span>
          </div>
          <span className="tabular-nums text-gray-800">
            {agua !== null
              ? `${formatarNumero(agua, 0)} mL/dia (${formatarNumero(agua / 1000, 2)} L/dia)`
              : documento.hidratacao.mlPorKg
                ? "Selecione um peso de referência para calcular a hidratação."
                : ""}
          </span>
        </div>
        <InputTextarea
          aria-label="Observações sobre hidratação"
          placeholder="Observações sobre hidratação"
          value={documento.hidratacao.observacoes}
          autoResize
          rows={2}
          className="mt-2 w-full"
          onChange={(e) => onAlterar((d) => void (d.hidratacao.observacoes = e.target.value))}
        />
      </div>

      <Button type="button" label="Detalhes Nutrientes" icon="pi pi-table" className="w-full" onClick={() => setDetalhes(true)} />

      <JanelaDetalhes
        visivel={detalhes}
        onFechar={() => setDetalhes(false)}
        documento={documento}
        base={base}
        nutrientes={nutrientes}
        onAlternar={(codigo) =>
          onAlterar((d) => {
            d.nutrientesAcompanhados = d.nutrientesAcompanhados.includes(codigo)
              ? d.nutrientesAcompanhados.filter((c) => c !== codigo)
              : [...d.nutrientesAcompanhados, codigo];
          })
        }
      />
    </div>
  );
}

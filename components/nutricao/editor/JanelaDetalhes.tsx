"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { formatarNutriente } from "@/lib/nutricao/calculo";
import { opcaoDeReferencia, totaisDaDieta, totaisDosItens, type DocumentoDieta } from "@/lib/nutricao/dieta";
import type { BaseDosAlimentos, Nutriente } from "./tipos";

const GRUPOS: Record<string, string> = {
  energia: "Energia",
  macronutrientes: "Macronutrientes",
  fibras: "Fibras alimentares",
  vitaminas: "Vitaminas",
  minerais: "Minerais",
  acidos_graxos: "Ácidos graxos",
  aminoacidos: "Aminoácidos",
  outros: "Outros componentes",
};

// Só vitaminas e minerais vão para o acompanhamento resumido do painel.
const ACOMPANHAVEIS = ["vitaminas", "minerais"];

function valor(total: { valor: number | null; completo: boolean } | undefined, nutriente: Nutriente) {
  if (!total || total.valor === null) return <span className="text-gray-400">Dado não disponível</span>;
  return (
    <span>
      {formatarNutriente(nutriente.codigo, total.valor)} {nutriente.unidade}
      {total.completo ? "" : <span className="text-amber-700"> (total parcial — dados incompletos)</span>}
    </span>
  );
}

// Janela "Detalhes Nutrientes": composição completa da dieta selecionada
// (só opções de referência), por grupo, com busca e totais por refeição.
export default function JanelaDetalhes({
  visivel,
  onFechar,
  documento,
  base,
  nutrientes,
  onAlternar,
}: {
  visivel: boolean;
  onFechar: () => void;
  documento: DocumentoDieta;
  base: BaseDosAlimentos;
  nutrientes: Nutriente[];
  onAlternar: (codigo: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [porRefeicao, setPorRefeicao] = useState<string | null>(null);

  const codigos = useMemo(() => nutrientes.map((n) => n.codigo), [nutrientes]);
  const totais = visivel ? totaisDaDieta(documento, base.composicoes, codigos) : {};
  const refeicao = documento.refeicoes.find((r) => r.id === porRefeicao);
  const totaisDaRefeicao =
    visivel && refeicao ? totaisDosItens(opcaoDeReferencia(refeicao).itens, base.composicoes, codigos) : null;

  const termo = busca
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  const filtrados = nutrientes.filter(
    (n) => !termo || n.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(termo)
  );

  return (
    <Dialog
      header={`Detalhes Nutrientes — ${documento.titulo || "Dieta"}`}
      visible={visivel}
      onHide={onFechar}
      className="w-[min(52rem,calc(100vw-1rem))]"
      contentClassName="max-h-[70vh]"
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="p-input-icon-left min-w-0 flex-1">
          <InputText
            aria-label="Buscar nutriente"
            placeholder="Buscar nutriente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full"
          />
        </span>
        <select
          aria-label="Mostrar também uma refeição"
          className="rounded-md border border-gray-300 px-2 text-sm"
          value={porRefeicao ?? ""}
          onChange={(e) => setPorRefeicao(e.target.value || null)}
        >
          <option value="">Só o total da dieta</option>
          {documento.refeicoes.map((r, i) => (
            <option key={r.id} value={r.id}>
              {r.nome.trim() || `Refeição ${i + 1}`}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-xs text-gray-500">
        Marque vitaminas e minerais para acompanhar no painel. Considera só a opção de referência de cada refeição.
      </p>

      {Object.entries(GRUPOS).map(([grupo, titulo]) => {
        const doGrupo = filtrados.filter((n) => n.grupo === grupo);
        if (doGrupo.length === 0) return null;
        return (
          <section key={grupo} className="mb-4">
            <h3 className="mb-1 font-semibold text-gray-900">{titulo}</h3>
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {doGrupo.map((n) => (
                  <tr key={n.codigo} className="border-t border-gray-100">
                    <td className="w-8 py-1">
                      {ACOMPANHAVEIS.includes(n.grupo) ? (
                        <Checkbox
                          inputId={`acompanhar-${n.codigo}`}
                          checked={documento.nutrientesAcompanhados.includes(n.codigo)}
                          onChange={() => onAlternar(n.codigo)}
                          aria-label={`Acompanhar ${n.nome} no painel`}
                        />
                      ) : null}
                    </td>
                    <td className="py-1 pr-2 text-gray-700">
                      <label htmlFor={`acompanhar-${n.codigo}`}>{n.nome}</label>
                    </td>
                    <td className="py-1 text-right">{valor(totais[n.codigo], n)}</td>
                    {totaisDaRefeicao ? (
                      <td className="py-1 pl-3 text-right text-gray-600">{valor(totaisDaRefeicao[n.codigo], n)}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </Dialog>
  );
}

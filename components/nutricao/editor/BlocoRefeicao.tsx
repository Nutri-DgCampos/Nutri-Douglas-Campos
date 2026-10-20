"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { RadioButton } from "primereact/radiobutton";
import type { AlimentoEncontrado } from "@/components/nutricao/BuscaAlimento";
import { formatarNutriente } from "@/lib/nutricao/calculo";
import {
  nomeNaPrescricao,
  novaOpcao,
  novoItem,
  opcaoDeReferencia,
  totaisDosItens,
  type ItemDaDieta,
  type Opcao,
  type Refeicao,
  type Totais,
} from "@/lib/nutricao/dieta";
import { pedirConfirmacao } from "@/lib/avisos";
import LinhaDoAlimento from "./LinhaDoAlimento";
import type { BaseDosAlimentos, Nutriente } from "./tipos";

const MACROS = [
  ["kcal", "Kcal", ""],
  ["carboidratos", "CHO", "g"],
  ["proteinas", "PTN", "g"],
  ["lipidios", "LIP", "g"],
] as const;

export const SUGESTOES_DE_NOME = [
  "Café da manhã",
  "Lanche da manhã",
  "Almoço",
  "Lanche da tarde",
  "Pré-treino",
  "Pós-treino",
  "Jantar",
  "Ceia",
];

function mover<T>(lista: T[], indice: number, direcao: -1 | 1) {
  const destino = indice + direcao;
  if (destino < 0 || destino >= lista.length) return;
  [lista[indice], lista[destino]] = [lista[destino], lista[indice]];
}

export function Totalizador({ totais, compacto = false }: { totais: Totais; compacto?: boolean }) {
  return (
    <div className={`grid grid-cols-4 gap-2 text-right tabular-nums ${compacto ? "text-xs" : "text-sm font-semibold"} text-gray-800`}>
      {MACROS.map(([codigo, rotulo, sufixo]) => {
        const total = totais[codigo];
        const parcial = total && total.valor !== null && !total.completo;
        return (
          <span
            key={codigo}
            className="whitespace-nowrap"
            title={parcial ? "Total parcial: algum alimento não tem este dado na base." : rotulo}
          >
            <span className="block text-[10px] font-normal uppercase leading-3 text-gray-400">{rotulo}</span>
            {total?.valor === null || total === undefined ? "—" : `${formatarNutriente(codigo, total.valor)}${sufixo}`}
            {parcial ? <span className="text-amber-600">*</span> : null}
          </span>
        );
      })}
    </div>
  );
}

export default function BlocoRefeicao({
  refeicao,
  indice,
  total,
  base,
  nutrientes,
  acompanhados,
  mostrarNutrientes,
  onAlterar,
  onRemover,
  onMover,
  onEscolherAlimento,
  onSubstituicoes,
}: {
  refeicao: Refeicao;
  indice: number;
  total: number;
  base: BaseDosAlimentos;
  nutrientes: Nutriente[];
  acompanhados: string[];
  mostrarNutrientes: boolean;
  onAlterar: (alterar: (refeicao: Refeicao) => void) => void;
  onRemover: () => void;
  onMover: (direcao: -1 | 1) => void;
  onEscolherAlimento: (opcaoId: string, itemId: string, alimento: AlimentoEncontrado) => void;
  onSubstituicoes: (opcaoId: string, itemId: string) => void;
}) {
  const [verMicronutrientes, setVerMicronutrientes] = useState(false);
  const referencia = opcaoDeReferencia(refeicao);
  const varias = refeicao.opcoes.length > 1;
  const nomeDaRefeicao = refeicao.nome.trim() || `Refeição ${indice + 1}`;

  const totaisDaReferencia = totaisDosItens(referencia.itens, base.composicoes, MACROS.map(([c]) => c));

  function alterarItem(opcaoId: string, itemId: string, alteracao: Partial<ItemDaDieta>) {
    onAlterar((r) => {
      const item = r.opcoes.find((o) => o.id === opcaoId)?.itens.find((i) => i.id === itemId);
      if (item) Object.assign(item, alteracao);
    });
  }

  async function removerItem(opcao: Opcao, item: ItemDaDieta) {
    if (item.alimentoId) {
      const confirmado = await pedirConfirmacao(`Deseja excluir o alimento ${nomeNaPrescricao(item)} desta refeição?`, {
        aceitar: "Excluir alimento",
        rejeitar: "Cancelar",
      });
      if (!confirmado) return;
    }
    onAlterar((r) => {
      const alvo = r.opcoes.find((o) => o.id === opcao.id);
      if (alvo) alvo.itens = alvo.itens.filter((i) => i.id !== item.id);
    });
  }

  async function removerOpcao(opcao: Opcao, numero: number) {
    const confirmado = await pedirConfirmacao(
      `Remover a opção ${numero} de ${nomeDaRefeicao}${opcao.itens.length ? ` e os ${opcao.itens.length} alimento(s) dela` : ""}?`,
      { aceitar: "Remover opção", rejeitar: "Cancelar" }
    );
    if (!confirmado) return;
    onAlterar((r) => {
      r.opcoes = r.opcoes.filter((o) => o.id !== opcao.id);
      if (r.opcaoReferencia === opcao.id) r.opcaoReferencia = r.opcoes[0].id;
    });
  }

  async function removerObservacao() {
    if (refeicao.observacao?.trim()) {
      const confirmado = await pedirConfirmacao("Remover a observação desta refeição?", {
        aceitar: "Remover observação",
        rejeitar: "Cancelar",
      });
      if (!confirmado) return;
    }
    onAlterar((r) => {
      r.observacao = null;
    });
  }

  const micronutrientes = nutrientes.filter((n) => acompanhados.includes(n.codigo));
  const totaisMicro = verMicronutrientes
    ? totaisDosItens(referencia.itens, base.composicoes, micronutrientes.map((n) => n.codigo))
    : {};

  return (
    <section className="cartao @container p-3 sm:p-4" aria-label={nomeDaRefeicao}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          icon="pi pi-minus-circle"
          text
          severity="danger"
          aria-label={`Remover ${nomeDaRefeicao}`}
          tooltip="Remover refeição"
          onClick={onRemover}
        />
        <InputText
          aria-label="Nome da refeição"
          value={refeicao.nome}
          placeholder="Nome da refeição"
          list="sugestoes-refeicao"
          onChange={(e) => onAlterar((r) => void (r.nome = e.target.value))}
          className={`min-w-0 flex-1 font-semibold uppercase ${refeicao.nome.trim() ? "" : "p-invalid"}`}
        />
        <InputText
          aria-label="Horário da refeição"
          type="time"
          value={refeicao.horario ?? ""}
          onChange={(e) => onAlterar((r) => void (r.horario = e.target.value || null))}
          className="w-28"
        />
        <div className="flex flex-wrap items-center">
          <Button type="button" icon="pi pi-angle-down" text aria-label="Mover refeição para baixo" disabled={indice === total - 1} onClick={() => onMover(1)} />
          <Button type="button" icon="pi pi-angle-up" text aria-label="Mover refeição para cima" disabled={indice === 0} onClick={() => onMover(-1)} />
          <Button
            type="button"
            icon="pi pi-clone"
            text
            label="Opção"
            aria-label="Adicionar opção"
            tooltip="Adicionar opção (alternativa completa da refeição)"
            onClick={() => onAlterar((r) => void r.opcoes.push(novaOpcao()))}
          />
          <Button
            type="button"
            icon="pi pi-comment"
            text
            aria-label="Adicionar observação"
            tooltip="Observação da refeição"
            onClick={() => onAlterar((r) => void (r.observacao = r.observacao ?? ""))}
          />
          <Button
            type="button"
            icon="pi pi-list"
            text
            aria-label="Vitaminas e minerais da refeição"
            tooltip="Vitaminas e minerais da refeição"
            className={verMicronutrientes ? "text-primary-700" : ""}
            onClick={() => setVerMicronutrientes((v) => !v)}
          />
        </div>
        <div className="ml-auto w-full max-w-[18rem]">
          <Totalizador totais={totaisDaReferencia} />
        </div>
      </div>

      {verMicronutrientes ? (
        <div className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-gray-700">
          {micronutrientes.length === 0 ? (
            "Escolha os nutrientes em “Detalhes Nutrientes”."
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {micronutrientes.map((n) => {
                const t = totaisMicro[n.codigo];
                return (
                  <span key={n.codigo}>
                    {n.nome}:{" "}
                    {t?.valor === null || !t ? "Dado não disponível" : `${formatarNutriente(n.codigo, t.valor)} ${n.unidade}`}
                    {t && t.valor !== null && !t.completo ? " (parcial)" : ""}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {refeicao.opcoes.map((opcao, numero) => {
        const ehReferencia = opcao.id === referencia.id;
        return (
          <div key={opcao.id} className={varias ? "mt-3 rounded-lg border border-dashed border-gray-300 p-2" : "mt-2"}>
            {varias ? (
              <div className="mb-1 flex flex-wrap items-center gap-3">
                <span className="font-semibold text-gray-800">Opção {numero + 1}</span>
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  <RadioButton
                    checked={ehReferencia}
                    onChange={() => onAlterar((r) => void (r.opcaoReferencia = opcao.id))}
                    aria-label={`Usar a opção ${numero + 1} nos totais`}
                  />
                  Referência para os totais
                </label>
                <Button
                  type="button"
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  size="small"
                  aria-label={`Remover a opção ${numero + 1}`}
                  onClick={() => removerOpcao(opcao, numero + 1)}
                />
                <div className="ml-auto w-full max-w-[16rem] text-gray-500">
                  <Totalizador totais={totaisDosItens(opcao.itens, base.composicoes, MACROS.map(([c]) => c))} compacto />
                </div>
              </div>
            ) : null}

            {opcao.itens.map((item, posicao) => (
              <LinhaDoAlimento
                key={item.id}
                item={item}
                numero={posicao + 1}
                base={base}
                mostrarNutrientes={mostrarNutrientes}
                primeira={posicao === 0}
                ultima={posicao === opcao.itens.length - 1}
                onAlterar={(alteracao) => alterarItem(opcao.id, item.id, alteracao)}
                onEscolherAlimento={(alimento) => onEscolherAlimento(opcao.id, item.id, alimento)}
                onRemover={() => removerItem(opcao, item)}
                onMover={(direcao) =>
                  onAlterar((r) => {
                    const alvo = r.opcoes.find((o) => o.id === opcao.id);
                    if (alvo) mover(alvo.itens, posicao, direcao);
                  })
                }
                onSubstituicoes={() => onSubstituicoes(opcao.id, item.id)}
              />
            ))}

            <Button
              type="button"
              icon="pi pi-plus"
              label="Alimento"
              text
              size="small"
              className="mt-1"
              onClick={() =>
                onAlterar((r) => {
                  r.opcoes.find((o) => o.id === opcao.id)?.itens.push(novoItem());
                })
              }
            />
          </div>
        );
      })}

      {refeicao.observacao !== null ? (
        <div className="mt-3 flex items-start gap-2">
          <InputTextarea
            aria-label={`Observação de ${nomeDaRefeicao}`}
            value={refeicao.observacao}
            autoResize
            rows={2}
            placeholder="Observação da refeição (aparece no PDF e para o paciente)"
            onChange={(e) => onAlterar((r) => void (r.observacao = e.target.value))}
            className="w-full"
          />
          <Button type="button" icon="pi pi-times" text aria-label="Remover observação" onClick={removerObservacao} />
        </div>
      ) : null}
    </section>
  );
}

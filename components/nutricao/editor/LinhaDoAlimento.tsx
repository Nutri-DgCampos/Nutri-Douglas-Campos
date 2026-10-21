"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import BuscaAlimento, { type AlimentoEncontrado } from "@/components/nutricao/BuscaAlimento";
import { nutrienteDaPorcao, textoDoResultado } from "@/lib/nutricao/calculo";
import { formatarNumero, quantidadeDoItem, type ItemDaDieta } from "@/lib/nutricao/dieta";
import CampoNumero from "./CampoNumero";
import type { BaseDosAlimentos } from "./tipos";

const MACROS = [
  ["kcal", "Kcal"],
  ["carboidratos", "CHO"],
  ["proteinas", "PTN"],
  ["lipidios", "LIP"],
] as const;

// Valor especial da lista de medidas: quantidade direto em g ou mL.
const DIRETO = "__direto__";
// Item da lista que leva ao cadastro do alimento (medidas caseiras).
const CADASTRAR = "__cadastrar__";

export default function LinhaDoAlimento({
  item,
  numero,
  base,
  mostrarNutrientes,
  primeira,
  ultima,
  onAlterar,
  onEscolherAlimento,
  onRemover,
  onMover,
  onSubstituicoes,
  onAbrirCadastro,
}: {
  item: ItemDaDieta;
  numero: number;
  base: BaseDosAlimentos;
  mostrarNutrientes: boolean;
  primeira: boolean;
  ultima: boolean;
  onAlterar: (alteracao: Partial<ItemDaDieta>) => void;
  onEscolherAlimento: (alimento: AlimentoEncontrado) => void;
  onRemover: () => void;
  onMover: (direcao: -1 | 1) => void;
  onSubstituicoes: () => void;
  // Abre o cadastro do alimento (medidas caseiras) com volta para a dieta.
  onAbrirCadastro?: (alimentoId: string) => void;
}) {
  const [trocando, setTrocando] = useState(false);
  const alimento = item.alimentoId ? base.alimentos[item.alimentoId] : undefined;
  const composicao = item.alimentoId ? base.composicoes[item.alimentoId] ?? {} : {};
  const quantidade = quantidadeDoItem(item);
  const unidade = item.unidade === "ml" ? "mL" : "g";

  const medidas = alimento?.medidas ?? [];
  // Mais de uma medida: o nome vai no plural ("2 unidades").
  const plural = (item.numeroMedidas ?? 0) > 1;
  const opcoesDeMedida = [
    ...medidas.map((m) => ({ label: plural ? m.nome_plural : m.nome_singular, value: m.id })),
    // Medida que saiu do cadastro continua valendo nesta dieta.
    ...(item.medida && !medidas.some((m) => m.id === item.medida?.id)
      ? [{ label: `${plural ? item.medida.plural : item.medida.singular} (cadastro anterior)`, value: item.medida.id }]
      : []),
    { label: `Em ${unidade}`, value: DIRETO },
    ...(onAbrirCadastro ? [{ label: "+ Cadastrar ou editar medidas…", value: CADASTRAR }] : []),
  ];

  function escolherMedida(valor: string) {
    if (valor === DIRETO) {
      // Passa a valer só a quantidade em g/mL (mantém a quantidade atual).
      onAlterar({ medida: null, numeroMedidas: null, quantidadeAjustada: quantidade.efetiva });
      return;
    }
    const escolhida = medidas.find((m) => m.id === valor);
    if (!escolhida) return;
    onAlterar({
      medida: { id: escolhida.id, singular: escolhida.nome_singular, plural: escolhida.nome_plural, quantidade: escolhida.quantidade },
      // Sem ajuste manual, o peso acompanha a nova medida; com ajuste, ele é
      // preservado até o nutricionista pedir para recalcular.
      quantidadeAjustada: item.medida ? item.quantidadeAjustada : quantidade.efetiva,
    });
  }

  function alterarGramas(valor: number | null) {
    // Igual ao calculado pela medida: não é ajuste.
    const igual = valor !== null && quantidade.calculada !== null && Math.abs(valor - quantidade.calculada) < 1e-9;
    onAlterar({ quantidadeAjustada: igual ? null : valor });
  }

  const substituicoesValidas = item.substituicoes.filter((s) => s.quantidade).length;
  const pendentes = item.substituicoes.length - substituicoesValidas;

  return (
    // Layout pela largura do bloco da refeição (container query): numa fileira
    // quando há espaço; senão os nutrientes descem para a fileira de baixo.
    <div className={`linha-alimento ${item.referencia ? "linha-referencia rounded-md bg-gray-100 text-gray-500" : ""} grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1 border-b border-gray-100 py-2 @2xl:grid-cols-[auto_minmax(10rem,1fr)_4rem_minmax(8.5rem,11rem)_5.75rem_auto] @2xl:items-center @6xl:grid-cols-[auto_minmax(10rem,1fr)_4rem_minmax(8.5rem,11rem)_5.75rem_auto_14rem]`}>
      <Button
        type="button"
        icon="pi pi-minus"
        rounded
        text
        severity="danger"
        aria-label={`Excluir a linha ${numero}`}
        tooltip="Excluir alimento"
        className="h-8 w-8"
        onClick={onRemover}
      />

      <div className="min-w-0">
        {!item.alimentoId || trocando ? (
          <div className="flex items-center gap-1">
            <BuscaAlimento
              inputId={`busca-${item.id}`}
              placeholder={trocando ? "Buscar o novo alimento" : "Buscar alimento"}
              onSelecionar={(escolhido) => {
                setTrocando(false);
                onEscolherAlimento(escolhido);
              }}
            />
            {trocando ? (
              <Button type="button" icon="pi pi-times" text aria-label="Cancelar troca" onClick={() => setTrocando(false)} />
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <InputText
              aria-label="Nome do alimento na prescrição"
              value={item.nomeExibido ?? item.nomeOriginal ?? ""}
              onChange={(evento) => {
                const texto = evento.target.value;
                onAlterar({ nomeExibido: texto === item.nomeOriginal ? null : texto });
              }}
              className="w-full"
              tooltip={`Base: ${item.nomeOriginal ?? ""}${alimento?.fonte === "taco" ? " (TACO)" : ""}`}
              tooltipOptions={{ position: "top" }}
            />
            <Button
              type="button"
              icon="pi pi-sync"
              text
              aria-label="Trocar alimento"
              tooltip="Trocar alimento (recalcula os nutrientes)"
              onClick={() => setTrocando(true)}
            />
          </div>
        )}
        {item.ia || item.sugeridoIa ? (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {item.ia ? (
              <button
                type="button"
                className="selo-ia"
                aria-label="Sugerido pela IA: confirmar"
                title="Sugerido pela IA. Clique para confirmar (o selo também some ao editar a linha)."
                onClick={() => onAlterar({ ia: undefined })}
              >
                IA <i className="pi pi-check text-[0.6rem]" aria-hidden />
              </button>
            ) : null}
            {!item.alimentoId && item.sugeridoIa ? (
              <span>
                A IA sugeriu <span className="font-semibold">“{item.sugeridoIa}”</span>, sem correspondência segura na base: escolha o alimento.
              </span>
            ) : null}
          </p>
        ) : null}
        {item.nomeExibido && item.nomeExibido !== item.nomeOriginal ? (
          <p className="mt-0.5 truncate text-xs text-gray-500">Nutrientes de: {item.nomeOriginal}</p>
        ) : null}
        {alimento?.arquivado ? <p className="mt-0.5 text-xs text-amber-700">Alimento arquivado na base.</p> : null}
        {item.informado ? (
          <p className="mt-1 text-xs text-gray-600">
            <i className="pi pi-comment mr-1" aria-hidden />
            Paciente informou: <span className="font-semibold">{item.informado}</span>
          </p>
        ) : null}
        {item.referencia ? (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {item.alimentoId ? (
              <>
                <span>{item.informado ? "Do recordatório" : "Rotina anterior"}: fora dos totais e do PDF até confirmar.</span>
                <button type="button" className="font-semibold text-primary-700 underline" onClick={() => onAlterar({ referencia: false })}>
                  Confirmar na dieta
                </button>
              </>
            ) : (
              <span>Do recordatório: escolha o alimento na base para incluir na dieta.</span>
            )}
          </p>
        ) : null}
      </div>

      {item.alimentoId ? (
        <div className="col-span-2 grid min-w-0 grid-cols-[4rem_minmax(0,1fr)_5.75rem] items-center gap-2 @2xl:contents">
          <CampoNumero
            ariaLabel="Quantidade de medidas"
            valor={item.medida ? item.numeroMedidas : null}
            disabled={!item.medida}
            placeholder={item.medida ? "Qtd." : "—"}
            maximo={10_000}
            onChange={(valor) => onAlterar({ numeroMedidas: valor })}
          />
          <Dropdown
            aria-label="Medida caseira"
            value={item.medida?.id ?? DIRETO}
            options={opcoesDeMedida}
            onChange={(evento) => {
              if (evento.value === CADASTRAR) {
                if (item.alimentoId) onAbrirCadastro?.(item.alimentoId);
                return;
              }
              escolherMedida(evento.value);
            }}
            className="w-full min-w-0"
            panelClassName="max-w-[calc(100vw-2rem)]"
            emptyMessage="Sem medidas cadastradas"
          />
          <div className="relative">
            <CampoNumero
              ariaLabel={`Quantidade em ${unidade}`}
              valor={quantidade.efetiva}
              placeholder={unidade}
              className={`w-full pr-8 ${quantidade.ajustada ? "border-amber-400 bg-amber-50" : ""}`}
              onChange={alterarGramas}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">{unidade}</span>
          </div>
          {quantidade.ajustada && quantidade.calculada !== null ? (
            <div className="col-span-3 flex flex-wrap items-center gap-2 text-xs text-amber-800 @2xl:order-last @2xl:col-span-4 @2xl:col-start-3">
              <span>
                Ajustado à mão (pela medida: {formatarNumero(quantidade.calculada)} {unidade}).
              </span>
              <button type="button" className="underline" onClick={() => onAlterar({ quantidadeAjustada: null })}>
                Usar o peso da medida
              </button>
            </div>
          ) : null}
          {medidas.length === 0 && !item.medida ? (
            <p className="col-span-3 text-xs text-gray-500 @2xl:order-last @2xl:col-span-4 @2xl:col-start-3">
              Sem medida caseira cadastrada: informe em {unidade}.
              {onAbrirCadastro && item.alimentoId ? (
                <button type="button" className="ml-1 font-semibold text-primary-700 underline" onClick={() => onAbrirCadastro(item.alimentoId!)}>
                  Cadastrar medidas caseiras
                </button>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="hidden @2xl:col-span-3 @2xl:block" />
      )}

      <div className="col-span-2 flex items-center gap-0.5 @2xl:col-span-1">
        <Button type="button" icon="pi pi-angle-down" text aria-label="Mover alimento para baixo" disabled={ultima} onClick={() => onMover(1)} />
        <Button type="button" icon="pi pi-angle-up" text aria-label="Mover alimento para cima" disabled={primeira} onClick={() => onMover(-1)} />
        <Button
          type="button"
          icon="pi pi-arrow-right-arrow-left"
          text
          disabled={!item.alimentoId}
          aria-label="Substituições do alimento"
          tooltip="Substituições"
          badge={item.substituicoes.length ? String(item.substituicoes.length) : undefined}
          badgeClassName={pendentes ? "bg-amber-500" : "bg-primary-600"}
          onClick={onSubstituicoes}
        />
      </div>

      {mostrarNutrientes ? (
        <div className="col-span-2 grid w-full max-w-[16rem] grid-cols-4 gap-1 justify-self-end text-right text-xs tabular-nums text-gray-700 @2xl:col-span-full @6xl:col-span-1">
          {MACROS.map(([codigo, rotulo]) => {
            const resultado =
              item.alimentoId && quantidade.efetiva ? nutrienteDaPorcao(composicao, codigo, quantidade.efetiva) : null;
            return (
              <span key={codigo} title={rotulo} className="whitespace-nowrap">
                <span className="block text-[10px] uppercase leading-3 text-gray-400">{rotulo}</span>
                {resultado ? textoDoResultado(codigo, resultado) : ""}
                {resultado?.situacao === "valor" && codigo !== "kcal" ? "g" : ""}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

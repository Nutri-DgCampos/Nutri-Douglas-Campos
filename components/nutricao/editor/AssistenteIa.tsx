"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputTextarea } from "primereact/inputtextarea";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import {
  CONDICOES,
  LIMITES_DO_PEDIDO,
  MAXIMO_DE_PARAMETROS,
  aplicarMudancas,
  marcarAuxilio,
  mudancaSubstitui,
  mudancasDaProposta,
  pedidoVazio,
  type Mudanca,
  type PedidoDaIa,
  type PropostaDaIa,
} from "@/lib/nutricao/assistente";
import { formatarNutriente } from "@/lib/nutricao/calculo";
import {
  documentoTemConteudo,
  nomeNaPrescricao,
  opcaoDeReferencia,
  textoDaQuantidade,
  totaisDaDieta,
  totaisDosItens,
  type DocumentoDieta,
  type ItemDaDieta,
  type Refeicao,
  type Totais,
} from "@/lib/nutricao/dieta";
import CampoNumero from "./CampoNumero";
import type { BaseDosAlimentos, Nutriente } from "./tipos";

const MACROS = [
  ["kcal", "kcal"],
  ["proteinas", "PTN"],
  ["carboidratos", "CHO"],
  ["lipidios", "LIP"],
] as const;

type Contexto = {
  disponivel: boolean;
  paciente: string;
  anamnese: { id: string; titulo: string; data: string; contexto: string; resumo: string | null; resumoEm: string | null } | null;
  limite: { hoje: number; limite: number; restantes: number };
};

export type PropostaNaTela = PropostaDaIa & { selecionadas: string[] };

function dataCurta(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
}

function textoDosTotais(totais: Totais) {
  return MACROS.map(([codigo, rotulo]) => {
    const total = totais[codigo];
    const valor = total?.valor === null || total?.valor === undefined ? "—" : formatarNutriente(codigo, total.valor);
    return codigo === "kcal" ? `${valor} kcal` : `${rotulo} ${valor}${valor === "—" ? "" : " g"}`;
  }).join(" · ");
}

function diferenca(codigo: string, depois: number | null | undefined, antes: number | null | undefined) {
  if (depois === null || depois === undefined || antes === null || antes === undefined) return null;
  const d = depois - antes;
  if (Math.abs(d) < (codigo === "kcal" ? 0.5 : 0.05)) return "=";
  return `${d > 0 ? "+" : "−"}${formatarNutriente(codigo, Math.abs(d))}${codigo === "kcal" ? " kcal" : " g"}`;
}

function nomeDoItem(item: ItemDaDieta) {
  return item.alimentoId ? nomeNaPrescricao(item) : `“${item.sugeridoIa ?? "alimento"}” (sem correspondência na base: escolher depois)`;
}

function textoDoItem(item: ItemDaDieta) {
  const quantidade = item.alimentoId ? textoDaQuantidade(item) : "";
  return quantidade ? `${nomeDoItem(item)} — ${quantidade}` : nomeDoItem(item);
}

export default function AssistenteIa({
  visivel,
  dietaId,
  documento,
  base,
  nutrientes,
  propostas,
  onPropostas,
  onFechar,
  onPreparar,
  onBase,
  onAplicar,
  onNovaDieta,
}: {
  visivel: boolean;
  dietaId: string;
  documento: DocumentoDieta;
  base: BaseDosAlimentos;
  nutrientes: Nutriente[];
  // Sugestões desta dieta (continuam disponíveis ao fechar e reabrir).
  propostas: PropostaNaTela[];
  onPropostas: (mudar: (atuais: PropostaNaTela[]) => PropostaNaTela[]) => void;
  onFechar: () => void;
  // Grava o que estiver pendente; devolve a revisão gravada (ou null).
  onPreparar: () => Promise<number | null>;
  onBase: (novos: BaseDosAlimentos) => void;
  onAplicar: (resultado: DocumentoDieta) => void;
  onNovaDieta: (resultado: DocumentoDieta) => Promise<boolean>;
}) {
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [pedido, setPedido] = useState<PedidoDaIa>(pedidoVazio);
  const [usarAnamnese, setUsarAnamnese] = useState(false);
  const [pedindo, setPedindo] = useState(false);
  const [resumindo, setResumindo] = useState(false);
  const [ativa, setAtiva] = useState(Math.max(0, propostas.length - 1));
  const [destino, setDestino] = useState<"atual" | "nova">("atual");
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (!visivel) return;
    let cancelado = false;
    fetch(`/api/nutricao/dietas/${dietaId}/ia`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: Contexto | null) => {
        if (cancelado || !dados) return;
        setContexto(dados);
        setPedido((atual) => (atual.contextoAnamnese || !dados.anamnese ? atual : { ...atual, contextoAnamnese: dados.anamnese.contexto }));
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [visivel, dietaId]);

  const proposta = propostas[ativa] ?? null;
  const mudancas = useMemo(() => (proposta ? mudancasDaProposta(documento, proposta) : []), [documento, proposta]);
  const escolhidas = useMemo(() => new Set(proposta?.selecionadas ?? []), [proposta]);
  const validas = mudancas.filter((m) => escolhidas.has(m.id));
  const resultado = useMemo(() => aplicarMudancas(documento, mudancas, escolhidas), [documento, mudancas, escolhidas]);

  function alterarPedido(mudanca: Partial<PedidoDaIa>) {
    setPedido((atual) => ({ ...atual, ...mudanca }));
  }

  function alterarMetas(mudanca: Partial<PedidoDaIa["metas"]>) {
    setPedido((atual) => ({ ...atual, metas: { ...atual.metas, ...mudanca } }));
  }

  async function pedir(comPedido: PedidoDaIa) {
    if (pedindo) return;
    setPedindo(true);
    try {
      const revisao = await onPreparar();
      if (revisao === null) {
        avisar("Não foi possível gravar a dieta antes do pedido. Tente de novo.", "error");
        return;
      }
      const resposta = await fetch(`/api/nutricao/dietas/${dietaId}/ia`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido: comPedido, revisao }),
      });
      const dados = await resposta.json().catch(() => null);
      if (dados?.limite) setContexto((atual) => (atual ? { ...atual, limite: dados.limite } : atual));
      if (!resposta.ok) {
        avisar(dados?.erro ?? "A IA não respondeu agora. Tente de novo em instantes.", "error");
        return;
      }
      onBase(dados.base);
      const nova: PropostaDaIa = dados.proposta;
      // Começa com tudo marcado: o nutricionista desmarca o que não quiser.
      const todas = mudancasDaProposta(documento, nova).map((m) => m.id);
      onPropostas((atuais) => {
        setAtiva(atuais.length);
        return [...atuais, { ...nova, selecionadas: todas }];
      });
      if (nova.refeicoes.length === 0) avisar("A IA não propôs alterações. Veja a mensagem dela na prévia.", "warn");
    } catch {
      avisar("Falha de conexão com o servidor. O editor continua funcionando normalmente.", "error");
    } finally {
      setPedindo(false);
    }
  }

  async function resumirAnamnese() {
    if (!contexto?.anamnese || resumindo) return;
    setResumindo(true);
    try {
      const resposta = await fetch(`/api/nutricao/anamneses/${contexto.anamnese.id}/resumo-ia`, { method: "POST" });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        avisar(dados?.erro ?? "Não foi possível resumir a anamnese.", "error");
        return;
      }
      setContexto((atual) =>
        atual?.anamnese ? { ...atual, limite: dados.limite ?? atual.limite, anamnese: { ...atual.anamnese, resumo: dados.resumo, resumoEm: dados.em } } : atual
      );
    } finally {
      setResumindo(false);
    }
  }

  function marcar(ids: string[], marcado: boolean) {
    if (!proposta) return;
    onPropostas((atuais) =>
      atuais.map((p) => {
        if (p.id !== proposta.id) return p;
        const conjunto = new Set(p.selecionadas);
        for (const id of ids) {
          if (marcado) conjunto.add(id);
          else conjunto.delete(id);
        }
        return { ...p, selecionadas: [...conjunto] };
      })
    );
  }

  async function aplicar() {
    if (!proposta || validas.length === 0 || aplicando) return;
    const final = marcarAuxilio(resultado);
    const comConteudo = documentoTemConteudo(documento);

    if (destino === "nova" && comConteudo) {
      setAplicando(true);
      try {
        if (await onNovaDieta(final)) onFechar();
      } finally {
        setAplicando(false);
      }
      return;
    }

    const substitui = validas.filter(mudancaSubstitui).length;
    if (substitui > 0) {
      const confirmado = await pedirConfirmacao(
        `${substitui} das alterações escolhidas trocam ou excluem o que já está na dieta (quantidades, exclusões, refeições ou horários). Aplicar nesta dieta?`,
        { aceitar: "Aplicar alterações", rejeitar: "Cancelar", titulo: "Substituir conteúdo da dieta" }
      );
      if (!confirmado) return;
    }
    onAplicar(final);
    avisar("Alterações aplicadas. As linhas da IA ficam com o selo “IA” até você editar ou confirmar.", "success");
    onFechar();
  }

  // ------------------------------------------------------------------
  // Prévia: mudanças agrupadas por refeição

  const refeicaoAtual = (id: string) => documento.refeicoes.find((r) => r.id === id);
  const itemAtual = (refeicaoId: string, itemId: string) => {
    const r = refeicaoAtual(refeicaoId);
    return r ? opcaoDeReferencia(r)?.itens.find((i) => i.id === itemId) : undefined;
  };

  function descrever(m: Mudanca): string {
    switch (m.tipo) {
      case "inclusao":
        return `Incluir ${textoDoItem(m.item)}`;
      case "exclusao": {
        const item = itemAtual(m.refeicaoId, m.itemId);
        return `Excluir ${item ? textoDoItem(item) : "alimento"}`;
      }
      case "quantidade": {
        const item = itemAtual(m.refeicaoId, m.itemId);
        return `${item ? nomeNaPrescricao(item) : "Alimento"}: ${item ? textoDaQuantidade(item) || "sem quantidade" : ""} → ${textoDaQuantidade(m.item) || "sem quantidade"}`;
      }
      case "dados_refeicao": {
        const r = refeicaoAtual(m.refeicaoId);
        const partes = [];
        if (m.nome) partes.push(`nome “${r?.nome ?? ""}” → “${m.nome}”`);
        if (m.horario) partes.push(`horário ${r?.horario ?? "sem horário"} → ${m.horario}`);
        if (m.observacao) partes.push(`observação: “${m.observacao}”`);
        return `Alterar ${partes.join("; ")}`;
      }
      case "alternativas":
        return `Acrescentar ${m.opcoes.length} opção(ões) alternativa(s): ${m.opcoes.map((o) => o.itens.map(textoDoItem).join(", ")).join(" | ")}`;
      case "refeicao_removida": {
        const r = refeicaoAtual(m.refeicaoId);
        const n = r ? opcaoDeReferencia(r)?.itens.length ?? 0 : 0;
        return `Remover a refeição ${r?.nome || ""} (${n} alimento(s))`;
      }
      case "refeicao_nova":
        return `Nova refeição: ${m.refeicao.nome}${m.refeicao.horario ? ` (${m.refeicao.horario})` : ""}`;
    }
  }

  // Grupos na ordem da dieta como ficaria; removidas no fim.
  const grupos = useMemo(() => {
    const lista: { chave: string; titulo: string; mudancas: Mudanca[]; refeicao: Refeicao | null; antes: Refeicao | null }[] = [];
    const ordem = [...resultado.refeicoes.map((r) => r.id), ...documento.refeicoes.filter((r) => !resultado.refeicoes.some((x) => x.id === r.id)).map((r) => r.id)];
    const novas = new Map(mudancas.filter((m) => m.tipo === "refeicao_nova").map((m) => [m.refeicao.id, m.refeicao] as const));
    for (const m of mudancas) {
      if (m.tipo === "refeicao_nova" && !ordem.includes(m.refeicao.id)) ordem.push(m.refeicao.id);
    }
    for (const id of ordem) {
      const daRefeicao = mudancas.filter((m) => (m.tipo === "refeicao_nova" ? m.refeicao.id === id : m.refeicaoId === id));
      const antes = documento.refeicoes.find((r) => r.id === id) ?? null;
      const depois = resultado.refeicoes.find((r) => r.id === id) ?? null;
      if (!daRefeicao.length && !antes) continue;
      const nome = depois?.nome || antes?.nome || novas.get(id)?.nome || "Refeição";
      lista.push({ chave: id, titulo: nome, mudancas: daRefeicao, refeicao: depois, antes });
    }
    return lista;
  }, [mudancas, resultado, documento]);

  const codigosDaPrevia = ["kcal", "proteinas", "carboidratos", "lipidios", ...(proposta?.pedido.metas.parametros.map((p) => p.nutriente) ?? [])];
  const totalAntes = totaisDaDieta(documento, base.composicoes, codigosDaPrevia);
  const totalDepois = totaisDaDieta(resultado, base.composicoes, codigosDaPrevia);
  const metas = proposta?.pedido.metas;
  const linhasDeMeta = metas
    ? [
        ...MACROS.filter(([codigo]) => metas[codigo as "kcal"] !== null).map(([codigo, rotulo]) => ({
          codigo,
          rotulo: codigo === "kcal" ? "Energia" : rotulo,
          condicao: "alvo" as const,
          meta: metas[codigo as "kcal"] as number,
          unidade: codigo === "kcal" ? "kcal" : "g",
        })),
        ...metas.parametros.map((p) => {
          const n = nutrientes.find((x) => x.codigo === p.nutriente);
          return { codigo: p.nutriente, rotulo: n?.nome ?? p.nutriente, condicao: p.condicao, meta: p.valor, unidade: n?.unidade ?? "" };
        }),
      ]
    : [];

  const comConteudo = documentoTemConteudo(documento);
  const limite = contexto?.limite;
  const semLimite = limite ? limite.restantes <= 0 : false;

  return (
    <Dialog
      header={
        <span className="flex flex-wrap items-center gap-2">
          <i className="pi pi-sparkles text-primary-600" aria-hidden />
          Auxílio da IA
          {limite ? (
            <span className="text-xs font-normal text-gray-500">
              {limite.hoje} de {limite.limite} pedidos hoje
            </span>
          ) : null}
        </span>
      }
      visible={visivel}
      onHide={onFechar}
      maximizable
      className="w-[min(72rem,calc(100vw-1rem))]"
      contentClassName="space-y-4"
    >
      <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
        As sugestões são apoio à elaboração profissional, não prescrição validada. Os valores nutricionais são calculados pelo sistema, pela base
        de alimentos. Nada muda na dieta até você clicar em “Aplicar alterações selecionadas”.
      </p>

      {contexto && !contexto.disponivel ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-800">O auxílio da IA não está configurado no servidor.</p>
      ) : null}

      {/* ----------------------------------------------------------- Pedido */}
      <section className="cartao space-y-3 p-3" aria-label="Novo pedido à IA">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <RadioButton inputId="alcance-dieta" checked={pedido.alcance === "dieta" && !pedido.doZero} onChange={() => alterarPedido({ alcance: "dieta", doZero: false })} />
            Dieta inteira
          </label>
          <label className="flex items-center gap-2">
            <RadioButton
              inputId="alcance-refeicao"
              disabled={documento.refeicoes.length === 0}
              checked={pedido.alcance === "refeicao" && !pedido.doZero}
              onChange={() => alterarPedido({ alcance: "refeicao", doZero: false, refeicaoId: pedido.refeicaoId ?? documento.refeicoes[0]?.id ?? null })}
            />
            Uma refeição
          </label>
          {pedido.alcance === "refeicao" && !pedido.doZero ? (
            <Dropdown
              aria-label="Refeição do pedido"
              value={pedido.refeicaoId}
              options={documento.refeicoes.map((r, n) => ({ label: r.nome || `Refeição ${n + 1}`, value: r.id }))}
              onChange={(e) => alterarPedido({ refeicaoId: e.value })}
              className="min-w-48"
            />
          ) : null}
          <label className="flex items-center gap-2">
            <RadioButton inputId="alcance-zero" checked={pedido.doZero} onChange={() => alterarPedido({ alcance: "dieta", doZero: true })} />
            Dieta do zero
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">O que a IA deve fazer?</span>
          <InputTextarea
            aria-label="Pedido à IA"
            value={pedido.pedido}
            maxLength={LIMITES_DO_PEDIDO.pedido}
            onChange={(e) => alterarPedido({ pedido: e.target.value })}
            rows={3}
            autoResize
            className="w-full"
            placeholder={
              pedido.alcance === "refeicao"
                ? "Ex.: troque por algo prático para levar ao trabalho, com 25 g de proteína"
                : "Ex.: 6 refeições, 1.800 kcal, 120 g de proteína, sem lactose · revise a distribuição de proteína"
            }
          />
        </label>

        <div>
          <span className="mb-1 block text-sm font-semibold text-gray-700">Metas (opcional; a prévia mostra a diferença)</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {MACROS.map(([codigo, rotulo]) => (
              <label key={codigo} className="block text-xs text-gray-600">
                {codigo === "kcal" ? "Energia (kcal)" : `${rotulo} (g)`}
                <CampoNumero
                  ariaLabel={`Meta de ${codigo === "kcal" ? "energia" : rotulo}`}
                  valor={pedido.metas[codigo as "kcal"]}
                  maximo={codigo === "kcal" ? 10_000 : 2_000}
                  onChange={(valor) => alterarMetas({ [codigo]: valor })}
                  className="w-full"
                />
              </label>
            ))}
          </div>
          <div className="mt-2 space-y-2">
            {pedido.metas.parametros.map((p, n) => (
              <div key={n} className="flex flex-wrap items-center gap-2">
                <Dropdown
                  aria-label={`Parâmetro de controle ${n + 1}`}
                  value={p.nutriente}
                  options={nutrientes.map((x) => ({ label: `${x.nome} (${x.unidade})`, value: x.codigo }))}
                  filter
                  onChange={(e) => alterarMetas({ parametros: pedido.metas.parametros.map((x, i) => (i === n ? { ...x, nutriente: e.value } : x)) })}
                  className="min-w-56 flex-1"
                />
                <Dropdown
                  aria-label={`Condição do parâmetro ${n + 1}`}
                  value={p.condicao}
                  options={Object.entries(CONDICOES).map(([value, label]) => ({ value, label }))}
                  onChange={(e) => alterarMetas({ parametros: pedido.metas.parametros.map((x, i) => (i === n ? { ...x, condicao: e.value } : x)) })}
                />
                <CampoNumero
                  ariaLabel={`Valor do parâmetro ${n + 1}`}
                  valor={p.valor || null}
                  maximo={1_000_000}
                  onChange={(valor) => alterarMetas({ parametros: pedido.metas.parametros.map((x, i) => (i === n ? { ...x, valor: valor ?? 0 } : x)) })}
                  className="w-28"
                />
                <Button
                  type="button"
                  icon="pi pi-times"
                  text
                  severity="danger"
                  aria-label={`Remover parâmetro ${n + 1}`}
                  onClick={() => alterarMetas({ parametros: pedido.metas.parametros.filter((_, i) => i !== n) })}
                />
              </div>
            ))}
            {pedido.metas.parametros.length < MAXIMO_DE_PARAMETROS ? (
              <Button
                type="button"
                icon="pi pi-plus"
                label="Parâmetro de controle"
                size="small"
                text
                onClick={() => alterarMetas({ parametros: [...pedido.metas.parametros, { nutriente: "fibras", condicao: "min", valor: 0 }] })}
              />
            ) : null}
          </div>
        </div>

        {pedido.doZero ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-gray-600">
              Número de refeições
              <CampoNumero ariaLabel="Número de refeições" valor={pedido.numeroRefeicoes} maximo={12} onChange={(valor) => alterarPedido({ numeroRefeicoes: valor })} className="w-full" />
            </label>
            {(
              [
                ["horarios", "Horários", "Ex.: acorda 6h, treino 18h, dorme 23h"],
                ["objetivo", "Objetivo", "Ex.: emagrecimento com preservação de massa magra"],
                ["restricoes", "Restrições", "Ex.: sem lactose"],
                ["preferencias", "Preferências", "Ex.: gosta de tapioca; refeições rápidas no almoço"],
              ] as const
            ).map(([campo, rotulo, exemplo]) => (
              <label key={campo} className="block text-xs text-gray-600">
                {rotulo}
                <InputText
                  aria-label={rotulo}
                  value={pedido[campo]}
                  maxLength={LIMITES_DO_PEDIDO.texto}
                  placeholder={exemplo}
                  onChange={(e) => alterarPedido({ [campo]: e.target.value })}
                  className="w-full"
                />
              </label>
            ))}
          </div>
        ) : null}

        {/* O que vai para a IA (validação 7.2 e 7.4) */}
        <details className="rounded-md border border-gray-200 p-2 text-sm" open={Boolean(contexto?.anamnese)}>
          <summary className="cursor-pointer font-semibold text-gray-700">O que vai para a IA</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-gray-700">
            <li>Paciente, sem nome nem contato: {contexto?.paciente ?? "…"}.</li>
            <li>{pedido.doZero ? "A dieta aberta não vai (dieta do zero)." : "A dieta aberta: refeições, alimentos e quantidades."}</li>
            <li>O seu pedido, as metas e a lista de alimentos da base.</li>
          </ul>
          {contexto?.anamnese ? (
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 font-semibold text-gray-700">
                <Checkbox inputId="usar-anamnese" checked={usarAnamnese} onChange={(e) => setUsarAnamnese(Boolean(e.checked))} />
                Incluir dados da anamnese ({contexto.anamnese.titulo}, {dataCurta(contexto.anamnese.data)})
              </label>
              {usarAnamnese ? (
                <>
                  <InputTextarea
                    aria-label="Dados da anamnese enviados à IA"
                    value={pedido.contextoAnamnese}
                    maxLength={LIMITES_DO_PEDIDO.contexto}
                    onChange={(e) => alterarPedido({ contextoAnamnese: e.target.value })}
                    rows={4}
                    autoResize
                    className="w-full text-sm"
                    placeholder="Alergias, restrições e preferências"
                  />
                  <p className="text-xs text-gray-500">
                    Vão sem o nome do paciente. Revise e apague o que não deve ir. Foram trazidas as respostas sobre alergias, restrições,
                    preferências, hábitos e saúde.
                  </p>
                </>
              ) : null}
              <div className="rounded-md bg-gray-50 p-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-700">Resumo da anamnese pela IA</span>
                  {contexto.anamnese.resumoEm ? <span className="text-xs text-gray-500">gerado em {new Date(contexto.anamnese.resumoEm).toLocaleString("pt-BR")}</span> : null}
                  <Button
                    type="button"
                    size="small"
                    text
                    icon="pi pi-sparkles"
                    label={contexto.anamnese.resumo ? "Gerar de novo" : "Gerar resumo"}
                    loading={resumindo}
                    disabled={semLimite || !contexto.disponivel}
                    onClick={resumirAnamnese}
                  />
                  {contexto.anamnese.resumo && usarAnamnese ? (
                    <Button
                      type="button"
                      size="small"
                      text
                      label="Usar no pedido"
                      onClick={() =>
                        alterarPedido({
                          contextoAnamnese: [pedido.contextoAnamnese.trim(), contexto.anamnese?.resumo ?? ""].filter(Boolean).join("\n").slice(0, LIMITES_DO_PEDIDO.contexto),
                        })
                      }
                    />
                  ) : null}
                </div>
                {contexto.anamnese.resumo ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{contexto.anamnese.resumo}</p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">Vão todas as respostas, menos as que identificam o paciente (nome, contato, endereço, nascimento).</p>
                )}
              </div>
            </div>
          ) : contexto ? (
            <p className="mt-2 text-xs text-gray-500">O paciente não tem anamnese respondida.</p>
          ) : null}
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            icon="pi pi-sparkles"
            label="Pedir sugestão"
            loading={pedindo}
            disabled={semLimite || contexto?.disponivel === false}
            onClick={() => pedir({ ...pedido, contextoAnamnese: usarAnamnese ? pedido.contextoAnamnese : "" })}
          />
          {pedindo ? <span className="text-sm text-gray-500">A IA está elaborando a proposta; uma dieta completa pode levar até um minuto.</span> : null}
          {semLimite ? <span className="text-sm text-red-700">Limite diário de pedidos atingido. Volta amanhã.</span> : null}
        </div>
      </section>

      {/* ----------------------------------------------------------- Sugestões */}
      {propostas.length ? (
        <section className="space-y-3" aria-label="Sugestões da IA">
          <div className="flex flex-wrap items-center gap-1 border-b border-gray-200">
            {propostas.map((p, n) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={n === ativa}
                onClick={() => setAtiva(n)}
                className={`rounded-t-md px-3 py-1.5 text-sm ${n === ativa ? "border border-b-0 border-gray-200 bg-white font-semibold text-primary-800" : "text-gray-600 hover:bg-gray-50"}`}
              >
                Sugestão {n + 1}
              </button>
            ))}
            {proposta ? (
              <Button
                type="button"
                icon="pi pi-refresh"
                label="Refazer sugestão"
                size="small"
                text
                className="ml-auto"
                loading={pedindo}
                disabled={semLimite}
                onClick={() => pedir(proposta.pedido)}
              />
            ) : null}
          </div>

          {proposta ? (
            <>
              <p className="text-xs text-gray-500">
                Pedido: {proposta.pedido.doZero ? "dieta do zero" : proposta.pedido.alcance === "refeicao" ? `uma refeição (${refeicaoAtual(proposta.pedido.refeicaoId ?? "")?.nome ?? "refeição"})` : "dieta inteira"}
                {proposta.pedido.pedido ? ` — “${proposta.pedido.pedido}”` : ""}
              </p>
              {proposta.mensagem ? (
                <div className="rounded-md border border-primary-200 bg-primary-50 p-2 text-sm text-gray-800">
                  <span className="font-semibold">Mensagem da IA: </span>
                  {proposta.mensagem}
                </div>
              ) : null}
              {proposta.pendencias.length ? (
                <ul className="list-disc rounded-md border border-amber-200 bg-amber-50 p-2 pl-6 text-sm text-amber-900">
                  {proposta.pendencias.map((p, n) => (
                    <li key={n}>{p}</li>
                  ))}
                </ul>
              ) : null}

              {mudancas.length === 0 ? (
                <p className="text-sm text-gray-600">Esta sugestão não muda nada na dieta como ela está agora.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-gray-700">
                      {validas.length} de {mudancas.length} alteração(ões) selecionada(s)
                    </span>
                    <Button type="button" size="small" text label="Selecionar tudo" onClick={() => marcar(mudancas.map((m) => m.id), true)} />
                    <Button type="button" size="small" text label="Desmarcar tudo" onClick={() => marcar(mudancas.map((m) => m.id), false)} />
                  </div>

                  <div className="space-y-3">
                    {grupos.map((g) => {
                      const totaisAntes = g.antes ? totaisDosItens(opcaoDeReferencia(g.antes)?.itens ?? [], base.composicoes, MACROS.map(([c]) => c)) : null;
                      const totaisDepois = g.refeicao ? totaisDosItens(opcaoDeReferencia(g.refeicao)?.itens ?? [], base.composicoes, MACROS.map(([c]) => c)) : null;
                      return (
                        <div key={g.chave} className="cartao p-3">
                          <div className="flex flex-wrap items-baseline gap-2">
                            <h3 className="font-bold uppercase text-gray-900">{g.titulo}</h3>
                            {!g.antes ? <span className="selo-ia">nova</span> : null}
                            {!g.refeicao ? <span className="text-xs font-semibold text-red-700">removida</span> : null}
                          </div>
                          <div className="mt-1 grid gap-x-4 text-xs text-gray-600 sm:grid-cols-[auto_1fr]">
                            <span className="font-semibold">Agora:</span>
                            <span>{totaisAntes ? textoDosTotais(totaisAntes) : "—"}</span>
                            <span className="font-semibold">Com as alterações:</span>
                            <span>
                              {totaisDepois ? textoDosTotais(totaisDepois) : "—"}
                              {totaisAntes && totaisDepois ? ` (${diferenca("kcal", totaisDepois.kcal?.valor, totaisAntes.kcal?.valor) ?? "—"})` : ""}
                            </span>
                          </div>
                          {g.mudancas.length ? (
                            <ul className="mt-2 space-y-1">
                              {g.mudancas.map((m) => (
                                <li key={m.id}>
                                  <label className="flex items-start gap-2 text-sm text-gray-800">
                                    <Checkbox inputId={m.id} checked={escolhidas.has(m.id)} onChange={(e) => marcar([m.id], Boolean(e.checked))} className="mt-0.5" />
                                    <span>
                                      {descrever(m)}
                                      {m.tipo === "refeicao_nova" ? (
                                        <span className="block text-xs text-gray-600">{opcaoDeReferencia(m.refeicao)?.itens.map(textoDoItem).join("; ")}</span>
                                      ) : null}
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-xs text-gray-500">Sem alterações nesta refeição.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Totais do dia e metas */}
              <div className="cartao p-3 text-sm">
                <h3 className="font-bold text-gray-900">Total do dia (opções principais)</h3>
                <div className="mt-1 grid gap-x-4 text-gray-700 sm:grid-cols-[auto_1fr]">
                  <span className="font-semibold">Agora:</span>
                  <span>{textoDosTotais(totalAntes)}</span>
                  <span className="font-semibold">Com as alterações:</span>
                  <span>{textoDosTotais(totalDepois)}</span>
                </div>
                {Object.values(totalDepois).some((t) => t && !t.completo) ? (
                  <p className="mt-1 text-xs text-amber-800">Há alimentos sem o dado na base: o total é parcial.</p>
                ) : null}
                {linhasDeMeta.length ? (
                  <table className="mt-3 w-full text-left text-sm">
                    <thead className="text-xs text-gray-500">
                      <tr>
                        <th className="py-1 font-semibold">Meta</th>
                        <th className="py-1 text-right font-semibold">Pedido</th>
                        <th className="py-1 text-right font-semibold">Com as alterações</th>
                        <th className="py-1 text-right font-semibold">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linhasDeMeta.map((l) => {
                        const valor = totalDepois[l.codigo]?.valor ?? null;
                        const d = valor === null ? null : valor - l.meta;
                        const atende = valor === null ? null : l.condicao === "min" ? valor >= l.meta : l.condicao === "max" ? valor <= l.meta : null;
                        return (
                          <tr key={`${l.codigo}-${l.condicao}`} className="border-t border-gray-100">
                            <td className="py-1">{l.rotulo}</td>
                            <td className="py-1 text-right tabular-nums">
                              {l.condicao === "alvo" ? "" : `${CONDICOES[l.condicao]} `}
                              {formatarNutriente(l.codigo, l.meta)} {l.unidade}
                            </td>
                            <td className="py-1 text-right tabular-nums">{valor === null ? "—" : `${formatarNutriente(l.codigo, valor)} ${l.unidade}`}</td>
                            <td className={`py-1 text-right tabular-nums ${atende === false ? "font-semibold text-red-700" : ""}`}>
                              {d === null ? "—" : `${d > 0 ? "+" : d < 0 ? "−" : ""}${formatarNutriente(l.codigo, Math.abs(d))} ${l.unidade}`}
                              {atende === true ? " ✓" : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : null}
              </div>

              {/* Aplicar */}
              <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white py-3">
                {comConteudo ? (
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <RadioButton inputId="destino-atual" checked={destino === "atual"} onChange={() => setDestino("atual")} />
                      Aplicar nesta dieta
                    </label>
                    <label className="flex items-center gap-2">
                      <RadioButton inputId="destino-nova" checked={destino === "nova"} onChange={() => setDestino("nova")} />
                      Criar nova dieta com o resultado
                    </label>
                  </div>
                ) : null}
                <Button
                  type="button"
                  icon="pi pi-check"
                  label="Aplicar alterações selecionadas"
                  className="ml-auto"
                  loading={aplicando}
                  disabled={validas.length === 0}
                  onClick={aplicar}
                />
              </div>
            </>
          ) : null}
        </section>
      ) : null}
    </Dialog>
  );
}

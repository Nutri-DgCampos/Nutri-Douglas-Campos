"use client";

import { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import type { AlimentoEncontrado } from "@/components/nutricao/BuscaAlimento";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { copiarParaAreaDeTransferencia, useRefeicaoCopiada } from "@/lib/nutricao/areaDeTransferencia";
import {
  alimentosDoDocumento,
  aplicarRefeicao,
  documentoVazio,
  novaRefeicao,
  type DocumentoDieta,
  type Refeicao,
} from "@/lib/nutricao/dieta";
import BlocoRefeicao, { SUGESTOES_DE_NOME } from "./BlocoRefeicao";
import JanelaAplicarRefeicao, { type OpcoesDeAplicacao } from "./JanelaAplicarRefeicao";
import JanelaSubstituicoes from "./JanelaSubstituicoes";
import { carregarAlimentos, type BaseDosAlimentos, type Nutriente } from "./tipos";

type ModeloEncontrado = { id: string; nome: string; resumo: string | null };

// Refeições do editor (dieta do paciente, modelo de dieta ou modelo de
// refeição): blocos, escolha de alimentos, substituições e as ações de
// refeição (copiar, colar, salvar como modelo, importar modelo).
export default function ListaDeRefeicoes({
  documento,
  base,
  onBase,
  alterar,
  nutrientes,
  mostrarNutrientes,
  estruturaFixa = false,
}: {
  documento: DocumentoDieta;
  base: BaseDosAlimentos;
  onBase: (atualizar: (base: BaseDosAlimentos) => BaseDosAlimentos) => void;
  alterar: (mudanca: (doc: DocumentoDieta) => void) => void;
  nutrientes: Nutriente[];
  mostrarNutrientes: boolean;
  // Modelo de refeição: uma refeição só, sem adicionar, remover ou mover.
  estruturaFixa?: boolean;
}) {
  const copiada = useRefeicaoCopiada();
  const [substituindo, setSubstituindo] = useState<{ opcaoId: string; itemId: string } | null>(null);
  const [aplicando, setAplicando] = useState<{ destinoId: string; origem: Refeicao; titulo: string } | null>(null);
  const [salvandoModelo, setSalvandoModelo] = useState<Refeicao | null>(null);
  const [nomeDoModelo, setNomeDoModelo] = useState("");
  const [gravandoModelo, setGravandoModelo] = useState(false);
  const [importandoPara, setImportandoPara] = useState<string | null>(null);
  const [busca, setBusca] = useState<string | ModeloEncontrado>("");
  const [sugestoes, setSugestoes] = useState<ModeloEncontrado[]>([]);

  function juntarBase(novos: BaseDosAlimentos) {
    onBase((atual) => ({
      alimentos: { ...atual.alimentos, ...novos.alimentos },
      composicoes: { ...atual.composicoes, ...novos.composicoes },
    }));
  }

  async function garantirAlimentos(ids: string[]) {
    const faltando = [...new Set(ids)].filter((id) => !base.alimentos[id]);
    if (faltando.length) juntarBase(await carregarAlimentos(faltando));
  }

  // Escolher (ou trocar) o alimento de uma linha: a quantidade zera
  // (decisão B.3) e a medida padrão do alimento já vem selecionada.
  async function escolherAlimento(refeicaoId: string, opcaoId: string, itemId: string, alimento: AlimentoEncontrado) {
    let dados = base.alimentos[alimento.id];
    try {
      if (!dados) {
        const novos = await carregarAlimentos([alimento.id]);
        juntarBase(novos);
        dados = novos.alimentos[alimento.id];
      }
    } catch {
      avisar("Não foi possível carregar o alimento.", "error");
      return;
    }

    const item = documento.refeicoes
      .find((r) => r.id === refeicaoId)
      ?.opcoes.find((o) => o.id === opcaoId)
      ?.itens.find((i) => i.id === itemId);

    if (item?.alimentoId && item.substituicoes.length > 0) {
      const confirmado = await pedirConfirmacao(
        "Trocar o alimento remove as substituições escolhidas para ele nesta linha. Continuar?",
        { aceitar: "Trocar alimento", rejeitar: "Cancelar" }
      );
      if (!confirmado) return;
    }

    const padrao = dados?.medidas.find((m) => m.padrao) ?? dados?.medidas[0];

    alterar((doc) => {
      const alvo = doc.refeicoes
        .find((r) => r.id === refeicaoId)
        ?.opcoes.find((o) => o.id === opcaoId)
        ?.itens.find((i) => i.id === itemId);
      if (!alvo) return;
      Object.assign(alvo, {
        alimentoId: alimento.id,
        nomeOriginal: alimento.nome,
        nomeExibido: null,
        unidade: alimento.unidade_base,
        medida: padrao
          ? { id: padrao.id, singular: padrao.nome_singular, plural: padrao.nome_plural, quantidade: padrao.quantidade }
          : null,
        numeroMedidas: null,
        quantidadeAjustada: null,
        substituicoes: [],
        referencia: false,
      });
    });
  }

  // Colar ou importar modelo: carrega os alimentos da origem e pede confirmação.
  async function prepararAplicacao(destinoId: string, origem: Refeicao, titulo: string) {
    try {
      await garantirAlimentos(alimentosDoDocumento({ ...documentoVazio(), refeicoes: [origem] }));
    } catch {
      avisar("Não foi possível carregar os alimentos da refeição.", "error");
      return;
    }
    setAplicando({ destinoId, origem, titulo });
  }

  function aplicar(opcoes: OpcoesDeAplicacao) {
    const alvo = aplicando;
    setAplicando(null);
    if (!alvo) return;
    alterar((doc) => {
      const indice = doc.refeicoes.findIndex((r) => r.id === alvo.destinoId);
      if (indice < 0) return;
      doc.refeicoes[indice] = aplicarRefeicao(doc.refeicoes[indice], alvo.origem, opcoes.modo, opcoes);
    });
    avisar(alvo.titulo === "Colar refeição" ? "Refeição colada." : "Modelo de refeição importado.", "success");
  }

  async function salvarModeloDeRefeicao() {
    if (!salvandoModelo || !nomeDoModelo.trim() || gravandoModelo) return;
    setGravandoModelo(true);
    try {
      const resposta = await fetch("/api/nutricao/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "refeicao", nome: nomeDoModelo, conteudo: salvandoModelo }),
      });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        avisar(resultado?.erro ?? "Não foi possível salvar o modelo.", "error");
        return;
      }
      setSalvandoModelo(null);
      avisar("Modelo de refeição salvo com sucesso.", "success");
    } finally {
      setGravandoModelo(false);
    }
  }

  async function buscarModelos(texto: string) {
    const resposta = await fetch(`/api/nutricao/modelos?tipo=refeicao&q=${encodeURIComponent(texto)}`, { cache: "no-store" });
    const dados = await resposta.json().catch(() => null);
    setSugestoes(dados?.modelos ?? []);
  }

  async function importarModelo() {
    const destinoId = importandoPara;
    if (!destinoId || typeof busca === "string") return;
    const resposta = await fetch(`/api/nutricao/modelos/${busca.id}/usar`, { method: "POST" });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      avisar(dados?.erro ?? "Não foi possível usar o modelo.", "error");
      return;
    }
    juntarBase({ alimentos: dados.alimentos, composicoes: dados.composicoes });
    setImportandoPara(null);
    setBusca("");
    setAplicando({ destinoId, origem: dados.conteudo as Refeicao, titulo: `Importar modelo: ${dados.nome}` });
  }

  const itemEmSubstituicao = substituindo
    ? documento.refeicoes
        .flatMap((r) => r.opcoes)
        .find((o) => o.id === substituindo.opcaoId)
        ?.itens.find((i) => i.id === substituindo.itemId) ?? null
    : null;
  const destinoDaAplicacao = aplicando ? documento.refeicoes.find((r) => r.id === aplicando.destinoId) : null;

  return (
    <>
      <datalist id="sugestoes-refeicao">
        {SUGESTOES_DE_NOME.map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>

      {documento.refeicoes.map((refeicao, indice) => (
        <BlocoRefeicao
          key={refeicao.id}
          refeicao={refeicao}
          indice={indice}
          total={documento.refeicoes.length}
          base={base}
          nutrientes={nutrientes}
          acompanhados={documento.nutrientesAcompanhados}
          mostrarNutrientes={mostrarNutrientes}
          estruturaFixa={estruturaFixa}
          temCopiada={Boolean(copiada)}
          onAlterar={(mudanca) =>
            alterar((d) => {
              const alvo = d.refeicoes.find((r) => r.id === refeicao.id);
              if (alvo) mudanca(alvo);
            })
          }
          onRemover={async () => {
            const confirmado = await pedirConfirmacao(
              `Remover ${refeicao.nome.trim() || `a refeição ${indice + 1}`} e todos os alimentos dela desta dieta?`,
              { aceitar: "Remover refeição", rejeitar: "Cancelar" }
            );
            if (confirmado) alterar((d) => void (d.refeicoes = d.refeicoes.filter((r) => r.id !== refeicao.id)));
          }}
          onMover={(direcao) =>
            alterar((d) => {
              const destino = indice + direcao;
              if (destino < 0 || destino >= d.refeicoes.length) return;
              [d.refeicoes[indice], d.refeicoes[destino]] = [d.refeicoes[destino], d.refeicoes[indice]];
            })
          }
          onEscolherAlimento={(opcaoId, itemId, alimento) => escolherAlimento(refeicao.id, opcaoId, itemId, alimento)}
          onSubstituicoes={(opcaoId, itemId) => setSubstituindo({ opcaoId, itemId })}
          onCopiar={() => {
            copiarParaAreaDeTransferencia(refeicao);
            avisar("Refeição copiada. Selecione onde deseja colar.", "info");
          }}
          onColar={() => {
            if (!copiada) {
              avisar("Nenhuma refeição copiada.", "warn");
              return;
            }
            prepararAplicacao(refeicao.id, copiada.refeicao, "Colar refeição");
          }}
          onSalvarModelo={() => {
            setNomeDoModelo(refeicao.nome.trim());
            setSalvandoModelo(refeicao);
          }}
          onImportarModelo={() => {
            setBusca("");
            setImportandoPara(refeicao.id);
          }}
        />
      ))}

      {!estruturaFixa ? (
        <Button
          type="button"
          icon="pi pi-plus"
          label="Adicionar refeição"
          outlined
          onClick={() => alterar((d) => void d.refeicoes.push(novaRefeicao()))}
        />
      ) : null}

      <JanelaSubstituicoes
        key={substituindo ? `${substituindo.opcaoId}-${substituindo.itemId}` : "fechada"}
        item={itemEmSubstituicao}
        base={base}
        visivel={Boolean(substituindo)}
        garantirAlimentos={garantirAlimentos}
        onFechar={() => setSubstituindo(null)}
        onConfirmar={(substituicoes) => {
          const alvo = substituindo;
          setSubstituindo(null);
          if (!alvo) return;
          alterar((d) => {
            const item = d.refeicoes
              .flatMap((r) => r.opcoes)
              .find((o) => o.id === alvo.opcaoId)
              ?.itens.find((i) => i.id === alvo.itemId);
            if (item) item.substituicoes = substituicoes;
          });
        }}
      />

      {aplicando && destinoDaAplicacao ? (
        <JanelaAplicarRefeicao
          titulo={aplicando.titulo}
          origem={aplicando.origem}
          destino={destinoDaAplicacao}
          onCancelar={() => setAplicando(null)}
          onConfirmar={aplicar}
        />
      ) : null}

      <Dialog
        header="Salvar refeição como modelo"
        visible={Boolean(salvandoModelo)}
        onHide={() => setSalvandoModelo(null)}
        className="w-[min(30rem,calc(100vw-1rem))]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setSalvandoModelo(null)} />
            <Button
              type="button"
              label="Salvar"
              icon="pi pi-check"
              loading={gravandoModelo}
              disabled={!nomeDoModelo.trim()}
              onClick={salvarModeloDeRefeicao}
            />
          </div>
        }
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Nome do modelo</span>
          <InputText
            autoFocus
            value={nomeDoModelo}
            onChange={(e) => setNomeDoModelo(e.target.value)}
            placeholder="Ex.: Café da manhã proteico"
            className={`w-full ${nomeDoModelo.trim() ? "" : "p-invalid"}`}
          />
        </label>
        <p className="mt-2 text-sm text-gray-600">
          O modelo guarda alimentos, quantidades, opções, substituições e a observação da refeição. Revise a observação para não
          levar informações deste paciente. A dieta atual não muda.
        </p>
      </Dialog>

      <Dialog
        header="Importar modelo de refeição"
        visible={Boolean(importandoPara)}
        onHide={() => setImportandoPara(null)}
        className="w-[min(32rem,calc(100vw-1rem))]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setImportandoPara(null)} />
            <Button type="button" label="Confirmar" icon="pi pi-check" disabled={typeof busca === "string"} onClick={importarModelo} />
          </div>
        }
      >
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Buscar modelo de refeição</span>
          <AutoComplete
            value={busca}
            suggestions={sugestoes}
            completeMethod={(e) => buscarModelos(e.query)}
            field="nome"
            delay={250}
            minLength={1}
            dropdown
            onChange={(e) => setBusca(e.value)}
            showEmptyMessage
            emptyMessage="Nenhum modelo encontrado."
            itemTemplate={(m: ModeloEncontrado) => (
              <span>
                <span className="block">{m.nome}</span>
                {m.resumo ? <span className="block text-xs text-gray-500">{m.resumo}</span> : null}
              </span>
            )}
            className="w-full"
            inputClassName="w-full"
          />
        </label>
        <p className="mt-2 text-sm text-gray-600">O modelo não muda: a refeição recebe uma cópia editável.</p>
      </Dialog>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { arredondarSubstituicao, nutrienteDaPorcao, quantidadeEquivalente, textoDoResultado } from "@/lib/nutricao/calculo";
import {
  formatarNumero,
  nomeNaPrescricao,
  quantidadeDoItem,
  textoDaQuantidade,
  type ItemDaDieta,
  type SubstituicaoDaLinha,
} from "@/lib/nutricao/dieta";
import { avisar } from "@/lib/avisos";
import CampoNumero from "./CampoNumero";
import type { BaseDosAlimentos } from "./tipos";

const MACROS = [
  ["kcal", "Kcal", ""],
  ["carboidratos", "CHO", "g"],
  ["proteinas", "PTN", "g"],
  ["lipidios", "LIP", "g"],
] as const;

type Candidato = {
  alimentoId: string;
  nome: string;
  unidade: "g" | "ml";
  // Proporção cadastrada: quantidade do substituto por quantidade do principal.
  cadastro: { referencia: number; substituto: number } | null;
};

// Janela de substituições de uma linha: lista os substitutos cadastrados no
// alimento, com caixa de seleção, quantidade definida pelo nutricionista e a
// comparação de kcal e macros com o alimento da linha. Só aplica ao confirmar.
export default function JanelaSubstituicoes({
  item,
  base,
  visivel,
  garantirAlimentos,
  onFechar,
  onConfirmar,
  onAbrirCadastro,
}: {
  item: ItemDaDieta | null;
  base: BaseDosAlimentos;
  visivel: boolean;
  garantirAlimentos: (ids: string[]) => Promise<void>;
  onFechar: () => void;
  onConfirmar: (substituicoes: SubstituicaoDaLinha[]) => void;
  onAbrirCadastro?: (alimentoId: string) => void;
}) {
  const alimento = item?.alimentoId ? base.alimentos[item.alimentoId] : undefined;

  // O componente é remontado a cada abertura (key no pai): parte do que já
  // está escolhido na linha e busca os substitutos ainda não carregados.
  const [marcadas, setMarcadas] = useState<Record<string, SubstituicaoDaLinha>>(() =>
    Object.fromEntries((item?.substituicoes ?? []).map((s) => [s.alimentoId, { ...s }]))
  );
  const [faltando] = useState(() =>
    (alimento?.substituicoes ?? []).map((s) => s.substituto_id).filter((id) => !base.alimentos[id])
  );
  const [carregando, setCarregando] = useState(faltando.length > 0);
  const quantidadeDaLinha = item ? quantidadeDoItem(item).efetiva : null;

  const candidatos: Candidato[] = useMemo(() => {
    if (!item || !alimento) return [];
    const lista: Candidato[] = alimento.substituicoes.map((s) => ({
      alimentoId: s.substituto_id,
      nome: base.alimentos[s.substituto_id]?.nome ?? "…",
      unidade: base.alimentos[s.substituto_id]?.unidade_base ?? "g",
      cadastro: { referencia: s.quantidade_referencia, substituto: s.quantidade_substituto },
    }));
    // Substitutos já escolhidos que saíram do cadastro continuam aparecendo.
    for (const s of item.substituicoes) {
      if (!lista.some((c) => c.alimentoId === s.alimentoId)) {
        lista.push({ alimentoId: s.alimentoId, nome: s.nome, unidade: s.unidade, cadastro: null });
      }
    }
    return lista;
  }, [item, alimento, base.alimentos]);

  useEffect(() => {
    if (faltando.length === 0) return;
    garantirAlimentos(faltando)
      .catch(() => avisar("Não foi possível carregar os substitutos.", "error"))
      .finally(() => setCarregando(false));
    // Só na abertura da janela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!item) return null;

  function marcar(candidato: Candidato, marcado: boolean) {
    setMarcadas((atual) => {
      const novo = { ...atual };
      if (!marcado) {
        delete novo[candidato.alimentoId];
        return novo;
      }
      novo[candidato.alimentoId] = {
        id: globalThis.crypto.randomUUID(),
        alimentoId: candidato.alimentoId,
        nome: base.alimentos[candidato.alimentoId]?.nome ?? candidato.nome,
        unidade: base.alimentos[candidato.alimentoId]?.unidade_base ?? candidato.unidade,
        medida: null,
        numeroMedidas: null,
        // Quantidade só com ação do nutricionista (sugestão ou digitação).
        quantidade: null,
      };
      return novo;
    });
  }

  function alterar(alimentoId: string, alteracao: Partial<SubstituicaoDaLinha>) {
    setMarcadas((atual) => {
      const s = { ...atual[alimentoId], ...alteracao };
      // Medida + número define a quantidade.
      if (("medida" in alteracao || "numeroMedidas" in alteracao) && s.medida && s.numeroMedidas) {
        s.quantidade = s.numeroMedidas * s.medida.quantidade;
      }
      return { ...atual, [alimentoId]: s };
    });
  }

  const composicaoDaLinha = item.alimentoId ? base.composicoes[item.alimentoId] ?? {} : {};
  const nome = nomeNaPrescricao(item);

  return (
    <Dialog
      header={`Substituições — ${nome}${quantidadeDaLinha ? ` (${textoDaQuantidade(item)})` : ""}`}
      visible={visivel}
      onHide={onFechar}
      className="w-[min(56rem,calc(100vw-1rem))]"
      contentClassName="max-h-[65vh]"
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              label="Incluir todas"
              icon="pi pi-check-square"
              outlined
              disabled={candidatos.length === 0}
              onClick={() => candidatos.forEach((c) => !marcadas[c.alimentoId] && marcar(c, true))}
            />
            {item.alimentoId ? (
              <Button
                type="button"
                label="Cadastro do alimento"
                icon="pi pi-external-link"
                text
                onClick={() =>
                  onAbrirCadastro
                    ? onAbrirCadastro(item.alimentoId!)
                    : window.open(`/nutricao/configuracoes/alimentos/${item.alimentoId}`, "_blank", "noopener")
                }
              />
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" label="Cancelar" text onClick={onFechar} />
            <Button
              type="button"
              label="Confirmar"
              icon="pi pi-check"
              onClick={() => onConfirmar(candidatos.filter((c) => marcadas[c.alimentoId]).map((c) => marcadas[c.alimentoId]))}
            />
          </div>
        </div>
      }
    >
      {carregando ? <p className="text-sm text-gray-500">Carregando substitutos…</p> : null}

      {candidatos.length === 0 ? (
        <p className="text-sm text-gray-600">Nenhum alimento de substituição cadastrado.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Estar na lista não torna o alimento equivalente: confira a quantidade de cada substituto. Substituto sem quantidade
            não vai para o paciente.
          </p>

          {candidatos.map((candidato) => {
            const escolhido = marcadas[candidato.alimentoId];
            const dados = base.alimentos[candidato.alimentoId];
            const composicao = base.composicoes[candidato.alimentoId] ?? {};
            const unidade = (dados?.unidade_base ?? candidato.unidade) === "ml" ? "mL" : "g";

            const proporcional =
              candidato.cadastro && quantidadeDaLinha
                ? arredondarSubstituicao((candidato.cadastro.substituto * quantidadeDaLinha) / candidato.cadastro.referencia)
                : null;
            const energetica = quantidadeDaLinha
              ? quantidadeEquivalente(composicaoDaLinha, quantidadeDaLinha, composicao)
              : null;

            return (
              <div key={candidato.alimentoId} className={`rounded-lg border p-3 ${escolhido ? "border-primary-300 bg-primary-50/40" : "border-gray-200"}`}>
                <label className="flex cursor-pointer items-center gap-2 font-semibold text-gray-900">
                  <Checkbox checked={Boolean(escolhido)} onChange={(e) => marcar(candidato, Boolean(e.checked))} />
                  {dados?.nome ?? candidato.nome}
                  {!candidato.cadastro ? <span className="text-xs font-normal text-amber-700">(fora do cadastro atual)</span> : null}
                </label>

                {escolhido ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-[5rem_minmax(9rem,14rem)_7rem_1fr] sm:items-center">
                    <CampoNumero
                      ariaLabel="Quantidade de medidas do substituto"
                      valor={escolhido.medida ? escolhido.numeroMedidas : null}
                      disabled={!escolhido.medida}
                      placeholder={escolhido.medida ? "Qtd." : "—"}
                      onChange={(valor) => alterar(candidato.alimentoId, { numeroMedidas: valor })}
                    />
                    <Dropdown
                      aria-label="Medida do substituto"
                      value={escolhido.medida?.id ?? "__direto__"}
                      options={[
                        ...(dados?.medidas ?? []).map((m) => ({ label: m.nome_singular, value: m.id })),
                        { label: `Em ${unidade}`, value: "__direto__" },
                      ]}
                      onChange={(e) => {
                        const m = dados?.medidas.find((x) => x.id === e.value);
                        alterar(candidato.alimentoId, {
                          medida: m ? { id: m.id, singular: m.nome_singular, plural: m.nome_plural, quantidade: m.quantidade } : null,
                          numeroMedidas: m ? escolhido.numeroMedidas : null,
                        });
                      }}
                      className="w-full"
                    />
                    <div className="relative">
                      <CampoNumero
                        ariaLabel={`Quantidade do substituto em ${unidade}`}
                        valor={escolhido.quantidade}
                        placeholder={unidade}
                        className={`w-full pr-8 ${escolhido.quantidade ? "" : "border-amber-400"}`}
                        onChange={(valor) => alterar(candidato.alimentoId, { quantidade: valor })}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">{unidade}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {proporcional ? (
                        <Button
                          type="button"
                          size="small"
                          text
                          label={`Proporcional ao cadastro: ${formatarNumero(proporcional)} ${unidade}`}
                          onClick={() => alterar(candidato.alimentoId, { quantidade: proporcional, medida: null, numeroMedidas: null })}
                        />
                      ) : null}
                      {energetica ? (
                        <Button
                          type="button"
                          size="small"
                          text
                          label={`Mesma energia: ${formatarNumero(energetica)} ${unidade}`}
                          onClick={() => alterar(candidato.alimentoId, { quantidade: energetica, medida: null, numeroMedidas: null })}
                        />
                      ) : null}
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-xs tabular-nums sm:col-span-4">
                      {MACROS.map(([codigo, rotulo, sufixo]) => {
                        const daLinha = quantidadeDaLinha ? nutrienteDaPorcao(composicaoDaLinha, codigo, quantidadeDaLinha) : null;
                        const doSub = escolhido.quantidade ? nutrienteDaPorcao(composicao, codigo, escolhido.quantidade) : null;
                        const diferenca =
                          daLinha?.situacao === "valor" && doSub?.situacao === "valor" ? doSub.valor - daLinha.valor : null;
                        return (
                          <span key={codigo} className="text-gray-700">
                            <span className="text-gray-400">{rotulo} </span>
                            {doSub ? textoDoResultado(codigo, doSub) : "—"}
                            {sufixo}
                            {diferenca !== null ? (
                              <span className={Math.abs(diferenca) < 0.05 ? "text-gray-400" : diferenca > 0 ? "text-red-600" : "text-blue-700"}>
                                {" "}
                                ({diferenca > 0 ? "+" : ""}
                                {textoDoResultado(codigo, { situacao: "valor", valor: diferenca })})
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

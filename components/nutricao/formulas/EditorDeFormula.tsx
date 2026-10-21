"use client";

import { useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { pedirConfirmacao } from "@/lib/avisos";
import CampoNumero from "@/components/nutricao/editor/CampoNumero";
import {
  AVISO_DA_FORMULA,
  UNIDADES_DO_COMPONENTE,
  calcularDispensacao,
  formatar,
  novoComponente,
  pendenciasDaFormula,
  type Formula,
  type UnidadeDoComponente,
} from "@/lib/nutricao/formula";

type Ingrediente = { id: string; nome: string; dosagem: string | null; unidade: string | null; forma: string | null };

function mover<T>(lista: T[], indice: number, direcao: -1 | 1) {
  const destino = indice + direcao;
  if (destino < 0 || destino >= lista.length) return;
  const [item] = lista.splice(indice, 1);
  lista.splice(destino, 0, item);
}

function CampoIngrediente({ valor, onTexto, onEscolher, rotulo }: { valor: string; onTexto: (t: string) => void; onEscolher: (i: Ingrediente) => void; rotulo: string }) {
  const [sugestoes, setSugestoes] = useState<Ingrediente[]>([]);
  return (
    <AutoComplete
      aria-label={rotulo}
      value={valor}
      suggestions={sugestoes}
      field="nome"
      placeholder="Ingrediente"
      completeMethod={async (e) => {
        const r = await fetch(`/api/nutricao/biblioteca/ingredientes?q=${encodeURIComponent(e.query)}`, { cache: "no-store" });
        setSugestoes(((await r.json().catch(() => null))?.modelos ?? []) as Ingrediente[]);
      }}
      itemTemplate={(i: Ingrediente) => (
        <span>
          {i.nome}
          {i.forma ? <span className="text-gray-500"> · {i.forma}</span> : null}
          {i.dosagem ? <span className="text-gray-500"> · ref. {i.dosagem} {i.unidade}</span> : null}
        </span>
      )}
      onChange={(e) => onTexto(typeof e.value === "string" ? e.value : (e.value as Ingrediente).nome)}
      onSelect={(e) => onEscolher(e.value as Ingrediente)}
      className="w-full"
      inputClassName="w-full"
    />
  );
}

// Campos de uma fórmula: nome, ingredientes (dosagem, unidade, por unidade ou
// por dose), excipiente, apresentação, dose, posologia, orientações,
// observação e a quantidade para dispensação.
export default function EditorDeFormula({
  formula,
  onAlterar,
  modelo = false,
  somenteLeitura = false,
}: {
  formula: Formula;
  onAlterar: (mudanca: (f: Formula) => void) => void;
  modelo?: boolean;
  somenteLeitura?: boolean;
}) {
  const [sugestoesDeNome, setSugestoesDeNome] = useState<string[]>([]);
  const dispensacao = calcularDispensacao(formula);
  const pendencias = pendenciasDaFormula(formula);

  return (
    <div className={`space-y-3 ${somenteLeitura ? "pointer-events-none opacity-60" : ""}`}>
      {!modelo ? (
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Nome da fórmula</span>
          <AutoComplete
            aria-label="Nome da fórmula"
            value={formula.nome}
            suggestions={sugestoesDeNome}
            completeMethod={async (e) => {
              const r = await fetch(`/api/nutricao/biblioteca/formulas?q=${encodeURIComponent(e.query)}`, { cache: "no-store" });
              setSugestoesDeNome((((await r.json().catch(() => null))?.modelos ?? []) as { nome: string }[]).map((m) => m.nome));
            }}
            onChange={(e) => onAlterar((f) => void (f.nome = String(e.value ?? "")))}
            placeholder="Nome da fórmula"
            className="w-full"
            inputClassName="w-full"
          />
          <span className="mt-0.5 block text-xs text-gray-500">A sugestão só preenche o nome; para trazer a fórmula inteira, use Importar.</span>
        </label>
      ) : null}

      <div className="space-y-2">
        <div className="hidden grid-cols-[minmax(0,1fr)_6rem_7rem_9rem_auto] gap-2 text-xs font-semibold text-gray-500 sm:grid">
          <span>Ingrediente</span>
          <span>Dosagem</span>
          <span>Unidade</span>
          <span>Quantidade de</span>
        </div>
        {formula.componentes.map((c, i) => (
          <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem_10.5rem_auto]" aria-label={`Ingrediente ${i + 1}`}>
            <CampoIngrediente
              rotulo={`Ingrediente ${i + 1}`}
              valor={c.nome}
              onTexto={(t) => onAlterar((f) => void Object.assign(f.componentes[i], { nome: t, ingredienteId: null }))}
              onEscolher={(ing) =>
                onAlterar((f) => {
                  const alvo = f.componentes[i];
                  alvo.nome = ing.nome;
                  alvo.ingredienteId = ing.id;
                  // Dosagem de referência só como sugestão (continua editável).
                  if (alvo.quantidade === null && ing.dosagem) alvo.quantidade = Number(ing.dosagem);
                  if (!alvo.unidade && ing.unidade) alvo.unidade = ing.unidade as UnidadeDoComponente;
                })
              }
            />
            <div className="col-span-2 grid grid-cols-[6rem_7rem_minmax(0,1fr)] gap-2 sm:contents">
              <CampoNumero ariaLabel={`Dosagem do ingrediente ${i + 1}`} valor={c.quantidade} maximo={1_000_000} onChange={(v) => onAlterar((f) => void (f.componentes[i].quantidade = v))} />
              <Dropdown
                aria-label={`Unidade do ingrediente ${i + 1}`}
                value={c.unidade}
                options={UNIDADES_DO_COMPONENTE.map((u) => ({ label: u, value: u }))}
                onChange={(e) => onAlterar((f) => void (f.componentes[i].unidade = e.value))}
                placeholder="Unid."
                className="w-full"
              />
              <Dropdown
                aria-label={`Quantidade do ingrediente ${i + 1} vale para`}
                value={c.base}
                options={[
                  { label: "cada unidade", value: "unidade" },
                  { label: "a dose toda", value: "dose" },
                ]}
                onChange={(e) => onAlterar((f) => void (f.componentes[i].base = e.value))}
                className="w-full"
              />
            </div>
            <div className="col-start-2 row-start-1 flex sm:col-start-auto sm:row-start-auto">
              <Button type="button" icon="pi pi-angle-up" text size="small" aria-label={`Subir ingrediente ${i + 1}`} disabled={i === 0} onClick={() => onAlterar((f) => mover(f.componentes, i, -1))} />
              <Button
                type="button"
                icon="pi pi-angle-down"
                text
                size="small"
                aria-label={`Descer ingrediente ${i + 1}`}
                disabled={i === formula.componentes.length - 1}
                onClick={() => onAlterar((f) => mover(f.componentes, i, 1))}
              />
              <Button
                type="button"
                icon="pi pi-copy"
                text
                size="small"
                aria-label={`Duplicar ingrediente ${i + 1}`}
                onClick={() => onAlterar((f) => void f.componentes.splice(i + 1, 0, { ...f.componentes[i], id: crypto.randomUUID() }))}
              />
              <Button
                type="button"
                icon="pi pi-minus-circle"
                text
                size="small"
                severity="danger"
                aria-label={`Remover ingrediente ${i + 1}`}
                onClick={async () => {
                  if ((c.nome.trim() || c.quantidade) && !(await pedirConfirmacao(`Remover “${c.nome || "este ingrediente"}” da fórmula?`, { aceitar: "Remover", rejeitar: "Cancelar" }))) return;
                  onAlterar((f) => void f.componentes.splice(i, 1));
                }}
              />
            </div>
          </div>
        ))}
        <Button type="button" icon="pi pi-plus" label="Ingrediente" text size="small" onClick={() => onAlterar((f) => void f.componentes.push(novoComponente()))} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Excipiente qsp</span>
          <InputText aria-label="Excipiente" value={formula.excipiente} onChange={(e) => onAlterar((f) => void (f.excipiente = e.target.value))} className="w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Apresentação</span>
          <InputText aria-label="Apresentação" value={formula.apresentacao} placeholder="Ex.: cápsulas, sachês" onChange={(e) => onAlterar((f) => void (f.apresentacao = e.target.value))} className="w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Dose</span>
          <InputText aria-label="Dose" value={formula.dose} placeholder="Ex.: 1 dose ao dia" onChange={(e) => onAlterar((f) => void (f.dose = e.target.value))} className="w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Posologia</span>
          <InputText aria-label="Posologia" value={formula.posologia} onChange={(e) => onAlterar((f) => void (f.posologia = e.target.value))} className="w-full" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Orientações para a farmácia</span>
          <InputTextarea aria-label="Orientações para a farmácia" value={formula.orientacoesFarmacia} rows={2} autoResize onChange={(e) => onAlterar((f) => void (f.orientacoesFarmacia = e.target.value))} className="w-full" />
        </label>
        {!modelo ? (
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700">Orientações para o paciente</span>
            <InputTextarea aria-label="Orientações para o paciente" value={formula.orientacoesPaciente} rows={2} autoResize onChange={(e) => onAlterar((f) => void (f.orientacoesPaciente = e.target.value))} className="w-full" />
          </label>
        ) : null}
        {!modelo ? (
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-semibold text-gray-700">Observação</span>
            <InputTextarea aria-label="Observação da fórmula" value={formula.observacao} rows={2} autoResize onChange={(e) => onAlterar((f) => void (f.observacao = e.target.value))} className="w-full" />
          </label>
        ) : null}
      </div>

      <section className="rounded-lg bg-gray-50 p-3">
        <p className="text-sm font-semibold text-gray-900">Quantidade para dispensação</p>
        <div className="mt-2 flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="mb-1 block text-xs text-gray-600">Unidades por dose</span>
            <CampoNumero ariaLabel="Unidades por dose" valor={formula.dispensacao.unidadesPorDose} maximo={1000} className="w-24" onChange={(v) => onAlterar((f) => void (f.dispensacao.unidadesPorDose = v))} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-gray-600">Doses por dia</span>
            <CampoNumero ariaLabel="Doses por dia" valor={formula.dispensacao.dosesPorDia} maximo={48} className="w-24" onChange={(v) => onAlterar((f) => void (f.dispensacao.dosesPorDia = v))} />
          </label>
          <label>
            <span className="mb-1 block text-xs text-gray-600">Dias</span>
            <CampoNumero ariaLabel="Dias de tratamento" valor={formula.dispensacao.dias} maximo={3650} className="w-24" onChange={(v) => onAlterar((f) => void (f.dispensacao.dias = v))} />
          </label>
        </div>
        <div className="mt-2 text-sm" role="status">
          {dispensacao.faltando.length ? (
            <p className="text-amber-800">Para calcular, informe: {dispensacao.faltando.join(", ")}.</p>
          ) : (
            <>
              {dispensacao.totalDeUnidades !== null ? (
                <p>
                  Total: <strong>{formatar(dispensacao.totalDeUnidades)} {formula.apresentacao.trim() || "unidades"}</strong>
                </p>
              ) : null}
              <ul className="mt-1 text-xs text-gray-700">
                {formula.componentes
                  .filter((c) => c.nome.trim())
                  .map((c) => {
                    const x = dispensacao.componentes.find((y) => y.id === c.id);
                    return (
                      <li key={c.id}>
                        {c.nome}: {x?.porDose !== null && x?.porDose !== undefined ? `${formatar(x.porDose)} ${x.unidade} por dose` : "—"}
                        {x?.total !== null && x?.total !== undefined ? ` · ${formatar(x.total)} ${x.unidade} no total` : ""}
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">{AVISO_DA_FORMULA}</p>
      </section>

      {pendencias.length ? (
        <ul className="list-inside list-disc rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {pendencias.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

"use client";

import { useParams } from "next/navigation";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import EditorDaBiblioteca from "@/components/nutricao/EditorDaBiblioteca";
import CampoNumero from "@/components/nutricao/editor/CampoNumero";
import { UNIDADES_DO_COMPONENTE, type DadosDoIngrediente } from "@/lib/nutricao/formula";

export default function IngredientePage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <EditorDaBiblioteca<Partial<DadosDoIngrediente>>
          key={id}
          tipo="ingredientes"
          campo="dados"
          id={id}
          titulo="Ingrediente"
          rotuloNome="Nome"
          voltarPara="/nutricao/configuracoes/formulas/ingredientes"
          rotuloVoltar="Voltar aos ingredientes"
        >
          {(d, alterar) => (
            <section className="cartao grid gap-3 p-4 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Dosagem de referência</span>
                <CampoNumero ariaLabel="Dosagem de referência" valor={d.dosagem ?? null} maximo={1_000_000} onChange={(v) => alterar((x) => void (x.dosagem = v))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Unidade</span>
                <Dropdown
                  aria-label="Unidade"
                  value={d.unidade ?? null}
                  options={UNIDADES_DO_COMPONENTE.map((u) => ({ label: u, value: u }))}
                  onChange={(e) => alterar((x) => void (x.unidade = e.value))}
                  placeholder="mg"
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Forma química / apresentação</span>
                <InputText aria-label="Forma" value={d.forma ?? ""} placeholder="Ex.: quelato, citrato" onChange={(e) => alterar((x) => void (x.forma = e.target.value))} className="w-full" />
              </label>
              <p className="text-xs text-gray-500 sm:col-span-3">A dosagem de referência só é sugerida ao escolher o ingrediente; não valida uso nem segurança.</p>
            </section>
          )}
        </EditorDaBiblioteca>
      </div>
    </main>
  );
}

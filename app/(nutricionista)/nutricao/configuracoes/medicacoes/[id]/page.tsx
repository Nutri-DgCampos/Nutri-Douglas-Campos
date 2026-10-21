"use client";

import { useParams } from "next/navigation";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import EditorDaBiblioteca from "@/components/nutricao/EditorDaBiblioteca";
import CampoNumero from "@/components/nutricao/editor/CampoNumero";
import { UNIDADES_DE_ATIVO, UNIDADES_DE_QUANTIDADE, type DadosDoMedicamento } from "@/lib/nutricao/medicacao";

export default function MedicamentoPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <EditorDaBiblioteca<Partial<DadosDoMedicamento>>
          key={id}
          tipo="medicamentos"
          campo="dados"
          id={id}
          titulo="Medicamento"
          rotuloNome="Nome comercial"
          voltarPara="/nutricao/configuracoes/medicacoes"
          rotuloVoltar="Voltar às medicações"
        >
          {(d, alterar) => (
            <section className="cartao grid gap-3 p-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Princípio ativo</span>
                <InputText aria-label="Princípio ativo" value={d.principioAtivo ?? ""} onChange={(e) => alterar((x) => void (x.principioAtivo = e.target.value))} className="w-full" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Apresentação</span>
                <InputText aria-label="Apresentação" value={d.apresentacao ?? ""} onChange={(e) => alterar((x) => void (x.apresentacao = e.target.value))} className="w-full" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Quantidade usada em</span>
                <Dropdown
                  aria-label="Unidade da quantidade"
                  value={d.unidadeQuantidade ?? null}
                  options={UNIDADES_DE_QUANTIDADE.map((u) => ({ label: u, value: u }))}
                  onChange={(e) => alterar((x) => void (x.unidadeQuantidade = e.value))}
                  placeholder="Unidade"
                  className="w-full"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Concentração (do rótulo)</span>
                <span className="flex items-center gap-1">
                  <CampoNumero ariaLabel="Concentração" valor={d.concentracao ?? null} maximo={1_000_000} className="w-28" onChange={(v) => alterar((x) => void (x.concentracao = v))} />
                  <Dropdown
                    aria-label="Unidade do princípio ativo"
                    value={d.unidadeAtivo ?? null}
                    options={UNIDADES_DE_ATIVO.map((u) => ({ label: u, value: u }))}
                    onChange={(e) => alterar((x) => void (x.unidadeAtivo = e.value))}
                    placeholder="mg"
                    className="w-24"
                  />
                  <span className="text-sm text-gray-600">/ {d.unidadeQuantidade ?? "…"}</span>
                </span>
              </label>
              <p className="text-xs text-gray-500 sm:col-span-2">
                Apresentações diferentes do mesmo princípio ativo devem ser cadastradas separadamente: a concentração não é presumida.
              </p>
            </section>
          )}
        </EditorDaBiblioteca>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { DURACOES, rotuloDaDuracao, textoDoPreco } from "@/lib/treinoContrato";

type Plano = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  duracao_dias: number;
  modalidades: string[];
  inclui_relatorio: boolean;
  arquivado_em: string | null;
};

type Formulario = { id: string | null; nome: string; descricao: string; preco: number | null; duracao: number | null; modalidades: string[]; relatorio: boolean };

const MODALIDADES = [
  { valor: "musculacao", rotulo: "Musculação" },
  { valor: "corrida", rotulo: "Corrida" },
  { valor: "ciclismo", rotulo: "Ciclismo" },
];

const VAZIO: Formulario = { id: null, nome: "", descricao: "", preco: null, duracao: 30, modalidades: ["musculacao"], relatorio: true };

async function enviar(url: string, metodo: string, corpo: unknown) {
  const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
  const dados = await r?.json().catch(() => null);
  if (!r?.ok) {
    avisar(dados?.erro ?? "Sem conexão. Tente de novo.", "error");
    return null;
  }
  return dados ?? {};
}

// Planos e preços do Treino (T8, respostas G1–G5): cada profissional cria os
// próprios planos, e a tolerância depois do vencimento é dele também. Mudar
// um plano não muda os contratos já feitos (eles guardam a cópia).
export default function PlanosDoTreinoPage() {
  const router = useRouter();
  const [dados, setDados] = useState<{ planos: Plano[]; tolerancia: number } | null | undefined>(undefined);
  const [form, setForm] = useState<Formulario | null>(null);
  const [tolerancia, setTolerancia] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/treino/planos", { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    setDados(d);
    setTolerancia(d?.tolerancia ?? null);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function salvarPlano() {
    if (!form) return;
    setSalvando(true);
    const corpo = {
      nome: form.nome,
      descricao: form.descricao,
      preco_centavos: form.preco === null ? null : Math.round(form.preco * 100),
      duracao_dias: form.duracao,
      modalidades: form.modalidades,
      inclui_relatorio: form.relatorio,
    };
    const ok = await enviar(form.id ? `/api/treino/planos/${form.id}` : "/api/treino/planos", form.id ? "PATCH" : "POST", corpo);
    setSalvando(false);
    if (!ok) return;
    avisar(form.id ? "Plano salvo. Contratos já feitos continuam com o valor combinado." : "Plano criado.", "success");
    setForm(null);
    void carregar();
  }

  async function arquivar(plano: Plano, arquivar: boolean) {
    if (arquivar && !(await pedirConfirmacao(`Arquivar o plano "${plano.nome}"? Ele deixa de ser oferecido, e os contratos já feitos não mudam.`, { aceitar: "Arquivar", rejeitar: "Cancelar" }))) return;
    if (await enviar(`/api/treino/planos/${plano.id}`, "PATCH", { acao: arquivar ? "arquivar" : "reativar" })) void carregar();
  }

  async function salvarTolerancia() {
    const d = await enviar("/api/treino/planos", "PUT", { tolerancia });
    if (d) {
      avisar("Tolerância salva. Vale para os contratos feitos daqui em diante.", "success");
      setDados((atual) => (atual ? { ...atual, tolerancia: d.tolerancia } : atual));
    }
  }

  const ativos = dados?.planos.filter((p) => !p.arquivado_em) ?? [];
  const arquivados = dados?.planos.filter((p) => p.arquivado_em) ?? [];

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl">
        <BotaoVoltar rotulo="Voltar para o Módulo de Treino" onClick={() => router.push("/treino")} />
        <CabecalhoPagina
          titulo="Planos e pagamentos"
          descricao="Seus planos do Treino, com preço e duração. Na ficha do aluno, você cria o contrato a partir de um plano e confirma o pagamento."
        />

        {dados === undefined ? (
          <Skeleton height="16rem" borderRadius="16px" className="mt-6" />
        ) : dados === null ? (
          <p className="cartao mt-6 p-6 text-center text-gray-600">Não foi possível carregar os planos.</p>
        ) : (
          <div className="mt-6 space-y-4">
            <section className="cartao p-5" aria-label="Planos">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold text-gray-900">Planos oferecidos</h2>
                <Button type="button" icon="pi pi-plus" label="Novo plano" onClick={() => setForm({ ...VAZIO })} />
              </div>
              {ativos.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Nenhum plano ainda. Crie o primeiro para registrar os pagamentos dos seus alunos.</p>
              ) : (
                <ul className="mt-3 divide-y divide-gray-100">
                  {ativos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900">{p.nome}</p>
                        <p className="text-sm text-gray-600">
                          {textoDoPreco(p.preco_centavos)} · {rotuloDaDuracao(p.duracao_dias)} ·{" "}
                          {p.modalidades.map((m) => MODALIDADES.find((x) => x.valor === m)?.rotulo ?? m).join(", ")}
                          {p.inclui_relatorio ? " · com relatório semanal" : ""}
                        </p>
                        {p.descricao ? <p className="mt-1 text-xs text-gray-500">{p.descricao}</p> : null}
                      </div>
                      <Button
                        type="button"
                        size="small"
                        outlined
                        icon="pi pi-pencil"
                        label="Editar"
                        onClick={() =>
                          setForm({
                            id: p.id,
                            nome: p.nome,
                            descricao: p.descricao ?? "",
                            preco: p.preco_centavos / 100,
                            duracao: p.duracao_dias,
                            modalidades: p.modalidades,
                            relatorio: p.inclui_relatorio,
                          })
                        }
                      />
                      <Button type="button" size="small" text icon="pi pi-inbox" label="Arquivar" onClick={() => arquivar(p, true)} />
                    </li>
                  ))}
                </ul>
              )}
              {arquivados.length ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-600">Arquivados ({arquivados.length})</summary>
                  <ul className="mt-2 divide-y divide-gray-100">
                    {arquivados.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 py-2 text-sm text-gray-600">
                        <span className="flex-1">
                          {p.nome} · {textoDoPreco(p.preco_centavos)}
                        </span>
                        <Button type="button" size="small" text icon="pi pi-replay" label="Reativar" onClick={() => arquivar(p, false)} />
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>

            <section className="cartao p-5" aria-label="Tolerância após o vencimento">
              <h2 className="font-bold text-gray-900">Tolerância após o vencimento</h2>
              <p className="mt-1 text-sm text-gray-600">
                Dias em que o aluno ainda usa o Treino depois do vencimento, sem o pagamento confirmado. Passado esse prazo, ele vê só o histórico e é
                orientado a falar com você. Nada é apagado. Vale para os contratos feitos daqui em diante.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold text-gray-700">Dias de tolerância</span>
                  <InputNumber value={tolerancia} onValueChange={(e) => setTolerancia(e.value ?? null)} min={0} max={60} showButtons inputClassName="w-20" aria-label="Dias de tolerância" />
                </label>
                <Button type="button" outlined icon="pi pi-check" label="Salvar" disabled={tolerancia === null || tolerancia === dados.tolerancia} onClick={salvarTolerancia} />
              </div>
            </section>
          </div>
        )}
      </div>

      <Dialog header={form?.id ? "Editar plano" : "Novo plano"} visible={form !== null} onHide={() => setForm(null)} className="w-full max-w-lg" modal>
        {form ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Nome do plano</span>
              <InputText value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full" placeholder="Ex.: Musculação mensal" aria-label="Nome do plano" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Preço</span>
                <InputNumber
                  value={form.preco}
                  onValueChange={(e) => setForm({ ...form, preco: e.value ?? null })}
                  mode="currency"
                  currency="BRL"
                  locale="pt-BR"
                  min={0}
                  className="w-full"
                  inputClassName="w-full"
                  aria-label="Preço"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Duração (dias)</span>
                <InputNumber value={form.duracao} onValueChange={(e) => setForm({ ...form, duracao: e.value ?? null })} min={1} max={730} className="w-full" inputClassName="w-full" aria-label="Duração em dias" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              {DURACOES.map((d) => (
                <Button key={d.dias} type="button" size="small" outlined={form.duracao !== d.dias} label={d.rotulo} onClick={() => setForm({ ...form, duracao: d.dias })} />
              ))}
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold text-gray-700">Modalidades</legend>
              <div className="flex flex-wrap gap-4">
                {MODALIDADES.map((m) => (
                  <label key={m.valor} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      inputId={`modalidade-${m.valor}`}
                      checked={form.modalidades.includes(m.valor)}
                      onChange={(e) =>
                        setForm({ ...form, modalidades: e.checked ? [...form.modalidades, m.valor] : form.modalidades.filter((x) => x !== m.valor) })
                      }
                    />
                    {m.rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox inputId="inclui-relatorio" checked={form.relatorio} onChange={(e) => setForm({ ...form, relatorio: Boolean(e.checked) })} />
              Inclui o relatório semanal
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Descrição (opcional)</span>
              <InputTextarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={2} className="w-full" aria-label="Descrição" />
            </label>
            {form.id ? <p className="text-xs text-gray-500">Contratos já feitos guardam o preço e a duração combinados e não mudam.</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setForm(null)} />
              <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvarPlano} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </main>
  );
}

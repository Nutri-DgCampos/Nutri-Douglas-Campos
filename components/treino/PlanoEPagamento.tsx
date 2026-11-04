"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Calendar } from "primereact/calendar";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { ROTULO_DA_SITUACAO, rotuloDaDuracao, textoDoPreco, vencimentoDe, type SituacaoDoContrato } from "@/lib/treinoContrato";
import { abrirDocumento } from "@/lib/visualizador";

type Contrato = {
  id: string;
  plano_nome: string;
  preco_centavos: number;
  inicio: string;
  vencimento: string;
  tolerancia_dias: number;
  tem_comprovante: boolean;
  comprovante_em: string | null;
  forma_pagamento: "comprovante" | "dinheiro" | null;
  confirmado_em: string | null;
  cancelado_em: string | null;
  observacao: string | null;
  situacao: SituacaoDoContrato;
};

type Plano = { id: string; nome: string; preco_centavos: number; duracao_dias: number };

type Dados = {
  hoje: string;
  bloqueado: boolean;
  outrosProfissionais: boolean;
  contratos: Contrato[];
  planos: Plano[];
  tolerancia: number;
  inicioSugerido: string;
  renovacoes: { id: string; plano_id: string | null; plano_nome: string | null; observacao: string | null; criada_em: string }[];
};

const COR: Record<SituacaoDoContrato, string> = {
  em_dia: "bg-green-100 text-green-800",
  futuro: "bg-green-100 text-green-800",
  em_tolerancia: "bg-amber-100 text-amber-900",
  aguardando_pagamento: "bg-amber-100 text-amber-900",
  comprovante_enviado: "bg-amber-100 text-amber-900",
  sem_pagamento: "bg-red-100 text-red-800",
  vencido: "bg-red-100 text-red-800",
  cancelado: "bg-gray-200 text-gray-700",
};

const data = (iso: string) => iso.split("-").reverse().join("/");
const paraIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function enviar(url: string, metodo: string, corpo: unknown) {
  const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
  const dados = await r?.json().catch(() => null);
  if (!r?.ok) {
    avisar(dados?.erro ?? "Sem conexão. Tente de novo.", "error");
    return null;
  }
  return dados ?? {};
}

// Plano e pagamento do aluno na ficha (T8): contratos do profissional
// conectado, confirmação do pagamento (comprovante ou dinheiro), pedidos de
// renovação e a situação do aluno (R9).
export default function PlanoEPagamento({ alunoId }: { alunoId: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [novo, setNovo] = useState<{ planoId: string | null; inicio: string; dinheiro: boolean; observacao: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/treino/alunos/${alunoId}/contratos`, { cache: "no-store" }).catch(() => null);
    setDados(r?.ok ? await r.json() : null);
  }, [alunoId]);

  useEffect(() => {
    fetch(`/api/treino/alunos/${alunoId}/contratos`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Dados>) : null))
      .then(setDados)
      .catch(() => setDados(null));
  }, [alunoId]);

  if (!dados) return null;

  const plano = dados.planos.find((p) => p.id === novo?.planoId) ?? null;

  async function criar() {
    if (!novo) return;
    setSalvando(true);
    const d = await enviar(`/api/treino/alunos/${alunoId}/contratos`, "POST", {
      planoId: novo.planoId,
      inicio: novo.inicio,
      pagoEmDinheiro: novo.dinheiro,
      observacao: novo.observacao,
    });
    setSalvando(false);
    if (!d) return;
    setDados(d);
    setNovo(null);
    avisar(novo.dinheiro ? "Contrato criado com o pagamento em dinheiro confirmado." : "Contrato criado. Confirme o pagamento quando receber.", "success");
  }

  async function agir(contrato: Contrato, acao: string, pergunta?: string) {
    if (pergunta && !(await pedirConfirmacao(pergunta, { aceitar: "Confirmar", rejeitar: "Voltar" }))) return;
    if (await enviar(`/api/treino/contratos/${contrato.id}`, "PATCH", { acao })) {
      avisar("Salvo.", "success");
      void carregar();
    }
  }

  return (
    <section className="cartao p-5" aria-label="Plano e pagamento">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Plano e pagamento</h2>
          <p className="mt-1 text-sm text-gray-500">
            {dados.bloqueado
              ? "Plano vencido além da tolerância: até a renovação, o aluno não vê o seu treino nem registra nas suas sessões, e você não recebe os alertas de desconforto dele."
              : dados.contratos.length || dados.outrosProfissionais
                ? "O aluno usa o Treino normalmente."
                : "Sem contrato do Treino: o aluno usa o Treino sem controle de pagamento."}
          </p>
        </div>
        {dados.planos.length ? (
          <Button
            type="button"
            size="small"
            icon="pi pi-plus"
            label={dados.contratos.length ? "Renovar" : "Novo contrato"}
            onClick={() => setNovo({ planoId: dados.renovacoes[0]?.plano_id ?? dados.planos[0].id, inicio: dados.inicioSugerido, dinheiro: false, observacao: "" })}
          />
        ) : (
          <Link href="/treino/planos" className="p-button p-button-outlined p-button-sm flex gap-2 font-semibold">
            <i className="pi pi-wallet" aria-hidden />
            Criar um plano
          </Link>
        )}
      </div>

      {dados.renovacoes.map((r) => (
        <p key={r.id} className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <i className="pi pi-refresh mr-2" aria-hidden />
          O aluno pediu a renovação{r.plano_nome ? `: ${r.plano_nome}` : ""} em {new Date(r.criada_em).toLocaleDateString("pt-BR")}.
          {r.observacao ? ` “${r.observacao}”` : ""}
        </p>
      ))}

      {dados.contratos.length ? (
        <ul className="mt-3 divide-y divide-gray-100">
          {dados.contratos.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-gray-900">{c.plano_nome}</span>
                <span className="text-sm text-gray-600">
                  {textoDoPreco(c.preco_centavos)} · {data(c.inicio)} a {data(c.vencimento)}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${COR[c.situacao]}`}>{ROTULO_DA_SITUACAO[c.situacao]}</span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Tolerância de {c.tolerancia_dias} {c.tolerancia_dias === 1 ? "dia" : "dias"}.
                {c.confirmado_em
                  ? ` Pagamento confirmado em ${new Date(c.confirmado_em).toLocaleDateString("pt-BR")} (${c.forma_pagamento === "dinheiro" ? "dinheiro" : "comprovante"}).`
                  : c.comprovante_em
                    ? ` Comprovante anexado em ${new Date(c.comprovante_em).toLocaleDateString("pt-BR")}.`
                    : ""}
                {c.observacao ? ` ${c.observacao}` : ""}
              </p>
              {c.cancelado_em ? null : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {c.tem_comprovante ? (
                    <Button type="button" size="small" outlined icon="pi pi-file" label="Ver comprovante" onClick={() => abrirDocumento(`/api/treino/contratos/${c.id}/comprovante`, `Comprovante — ${c.plano_nome}`)} />
                  ) : null}
                  {c.confirmado_em ? (
                    <Button type="button" size="small" text icon="pi pi-undo" label="Desfazer confirmação" onClick={() => agir(c, "desfazer_confirmacao", "Desfazer a confirmação deste pagamento?")} />
                  ) : (
                    <>
                      {c.tem_comprovante ? (
                        <Button type="button" size="small" icon="pi pi-check" label="Confirmar pelo comprovante" onClick={() => agir(c, "confirmar_comprovante", "Você conferiu o comprovante e recebeu o valor?")} />
                      ) : null}
                      <Button type="button" size="small" outlined icon="pi pi-money-bill" label="Recebi em dinheiro" onClick={() => agir(c, "confirmar_dinheiro", "Confirmar que recebeu este pagamento em dinheiro?")} />
                      <Button type="button" size="small" text severity="danger" icon="pi pi-times" label="Cancelar contrato" onClick={() => agir(c, "cancelar", "Cancelar este contrato? Ele deixa de valer, e o histórico fica guardado.")} />
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog header="Novo contrato" visible={novo !== null} onHide={() => setNovo(null)} className="w-full max-w-lg" modal>
        {novo ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Plano</span>
              <Dropdown
                value={novo.planoId}
                options={dados.planos.map((p) => ({ label: `${p.nome} · ${textoDoPreco(p.preco_centavos)} · ${rotuloDaDuracao(p.duracao_dias)}`, value: p.id }))}
                onChange={(e) => setNovo({ ...novo, planoId: e.value })}
                className="w-full"
                aria-label="Plano"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Início</span>
              <Calendar
                value={new Date(`${novo.inicio}T12:00:00`)}
                onChange={(e) => e.value instanceof Date && setNovo({ ...novo, inicio: paraIso(e.value) })}
                dateFormat="dd/mm/yy"
                className="w-full"
                aria-label="Início"
              />
              {plano ? <span className="mt-1 block text-xs text-gray-500">Vence em {data(vencimentoDe(novo.inicio, plano.duracao_dias))}. Tolerância de {dados.tolerancia} dias.</span> : null}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox inputId="pago-em-dinheiro" checked={novo.dinheiro} onChange={(e) => setNovo({ ...novo, dinheiro: Boolean(e.checked) })} />
              Já recebi em dinheiro (confirma o pagamento agora)
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Observação (opcional)</span>
              <InputText value={novo.observacao} onChange={(e) => setNovo({ ...novo, observacao: e.target.value })} className="w-full" aria-label="Observação" />
            </label>
            <p className="text-xs text-gray-500">Sem confirmação, o aluno anexa o comprovante pela Área do Paciente, e você confirma aqui.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setNovo(null)} />
              <Button type="button" label="Criar contrato" icon="pi pi-check" loading={salvando} disabled={!novo.planoId} onClick={criar} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

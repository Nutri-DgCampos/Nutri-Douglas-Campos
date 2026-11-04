"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { avisar } from "@/lib/avisos";
import { ROTULO_DA_SITUACAO, rotuloDaDuracao, textoDoPreco, type SituacaoDoContrato } from "@/lib/treinoContrato";

type Contrato = {
  id: string;
  profissional: string;
  plano_nome: string;
  preco_centavos: number;
  inicio: string;
  vencimento: string;
  tolerancia_dias: number;
  tem_comprovante: boolean;
  confirmado_em: string | null;
  situacao: SituacaoDoContrato;
};

type Plano = { id: string; nome: string; preco_centavos: number; duracao_dias: number; descricao: string | null };

export type PlanoNaTela = {
  hoje: string;
  bloqueado: boolean;
  mensagem: string | null;
  contratos: Contrato[];
  planos: Plano[];
  pedidos: { id: string; plano_nome: string | null; criada_em: string }[];
};

const data = (iso: string) => iso.split("-").reverse().join("/");

// Plano do Treino na Área do Paciente (T8): situação do contrato, comprovante
// e pedido de renovação. Plano vencido além da tolerância (R9): o aviso para
// falar com o profissional; o histórico continua. Sem contrato, não aparece.
export default function PlanoDoAluno() {
  const [plano, setPlano] = useState<PlanoNaTela | null>(null);
  const [pedido, setPedido] = useState<{ planoId: string | null; observacao: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);
  const contratoDoComprovante = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/area-paciente/treino/plano", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PlanoNaTela>) : null))
      .then(setPlano)
      .catch(() => undefined); // Sem internet: o cartão não aparece.
  }, []);

  if (!plano || !plano.contratos.length) return null;

  // Contrato atual: o que vale hoje, senão o mais recente.
  const atual = plano.contratos.find((c) => c.inicio <= plano.hoje && plano.hoje <= c.vencimento) ?? plano.contratos[0];
  const aPagar = plano.contratos.filter((c) => !c.confirmado_em && c.situacao !== "vencido");
  const pedidoPendente = plano.pedidos[0] ?? null;

  async function enviarComprovante(arquivoEscolhido: File) {
    const contratoId = contratoDoComprovante.current;
    if (!contratoId) return;
    const dados = new FormData();
    dados.append("arquivo", arquivoEscolhido);
    dados.append("contratoId", contratoId);
    setEnviando(true);
    const r = await fetch("/api/area-paciente/treino/plano/comprovante", { method: "POST", body: dados }).catch(() => null);
    setEnviando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(d?.erro ?? "Sem conexão. Tente de novo quando a internet voltar.", "error");
      return;
    }
    setPlano(d);
    avisar("Comprovante enviado. O seu profissional confere e confirma o pagamento.", "success");
  }

  async function pedirRenovacao() {
    if (!pedido) return;
    setEnviando(true);
    const r = await fetch("/api/area-paciente/treino/plano", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    }).catch(() => null);
    setEnviando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(d?.erro ?? "Sem conexão. Tente de novo quando a internet voltar.", "error");
      return;
    }
    setPlano(d);
    setPedido(null);
    avisar("Pedido enviado ao seu profissional.", "success");
  }

  return (
    <section className={`cartao p-4 sm:p-5 ${plano.bloqueado ? "border-2 border-red-300" : ""}`} aria-label="Meu plano do Treino">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">Meu plano do Treino</h2>
          <p className="text-sm text-gray-600">
            {atual.plano_nome} · {atual.profissional} · vence em {data(atual.vencimento)}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">{ROTULO_DA_SITUACAO[atual.situacao]}</span>
      </div>

      {plano.bloqueado && plano.mensagem ? (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800">
          {plano.mensagem}
        </p>
      ) : null}

      {aPagar.map((c) => (
        <div key={c.id} className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            {c.plano_nome}: {textoDoPreco(c.preco_centavos)}, de {data(c.inicio)} a {data(c.vencimento)}.{" "}
            {c.tem_comprovante ? "Comprovante enviado, aguardando a confirmação do profissional." : "Pagamento ainda não confirmado."}
          </p>
          <Button
            type="button"
            size="small"
            outlined
            className="mt-2"
            icon="pi pi-paperclip"
            label={c.tem_comprovante ? "Trocar comprovante" : "Anexar comprovante"}
            loading={enviando}
            onClick={() => {
              contratoDoComprovante.current = c.id;
              arquivo.current?.click();
            }}
          />
        </div>
      ))}

      <input
        ref={arquivo}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        aria-label="Arquivo do comprovante"
        onChange={(e) => {
          const escolhido = e.target.files?.[0];
          e.target.value = "";
          if (escolhido) void enviarComprovante(escolhido);
        }}
      />

      {pedidoPendente ? (
        <p className="mt-3 text-sm text-gray-600">
          <i className="pi pi-clock mr-2" aria-hidden />
          Renovação pedida em {new Date(pedidoPendente.criada_em).toLocaleDateString("pt-BR")}
          {pedidoPendente.plano_nome ? ` (${pedidoPendente.plano_nome})` : ""}. Aguarde o seu profissional.
        </p>
      ) : plano.planos.length ? (
        <Button
          type="button"
          size="small"
          className="mt-3"
          icon="pi pi-refresh"
          label="Pedir renovação"
          outlined={!plano.bloqueado}
          onClick={() => setPedido({ planoId: plano.planos[0].id, observacao: "" })}
        />
      ) : null}

      <Dialog header="Pedir renovação" visible={pedido !== null} onHide={() => setPedido(null)} className="w-full max-w-md" modal>
        {pedido ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Plano</span>
              <Dropdown
                value={pedido.planoId}
                options={plano.planos.map((p) => ({ label: `${p.nome} · ${textoDoPreco(p.preco_centavos)} · ${rotuloDaDuracao(p.duracao_dias)}`, value: p.id }))}
                onChange={(e) => setPedido({ ...pedido, planoId: e.value })}
                className="w-full"
                aria-label="Plano"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Recado (opcional)</span>
              <InputText value={pedido.observacao} maxLength={500} onChange={(e) => setPedido({ ...pedido, observacao: e.target.value })} className="w-full" aria-label="Recado" />
            </label>
            <p className="text-xs text-gray-500">O pedido avisa o seu profissional. O plano volta a valer quando ele confirmar.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setPedido(null)} />
              <Button type="button" label="Enviar pedido" icon="pi pi-send" loading={enviando} disabled={!pedido.planoId} onClick={pedirRenovacao} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

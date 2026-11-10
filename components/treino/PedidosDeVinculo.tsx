"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Recebido = { id: string; mensagem: string; criado_em: string; aluno: string; solicitante: string; solicitante_cref: string | null };
type Enviado = { id: string; status: "pendente" | "aprovado" | "recusado"; email_informado: string; criado_em: string; decidido_em: string | null; aluno: string | null };

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const SITUACAO: Record<Enviado["status"], { rotulo: string; cor: "warning" | "success" | "danger" }> = {
  pendente: { rotulo: "Aguardando", cor: "warning" },
  aprovado: { rotulo: "Aprovado", cor: "success" },
  recusado: { rotulo: "Recusado", cor: "danger" },
};

// Pedidos de vínculo (SPEC de correções 10/11, item 003): quem cadastrou o
// aluno (ou o nutricionista, para paciente da clínica) aprova ou recusa; quem
// pediu acompanha a situação. Só aparece quando há algum pedido.
export default function PedidosDeVinculo({ onAprovado }: { onAprovado?: () => void }) {
  const [dados, setDados] = useState<{ recebidos: Recebido[]; enviados: Enviado[] } | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/treino/pedidos-vinculo", { cache: "no-store" }).catch(() => null);
    setDados(r?.ok ? await r.json() : null);
  }, []);

  useEffect(() => {
    fetch("/api/treino/pedidos-vinculo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDados)
      .catch(() => setDados(null));
  }, []);

  async function decidir(p: Recebido, acao: "aprovar" | "recusar") {
    const pergunta =
      acao === "aprovar"
        ? `Aprovar o vínculo de ${p.solicitante} com ${p.aluno}? Ele passa a acompanhar o Treino do aluno. O cadastro, os outros vínculos, planos e pagamentos não mudam.`
        : `Recusar o pedido de ${p.solicitante}? Nada muda no cadastro do aluno.`;
    if (!(await pedirConfirmacao(pergunta, { aceitar: acao === "aprovar" ? "Aprovar" : "Recusar", rejeitar: "Cancelar" }))) return;
    setDecidindo(p.id);
    const r = await fetch(`/api/treino/pedidos-vinculo/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    }).catch(() => null);
    setDecidindo(null);
    if (!r?.ok) return avisar((await r?.json().catch(() => null))?.erro ?? "Não foi possível concluir.", "error");
    avisar(acao === "aprovar" ? "Vínculo aprovado." : "Pedido recusado.", "success");
    void carregar();
    if (acao === "aprovar") onAprovado?.();
  }

  if (!dados || (!dados.recebidos.length && !dados.enviados.length)) return null;

  return (
    <section className="cartao p-5" aria-label="Pedidos de vínculo">
      <h2 className="font-bold text-gray-900">Pedidos de vínculo</h2>
      {dados.recebidos.length ? (
        <ul className="mt-3 space-y-3">
          {dados.recebidos.map((p) => (
            <li key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-gray-900">
                <strong>{p.solicitante}</strong>
                {p.solicitante_cref ? ` (CREF ${p.solicitante_cref})` : ""} pede vínculo com <strong>{p.aluno}</strong> · {data(p.criado_em)}
              </p>
              {p.mensagem ? <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">“{p.mensagem}”</p> : null}
              <div className="mt-2 flex gap-2">
                <Button type="button" size="small" icon="pi pi-check" label="Aprovar" loading={decidindo === p.id} onClick={() => decidir(p, "aprovar")} />
                <Button type="button" size="small" outlined severity="danger" icon="pi pi-times" label="Recusar" disabled={decidindo === p.id} onClick={() => decidir(p, "recusar")} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {dados.enviados.length ? (
        <div className="mt-3">
          <p className="text-sm font-semibold text-gray-700">Seus pedidos</p>
          <ul className="mt-1 divide-y divide-gray-100 text-sm">
            {dados.enviados.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 break-all text-gray-700">
                  {p.aluno ?? p.email_informado} · pedido em {data(p.criado_em)}
                </span>
                <Tag value={SITUACAO[p.status].rotulo} severity={SITUACAO[p.status].cor} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

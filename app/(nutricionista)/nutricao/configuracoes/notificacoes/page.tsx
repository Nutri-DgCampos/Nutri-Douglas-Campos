"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputSwitch } from "primereact/inputswitch";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import AtivarAlertas from "@/components/treino/AtivarAlertas";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Aparelho = { id: string; descricao: string | null; ativo: boolean; criado_em: string; atualizado_em: string; este: boolean };

async function endpointDesteAparelho() {
  try {
    if (!("serviceWorker" in navigator)) return null;
    const inscricao = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    return inscricao?.endpoint ?? null;
  } catch {
    return null;
  }
}

// Configurações → Notificações: aparelhos que recebem o push dos avisos.
// Pausar ou remover um aparelho não apaga nada do sino.
export default function NotificacoesPage() {
  const router = useRouter();
  const [aparelhos, setAparelhos] = useState<Aparelho[] | null>(null);

  const buscar = useCallback(async () => {
    const endpoint = await endpointDesteAparelho();
    const r = await fetch(`/api/avisos/aparelhos${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ""}`, { cache: "no-store" });
    return r.ok ? ((await r.json()).aparelhos as Aparelho[]) : [];
  }, []);
  const carregar = useCallback(async () => setAparelhos(await buscar()), [buscar]);

  useEffect(() => {
    buscar()
      .then(setAparelhos)
      .catch(() => setAparelhos([]));
  }, [buscar]);

  async function alternar(aparelho: Aparelho) {
    const r = await fetch("/api/avisos/aparelhos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: aparelho.id, ativo: !aparelho.ativo }),
    });
    if (!r.ok) avisar("Não foi possível alterar o aparelho.", "error");
    await carregar();
  }

  async function remover(aparelho: Aparelho) {
    if (!(await pedirConfirmacao(`Remover "${aparelho.descricao ?? "Aparelho"}"? Ele deixa de receber notificações. O histórico do sino não muda.`))) return;
    const r = await fetch(`/api/avisos/aparelhos?id=${aparelho.id}`, { method: "DELETE" });
    if (!r.ok) avisar("Não foi possível remover o aparelho.", "error");
    else avisar("Aparelho removido.", "success");
    await carregar();
  }

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <BotaoVoltar rotulo="Voltar às configurações" onClick={() => router.push("/nutricao/configuracoes")} />
        <CabecalhoPagina
          titulo="Notificações"
          descricao="Avisos quando o paciente envia a anamnese, o relatório nutricional, exames ou pede a renovação do plano."
        />

        <section className="cartao space-y-3 p-5">
          <h2 className="font-bold text-gray-900">Este aparelho</h2>
          <p className="text-sm text-gray-600">
            Para receber as notificações mesmo com o sistema fechado, autorize este navegador ou celular. O navegador vai pedir a
            sua permissão. A entrega depende do aparelho, do sistema e do navegador. Sem permissão, os avisos continuam no sino.
          </p>
          <AtivarAlertas onAtivado={carregar} />
        </section>

        <section className="cartao p-5" aria-label="Aparelhos cadastrados">
          <h2 className="font-bold text-gray-900">Aparelhos cadastrados</h2>
          {aparelhos === null ? (
            <Skeleton height="4rem" className="mt-3" />
          ) : aparelhos.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Nenhum aparelho recebe notificações. Os avisos continuam no sino.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {aparelhos.map((aparelho) => (
                <li key={aparelho.id} className="flex flex-wrap items-center gap-3 py-3">
                  <i className={`pi ${/Android|iPhone/.test(aparelho.descricao ?? "") ? "pi-mobile" : "pi-desktop"} text-lg text-primary-700`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900">
                      {aparelho.descricao ?? "Aparelho"}
                      {aparelho.este ? <span className="ml-2 text-xs font-semibold text-primary-700">este aparelho</span> : null}
                    </span>
                    <span className="block text-xs text-gray-500">
                      Cadastrado em {new Date(aparelho.criado_em).toLocaleDateString("pt-BR")}
                      {aparelho.ativo ? "" : " · pausado"}
                    </span>
                  </span>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <InputSwitch checked={aparelho.ativo} onChange={() => alternar(aparelho)} aria-label={`Receber notificações em ${aparelho.descricao ?? "aparelho"}`} />
                    {aparelho.ativo ? "Recebe" : "Pausado"}
                  </label>
                  <Button type="button" text size="small" severity="danger" icon="pi pi-trash" aria-label="Remover aparelho" onClick={() => remover(aparelho)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { avisar } from "@/lib/avisos";

// O profissional ativa, neste navegador ou celular, os alertas imediatos
// (Treino: relato de desconforto; Nutrição: avisos do sino). Mesmo service
// worker e chaves do app. A permissão só é pedida no clique.

function chaveVapid(chave: string): Uint8Array<ArrayBuffer> {
  const base64 = (chave + "=".repeat((4 - (chave.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const dados = atob(base64);
  const resultado = new Uint8Array(new ArrayBuffer(dados.length));
  for (let i = 0; i < dados.length; i++) resultado[i] = dados.charCodeAt(i);
  return resultado;
}

function suportado() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

export default function AtivarAlertas({ onAtivado }: { onAtivado?: () => void } = {}) {
  const [estado, setEstado] = useState<"verificando" | "ativo" | "inativo" | "sem_suporte">("verificando");
  const [ativando, setAtivando] = useState(false);

  useEffect(() => {
    async function verificar() {
      if (!suportado()) return "sem_suporte" as const;
      if (Notification.permission !== "granted") return "inativo" as const;
      const inscricao = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (!inscricao) return "inativo" as const;
      const r = await fetch(`/api/treino/push?endpoint=${encodeURIComponent(inscricao.endpoint)}`, { cache: "no-store" });
      return r.ok && (await r.json()).inscrito ? ("ativo" as const) : ("inativo" as const);
    }
    verificar()
      .then(setEstado)
      .catch(() => setEstado("inativo"));
  }, []);

  async function ativar() {
    setAtivando(true);
    try {
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) {
        avisar("A chave pública das notificações não foi configurada.", "error");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        avisar("As notificações não foram autorizadas neste navegador.", "warn");
        return;
      }
      const registro = await navigator.serviceWorker.ready;
      const inscricao =
        (await registro.pushManager.getSubscription()) ??
        (await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveVapid(chave) }));
      const dados = inscricao.toJSON();
      const r = await fetch("/api/treino/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: dados.endpoint, p256dh: dados.keys?.p256dh, auth: dados.keys?.auth }),
      });
      if (!r.ok) {
        avisar("Não foi possível cadastrar este aparelho.", "error");
        return;
      }
      setEstado("ativo");
      avisar("Alertas ativados neste aparelho.", "success");
      onAtivado?.();
    } catch {
      avisar("Não foi possível ativar os alertas.", "error");
    } finally {
      setAtivando(false);
    }
  }

  if (estado === "verificando") return null;
  if (estado === "ativo")
    return (
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <i className="pi pi-bell text-primary-700" aria-hidden /> Alertas imediatos ativos neste aparelho.
      </p>
    );
  if (estado === "sem_suporte")
    return <p className="text-sm text-gray-500">Este navegador não recebe alertas. Os relatos ficam sempre listados aqui.</p>;
  return (
    <Button
      type="button"
      outlined
      size="small"
      icon="pi pi-bell"
      label="Ativar alertas neste aparelho"
      loading={ativando}
      onClick={ativar}
    />
  );
}

"use client";

import { useSyncExternalStore } from "react";

// Instalação do aplicativo (PWA).
//
// O Chrome e o Edge avisam que o site pode ser instalado com o evento
// "beforeinstallprompt", que chega uma única vez, logo na carga da página.
// Ele é guardado aqui para o aviso "Instalar o aplicativo" usar quando o
// paciente tocar no botão. No iPhone não existe esse evento: a instalação é
// pelo menu Compartilhar → "Adicionar à Tela de Início".
//
// Samsung Internet (04/11/2026): o app que ele gera ao instalar é feito para
// uma versão antiga do Android, e o Play Protect do Android 14 em diante
// bloqueia ("App de risco bloqueado"). Nesse navegador o aviso orienta a
// instalar pelo Chrome, com um link que abre a mesma página no Chrome.

type EventoDeInstalacao = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let convite: EventoDeInstalacao | null = null;
let instalado = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((ouvir) => ouvir());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (evento) => {
    // Sem isso o navegador pode mostrar a própria barra e consumir o convite.
    evento.preventDefault();
    convite = evento as EventoDeInstalacao;
    avisar();
  });
  window.addEventListener("appinstalled", () => {
    convite = null;
    instalado = true;
    avisar();
  });
}

export type SituacaoDaInstalacao = "instalado" | "pode-instalar" | "samsung" | "ios" | "indisponivel";

export function ehSamsungInternet(agente: string) {
  return /SamsungBrowser\//i.test(agente);
}

// Link que abre o endereço no Chrome do Android; sem o Chrome, a loja abre
// na página dele.
export function linkParaChrome(endereco: string) {
  const url = new URL(endereco);
  const loja = "https://play.google.com/store/apps/details?id=com.android.chrome";
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(":", "")};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(loja)};end`;
}

function situacao(): SituacaoDaInstalacao {
  if (typeof window === "undefined") return "indisponivel";
  const aberto =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (instalado || aberto) return "instalado";
  // Antes do convite: o Samsung Internet também oferece instalar.
  if (ehSamsungInternet(navigator.userAgent)) return "samsung";
  if (convite) return "pode-instalar";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "indisponivel";
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

export function useSituacaoDaInstalacao() {
  return useSyncExternalStore(assinar, situacao, () => "indisponivel" as const);
}

// Abre a janela de instalação do navegador. Devolve true se aceita.
export async function instalar() {
  if (!convite) return false;
  const evento = convite;
  convite = null;
  await evento.prompt();
  const escolha = await evento.userChoice;
  avisar();
  return escolha.outcome === "accepted";
}

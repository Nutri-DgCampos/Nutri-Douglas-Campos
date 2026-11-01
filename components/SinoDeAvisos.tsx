"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OverlayPanel } from "primereact/overlaypanel";

type Aviso = { id: string; tipo: string; titulo: string; corpo: string; quantidade: number; criada_em: string; lido_em: string | null };

const ICONE: Record<string, string> = {
  anamnese: "pi-file-edit",
  relatorio: "pi-chart-bar",
  exames: "pi-heart",
  renovacao: "pi-refresh",
  desconforto: "pi-exclamation-triangle",
};

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Sino de avisos do nutricionista: histórico e contador de não lidos. Abrir o
// sino não marca nada como lido; clicar em um aviso abre o conteúdo e marca
// só aquele (em /avisos/[id]). O estado vem do servidor e vale em todos os
// aparelhos; a contagem é atualizada a cada minuto e ao voltar para a janela.
export default function SinoDeAvisos({ variante }: { variante: "barra" | "menu" }) {
  const painel = useRef<OverlayPanel>(null);
  const [dados, setDados] = useState<{ avisos: Aviso[]; naoLidos: number } | null>(null);

  const atualizar = useCallback(() => {
    fetch("/api/avisos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDados(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    atualizar();
    const intervalo = setInterval(atualizar, 60_000);
    window.addEventListener("focus", atualizar);
    return () => {
      clearInterval(intervalo);
      window.removeEventListener("focus", atualizar);
    };
  }, [atualizar]);

  const naoLidos = dados?.naoLidos ?? 0;
  const contador = naoLidos > 99 ? "99+" : String(naoLidos);
  const rotulo = naoLidos ? `Notificações, ${naoLidos} não ${naoLidos === 1 ? "lida" : "lidas"}` : "Notificações";

  function abrir(evento: React.MouseEvent) {
    atualizar();
    painel.current?.toggle(evento);
  }

  return (
    <>
      {variante === "barra" ? (
        <button
          type="button"
          onClick={abrir}
          aria-label={rotulo}
          aria-haspopup="dialog"
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10"
        >
          <i className="pi pi-bell text-lg" aria-hidden />
          {naoLidos ? (
            <span className="absolute right-1 top-1 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white">{contador}</span>
          ) : null}
        </button>
      ) : (
        <button type="button" onClick={abrir} aria-label={rotulo} aria-haspopup="dialog" className="menu-lateral__item">
          <i className="pi pi-bell" aria-hidden />
          Notificações
          {naoLidos ? (
            <span className="ml-auto min-w-6 rounded-full bg-red-600 px-1.5 text-center text-xs font-bold leading-6 text-white">{contador}</span>
          ) : null}
        </button>
      )}

      <OverlayPanel ref={painel} className="w-[24rem] max-w-[calc(100vw-1rem)]" aria-label="Notificações">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 pb-2">
          <p className="font-bold text-gray-900">Notificações</p>
          <Link
            href="/nutricao/configuracoes/notificacoes"
            className="text-xs font-semibold text-primary-700 hover:underline"
            onClick={() => painel.current?.hide()}
          >
            Configurar
          </Link>
        </div>
        {!dados ? (
          <p className="py-4 text-sm text-gray-500">Carregando...</p>
        ) : dados.avisos.length === 0 ? (
          <p className="py-4 text-sm text-gray-500">Nenhuma notificação ainda.</p>
        ) : (
          <ul className="-mx-2 max-h-[60vh] overflow-y-auto">
            {dados.avisos.map((aviso) => (
              <li key={aviso.id}>
                <a
                  href={`/avisos/${aviso.id}`}
                  className={`flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-primary-50 ${aviso.lido_em ? "" : "bg-primary-50/60"}`}
                >
                  <i className={`pi ${ICONE[aviso.tipo] ?? "pi-bell"} mt-1 text-primary-700`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${aviso.lido_em ? "text-gray-700" : "font-bold text-gray-900"}`}>{aviso.titulo}</span>
                    <span className="block text-sm text-gray-600">{aviso.corpo}</span>
                    <span className="block text-xs text-gray-500">{quando(aviso.criada_em)}</span>
                  </span>
                  {aviso.lido_em ? null : <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" aria-label="Não lida" />}
                </a>
              </li>
            ))}
          </ul>
        )}
      </OverlayPanel>
    </>
  );
}

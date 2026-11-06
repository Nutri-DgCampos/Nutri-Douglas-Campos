"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "primereact/button";
import { ajustar, descansoValido, iniciar, mmss, pausar, reiniciar, restante, retomar, rodando, terminou, type Cronometro } from "@/lib/cronometro";

// Cronômetro regressivo de descanso no "Meu treino" (SPEC complementar
// 06/11, item 3). Um por vez na tela: iniciar outro substitui o anterior.
// Não muda a prescrição, não conclui séries e não grava nada. Ao chegar a
// zero: aviso na tela e, se o aparelho e o navegador permitirem, uma
// vibração curta (o iPhone/Safari não vibra; com a tela bloqueada ou em
// segundo plano, o navegador pode pausar a página).

const CHAVE_VIBRAR = "treino:descanso-vibrar";

let atual: Cronometro | null = null;
let avisadoEm: string | null = null; // evita vibrar duas vezes na mesma contagem
const ouvintes = new Set<() => void>();
const definir = (c: Cronometro | null) => {
  atual = c;
  avisadoEm = null;
  ouvintes.forEach((o) => o());
};
const assinar = (o: () => void) => {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
};

function lerPreferencia() {
  try {
    return localStorage.getItem(CHAVE_VIBRAR) !== "nao";
  } catch {
    return true;
  }
}

export default function CronometroDeDescanso({ chave, descansoSegundos }: { chave: string; descansoSegundos: number | null | undefined }) {
  const cronometro = useSyncExternalStore(assinar, () => atual, () => null);
  const [agora, setAgora] = useState(() => Date.now());
  const [vibrar, setVibrar] = useState(lerPreferencia);
  const meu = cronometro?.chave === chave ? cronometro : null;
  const segundos = descansoValido(descansoSegundos);
  const ativo = Boolean(meu && rodando(meu, agora));

  // Atualiza a tela enquanto conta e ao voltar para a aba.
  useEffect(() => {
    if (!ativo) return;
    const intervalo = window.setInterval(() => setAgora(Date.now()), 250);
    const aoVoltar = () => setAgora(Date.now());
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [ativo]);

  // Chegou a zero: uma vibração curta, uma vez, se houver suporte.
  useEffect(() => {
    if (!meu || meu.fimEm === null || !terminou(meu, agora) || avisadoEm === `${meu.chave}:${meu.fimEm}`) return;
    avisadoEm = `${meu.chave}:${meu.fimEm}`;
    if (vibrar && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate(300);
      } catch {
        // Sem permissão: fica só o aviso na tela.
      }
    }
  }, [meu, agora, vibrar]);

  function alternarVibracao() {
    const novo = !vibrar;
    setVibrar(novo);
    try {
      localStorage.setItem(CHAVE_VIBRAR, novo ? "sim" : "nao");
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
  }

  const acao = (f: (c: Cronometro, t: number) => Cronometro) => {
    const t = Date.now();
    setAgora(t);
    if (meu) definir(f(meu, t));
  };

  if (!segundos) {
    return <p className="mt-2 text-xs text-gray-500">Sem descanso prescrito para este exercício: o cronômetro não se aplica.</p>;
  }

  if (!meu) {
    return (
      <Button
        type="button"
        size="small"
        text
        icon="pi pi-stopwatch"
        className="mt-1"
        label={`Iniciar descanso (${mmss(segundos * 1000)})`}
        onClick={() => {
          const t = Date.now();
          setAgora(t);
          definir(iniciar(chave, segundos, t));
        }}
      />
    );
  }

  const resta = restante(meu, agora);
  const acabou = resta === 0;
  const pausado = meu.fimEm === null && !acabou;

  return (
    <div
      role="timer"
      aria-live={acabou ? "assertive" : "off"}
      aria-label="Cronômetro de descanso"
      className={`mt-2 rounded-xl border p-3 ${acabou ? "animate-pulse border-green-500 bg-green-50" : "border-primary-200 bg-primary-50"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`font-mono text-3xl font-bold tabular-nums ${acabou ? "text-green-700" : "text-primary-800"}`}>{mmss(resta)}</span>
        <span className={`text-sm font-semibold ${acabou ? "text-green-700" : "text-gray-600"}`}>
          {acabou ? "Descanso concluído" : pausado ? "Pausado" : "Descansando"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {acabou ? null : pausado ? (
          <Button type="button" size="small" icon="pi pi-play" label="Retomar" onClick={() => acao(retomar)} />
        ) : (
          <Button type="button" size="small" icon="pi pi-pause" label="Pausar" onClick={() => acao(pausar)} />
        )}
        <Button type="button" size="small" outlined icon="pi pi-replay" label="Reiniciar" onClick={() => acao(reiniciar)} />
        {acabou ? null : (
          <>
            <Button type="button" size="small" text label="−15 s" aria-label="Menos 15 segundos" onClick={() => acao((c, t) => ajustar(c, -15_000, t))} />
            <Button type="button" size="small" text label="+15 s" aria-label="Mais 15 segundos" onClick={() => acao((c, t) => ajustar(c, 15_000, t))} />
          </>
        )}
        <Button type="button" size="small" text severity="secondary" icon="pi pi-times" aria-label="Fechar cronômetro" onClick={() => definir(null)} />
      </div>
      <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={vibrar} onChange={alternarVibracao} />
        Vibrar ao terminar (quando o celular permitir)
      </label>
    </div>
  );
}

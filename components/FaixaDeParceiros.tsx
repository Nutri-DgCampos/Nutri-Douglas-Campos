"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

const CHAVE = "faixa-parceiros-vista";
// Velocidade de leitura confortável no celular; a faixa fica no mínimo 5 s.
const PIXELS_POR_SEGUNDO = 70;
const DURACAO_MINIMA = 5000;

// Ao abrir a área do paciente (uma vez por sessão), uma faixa mostra os
// parceiros cadastrados pelo nutricionista, com o texto entrando pela direita
// e saindo pela esquerda. Tocar leva à página de parceiros.
export default function FaixaDeParceiros() {
  const [texto, setTexto] = useState<string | null>(null);
  const [visivel, setVisivel] = useState(false);
  const caixa = useRef<HTMLAnchorElement>(null);
  const linha = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(CHAVE)) return;
    } catch {
      // Sem armazenamento: mostra mesmo assim.
    }
    api
      .from("parceiros")
      .select("nome")
      .order("nome", { ascending: true })
      .then(({ data }) => {
        const nomes = ((data ?? []) as { nome: string }[]).map((p) => p.nome.trim()).filter(Boolean);
        if (!nomes.length) return;
        setTexto(`Parceiros: ${nomes.join("  •  ")}`);
        setVisivel(true);
        try {
          sessionStorage.setItem(CHAVE, "1");
        } catch {
          // Preferência só desta sessão.
        }
      });
  }, []);

  useEffect(() => {
    if (!visivel || !caixa.current || !linha.current) return;
    const largura = caixa.current.clientWidth;
    const tamanho = linha.current.scrollWidth;
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) {
      const t = setTimeout(() => setVisivel(false), DURACAO_MINIMA + 2000);
      return () => clearTimeout(t);
    }
    const duracao = Math.max(DURACAO_MINIMA, ((largura + tamanho) / PIXELS_POR_SEGUNDO) * 1000);
    const animacao = linha.current.animate([{ transform: `translateX(${largura}px)` }, { transform: `translateX(${-tamanho}px)` }], {
      duration: duracao,
      easing: "linear",
      fill: "forwards",
    });
    animacao.onfinish = () => setVisivel(false);
    return () => animacao.cancel();
  }, [visivel]);

  if (!visivel || !texto) return null;

  return (
    <Link
      ref={caixa}
      href="/area-paciente/parceiros"
      aria-label={texto}
      className="mt-3 block overflow-hidden whitespace-nowrap rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-primary-800 shadow-sm"
      role="marquee"
    >
      <span ref={linha} className="inline-block will-change-transform" aria-hidden>
        {texto}
      </span>
    </Link>
  );
}

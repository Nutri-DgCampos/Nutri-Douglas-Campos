"use client";

import { useRef } from "react";
import { OverlayPanel } from "primereact/overlaypanel";
import type { Descricao } from "@/lib/nutricao/avaliacao";

// "?" ao lado de cada método: equação, população e fonte. Abre ao passar o
// mouse (computador) ou ao tocar (celular).
export default function InfoMetodo({ descricao }: { descricao: Descricao }) {
  const painel = useRef<OverlayPanel>(null);
  return (
    <>
      <button
        type="button"
        aria-label={`Sobre: ${descricao.nome}`}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary-300 text-xs font-bold text-primary-700 hover:bg-primary-50"
        onMouseEnter={(e) => painel.current?.show(e, e.currentTarget)}
        onMouseLeave={() => painel.current?.hide()}
        onClick={(e) => painel.current?.toggle(e)}
      >
        ?
      </button>
      <OverlayPanel ref={painel} className="max-w-md">
        <p className="font-semibold text-gray-900">{descricao.nome}</p>
        <p className="mt-2 text-sm text-gray-800">{descricao.equacao}</p>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-semibold">População:</span> {descricao.populacao}
        </p>
        <p className="mt-1 text-xs text-gray-500">{descricao.fonte}</p>
      </OverlayPanel>
    </>
  );
}

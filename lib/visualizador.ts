import { useSyncExternalStore } from "react";

// Visualizador de documentos dentro do app (PDF e imagens), com Voltar e
// Baixar. Substitui o window.open: no app instalado, a nova aba abria fora
// do app e não tinha como voltar.

export type Documento = { url: string; nome?: string };

let atual: Documento | null = null;
const ouvintes = new Set<() => void>();

function avisarOuvintes() {
  for (const ouvinte of ouvintes) ouvinte();
}

export function abrirDocumento(url: string, nome?: string) {
  atual = { url, nome };
  avisarOuvintes();
}

export function fecharDocumento() {
  atual = null;
  avisarOuvintes();
}

export function useDocumentoAberto() {
  return useSyncExternalStore(
    (ouvinte) => {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    () => atual,
    () => null
  );
}

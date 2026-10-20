"use client";

import { useSyncExternalStore } from "react";
import type { Refeicao } from "./dieta";

// Área de transferência interna do editor para "Copiar refeição" e "Colar
// refeição". Não usa a do sistema operacional: guarda a refeição
// estruturada enquanto durar a sessão do navegador (também entre abas de
// dietas e pacientes). Só a estrutura alimentar é copiada.

type Copiada = { refeicao: Refeicao; copiadaEm: number };

const CHAVE = "dieta-refeicao-copiada";
let atual: Copiada | null = null;
let carregada = false;
const ouvintes = new Set<() => void>();

function ler(): Copiada | null {
  if (!carregada && typeof window !== "undefined") {
    carregada = true;
    try {
      atual = JSON.parse(sessionStorage.getItem(CHAVE) ?? "null");
    } catch {
      atual = null;
    }
  }
  return atual;
}

export function copiarParaAreaDeTransferencia(refeicao: Refeicao) {
  atual = { refeicao: structuredClone(refeicao), copiadaEm: Date.now() };
  carregada = true;
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(atual));
  } catch {
    // Sem armazenamento: vale até recarregar a página.
  }
  ouvintes.forEach((ouvir) => ouvir());
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

export function useRefeicaoCopiada() {
  return useSyncExternalStore(assinar, ler, () => null);
}

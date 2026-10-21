import type { Composicoes, DocumentoDieta, GastoDeReferencia } from "@/lib/nutricao/dieta";

// Dados que o editor recebe da API (GET /api/nutricao/dietas/[id]).

export type Nutriente = { codigo: string; nome: string; unidade: string; grupo: string; ordem: number };

export type MedidaDoAlimento = {
  id: string;
  nome_singular: string;
  nome_plural: string;
  quantidade: number;
  padrao: boolean;
};

export type DadosDoAlimento = {
  id: string;
  nome: string;
  fonte: string;
  unidade_base: "g" | "ml";
  arquivado: boolean;
  medidas: MedidaDoAlimento[];
  substituicoes: {
    substituto_id: string;
    quantidade_referencia: number;
    quantidade_substituto: number;
    medida_caseira_id: string | null;
    quantidade_medidas: number | null;
  }[];
};

export type BaseDosAlimentos = {
  alimentos: Record<string, DadosDoAlimento>;
  composicoes: Composicoes;
};

export type DietaAnterior = {
  id: string;
  dieta_id: string;
  numero: number;
  enviada_em: string;
  titulo: string | null;
  peso: number | null;
  totais: Record<string, { valor: number | null; completo: boolean; conhecidos: number; itens: number }>;
};

export type Versao = {
  id: string;
  numero: number;
  modelo_pdf: string;
  novo_ciclo: boolean;
  enviada_em: string;
  arquivo: string | null;
};

export type DadosDoEditor = BaseDosAlimentos & {
  dieta: {
    id: string;
    patient_id: string;
    consulta_id: string;
    rascunho: DocumentoDieta;
    rascunho_em: string;
    salvo: DocumentoDieta | null;
    salvo_em: string | null;
    revisao: number;
    arquivada_em: string | null;
  };
  versoes: Versao[];
  paciente: {
    id: string;
    name: string;
    birth_date: string | null;
    sex: string | null;
    height_cm: number | null;
    objective: string | null;
  };
  consulta: { data: string; tipo: string; status: string } | null;
  lembretes: { cadastro: string | null; anamnese: string | null };
  anteriores: DietaAnterior[];
  nutrientes: Nutriente[];
  pesoAtual: { valor: number; data: string; origem: string } | null;
  gastos?: GastoDeReferencia[];
  cicloAtivo: { id: string; inicio: string; fim: string; enviadas_da_consulta: number } | null;
};

// Busca composição, medidas e substituições de alimentos ainda não carregados.
export async function carregarAlimentos(ids: string[]): Promise<BaseDosAlimentos> {
  if (ids.length === 0) return { alimentos: {}, composicoes: {} };
  const resposta = await fetch("/api/nutricao/alimentos/dados", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!resposta.ok) throw new Error("Não foi possível carregar os alimentos.");
  return resposta.json();
}

export function horaCurta(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

import { validarListaDeExames } from "@/lib/nutricao/exames";
import { conteudoVazio, validarOrientacao } from "@/lib/nutricao/orientacao";
import type { ConfiguracaoDaBiblioteca } from "./biblioteca";

// Bibliotecas de Configurações servidas por /api/nutricao/biblioteca/<tipo>.
export const BIBLIOTECAS: Record<string, ConfiguracaoDaBiblioteca> = {
  exames: {
    tabela: "modelos_exames",
    campo: "exames",
    validar: validarListaDeExames,
    conteudoInicial: [],
    resumo: "jsonb_array_length(exames) as quantidade",
    nomePadrao: "Nova lista de exames",
  },
  orientacoes: {
    tabela: "modelos_orientacoes",
    campo: "conteudo",
    validar: validarOrientacao,
    conteudoInicial: conteudoVazio(),
    resumo: "(conteudo->>'automatica')::boolean as automatica",
    nomePadrao: "Nova orientação",
  },
};

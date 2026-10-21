import { validarListaDeExames } from "@/lib/nutricao/exames";
import { formulaVazia, validarIngrediente, validarModeloDeFormula } from "@/lib/nutricao/formula";
import { validarMedicamento } from "@/lib/nutricao/medicacao";
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
  medicamentos: {
    tabela: "medicamentos",
    campo: "dados",
    validar: validarMedicamento,
    conteudoInicial: {},
    resumo: "dados->>'principioAtivo' as principio_ativo, dados->>'apresentacao' as apresentacao",
    nomePadrao: "Novo medicamento",
  },
  ingredientes: {
    tabela: "ingredientes",
    campo: "dados",
    validar: validarIngrediente,
    conteudoInicial: {},
    resumo: "dados->>'dosagem' as dosagem, dados->>'unidade' as unidade, dados->>'forma' as forma",
    nomePadrao: "Novo ingrediente",
  },
  formulas: {
    tabela: "modelos_formulas",
    campo: "conteudo",
    validar: validarModeloDeFormula,
    conteudoInicial: formulaVazia(),
    resumo: "jsonb_array_length(conteudo->'componentes') as quantidade",
    nomePadrao: "Nova fórmula",
  },
};

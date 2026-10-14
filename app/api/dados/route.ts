import { NextResponse } from "next/server";
import type { Consulta } from "@/lib/consulta";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { criarRegras } from "@/lib/servidor/permissoes";
import { obterContexto } from "@/lib/servidor/sessao";
import { executarConsulta } from "@/lib/servidor/sql";

export const runtime = "nodejs";

const ACOES = ["select", "insert", "update", "delete", "upsert"];
const OPERADORES = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "not.is"];
const FORMATOS = ["lista", "unico", "talvezUnico"];

const inteiroOuNulo = (valor: unknown) =>
  valor === null || (Number.isInteger(valor) && (valor as number) >= 0);

// Confere o formato da consulta recebida. As permissões e os nomes de tabelas
// e colunas são conferidos depois, em lib/servidor.
function consultaValida(dados: unknown): dados is Consulta {
  if (!dados || typeof dados !== "object") {
    return false;
  }

  const c = dados as Record<string, unknown>;

  return (
    typeof c.tabela === "string" &&
    ACOES.includes(c.acao as string) &&
    (c.colunas === null ||
      (typeof c.colunas === "string" && c.colunas.length <= 2000)) &&
    Array.isArray(c.filtros) &&
    c.filtros.length <= 20 &&
    c.filtros.every(
      (filtro) =>
        filtro &&
        typeof filtro === "object" &&
        typeof filtro.coluna === "string" &&
        OPERADORES.includes(filtro.operador)
    ) &&
    Array.isArray(c.ordem) &&
    c.ordem.length <= 5 &&
    c.ordem.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.coluna === "string" &&
        typeof item.ascendente === "boolean"
    ) &&
    inteiroOuNulo(c.limite) &&
    inteiroOuNulo(c.deslocamento) &&
    typeof c.contar === "boolean" &&
    typeof c.somenteContagem === "boolean" &&
    FORMATOS.includes(c.formato as string) &&
    (c.valores === null || typeof c.valores === "object") &&
    (c.conflito === null || typeof c.conflito === "string") &&
    typeof c.ignorarDuplicados === "boolean"
  );
}

export async function POST(request: Request) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  const consulta: unknown = await request.json().catch(() => null);

  if (!consultaValida(consulta)) {
    return recusar("Consulta inválida.", 400);
  }

  const resultado = await executarConsulta(
    obterPool(),
    consulta,
    criarRegras(contexto)
  );

  if (resultado.error) {
    console.error("Erro em /api/dados:", consulta.tabela, resultado.error);
  }

  return NextResponse.json(resultado, {
    headers: { "Cache-Control": "no-store" },
  });
}

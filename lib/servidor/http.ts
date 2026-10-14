import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { Contexto } from "./permissoes";
import { obterContexto } from "./sessao";

// Verificações comuns às rotas de API.

// Endereço público do sistema. Atrás do nginx, request.url mostra o endereço
// interno do container; por isso vale o cabeçalho repassado pelo proxy.
export function enderecoPublico(request: Request) {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/+$/, "");
  }

  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    url.host;
  const protocolo =
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");

  return `${protocolo}://${host}`;
}

// Recusa requisições disparadas por outros sites usando o cookie do usuário.
export function origemPermitida(request: Request) {
  const origem = request.headers.get("origin");

  if (!origem) {
    return true;
  }

  try {
    return new URL(origem).host === new URL(enderecoPublico(request)).host;
  } catch {
    return false;
  }
}

export function recusar(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem, error: mensagem }, { status });
}

// Devolve o contexto do nutricionista conectado ou a resposta de erro pronta.
export async function exigirNutricionista(
  request: Request
): Promise<Contexto | NextResponse> {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  if (contexto.papel !== "nutricionista") {
    return recusar("Acesso permitido somente ao nutricionista.", 403);
  }

  return contexto;
}

// Chamadas do agendador (container "cron") trazem o CRON_SECRET no cabeçalho.
export function autorizadoPorCron(request: Request) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = request.headers.get("authorization");

  if (!segredo || segredo.length < 32 || !autorizacao?.startsWith("Bearer ")) {
    return false;
  }

  const recebido = Buffer.from(autorizacao.slice(7).trim());
  const esperado = Buffer.from(segredo);

  return (
    recebido.length === esperado.length &&
    crypto.timingSafeEqual(recebido, esperado)
  );
}

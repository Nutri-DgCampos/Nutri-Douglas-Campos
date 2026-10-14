import { NextResponse } from "next/server";
import { banco } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { podeChamarFuncao } from "@/lib/servidor/permissoes";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!origemPermitida(request)) {
    return recusar("Origem não permitida.", 403);
  }

  const contexto = await obterContexto();

  if (!contexto) {
    return recusar("Usuário não autenticado.", 401);
  }

  const dados = await request.json().catch(() => null);

  if (
    typeof dados?.nome !== "string" ||
    !dados.argumentos ||
    typeof dados.argumentos !== "object" ||
    Array.isArray(dados.argumentos)
  ) {
    return recusar("Chamada inválida.", 400);
  }

  if (!podeChamarFuncao(contexto, dados.nome)) {
    return recusar("Operação não permitida.", 403);
  }

  return NextResponse.json(await banco.rpc(dados.nome, dados.argumentos), {
    headers: { "Cache-Control": "no-store" },
  });
}

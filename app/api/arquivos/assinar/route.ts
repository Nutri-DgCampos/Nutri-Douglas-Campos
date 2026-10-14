import { NextResponse } from "next/server";
import { podeBaixar, resolverCaminho } from "@/lib/servidor/arquivos";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { assinar, obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

// Gera um endereço temporário para abrir um arquivo em nova aba.
export async function POST(request: Request) {
  try {
    if (!origemPermitida(request)) {
      return recusar("Origem não permitida.", 403);
    }

    const contexto = await obterContexto();

    if (!contexto) {
      return recusar("Usuário não autenticado.", 401);
    }

    const dados = await request.json().catch(() => null);
    const bucket = typeof dados?.bucket === "string" ? dados.bucket : "";
    const caminho = typeof dados?.caminho === "string" ? dados.caminho : "";
    const segundos = Number.isInteger(dados?.segundos)
      ? Math.min(Math.max(dados.segundos, 10), 600)
      : 60;

    if (!resolverCaminho(bucket, caminho)) {
      return recusar("Arquivo inválido.", 400);
    }

    if (!(await podeBaixar(contexto, bucket, caminho))) {
      return recusar("Arquivo não encontrado.", 404);
    }

    const token = await assinar({ b: bucket, c: caminho }, "arquivo", segundos);

    return NextResponse.json({ endereco: `/api/arquivos/baixar?t=${token}` });
  } catch (erro) {
    console.error("Erro ao liberar arquivo:", erro);

    return recusar("Não foi possível abrir o arquivo.", 500);
  }
}

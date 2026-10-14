import {
  lerArquivo,
  resolverCaminho,
  tipoDoArquivo,
} from "@/lib/servidor/arquivos";
import { recusar } from "@/lib/servidor/http";
import { conferir } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

// Entrega o arquivo de um endereço temporário gerado em /api/arquivos/assinar.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const dados = await conferir(token, "arquivo");

  if (typeof dados?.b !== "string" || typeof dados?.c !== "string") {
    return recusar("Link inválido ou expirado.", 403);
  }

  const destino = resolverCaminho(dados.b, dados.c);
  const tipo = destino ? tipoDoArquivo(dados.b, dados.c) : null;

  if (!destino || !tipo) {
    return recusar("Arquivo inválido.", 400);
  }

  try {
    const conteudo = await lerArquivo(destino);

    return new Response(new Uint8Array(conteudo), {
      headers: {
        "Content-Type": tipo,
        "Content-Length": String(conteudo.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return recusar("Arquivo não encontrado.", 404);
  }
}

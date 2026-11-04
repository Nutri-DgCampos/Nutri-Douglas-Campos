import { NextResponse } from "next/server";
import { lerArquivo, resolverCaminho, tipoDoArquivo } from "@/lib/servidor/arquivos";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import { comprovanteParaProfissional } from "@/lib/servidor/treinoContratos";

export const runtime = "nodejs";

// Comprovante anexado pelo aluno: só o profissional do contrato abre.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id } = await params;
  const caminho = UUID.test(id) ? await comprovanteParaProfissional(profissional, id) : null;
  const destino = caminho ? resolverCaminho("comprovantes", caminho) : null;
  const tipo = caminho ? tipoDoArquivo("comprovantes", caminho) : null;
  if (!destino || !tipo) return recusar("Comprovante não encontrado.", 404);
  const conteudo = await lerArquivo(destino).catch(() => null);
  if (!conteudo) return recusar("Comprovante não encontrado.", 404);
  return new Response(new Uint8Array(conteudo), {
    headers: { "Content-Type": tipo, "Content-Disposition": "inline", "Cache-Control": "private, no-store" },
  });
}

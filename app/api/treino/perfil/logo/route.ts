import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { BUCKETS, gravarArquivo, lerArquivo, removerArquivo, resolverCaminho, tipoDoArquivo } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Logotipo do educador físico para os PDFs dele (R8). Fica no bucket
// "identidade", na pasta educadores/<id>; só o próprio educador envia, vê e
// remove o dele.
async function educador(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  if (profissional.admin) return recusar("O administrador usa a identidade visual da clínica, em Configurações.", 403);
  return profissional;
}

async function caminhoAtual(usuarioId: string) {
  const r = await obterPool().query<{ logo_path: string | null }>("select logo_path from public.educadores_fisicos where usuario_id = $1", [usuarioId]);
  return r.rows[0]?.logo_path ?? null;
}

export async function GET(request: Request) {
  const profissional = await educador(request);
  if (profissional instanceof NextResponse) return profissional;
  const caminho = await caminhoAtual(profissional.usuarioId);
  const destino = caminho ? resolverCaminho("identidade", caminho) : null;
  const tipo = caminho ? tipoDoArquivo("identidade", caminho) : null;
  if (!destino || !tipo) return recusar("Sem logotipo.", 404);
  return new Response(new Uint8Array(await lerArquivo(destino)), { headers: { "Content-Type": tipo, "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const profissional = await educador(request);
  if (profissional instanceof NextResponse) return profissional;
  const formulario = await request.formData().catch(() => null);
  const arquivo = formulario?.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return recusar("Escolha a imagem do logotipo.", 400);
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["png", "jpg", "jpeg"].includes(extensao)) return recusar("Envie o logotipo em PNG ou JPG.", 400);
  if (arquivo.size > BUCKETS.identidade.tamanhoMaximo) return recusar("Imagem maior que 5 MB.", 400);

  const caminho = `educadores/${profissional.usuarioId}/logo-${randomUUID()}.${extensao}`;
  const destino = resolverCaminho("identidade", caminho);
  if (!destino) return recusar("Arquivo inválido.", 400);
  await gravarArquivo(destino, Buffer.from(await arquivo.arrayBuffer()), false);
  const anterior = await caminhoAtual(profissional.usuarioId);
  await obterPool().query("update public.educadores_fisicos set logo_path = $2, atualizado_em = now() where usuario_id = $1", [profissional.usuarioId, caminho]);
  const antigo = anterior ? resolverCaminho("identidade", anterior) : null;
  if (antigo) await removerArquivo(antigo);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const profissional = await educador(request);
  if (profissional instanceof NextResponse) return profissional;
  const anterior = await caminhoAtual(profissional.usuarioId);
  await obterPool().query("update public.educadores_fisicos set logo_path = null, atualizado_em = now() where usuario_id = $1", [profissional.usuarioId]);
  const antigo = anterior ? resolverCaminho("identidade", anterior) : null;
  if (antigo) await removerArquivo(antigo);
  return NextResponse.json({ ok: true });
}

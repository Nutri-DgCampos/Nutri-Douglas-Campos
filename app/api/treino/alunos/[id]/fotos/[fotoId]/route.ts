import { NextResponse } from "next/server";
import { lerArquivo, resolverCaminho, tipoDoArquivo } from "@/lib/servidor/arquivos";
import { UUID } from "@/lib/servidor/dietas";
import { caminhoDaFoto } from "@/lib/servidor/fotosDoAluno";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Uma foto de evolução do aluno, para o profissional que o acompanha. A foto
// precisa ser deste aluno (não serve foto de outro paciente pelo id).
export async function GET(request: Request, { params }: { params: Promise<{ id: string; fotoId: string }> }) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const { id, fotoId } = await params;
  if (!UUID.test(id) || !UUID.test(fotoId) || !(await podeAcompanharAluno(profissional, id))) return recusar("Foto não encontrada.", 404);
  const caminho = await caminhoDaFoto(id, fotoId);
  const destino = caminho ? resolverCaminho("fotos", caminho) : null;
  const tipo = caminho ? tipoDoArquivo("fotos", caminho) : null;
  if (!destino || !tipo) return recusar("Foto não encontrada.", 404);
  const conteudo = await lerArquivo(destino).catch(() => null);
  if (!conteudo) return recusar("Foto não encontrada.", 404);
  return new Response(new Uint8Array(conteudo), { headers: { "Content-Type": tipo, "Cache-Control": "private, max-age=3600" } });
}

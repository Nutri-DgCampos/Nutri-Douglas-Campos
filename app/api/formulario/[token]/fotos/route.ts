import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { excluirFotoDeHoje, FotoRecusada, fotosDeHoje, gravarFotoDoLink } from "@/lib/servidor/fotosDoLink";
import { recusar } from "@/lib/servidor/http";
import { pacienteDaRequisicao } from "@/lib/servidor/respostasDoPaciente";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ token: string }> };

// Fotos corporais pelo link individual: posições já enviadas hoje e o sexo do
// cadastro (para os avatares). Nada do histórico sai por aqui.
export async function GET(request: Request, { params }: Parametros) {
  const paciente = await pacienteDaRequisicao(request, (await params).token);
  if (paciente instanceof NextResponse) return paciente;
  return NextResponse.json(await fotosDeHoje(paciente), { headers: { "Cache-Control": "private, no-store" } });
}

// Envia uma foto (corpo = arquivo; ?perfil=frente|lado|costas).
export async function POST(request: Request, { params }: Parametros) {
  const paciente = await pacienteDaRequisicao(request, (await params).token);
  if (paciente instanceof NextResponse) return paciente;
  if (Number(request.headers.get("content-length") ?? 0) > 10 * 1024 * 1024) return recusar("A foto deve ter no máximo 10 MB.", 413);
  try {
    const id = await gravarFotoDoLink(paciente, new URL(request.url).searchParams.get("perfil") ?? "", Buffer.from(await request.arrayBuffer()));
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof FotoRecusada) return recusar(erro.message, erro.status);
    console.error("Erro ao gravar foto pelo link:", erro);
    return recusar("Não foi possível enviar a foto.", 500);
  }
}

// Exclui uma foto enviada hoje.
export async function DELETE(request: Request, { params }: Parametros) {
  const paciente = await pacienteDaRequisicao(request, (await params).token);
  if (paciente instanceof NextResponse) return paciente;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return recusar("Foto inválida.", 400);
  return (await excluirFotoDeHoje(paciente, id)) ? NextResponse.json({ sucesso: true }) : recusar("Foto não encontrada.", 404);
}

import { NextResponse } from "next/server";
import { UUID } from "@/lib/servidor/dietas";
import { lerFotoDeHoje } from "@/lib/servidor/fotosDoLink";
import { recusar } from "@/lib/servidor/http";
import { pacienteDaRequisicao } from "@/lib/servidor/respostasDoPaciente";

export const runtime = "nodejs";

// Miniatura de uma foto enviada hoje pelo próprio link (não fica em cache).
export async function GET(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const paciente = await pacienteDaRequisicao(request, token);
  if (paciente instanceof NextResponse) return paciente;
  if (!UUID.test(id)) return recusar("Foto inválida.", 400);
  const foto = await lerFotoDeHoje(paciente, id);
  if (!foto) return recusar("Foto não encontrada.", 404);
  return new NextResponse(new Uint8Array(foto.conteudo), {
    headers: { "Content-Type": foto.tipo, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

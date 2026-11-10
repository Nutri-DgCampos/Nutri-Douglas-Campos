import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { linkDoPaciente } from "@/lib/servidor/formularios";
import { enderecoPublico, recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino, podeAcompanharAluno } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

type Parametros = { params: Promise<{ id: string }> };

// Link individual do aluno (o mesmo da Nutrição: um por paciente), para o
// profissional do Treino que o acompanha. Gerar um novo invalida o anterior
// para todos os profissionais.
async function responder(request: Request, id: string, novo: boolean) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  if (!UUID.test(id) || !(await podeAcompanharAluno(profissional, id))) return recusar("Aluno não encontrado.", 404);
  const paciente = await obterPool().query<{ name: string; phone: string | null }>("select name, phone from public.patients where id = $1", [id]);
  if (!paciente.rows[0]) return recusar("Aluno não encontrado.", 404);
  const token = await linkDoPaciente(id, profissional.usuarioId, novo);
  return NextResponse.json(
    { url: `${enderecoPublico(request)}/formulario/${token}`, nome: paciente.rows[0].name, telefone: paciente.rows[0].phone },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

export async function GET(request: Request, { params }: Parametros) {
  return responder(request, (await params).id, false);
}

export async function POST(request: Request, { params }: Parametros) {
  return responder(request, (await params).id, true);
}

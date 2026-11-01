import { NextResponse } from "next/server";
import { criarEducador, DadosInvalidos, listarEducadores } from "@/lib/servidor/educadores";
import { recusar } from "@/lib/servidor/http";
import { exigirAdminDoTreino } from "@/lib/servidor/treinoAcesso";
import { EmailJaCadastrado } from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

// Educadores físicos: só o administrador (nutricionista) lista e cadastra.
export async function GET(request: Request) {
  const admin = await exigirAdminDoTreino(request);
  if (admin instanceof NextResponse) return admin;
  return NextResponse.json({ educadores: await listarEducadores() });
}

export async function POST(request: Request) {
  const admin = await exigirAdminDoTreino(request);
  if (admin instanceof NextResponse) return admin;
  try {
    const id = await criarEducador((await request.json().catch(() => ({}))) ?? {}, admin.usuarioId);
    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    if (erro instanceof DadosInvalidos) return recusar(erro.message, 400);
    if (erro instanceof EmailJaCadastrado) return recusar("Este e-mail já é usado por outro acesso.", 409);
    console.error("Erro ao cadastrar educador físico:", erro);
    return recusar("Não foi possível cadastrar o educador físico.", 500);
  }
}

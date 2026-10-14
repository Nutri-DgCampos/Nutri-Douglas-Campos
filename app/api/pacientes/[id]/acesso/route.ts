import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import {
  definirEmail,
  definirSenha,
  EmailJaCadastrado,
  emailDoUsuario,
} from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function usuarioDoPaciente(id: string) {
  const resultado = await obterPool().query<{ auth_user_id: string | null; role: string | null }>(
    `select p.auth_user_id, pr.role
       from public.patients p
       left join public.profiles pr on pr.id = p.auth_user_id
      where p.id = $1`,
    [id]
  );

  return resultado.rows[0] ?? null;
}

// E-mail de acesso atual do paciente (null se ainda não tem acesso).
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Paciente inválido.", 400);
  }

  const paciente = await usuarioDoPaciente(id);

  if (!paciente) {
    return recusar("Paciente não encontrado.", 404);
  }

  return NextResponse.json(
    {
      email: paciente.auth_user_id ? await emailDoUsuario(paciente.auth_user_id) : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

// Troca o e-mail e/ou a senha de acesso do paciente.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    const { id } = await params;

    if (!UUID.test(id)) {
      return recusar("Paciente inválido.", 400);
    }

    const dados = await request.json().catch(() => null);
    const email =
      typeof dados?.email === "string" ? dados.email.trim().toLowerCase() : "";
    const senha = typeof dados?.senha === "string" ? dados.senha : "";

    if (!email && !senha) {
      return recusar("Informe um novo e-mail ou uma nova senha.", 400);
    }

    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      return recusar("Informe um e-mail válido.", 400);
    }

    if (senha && (senha.length < 6 || senha.length > 200)) {
      return recusar("A nova senha deve ter pelo menos 6 caracteres.", 400);
    }

    const paciente = await usuarioDoPaciente(id);

    if (!paciente) {
      return recusar("Paciente não encontrado.", 404);
    }

    if (!paciente.auth_user_id) {
      return recusar("Este paciente ainda não possui um acesso cadastrado.", 400);
    }

    // Nunca altera o acesso do próprio nutricionista por esta tela.
    if (paciente.role !== "paciente") {
      return recusar("O acesso vinculado não pertence a um perfil de paciente.", 403);
    }

    if (email) {
      await definirEmail(paciente.auth_user_id, email);
    }

    if (senha) {
      await definirSenha(paciente.auth_user_id, senha, true);
    }

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    if (erro instanceof EmailJaCadastrado) {
      return recusar("Este e-mail já está em uso por outra conta.", 409);
    }

    console.error("Erro ao atualizar acesso do paciente:", erro);
    return recusar("Não foi possível atualizar o acesso do paciente.", 500);
  }
}

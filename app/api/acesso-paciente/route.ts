import { NextResponse } from "next/server";
import { banco } from "@/lib/servidor/banco";
import { exigirNutricionista } from "@/lib/servidor/http";
import {
  criarUsuario,
  definirSenha,
  excluirUsuario,
} from "@/lib/servidor/usuarios";

export const runtime = "nodejs";


export async function POST(request: Request) {
  try {
    const contexto = await exigirNutricionista(request);

    if (contexto instanceof NextResponse) {
      return contexto;
    }

    const dados = await request.json();
    if (dados.acao === "redefinir_senha") {
  const pacienteId = dados.pacienteId;
  const novaSenha = dados.senha;

  if (
    typeof pacienteId !== "string" ||
    typeof novaSenha !== "string" ||
    novaSenha.length < 6
  ) {
    return NextResponse.json(
      { erro: "Informe o paciente e uma senha de pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  const { data: paciente, error: erroPaciente } = await banco
    .from("patients")
    .select("auth_user_id")
    .eq("id", pacienteId)
    .maybeSingle();

  if (erroPaciente || !paciente) {
    return NextResponse.json(
      { erro: "Paciente não encontrado." },
      { status: 404 }
    );
  }

  if (!paciente.auth_user_id) {
    return NextResponse.json(
      { erro: "Este paciente ainda não possui um acesso cadastrado." },
      { status: 400 }
    );
  }

  const { data: perfilPaciente, error: erroPerfilPaciente } = await banco
    .from("profiles")
    .select("role")
    .eq("id", paciente.auth_user_id)
    .maybeSingle();

  if (erroPerfilPaciente || perfilPaciente?.role !== "paciente") {
    return NextResponse.json(
      { erro: "O acesso vinculado não pertence a um perfil de paciente." },
      { status: 403 }
    );
  }

  if (!(await definirSenha(paciente.auth_user_id, novaSenha))) {
    console.error("Erro ao redefinir senha: usuário não encontrado.");

    return NextResponse.json(
      { erro: "Não foi possível redefinir a senha do paciente." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    sucesso: true,
    mensagem: "Senha do paciente redefinida com sucesso.",
  });
}

const pacienteId = dados.pacienteId;
const email = dados.email?.trim().toLowerCase();
const senha = dados.senha;

if (
  typeof pacienteId !== "string" ||
  typeof email !== "string" ||
  !email.includes("@") ||
  typeof senha !== "string" ||
  senha.length < 6
) {
  return NextResponse.json(
    { erro: "Informe o paciente, um e-mail válido e uma senha de pelo menos 6 caracteres." },
    { status: 400 }
  );
}
const { data: paciente, error: pacienteError } = await banco
  .from("patients")
  .select("id, auth_user_id")
  .eq("id", pacienteId)
  .maybeSingle();

if (pacienteError) {
  console.error("Erro ao consultar paciente:", pacienteError);

  return NextResponse.json(
    { erro: "Não foi possível verificar o cadastro do paciente." },
    { status: 500 }
  );
}

if (!paciente) {
  return NextResponse.json(
    { erro: "Paciente não encontrado." },
    { status: 404 }
  );
}

if (paciente.auth_user_id) {
  return NextResponse.json(
    { erro: "Este paciente já possui um acesso cadastrado." },
    { status: 409 }
  );
}
let novoUsuarioId: string;

try {
  novoUsuarioId = await criarUsuario(email, senha);
} catch (erroCriacao) {
  console.error("Erro ao criar acesso:", erroCriacao);

  return NextResponse.json(
    { erro: "Não foi possível criar o acesso do paciente." },
    { status: 400 }
  );
}

const { error: erroPerfilNovo } = await banco
  .from("profiles")
  .upsert(
    {
      id: novoUsuarioId,
      role: "paciente",
    },
    { onConflict: "id" }
  );

if (erroPerfilNovo) {
  console.error("Erro ao registrar perfil:", erroPerfilNovo);

  await excluirUsuario(novoUsuarioId);

  return NextResponse.json(
    { erro: "Não foi possível registrar o perfil do paciente." },
    { status: 500 }
  );
}

const { data: pacienteVinculado, error: erroVinculo } = await banco
  .from("patients")
  .update({ auth_user_id: novoUsuarioId })
  .eq("id", pacienteId)
  .is("auth_user_id", null)
  .select("id")
  .maybeSingle();

if (erroVinculo || !pacienteVinculado) {
  console.error("Erro ao vincular acesso:", erroVinculo);

  await excluirUsuario(novoUsuarioId);

  return NextResponse.json(
    { erro: "Não foi possível vincular o acesso ao paciente." },
    { status: 500 }
  );
}
     return NextResponse.json(
    {
      sucesso: true,
      mensagem: "Acesso do paciente criado com sucesso.",
      pacienteId: pacienteId,
    },
    { status: 201 }
  );

  } catch (error) {
    console.error("Erro na API de acesso do paciente:", error);

    return NextResponse.json(
      { erro: "Erro interno do servidor." },
      { status: 500 }
    );
  }
}
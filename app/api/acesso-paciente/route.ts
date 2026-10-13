import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";


export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json(
        { erro: "Usuário não autenticado." },
        { status: 401 }
      );
    }

    const token = authorization.slice(7);

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !publicKey || !secretKey) {
      return NextResponse.json(
        { erro: "Configuração do servidor incompleta." },
        { status: 500 }
      );
    }

    const authClient = createClient(supabaseUrl, publicKey);

    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { erro: "Sessão inválida ou expirada." },
        { status: 401 }
      );
    }

    const admin = createClient(supabaseUrl, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: perfil, error: perfilError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

      console.log("Diagnóstico da autorização:", {
  usuarioId: user.id,
  erroPerfil: perfilError?.message ?? null,
  roleEncontrada: perfil?.role ?? null,
});
    if (perfilError || perfil?.role !== "nutricionista") {
      return NextResponse.json(
        { erro: "Acesso permitido somente ao nutricionista." },
        { status: 403 }
      );
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

  const { data: paciente, error: erroPaciente } = await admin
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

  const { data: perfilPaciente, error: erroPerfilPaciente } = await admin
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

  const { error: erroSenha } = await admin.auth.admin.updateUserById(
    paciente.auth_user_id,
    { password: novaSenha }
  );

  if (erroSenha) {
    console.error("Erro ao redefinir senha:", erroSenha);

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
const { data: paciente, error: pacienteError } = await admin
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
const { data: novoAcesso, error: erroCriacao } =
  await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });

if (erroCriacao || !novoAcesso.user) {
  console.error("Erro ao criar acesso:", erroCriacao);

  return NextResponse.json(
    { erro: "Não foi possível criar o acesso do paciente." },
    { status: 400 }
  );
}
const novoUsuarioId = novoAcesso.user.id;

const { error: erroPerfilNovo } = await admin
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

  await admin.auth.admin.deleteUser(novoUsuarioId);

  return NextResponse.json(
    { erro: "Não foi possível registrar o perfil do paciente." },
    { status: 500 }
  );
}

const { data: pacienteVinculado, error: erroVinculo } = await admin
  .from("patients")
  .update({ auth_user_id: novoUsuarioId })
  .eq("id", pacienteId)
  .is("auth_user_id", null)
  .select("id")
  .maybeSingle();

if (erroVinculo || !pacienteVinculado) {
  console.error("Erro ao vincular acesso:", erroVinculo);

  await admin.auth.admin.deleteUser(novoUsuarioId);

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
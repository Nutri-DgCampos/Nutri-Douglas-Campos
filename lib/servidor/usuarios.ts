import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { obterPool } from "./banco";

// Contas de acesso (tabela public.users). As senhas são guardadas com bcrypt,
// o mesmo formato que o Supabase usava, então as senhas antigas continuam válidas.

const CUSTO = 10;

export class EmailJaCadastrado extends Error {
  code = "email_exists";

  constructor() {
    super("E-mail já cadastrado.");
  }
}

// provisoria: senha definida por outra pessoa (nutricionista, importação),
// que o usuário precisa trocar no primeiro acesso.
export async function criarUsuario(email: string, senha: string, provisoria = false) {
  try {
    const resultado = await obterPool().query<{ id: string }>(
      `insert into public.users (email, password_hash, must_change_password)
       values ($1, $2, $3)
       returning id`,
      [email.trim().toLowerCase(), await bcrypt.hash(senha, CUSTO), provisoria]
    );

    return resultado.rows[0].id;
  } catch (erro) {
    if (
      erro &&
      typeof erro === "object" &&
      "code" in erro &&
      erro.code === "23505"
    ) {
      throw new EmailJaCadastrado();
    }

    throw erro;
  }
}

export async function emailDoUsuario(id: string) {
  const resultado = await obterPool().query<{ email: string }>(
    "select email from public.users where id = $1",
    [id]
  );

  return resultado.rows[0]?.email ?? null;
}

export async function definirEmail(id: string, email: string) {
  try {
    const resultado = await obterPool().query(
      "update public.users set email = $2, updated_at = now() where id = $1",
      [id, email.trim().toLowerCase()]
    );

    return resultado.rowCount === 1;
  } catch (erro) {
    if (erro && typeof erro === "object" && "code" in erro && erro.code === "23505") {
      throw new EmailJaCadastrado();
    }

    throw erro;
  }
}

export async function excluirUsuario(id: string) {
  await obterPool().query("delete from public.users where id = $1", [id]);
}

export async function definirSenha(id: string, senha: string, provisoria = false) {
  const resultado = await obterPool().query(
    `update public.users
        set password_hash = $2, must_change_password = $3, updated_at = now()
      where id = $1`,
    [id, await bcrypt.hash(senha, CUSTO), provisoria]
  );

  return resultado.rowCount === 1;
}

export async function senhaConfere(id: string, senha: string) {
  const resultado = await obterPool().query<{ password_hash: string }>(
    "select password_hash from public.users where id = $1",
    [id]
  );

  const hash = resultado.rows[0]?.password_hash;
  return hash ? bcrypt.compare(senha, hash) : false;
}

// Um hash qualquer, para gastar o mesmo tempo quando o e-mail não existe.
const HASH_FALSO = bcrypt.hashSync("senha-inexistente", CUSTO);

export async function conferirCredenciais(email: string, senha: string) {
  const resultado = await obterPool().query<{
    id: string;
    password_hash: string;
  }>("select id, password_hash from public.users where email = $1", [
    email.trim().toLowerCase(),
  ]);

  const usuario = resultado.rows[0];
  const confere = await bcrypt.compare(
    senha,
    usuario?.password_hash ?? HASH_FALSO
  );

  if (!usuario || !confere) {
    return null;
  }

  await obterPool().query(
    "update public.users set last_sign_in_at = now() where id = $1",
    [usuario.id]
  );

  return usuario.id;
}

// ------------------------------------------------------------------------
// Bloqueio temporário após muitas senhas erradas
// ------------------------------------------------------------------------

const TENTATIVAS_MAXIMAS = 10;

export async function loginBloqueado(email: string) {
  const resultado = await obterPool().query(
    `select 1 from public.cadastro_rate_limits
      where identificador = $1
        and tentativas >= $2
        and janela_inicio > now() - interval '15 minutes'`,
    [`login:${email}`, TENTATIVAS_MAXIMAS]
  );

  return resultado.rowCount === 1;
}

export async function registrarFalhaDeLogin(email: string) {
  await obterPool().query("select public.verificar_limite_cadastro($1)", [
    `login:${email}`,
  ]);
}

export async function limparFalhasDeLogin(email: string) {
  await obterPool().query(
    "delete from public.cadastro_rate_limits where identificador = $1",
    [`login:${email}`]
  );
}

// ------------------------------------------------------------------------
// Redefinição de senha por e-mail
// ------------------------------------------------------------------------

function resumo(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Devolve o token a enviar por e-mail, ou null se o e-mail não tem conta.
export async function criarTokenDeRedefinicao(email: string) {
  const usuario = await obterPool().query<{ id: string }>(
    "select id from public.users where email = $1",
    [email.trim().toLowerCase()]
  );

  if (!usuario.rows[0]) {
    return null;
  }

  const token = crypto.randomBytes(32).toString("base64url");

  await obterPool().query(
    `insert into public.password_reset_tokens (token_hash, user_id, expires_at)
     values ($1, $2, now() + interval '1 hour')`,
    [resumo(token), usuario.rows[0].id]
  );

  return token;
}

export async function tokenDeRedefinicaoValido(token: string) {
  const resultado = await obterPool().query(
    `select 1 from public.password_reset_tokens
      where token_hash = $1 and used_at is null and expires_at > now()`,
    [resumo(token)]
  );

  return resultado.rowCount === 1;
}

export async function redefinirSenhaComToken(token: string, senha: string) {
  // Marcar como usado e ler o dono em um só comando impede o uso duplo.
  const resultado = await obterPool().query<{ user_id: string }>(
    `update public.password_reset_tokens
        set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now()
      returning user_id`,
    [resumo(token)]
  );

  const usuarioId = resultado.rows[0]?.user_id;

  if (!usuarioId) {
    return false;
  }

  return definirSenha(usuarioId, senha);
}

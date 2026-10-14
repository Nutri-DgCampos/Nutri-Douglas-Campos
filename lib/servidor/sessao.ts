import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { obterPool } from "./banco";
import type { Contexto } from "./permissoes";

// Sessão do usuário: um token assinado guardado em cookie httpOnly.
// O navegador nunca lê o token; ele só acompanha as requisições.

const COOKIE = "sessao";
const DURACAO_DIAS = 30;
const DURACAO_SEGUNDOS = DURACAO_DIAS * 24 * 60 * 60;

function segredo() {
  const valor = process.env.SESSAO_SEGREDO;

  if (!valor || valor.length < 32) {
    throw new Error("SESSAO_SEGREDO ausente ou com menos de 32 caracteres.");
  }

  return new TextEncoder().encode(valor);
}

export async function assinar(
  dados: Record<string, unknown>,
  finalidade: string,
  segundos: number
) {
  return new SignJWT(dados)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(finalidade)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + segundos)
    .sign(segredo());
}

export async function conferir(token: string, finalidade: string) {
  try {
    const { payload } = await jwtVerify(token, segredo(), {
      audience: finalidade,
      algorithms: ["HS256"],
    });

    return payload;
  } catch {
    return null;
  }
}

export async function iniciarSessao(usuarioId: string) {
  const token = await assinar({ sub: usuarioId }, "sessao", DURACAO_SEGUNDOS);

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSAO_COOKIE_SEGURO === "true",
    path: "/",
    maxAge: DURACAO_SEGUNDOS,
  });
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE);
}

// Quem está chamando, com papel e cadastro de paciente lidos do banco a cada
// requisição (um acesso removido deixa de valer na hora).
export async function obterContexto(): Promise<Contexto | null> {
  const token = (await cookies()).get(COOKIE)?.value;

  if (!token) {
    return null;
  }

  const dados = await conferir(token, "sessao");

  if (!dados?.sub) {
    return null;
  }

  const resultado = await obterPool().query<{
    email: string;
    papel: string | null;
    paciente_id: string | null;
  }>(
    `select u.email,
            p.role as papel,
            (select pa.id from public.patients pa
              where pa.auth_user_id = u.id
              order by pa.created_at
              limit 1) as paciente_id
       from public.users u
       left join public.profiles p on p.id = u.id
      where u.id = $1`,
    [dados.sub]
  );

  const usuario = resultado.rows[0];

  if (!usuario) {
    return null;
  }

  // Renova o cookie quando já passou um dia, para a sessão não expirar em uso.
  if (
    typeof dados.iat === "number" &&
    Date.now() / 1000 - dados.iat > 24 * 60 * 60
  ) {
    try {
      await iniciarSessao(dados.sub);
    } catch {
      // Cookies só podem ser gravados em rotas e ações; fora delas, ignora.
    }
  }

  return {
    usuarioId: dados.sub,
    email: usuario.email,
    papel: usuario.papel,
    pacienteId: usuario.paciente_id,
  };
}

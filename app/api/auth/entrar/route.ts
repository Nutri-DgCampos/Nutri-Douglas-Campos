import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { iniciarSessao } from "@/lib/servidor/sessao";
import {
  conferirCredenciais,
  limparFalhasDeLogin,
  loginBloqueado,
  registrarFalhaDeLogin,
} from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!origemPermitida(request)) {
      return recusar("Origem não permitida.", 403);
    }

    const dados = await request.json().catch(() => null);
    const email =
      typeof dados?.email === "string" ? dados.email.trim().toLowerCase() : "";
    const senha = typeof dados?.senha === "string" ? dados.senha : "";

    if (!email || email.length > 254 || !senha || senha.length > 200) {
      return recusar("E-mail ou senha incorretos.", 400);
    }

    if (await loginBloqueado(email)) {
      return recusar(
        "Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.",
        429
      );
    }

    const usuarioId = await conferirCredenciais(email, senha);

    if (!usuarioId) {
      await registrarFalhaDeLogin(email);

      return recusar("E-mail ou senha incorretos.", 401);
    }

    await limparFalhasDeLogin(email);
    await iniciarSessao(usuarioId);

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao entrar:", erro);

    return recusar("Não foi possível entrar. Tente novamente.", 500);
  }
}

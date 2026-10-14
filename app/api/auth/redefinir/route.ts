import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import {
  redefinirSenhaComToken,
  tokenDeRedefinicaoValido,
} from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!origemPermitida(request)) {
      return recusar("Origem não permitida.", 403);
    }

    const dados = await request.json().catch(() => null);
    const token = typeof dados?.token === "string" ? dados.token : "";

    if (!token || token.length > 200) {
      return recusar("Link de recuperação inválido ou expirado.", 400);
    }

    if (dados.apenasConferir === true) {
      return NextResponse.json({
        valido: await tokenDeRedefinicaoValido(token),
      });
    }

    if (
      typeof dados.senha !== "string" ||
      dados.senha.length < 6 ||
      dados.senha.length > 200
    ) {
      return recusar("A nova senha deve ter pelo menos 6 caracteres.", 400);
    }

    if (!(await redefinirSenhaComToken(token, dados.senha))) {
      return recusar("Link de recuperação inválido ou expirado.", 400);
    }

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao redefinir senha:", erro);

    return recusar("Não foi possível redefinir a senha.", 500);
  }
}

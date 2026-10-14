import { NextResponse } from "next/server";
import { banco } from "@/lib/servidor/banco";
import { emailConfigurado, enviarEmail } from "@/lib/servidor/email";
import {
  enderecoPublico,
  origemPermitida,
  recusar,
} from "@/lib/servidor/http";
import { criarTokenDeRedefinicao } from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!origemPermitida(request)) {
      return recusar("Origem não permitida.", 403);
    }

    const dados = await request.json().catch(() => null);
    const email =
      typeof dados?.email === "string" ? dados.email.trim().toLowerCase() : "";

    if (!email.includes("@") || email.length > 254) {
      return recusar("Informe um e-mail válido.", 400);
    }

    if (!emailConfigurado()) {
      console.error(
        "Redefinição de senha solicitada, mas o SMTP não está configurado."
      );

      return recusar("O envio de e-mails não está configurado.", 503);
    }

    const { data: permitido } = await banco.rpc("verificar_limite_cadastro", {
      p_identificador: `recuperar:${email}`,
    });

    if (permitido !== true) {
      return recusar("Muitas tentativas. Tente novamente mais tarde.", 429);
    }

    const token = await criarTokenDeRedefinicao(email);

    // A resposta é a mesma exista ou não a conta, para não revelar cadastros.
    if (token) {
      const link = `${enderecoPublico(request)}/redefinir-senha?token=${token}`;

      await enviarEmail(
        email,
        "Redefinição de senha - Acompanhamento Nutricional",
        `Olá!\n\nRecebemos um pedido para redefinir a sua senha.\n\nAcesse o link abaixo para criar uma nova senha (válido por 1 hora):\n${link}\n\nSe você não fez esse pedido, ignore este e-mail.`
      );
    }

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao enviar e-mail de recuperação:", erro);

    return recusar("Não foi possível enviar o e-mail de recuperação.", 500);
  }
}

import { NextResponse } from "next/server";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";
import {
  definirSenha,
  limparFalhasDeLogin,
  loginBloqueado,
  registrarFalhaDeLogin,
  senhaConfere,
} from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

// Troca da própria senha. Também é o caminho de quem está com senha
// provisória, por isso aceita esse tipo de sessão.
export async function POST(request: Request) {
  try {
    if (!origemPermitida(request)) {
      return recusar("Origem não permitida.", 403);
    }

    const contexto = await obterContexto({ permitirSenhaProvisoria: true });

    if (!contexto) {
      return recusar("Usuário não autenticado.", 401);
    }

    const dados = await request.json().catch(() => null);
    const senhaAtual = typeof dados?.senhaAtual === "string" ? dados.senhaAtual : "";
    const novaSenha = typeof dados?.novaSenha === "string" ? dados.novaSenha : "";

    if (novaSenha.length < 6 || novaSenha.length > 200) {
      return recusar("A nova senha deve ter pelo menos 6 caracteres.", 400);
    }

    if (novaSenha === senhaAtual) {
      return recusar("A nova senha precisa ser diferente da atual.", 400);
    }

    // Mesmo limite de tentativas do login, contra adivinhação da senha atual.
    if (await loginBloqueado(contexto.email)) {
      return recusar("Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.", 429);
    }

    if (!(await senhaConfere(contexto.usuarioId, senhaAtual))) {
      await registrarFalhaDeLogin(contexto.email);
      return recusar("A senha atual está incorreta.", 400);
    }

    await limparFalhasDeLogin(contexto.email);
    await definirSenha(contexto.usuarioId, novaSenha);

    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    console.error("Erro ao trocar senha:", erro);
    return recusar("Não foi possível trocar a senha.", 500);
  }
}

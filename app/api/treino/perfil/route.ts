import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Perfil do educador físico para os PDFs dele (resposta R8): nome, CREF,
// telefone, e-mail de contato e logotipo (enviado por /perfil/logo). O
// administrador usa a identidade da clínica (Configurações).
async function educador(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  if (profissional.admin) return recusar("O administrador usa a identidade visual da clínica, em Configurações.", 403);
  return profissional;
}

export async function GET(request: Request) {
  const profissional = await educador(request);
  if (profissional instanceof NextResponse) return profissional;
  const r = await obterPool().query(
    "select nome, cref, telefone, email_contato, logo_path is not null as tem_logo from public.educadores_fisicos where usuario_id = $1",
    [profissional.usuarioId]
  );
  return NextResponse.json({ perfil: r.rows[0] });
}

function texto(valor: unknown, limite: number, rotulo: string, obrigatorio = false) {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (obrigatorio && t.length < 2) throw new Error(`Preencha ${rotulo}.`);
  if (t.length > limite) throw new Error(`${rotulo}: no máximo ${limite} caracteres.`);
  return t || null;
}

export async function PUT(request: Request) {
  const profissional = await educador(request);
  if (profissional instanceof NextResponse) return profissional;
  const d = (await request.json().catch(() => null)) ?? {};
  try {
    const email = texto(d.email_contato, 120, "o e-mail");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("E-mail de contato inválido.");
    await obterPool().query(
      "update public.educadores_fisicos set nome = $2, cref = $3, telefone = $4, email_contato = $5, atualizado_em = now() where usuario_id = $1",
      [profissional.usuarioId, texto(d.nome, 120, "o nome", true), texto(d.cref, 30, "o CREF"), texto(d.telefone, 30, "o telefone"), email]
    );
  } catch (erro) {
    return recusar((erro as Error).message, 400);
  }
  return GET(request);
}

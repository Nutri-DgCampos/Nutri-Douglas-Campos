import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Aparelhos que recebem push do profissional conectado (Configurações →
// Notificações). Pausar ou remover um aparelho não apaga o histórico do sino.
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const r = await obterPool().query(
    `select id, descricao, ativo, criado_em, atualizado_em, endpoint
       from public.push_profissionais where usuario_id = $1 order by atualizado_em desc`,
    [profissional.usuarioId]
  );
  // O endereço completo de push não sai do servidor; só o suficiente para
  // a tela reconhecer "este aparelho".
  const atual = new URL(request.url).searchParams.get("endpoint");
  return NextResponse.json({
    aparelhos: r.rows.map(({ endpoint, ...a }) => ({ ...a, este: Boolean(atual) && endpoint === atual })),
  });
}

export async function PATCH(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const dados = (await request.json().catch(() => ({}))) ?? {};
  if (typeof dados.id !== "string" || !UUID.test(dados.id) || typeof dados.ativo !== "boolean") return recusar("Dados inválidos.", 400);
  const r = await obterPool().query(
    "update public.push_profissionais set ativo = $3, atualizado_em = now() where id = $1 and usuario_id = $2",
    [dados.id, profissional.usuarioId, dados.ativo]
  );
  return r.rowCount ? NextResponse.json({ sucesso: true }) : recusar("Aparelho não encontrado.", 404);
}

export async function DELETE(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return recusar("Aparelho inválido.", 400);
  const r = await obterPool().query("delete from public.push_profissionais where id = $1 and usuario_id = $2", [id, profissional.usuarioId]);
  return r.rowCount ? NextResponse.json({ sucesso: true }) : recusar("Aparelho não encontrado.", 404);
}

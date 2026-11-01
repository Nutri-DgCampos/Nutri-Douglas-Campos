import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { recusar } from "@/lib/servidor/http";
import { exigirProfissionalDeTreino } from "@/lib/servidor/treinoAcesso";

export const runtime = "nodejs";

// Inscrição do navegador/celular do profissional para receber os alertas do
// Treino. Separada das inscrições dos pacientes.
export async function POST(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const dados = (await request.json().catch(() => ({}))) ?? {};
  const { endpoint, p256dh, auth } = dados as Record<string, unknown>;
  if (
    typeof endpoint !== "string" || !endpoint.startsWith("https://") || endpoint.length > 1000 ||
    typeof p256dh !== "string" || p256dh.length > 200 ||
    typeof auth !== "string" || auth.length > 100
  ) {
    return recusar("Inscrição inválida.", 400);
  }
  await obterPool().query(
    `insert into public.push_profissionais (usuario_id, endpoint, p256dh, auth_key) values ($1, $2, $3, $4)
     on conflict (endpoint) do update
       set usuario_id = excluded.usuario_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key, atualizado_em = now()`,
    [profissional.usuarioId, endpoint, p256dh, auth]
  );
  return NextResponse.json({ sucesso: true });
}

// Este aparelho já está inscrito para o profissional conectado?
export async function GET(request: Request) {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  const endpoint = new URL(request.url).searchParams.get("endpoint") ?? "";
  const r = await obterPool().query("select 1 from public.push_profissionais where usuario_id = $1 and endpoint = $2", [profissional.usuarioId, endpoint]);
  return NextResponse.json({ inscrito: (r.rowCount ?? 0) > 0 });
}

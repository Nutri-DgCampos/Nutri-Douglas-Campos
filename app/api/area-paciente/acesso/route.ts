import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

// A área do paciente avisa que foi aberta (e se foi pelo app instalado).
// Alimenta o indicador de acesso na lista de pacientes do nutricionista.
export async function POST(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);

  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return NextResponse.json({ registrado: false });

  const dados = await request.json().catch(() => null);
  const instalado = dados?.instalado === true;

  await obterPool().query(
    `update public.patients
        set ultimo_acesso_em = now(),
            app_instalado_em = case when $2 then now() else app_instalado_em end
      where id = $1`,
    [contexto.pacienteId, instalado]
  );

  return NextResponse.json({ registrado: true });
}

import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Acesso de cada paciente ao aplicativo: tem login, quantos aparelhos
// recebem os avisos, último acesso e último uso pelo app instalado.
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const resultado = await obterPool().query(
    `select p.id,
            p.auth_user_id is not null as tem_acesso,
            (select count(*)::int from public.push_subscriptions s where s.patient_id = p.id) as aparelhos,
            p.ultimo_acesso_em,
            p.app_instalado_em
       from public.patients p`
  );

  return NextResponse.json({ pacientes: resultado.rows });
}

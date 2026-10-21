import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Avisos da tela Dietas pendentes: "Anamnese online recebida" e
// "Recordatório alimentar recebido", até o nutricionista clicar em
// "Preparar dieta". Os formulários continuam na ficha do paciente.
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const resultado = await obterPool().query<{ patient_id: string; name: string; anamnese: boolean; recordatorio: boolean }>(
    `select p.id as patient_id, p.name,
            exists (select 1 from public.anamneses a where a.patient_id = p.id and a.respondido_em is not null
                     and a.aviso_visto_em is null and a.arquivado_em is null) as anamnese,
            exists (select 1 from public.recordatorios r where r.patient_id = p.id and r.respondido_em is not null
                     and r.aviso_visto_em is null and r.arquivado_em is null) as recordatorio
       from public.patients p
      where exists (select 1 from public.anamneses a where a.patient_id = p.id and a.respondido_em is not null
                     and a.aviso_visto_em is null and a.arquivado_em is null)
         or exists (select 1 from public.recordatorios r where r.patient_id = p.id and r.respondido_em is not null
                     and r.aviso_visto_em is null and r.arquivado_em is null)
      order by p.name`
  );
  return NextResponse.json({ avisos: resultado.rows });
}

// "Preparar dieta": marca os avisos do paciente como vistos.
export async function POST(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const dados = await request.json().catch(() => null);
  if (!UUID.test(String(dados?.pacienteId))) return recusar("Paciente inválido.", 400);

  const pool = obterPool();
  await pool.query(
    "update public.anamneses set aviso_visto_em = now() where patient_id = $1 and respondido_em is not null and aviso_visto_em is null",
    [dados.pacienteId]
  );
  await pool.query(
    "update public.recordatorios set aviso_visto_em = now() where patient_id = $1 and respondido_em is not null and aviso_visto_em is null",
    [dados.pacienteId]
  );
  return NextResponse.json({ ok: true });
}

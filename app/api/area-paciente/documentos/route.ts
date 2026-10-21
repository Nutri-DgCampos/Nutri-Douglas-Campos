import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

// Documentos enviados ao paciente conectado (solicitações de exames e
// orientações), com o aviso de novidade.
export async function GET(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  const resultado = await obterPool().query(
    `select d.id, d.tipo, d.titulo, d.file_name, d.storage_path, d.enviado_em,
            not exists (select 1 from public.patient_update_views v
                         where v.patient_id = d.patient_id and v.update_type = 'documento' and v.reference_id = d.id) as novo
       from public.documentos_enviados d
      where d.patient_id = $1
      order by d.enviado_em desc`,
    [contexto.pacienteId]
  );
  return NextResponse.json({ documentos: resultado.rows });
}

// Marca como vistos.
export async function POST(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto?.pacienteId) return recusar("Somente pacientes.", 403);
  await obterPool().query(
    `insert into public.patient_update_views (patient_id, update_type, reference_id)
     select d.patient_id, 'documento', d.id from public.documentos_enviados d where d.patient_id = $1
     on conflict (patient_id, update_type, reference_id) do nothing`,
    [contexto.pacienteId]
  );
  return NextResponse.json({ ok: true });
}

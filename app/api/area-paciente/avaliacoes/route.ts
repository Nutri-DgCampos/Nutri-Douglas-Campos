import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { origemPermitida, recusar } from "@/lib/servidor/http";
import { obterContexto } from "@/lib/servidor/sessao";

export const runtime = "nodejs";

async function pacienteConectado(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  return contexto.pacienteId;
}

// Avaliações físicas enviadas ao paciente conectado (só o que foi publicado):
// a versão mais recente de cada avaliação, com o aviso de novidade.
export async function GET(request: Request) {
  const pacienteId = await pacienteConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;

  const resultado = await obterPool().query(
    `select * from (
       select distinct on (e.avaliacao_id) e.id, e.avaliacao_id, e.numero, e.file_name, e.storage_path, e.enviada_em,
              to_char(a.data, 'YYYY-MM-DD') as data,
              not exists (select 1 from public.patient_update_views v
                           where v.patient_id = e.patient_id and v.update_type = 'avaliacao' and v.reference_id = e.id) as nova
         from public.avaliacoes_envios e
         join public.avaliacoes_fisicas a on a.id = e.avaliacao_id
        where e.patient_id = $1
        order by e.avaliacao_id, e.numero desc
     ) x order by x.data desc, x.enviada_em desc`,
    [pacienteId]
  );
  return NextResponse.json({ avaliacoes: resultado.rows });
}

// Marca como vistas as avaliações recebidas.
export async function POST(request: Request) {
  const pacienteId = await pacienteConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;

  await obterPool().query(
    `insert into public.patient_update_views (patient_id, update_type, reference_id)
     select e.patient_id, 'avaliacao', e.id from public.avaliacoes_envios e where e.patient_id = $1
     on conflict (patient_id, update_type, reference_id) do nothing`,
    [pacienteId]
  );
  return NextResponse.json({ ok: true });
}

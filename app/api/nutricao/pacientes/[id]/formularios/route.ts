import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import type { LinhaFormulario } from "@/lib/servidor/formularios";
import { resumoDoFormulario } from "@/lib/servidor/formulariosNutricionista";
import { pacienteDaClinica } from "@/lib/servidor/clinica";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Todas as anamneses e recordatórios do paciente (histórico e importação).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!(await pacienteDaClinica(id))) return recusar("Paciente não encontrado.", 404);

  const pool = obterPool();
  const consultaData = "(select to_char(c.data, 'YYYY-MM-DD') from public.consultas c where c.id = f.consulta_id) as consulta_data";
  // Anamneses do Treino (SPEC 06/11): só as preenchidas, para leitura, com a
  // data da resposta no lugar da consulta e o profissional que enviou.
  const [anamneses, recordatorios] = await Promise.all([
    pool.query<LinhaFormulario & { consulta_data: string; autor: string | null }>(
      `select f.*,
              coalesce(${consultaData.replace(" as consulta_data", "")},
                       to_char(coalesce(f.respondido_em, f.concluido_em, f.atualizado_em) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')) as consulta_data,
              (select coalesce(e.nome, 'Profissional do Treino') from public.educadores_fisicos e where e.usuario_id = f.criado_por) as autor
         from public.anamneses f
        where f.patient_id = $1 and (f.modulo = 'nutricao' or f.respondido_em is not null or f.status = 'concluido')
        order by f.criado_em desc`,
      [id]
    ),
    pool.query<LinhaFormulario & { consulta_data: string }>(
      `select f.*, ${consultaData} from public.recordatorios f where f.patient_id = $1 order by f.criado_em desc`,
      [id]
    ),
  ]);
  return NextResponse.json({
    anamneses: anamneses.rows.map((f) => ({ ...resumoDoFormulario(f), consulta_data: f.consulta_data, modulo: f.modulo ?? "nutricao", autor: f.autor })),
    recordatorios: recordatorios.rows.map((f) => ({ ...resumoDoFormulario(f), consulta_data: f.consulta_data, conteudo: f.conteudo })),
  });
}

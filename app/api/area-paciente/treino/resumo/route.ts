import { NextResponse } from "next/server";
import { alunoConectado } from "@/lib/servidor/alunoConectado";
import { obterPool } from "@/lib/servidor/banco";
import { bloqueiosDoAluno } from "@/lib/servidor/treinoContratos";
import { prescricaoVigente } from "@/lib/servidor/treinoRegistros";

export const runtime = "nodejs";

// O paciente conectado tem treino para ver em "Meu treino"? (SPEC de
// correções 10/11, item 001.) O cartão "Treino" da tela inicial só olhava o
// arquivo enviado pelo próprio paciente (tabela treinos) e escondia o treino
// enviado pelo profissional. Só do próprio paciente; respeita o bloqueio por
// plano vencido (T8, S2).
export async function GET(request: Request) {
  const pacienteId = await alunoConectado(request);
  if (pacienteId instanceof NextResponse) return pacienteId;
  const { bloqueados } = await bloqueiosDoAluno(pacienteId);
  const [musculacao, planilhas] = await Promise.all([
    prescricaoVigente(pacienteId, bloqueados),
    obterPool().query<{ total: number }>(
      `select count(*)::int as total from public.treino_prescricoes
        where patient_id = $1 and status = 'publicada' and modalidade in ('corrida', 'ciclismo') and arquivada_em is null
          and (criada_por is null or criada_por <> all($2::uuid[]))`,
      [pacienteId, bloqueados]
    ),
  ]);
  return NextResponse.json(
    { musculacao: musculacao ? { origem: musculacao.origem } : null, planilhas: planilhas.rows[0].total > 0 },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}

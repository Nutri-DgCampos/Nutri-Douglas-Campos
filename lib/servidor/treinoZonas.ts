import { validarZonas, type ModalidadeEndurance, type ZonasDoAluno } from "@/lib/treinoEndurance";
import { obterPool } from "./banco";

// Zonas individuais do aluno (T4c): FC e ritmo informados pelo profissional
// (E1); no ciclismo, FTP e zonas de potência (Coggan, R2, editáveis).
// Compartilhadas pelos profissionais que acompanham o aluno.

export class ZonasInvalidas extends Error {}

const VAZIAS: ZonasDoAluno = { fc: [], ritmo: [], ftp: null, potencia: [] };

export async function zonasDoAluno(patientId: string, modalidade: ModalidadeEndurance) {
  const r = await obterPool().query<{ zonas: ZonasDoAluno; atualizado_em: string; autor: string | null }>(
    `select z.zonas, z.atualizado_em,
            coalesce(e.nome, case when pr.role = 'nutricionista' then 'Administrador' end) as autor
       from public.treino_zonas z
       left join public.educadores_fisicos e on e.usuario_id = z.atualizado_por
       left join public.profiles pr on pr.id = z.atualizado_por
      where z.patient_id = $1 and z.modalidade = $2`,
    [patientId, modalidade]
  );
  const linha = r.rows[0];
  return linha ? { ...VAZIAS, ...linha.zonas, atualizado_em: linha.atualizado_em, autor: linha.autor } : { ...VAZIAS, atualizado_em: null, autor: null };
}

export async function salvarZonas(usuarioId: string, patientId: string, modalidade: ModalidadeEndurance, corpo: unknown) {
  const v = validarZonas(corpo, modalidade);
  if ("erro" in v) throw new ZonasInvalidas(v.erro);
  await obterPool().query(
    `insert into public.treino_zonas (patient_id, modalidade, zonas, atualizado_por) values ($1, $2, $3, $4)
     on conflict (patient_id, modalidade) do update set zonas = excluded.zonas, atualizado_por = excluded.atualizado_por, atualizado_em = now()`,
    [patientId, modalidade, JSON.stringify(v.zonas), usuarioId]
  );
  return zonasDoAluno(patientId, modalidade);
}

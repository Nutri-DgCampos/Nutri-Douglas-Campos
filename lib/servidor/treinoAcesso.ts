import { NextResponse } from "next/server";
import { obterPool } from "./banco";
import { origemPermitida, recusar } from "./http";
import type { Contexto } from "./permissoes";
import { obterContexto } from "./sessao";

// Quem acessa o Módulo de Treino.
//
// - Nutricionista: administrador. Vê todos os alunos da clínica, cadastra
//   educadores físicos e faz os vínculos.
// - Educador físico: só o Módulo de Treino, e só dos alunos vinculados a ele
//   (vínculo ativo). Conta desativada perde o acesso na hora.
// - Alunos próprios do educador (T7b, resposta A7): cadastrados por ele,
//   vinculados a ele e invisíveis ao administrador.
//
// O resto do sistema continua exigindo papel === "nutricionista": o educador
// não alcança nada da Nutrição, nem pela API.

export const PAPEL_EDUCADOR = "educador_fisico";

export type ProfissionalDeTreino = Contexto & { admin: boolean };

export function ehAdmin(contexto: Pick<Contexto, "papel">) {
  return contexto.papel === "nutricionista";
}

export async function educadorAtivo(usuarioId: string) {
  const r = await obterPool().query("select 1 from public.educadores_fisicos where usuario_id = $1 and ativo", [usuarioId]);
  return (r.rowCount ?? 0) > 0;
}

// Para layouts e páginas do servidor: o profissional conectado ou null.
export async function profissionalDeTreino(contexto: Contexto | null): Promise<ProfissionalDeTreino | null> {
  if (!contexto || contexto.pacienteId) return null;
  if (ehAdmin(contexto)) return { ...contexto, admin: true };
  if (contexto.papel === PAPEL_EDUCADOR && (await educadorAtivo(contexto.usuarioId))) return { ...contexto, admin: false };
  return null;
}

export async function exigirProfissionalDeTreino(request: Request): Promise<ProfissionalDeTreino | NextResponse> {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  const profissional = await profissionalDeTreino(contexto);
  if (!profissional) return recusar("Acesso permitido somente aos profissionais do Treino.", 403);
  return profissional;
}

export async function exigirAdminDoTreino(request: Request): Promise<ProfissionalDeTreino | NextResponse> {
  const profissional = await exigirProfissionalDeTreino(request);
  if (profissional instanceof NextResponse) return profissional;
  if (!profissional.admin) return recusar("Acesso permitido somente ao administrador.", 403);
  return profissional;
}

// O profissional acompanha este aluno? (admin: qualquer paciente da clínica)
export async function podeAcompanharAluno(profissional: ProfissionalDeTreino, patientId: string) {
  const r = profissional.admin
    ? await obterPool().query("select 1 from public.patients where id = $1 and educador_dono_id is null", [patientId])
    : await obterPool().query(
        "select 1 from public.treino_vinculos where patient_id = $1 and profissional_id = $2 and fim is null",
        [patientId, profissional.usuarioId]
      );
  return (r.rowCount ?? 0) > 0;
}

// Alunos visíveis ao profissional, com o resumo do Treino.
export async function alunosDoProfissional(profissional: ProfissionalDeTreino) {
  const filtro = profissional.admin
    ? "where p.educador_dono_id is null"
    : "where exists (select 1 from public.treino_vinculos v where v.patient_id = p.id and v.profissional_id = $1 and v.fim is null)";
  const r = await obterPool().query<{
    id: string;
    nome: string;
    situacao: string;
    tem_treino: boolean;
    desconfortos_novos: number;
    educadores: string[];
    proprio: boolean;
    desativado: boolean;
  }>(
    `select p.id, p.name as nome, p.payment_status as situacao,
            p.educador_dono_id is not null and p.educador_dono_id = $1 as proprio,
            p.desativado_em is not null as desativado,
            exists (select 1 from public.treino_prescricoes t where t.patient_id = p.id and t.status = 'publicada' and t.arquivada_em is null) as tem_treino,
            (select count(*)::int from public.treino_desconfortos d where d.patient_id = p.id and d.visto_em is null) as desconfortos_novos,
            coalesce((select array_agg(e.nome order by e.nome)
                        from public.treino_vinculos v
                        join public.educadores_fisicos e on e.usuario_id = v.profissional_id
                       where v.patient_id = p.id and v.fim is null), '{}') as educadores
       from public.patients p
       ${filtro}
      order by p.name`,
    [profissional.usuarioId]
  );
  return r.rows;
}

// Quem recebe o aviso imediato de um aluno: os educadores vinculados e ativos;
// sem nenhum, os administradores (nutricionistas). Aluno próprio de educador
// nunca vai para o administrador.
export async function responsaveisPeloAluno(patientId: string) {
  const educadores = await obterPool().query<{ id: string }>(
    `select v.profissional_id as id
       from public.treino_vinculos v
       join public.educadores_fisicos e on e.usuario_id = v.profissional_id and e.ativo
      where v.patient_id = $1 and v.fim is null`,
    [patientId]
  );
  if (educadores.rows.length) return educadores.rows.map((l) => l.id);
  const admins = await obterPool().query<{ id: string }>(
    `select id from public.profiles
      where role = 'nutricionista'
        and exists (select 1 from public.patients where id = $1 and educador_dono_id is null)`,
    [patientId]
  );
  return admins.rows.map((l) => l.id);
}

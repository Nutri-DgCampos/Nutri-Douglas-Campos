import { ordenarSessoes, planoVazio, problemasParaEnvio, validarPlanoDoEditor } from "@/lib/treinoEditor";
import type { PlanoDeTreino } from "@/lib/treino";
import { obterPool } from "./banco";
import { enfileirarAtualizacao } from "./notificacoes";
import { podeAcompanharAluno, type ProfissionalDeTreino } from "./treinoAcesso";

// Programas de musculação do editor (T4a).
//
// - Programa = um rascunho do profissional (linha com status "rascunho",
//   editável, com controle de revisão) + as versões enviadas ao aluno (uma
//   linha publicada por envio, imutável pelo gatilho da migração 020).
// - Só o autor edita, envia e arquiva o próprio programa, e só enquanto
//   acompanha o aluno. O aluno vê a versão publicada mais recente (C4).
// - Arquivar não apaga nada: tira da lista e deixa de valer para o aluno.

export class ProgramaInvalido extends Error {}
export class RevisaoDesatualizada extends Error {}

export type ResumoDoPrograma = {
  programa_id: string;
  titulo: string | null;
  objetivo: string | null;
  atualizada_em: string;
  arquivada_em: string | null;
  versao: number | null;
  publicada_em: string | null;
  alterada: boolean;
  vigente: boolean;
};

export type ProgramaCompleto = {
  programa_id: string;
  patient_id: string;
  titulo: string;
  objetivo: string;
  plano: PlanoDeTreino;
  revisao: number;
  atualizada_em: string;
  arquivada_em: string | null;
  importacao: { em: string; origem: "texto" | "arquivo"; nome: string | null; caminho: string | null; texto: string | null; comentario: string | null } | null;
  versoes: { id: string; versao: number; publicada_em: string }[];
};

// Prescrição vigente do aluno (qualquer origem), para marcar o programa.
const VIGENTE = `(select v.id from public.treino_prescricoes v
                   where v.patient_id = r.patient_id and v.status = 'publicada' and v.modalidade = 'musculacao' and v.arquivada_em is null
                   order by v.publicada_em desc, v.criada_em desc limit 1)`;

export async function programasDoAluno(profissional: ProfissionalDeTreino, patientId: string): Promise<ResumoDoPrograma[]> {
  const r = await obterPool().query<ResumoDoPrograma>(
    `select r.programa_id, r.titulo, r.objetivo, r.atualizada_em, r.arquivada_em,
            u.versao, u.publicada_em,
            u.id is not null and (u.plano is distinct from r.plano or u.titulo is distinct from r.titulo) as alterada,
            u.id is not null and u.id = ${VIGENTE} as vigente
       from public.treino_prescricoes r
       left join lateral (select p.id, p.versao, p.publicada_em, p.plano, p.titulo from public.treino_prescricoes p
                           where p.programa_id = r.programa_id and p.status = 'publicada'
                           order by p.versao desc limit 1) u on true
      where r.patient_id = $1 and r.status = 'rascunho' and r.criada_por = $2 and r.modalidade = 'musculacao'
      order by r.arquivada_em nulls first, r.atualizada_em desc`,
    [patientId, profissional.usuarioId]
  );
  return r.rows;
}

// Programa do autor, com acesso conferido. null = não encontrado.
async function rascunhoDoAutor(profissional: ProfissionalDeTreino, programaId: string) {
  const r = await obterPool().query<{ id: string; patient_id: string }>(
    `select id, patient_id from public.treino_prescricoes
      where programa_id = $1 and status = 'rascunho' and criada_por = $2`,
    [programaId, profissional.usuarioId]
  );
  const linha = r.rows[0];
  if (!linha || !(await podeAcompanharAluno(profissional, linha.patient_id))) return null;
  return linha;
}

export async function lerPrograma(profissional: ProfissionalDeTreino, programaId: string): Promise<ProgramaCompleto | null> {
  if (!(await rascunhoDoAutor(profissional, programaId))) return null;
  const pool = obterPool();
  const [rascunho, versoes] = await Promise.all([
    pool.query<ProgramaCompleto>(
      `select programa_id, patient_id, coalesce(titulo, '') as titulo, coalesce(objetivo, '') as objetivo, plano, revisao,
              atualizada_em, arquivada_em, importacao
         from public.treino_prescricoes where programa_id = $1 and status = 'rascunho'`,
      [programaId]
    ),
    pool.query<{ id: string; versao: number; publicada_em: string }>(
      `select id, versao, publicada_em from public.treino_prescricoes
        where programa_id = $1 and status = 'publicada' order by versao desc`,
      [programaId]
    ),
  ]);
  return { ...rascunho.rows[0], versoes: versoes.rows };
}

type Origem =
  | { tipo: "vazio" }
  | { tipo: "duplicar"; programaId: string }
  | { tipo: "modelo"; modeloId: string }
  | { tipo: "rotina"; prescricaoId: string }
  | { tipo: "ia"; plano: PlanoDeTreino; titulo: string; objetivo: string };

// Novo programa (Gerar novo treino, Duplicar, Modelo, Importar rotina).
export async function criarPrograma(profissional: ProfissionalDeTreino, patientId: string, origem: Origem) {
  if (!(await podeAcompanharAluno(profissional, patientId))) return null;
  const pool = obterPool();
  let plano: PlanoDeTreino = planoVazio();
  let titulo = "";
  let objetivo = "";

  if (origem.tipo === "duplicar") {
    const base = await lerPrograma(profissional, origem.programaId);
    if (!base) throw new ProgramaInvalido("Programa não encontrado.");
    plano = base.plano;
    titulo = base.titulo ? `${base.titulo} (cópia)` : "";
    objetivo = base.objetivo;
  } else if (origem.tipo === "modelo") {
    const modelo = await pool.query<{ nome: string; plano: PlanoDeTreino }>(
      `select nome, plano from public.treino_modelos
        where id = $1 and arquivado_em is null and modalidade = 'musculacao' and (compartilhado or criado_por = $2)`,
      [origem.modeloId, profissional.usuarioId]
    );
    if (!modelo.rows[0]) throw new ProgramaInvalido("Modelo não encontrado.");
    plano = modelo.rows[0].plano;
    titulo = modelo.rows[0].nome;
  } else if (origem.tipo === "rotina") {
    // Treino que o aluno já tem (importado por ele ou enviado por outro
    // profissional que o acompanha): copiado para revisão.
    const rotina = await pool.query<{ plano: PlanoDeTreino; titulo: string | null }>(
      `select plano, titulo from public.treino_prescricoes
        where id = $1 and patient_id = $2 and status = 'publicada' and modalidade = 'musculacao'`,
      [origem.prescricaoId, patientId]
    );
    if (!rotina.rows[0]) throw new ProgramaInvalido("Treino não encontrado.");
    plano = rotina.rows[0].plano;
    titulo = rotina.rows[0].titulo ?? "";
  } else if (origem.tipo === "ia") {
    plano = origem.plano;
    titulo = origem.titulo;
    objetivo = origem.objetivo;
  }

  const limpo = validarPlanoDoEditor(plano);
  if ("erro" in limpo) throw new ProgramaInvalido(limpo.erro);
  const criado = await pool.query<{ programa_id: string }>(
    `insert into public.treino_prescricoes (patient_id, origem, versao, modalidade, plano, status, criada_por, programa_id, titulo, objetivo)
     values ($1, 'profissional', 0, 'musculacao', $2, 'rascunho', $3, gen_random_uuid(), $4, $5)
     returning programa_id`,
    [patientId, JSON.stringify(limpo.plano), profissional.usuarioId, titulo.slice(0, 120) || null, objetivo.slice(0, 120) || null]
  );
  return criado.rows[0].programa_id;
}

function textoCurto(valor: unknown, limite: number) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor !== "string") throw new ProgramaInvalido("Texto inválido.");
  const t = valor.trim().replace(/\s+/g, " ");
  if (t.length > limite) throw new ProgramaInvalido(`Texto com mais de ${limite} caracteres.`);
  return t;
}

// Salvar e salvamento automático: só o rascunho.
export async function salvarRascunho(profissional: ProfissionalDeTreino, programaId: string, dados: Record<string, unknown>) {
  if (!(await rascunhoDoAutor(profissional, programaId))) return null;
  const titulo = textoCurto(dados.titulo, 120);
  const objetivo = textoCurto(dados.objetivo, 120);
  const limpo = validarPlanoDoEditor(dados.plano);
  if ("erro" in limpo) throw new ProgramaInvalido(limpo.erro);
  const gravado = await obterPool().query<{ revisao: number; atualizada_em: string }>(
    `update public.treino_prescricoes
        set titulo = $2, objetivo = $3, plano = $4, revisao = revisao + 1, atualizada_em = now()
      where programa_id = $1 and status = 'rascunho' and revisao = $5 and arquivada_em is null
      returning revisao, atualizada_em`,
    [programaId, titulo || null, objetivo || null, JSON.stringify(limpo.plano), dados.revisao]
  );
  if (!gravado.rows[0]) throw new RevisaoDesatualizada("O treino foi alterado em outra janela ou está arquivado. Recarregue antes de continuar.");
  return gravado.rows[0];
}

// "Enviar ao paciente": nova versão imutável a partir do rascunho salvo.
export async function enviarAoAluno(profissional: ProfissionalDeTreino, programaId: string, revisao: unknown) {
  const dono = await rascunhoDoAutor(profissional, programaId);
  if (!dono) return null;
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const r = await cliente.query<{ patient_id: string; titulo: string | null; objetivo: string | null; plano: PlanoDeTreino; revisao: number; arquivada_em: string | null }>(
      `select patient_id, titulo, objetivo, plano, revisao, arquivada_em from public.treino_prescricoes
        where programa_id = $1 and status = 'rascunho' for update`,
      [programaId]
    );
    const rascunho = r.rows[0];
    if (rascunho.revisao !== revisao) throw new RevisaoDesatualizada("Salve o treino antes de enviar (há alterações não gravadas).");
    if (rascunho.arquivada_em) throw new ProgramaInvalido("Treino arquivado: reative antes de enviar.");
    const problemas = problemasParaEnvio({ titulo: rascunho.titulo ?? "", objetivo: rascunho.objetivo ?? "", plano: rascunho.plano });
    if (problemas.length) throw new ProgramaInvalido(problemas.join(" "));
    const publicada = await cliente.query<{ id: string; versao: number; publicada_em: string }>(
      `insert into public.treino_prescricoes (patient_id, origem, versao, modalidade, plano, status, criada_por, programa_id, titulo, objetivo)
       values ($1, 'profissional',
               (select coalesce(max(versao), 0) + 1 from public.treino_prescricoes where programa_id = $2 and status = 'publicada'),
               'musculacao', $3, 'publicada', $4, $2, $5, $6)
       returning id, versao, publicada_em`,
      [rascunho.patient_id, programaId, JSON.stringify(ordenarSessoes(rascunho.plano)), profissional.usuarioId, rascunho.titulo, rascunho.objetivo]
    );
    await cliente.query("commit");
    const versao = publicada.rows[0];
    await enfileirarAtualizacao("treino_novo", rascunho.patient_id, versao.id);
    return versao;
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

// Arquivar / reativar o programa inteiro (rascunho e versões).
export async function arquivarPrograma(profissional: ProfissionalDeTreino, programaId: string, arquivar: boolean) {
  if (!(await rascunhoDoAutor(profissional, programaId))) return false;
  await obterPool().query(
    `update public.treino_prescricoes
        set arquivada_em = ${arquivar ? "now()" : "null"}, arquivada_por = ${arquivar ? "$2" : "null"}
      where programa_id = $1`,
    arquivar ? [programaId, profissional.usuarioId] : [programaId]
  );
  return true;
}

// Guarda a origem da importação no rascunho (o original fica no bucket
// "treinos" do aluno ou como texto).
export async function registrarImportacao(programaId: string, importacao: NonNullable<ProgramaCompleto["importacao"]>) {
  await obterPool().query(
    "update public.treino_prescricoes set importacao = $2 where programa_id = $1 and status = 'rascunho'",
    [programaId, JSON.stringify(importacao)]
  );
}

// Treinos publicados do aluno que podem servir de base ("Importar rotina"):
// o mais recente de cada origem (envio do aluno ou programa).
export async function rotinasDoAluno(profissional: ProfissionalDeTreino, patientId: string) {
  if (!(await podeAcompanharAluno(profissional, patientId))) return [];
  const r = await obterPool().query<{ id: string; origem: string; titulo: string | null; versao: number; publicada_em: string; autor: string | null; dias: number }>(
    `select distinct on (coalesce(p.programa_id, p.treino_id, p.id))
            p.id, p.origem, p.titulo, p.versao, p.publicada_em,
            coalesce(e.nome, case when pr.role = 'nutricionista' then 'Administrador' end) as autor,
            jsonb_array_length(p.plano->'dias') as dias
       from public.treino_prescricoes p
       left join public.educadores_fisicos e on e.usuario_id = p.criada_por
       left join public.profiles pr on pr.id = p.criada_por
      where p.patient_id = $1 and p.status = 'publicada' and p.modalidade = 'musculacao'
      order by coalesce(p.programa_id, p.treino_id, p.id), p.publicada_em desc
      limit 30`,
    [patientId]
  );
  return r.rows.sort((a, b) => b.publicada_em.localeCompare(a.publicada_em));
}

// Versão publicada para o PDF (ou o rascunho, marcado como tal).
export async function versaoParaPdf(profissional: ProfissionalDeTreino, programaId: string, versao: number | null) {
  if (!(await rascunhoDoAutor(profissional, programaId))) return null;
  const r = await obterPool().query<{ patient_id: string; titulo: string | null; objetivo: string | null; plano: PlanoDeTreino; versao: number; status: string; publicada_em: string; atualizada_em: string }>(
    versao === null
      ? `select patient_id, titulo, objetivo, plano, versao, status, publicada_em, atualizada_em from public.treino_prescricoes
          where programa_id = $1 and status = 'rascunho'`
      : `select patient_id, titulo, objetivo, plano, versao, status, publicada_em, atualizada_em from public.treino_prescricoes
          where programa_id = $1 and status = 'publicada' and versao = $2`,
    versao === null ? [programaId] : [programaId, versao]
  );
  return r.rows[0] ?? null;
}

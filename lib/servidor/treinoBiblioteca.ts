import { GRUPOS, OUTROS_GRUPOS, type PlanoDeTreino } from "@/lib/treino";
import { EQUIPAMENTOS, VIDEO_YOUTUBE, validarPlanoDoEditor } from "@/lib/treinoEditor";
import { obterPool } from "./banco";
import { podeAcompanharAluno, type ProfissionalDeTreino } from "./treinoAcesso";

// Biblioteca de exercícios, academias e modelos do Treino (T4a).
//
// - Exercícios: lista compartilhada. Os itens da lista inicial (base) só o
//   administrador altera; cada profissional altera os que cadastrou. Nada se
//   apaga: arquiva-se (pode estar em prescrições). Nome repetido é recusado.
// - Academias: nome e equipamentos, compartilhadas entre os profissionais
//   (não têm dado de aluno). Quem cadastrou ou o administrador alteram.
// - Modelos: treino sem dados de aluno, privado ou compartilhado.

export class DadoInvalido extends Error {}

export type ExercicioDaBiblioteca = {
  id: string;
  nome: string;
  grupo: string;
  grupos_secundarios: string[];
  equipamentos: string[];
  instrucoes: string | null;
  video_url: string | null;
  base: boolean;
  pode_alterar: boolean;
  arquivado_em: string | null;
};

function texto(valor: unknown, limite: number, obrigatorio = false) {
  if (valor === null || valor === undefined || valor === "") {
    if (obrigatorio) throw new DadoInvalido("Preencha o nome.");
    return null;
  }
  if (typeof valor !== "string") throw new DadoInvalido("Texto inválido.");
  const t = valor.trim();
  if (t.length > limite) throw new DadoInvalido(`Texto com mais de ${limite} caracteres.`);
  if (obrigatorio && t.length < 2) throw new DadoInvalido("Preencha o nome.");
  return t || null;
}

function listaDe(valor: unknown, permitidos: readonly string[], rotulo: string) {
  if (valor === null || valor === undefined) return [];
  if (!Array.isArray(valor) || !valor.every((v) => typeof v === "string" && permitidos.includes(v))) throw new DadoInvalido(`${rotulo} inválidos.`);
  return [...new Set(valor as string[])];
}

const PODE_ALTERAR_EXERCICIO = (p: ProfissionalDeTreino) => (p.admin ? "true" : `(not e.base and e.criado_por = '${p.usuarioId}')`);

export async function listarExercicios(profissional: ProfissionalDeTreino, busca = "", arquivados = false) {
  const palavras = busca
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const parametros: unknown[] = [];
  const condicoes = [arquivados ? "true" : "e.arquivado_em is null"];
  for (const p of palavras) {
    parametros.push(`%${p.replace(/[%_\\]/g, (x) => `\\${x}`)}%`);
    condicoes.push(`(e.chave like $${parametros.length} or public.normalizar_texto(e.grupo) like $${parametros.length})`);
  }
  const r = await obterPool().query<ExercicioDaBiblioteca>(
    `select e.id, e.nome, e.grupo, e.grupos_secundarios, e.equipamentos, e.instrucoes, e.video_url, e.base, e.arquivado_em,
            ${PODE_ALTERAR_EXERCICIO(profissional)} as pode_alterar
       from public.treino_exercicios e
      where ${condicoes.join(" and ")}
      order by e.arquivado_em nulls first, e.nome
      limit 500`,
    parametros
  );
  return r.rows;
}

function dadosDoExercicio(d: Record<string, unknown>) {
  const nome = texto(d.nome, 120, true)!;
  const grupo = typeof d.grupo === "string" && ([...GRUPOS, ...OUTROS_GRUPOS] as string[]).includes(d.grupo) ? d.grupo : null;
  if (!grupo) throw new DadoInvalido("Escolha o grupo muscular principal.");
  const video = texto(d.video_url, 300);
  if (video && !VIDEO_YOUTUBE.test(video)) throw new DadoInvalido("O vídeo precisa ser um link do YouTube.");
  return {
    nome,
    grupo,
    secundarios: listaDe(d.grupos_secundarios, GRUPOS, "Músculos secundários").filter((g) => g !== grupo),
    equipamentos: listaDe(d.equipamentos, EQUIPAMENTOS, "Equipamentos"),
    instrucoes: texto(d.instrucoes, 2000),
    video,
  };
}

function nomeRepetido(erro: unknown) {
  return (erro as { code?: string })?.code === "23505";
}

export async function criarExercicio(profissional: ProfissionalDeTreino, corpo: unknown) {
  const d = dadosDoExercicio((corpo ?? {}) as Record<string, unknown>);
  try {
    const r = await obterPool().query<{ id: string }>(
      `insert into public.treino_exercicios (nome, chave, grupo, grupos_secundarios, equipamentos, instrucoes, video_url, criado_por)
       values ($1, public.normalizar_texto($1), $2, $3, $4, $5, $6, $7) returning id`,
      [d.nome, d.grupo, d.secundarios, d.equipamentos, d.instrucoes, d.video, profissional.usuarioId]
    );
    return r.rows[0].id;
  } catch (erro) {
    if (nomeRepetido(erro)) throw new DadoInvalido("Já existe um exercício com este nome na biblioteca.");
    throw erro;
  }
}

export async function alterarExercicio(profissional: ProfissionalDeTreino, id: string, corpo: unknown) {
  const dados = (corpo ?? {}) as Record<string, unknown>;
  const pode = `id = $1 and ${PODE_ALTERAR_EXERCICIO(profissional).replaceAll("e.", "")}`;
  if (dados.acao === "arquivar" || dados.acao === "reativar") {
    try {
      const r = await obterPool().query(
        `update public.treino_exercicios set arquivado_em = ${dados.acao === "arquivar" ? "now()" : "null"}, atualizado_em = now() where ${pode}`,
        [id]
      );
      return (r.rowCount ?? 0) > 0;
    } catch (erro) {
      if (nomeRepetido(erro)) throw new DadoInvalido("Já existe outro exercício ativo com este nome.");
      throw erro;
    }
  }
  const d = dadosDoExercicio(dados);
  try {
    const r = await obterPool().query(
      `update public.treino_exercicios
          set nome = $2, chave = public.normalizar_texto($2), grupo = $3, grupos_secundarios = $4, equipamentos = $5,
              instrucoes = $6, video_url = $7, atualizado_em = now()
        where ${pode}`,
      [id, d.nome, d.grupo, d.secundarios, d.equipamentos, d.instrucoes, d.video]
    );
    return (r.rowCount ?? 0) > 0;
  } catch (erro) {
    if (nomeRepetido(erro)) throw new DadoInvalido("Já existe um exercício com este nome na biblioteca.");
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Academias

export type Academia = { id: string; nome: string; domestica: boolean; equipamentos: string[]; pode_alterar: boolean; arquivada_em: string | null };

const PODE_ALTERAR_ACADEMIA = (p: ProfissionalDeTreino) => (p.admin ? "true" : `(a.criada_por = '${p.usuarioId}')`);

export async function listarAcademias(profissional: ProfissionalDeTreino, arquivadas = false) {
  const r = await obterPool().query<Academia>(
    `select a.id, a.nome, a.domestica, a.equipamentos, a.arquivada_em, ${PODE_ALTERAR_ACADEMIA(profissional)} as pode_alterar
       from public.treino_academias a
      where ${arquivadas ? "true" : "a.arquivada_em is null"}
      order by a.arquivada_em nulls first, a.nome`
  );
  return r.rows;
}

function dadosDaAcademia(d: Record<string, unknown>) {
  return {
    nome: texto(d.nome, 120, true)!,
    domestica: d.domestica === true,
    equipamentos: listaDe(d.equipamentos, EQUIPAMENTOS, "Equipamentos"),
  };
}

export async function criarAcademia(profissional: ProfissionalDeTreino, corpo: unknown) {
  const d = dadosDaAcademia((corpo ?? {}) as Record<string, unknown>);
  const r = await obterPool().query<{ id: string }>(
    "insert into public.treino_academias (nome, domestica, equipamentos, criada_por) values ($1, $2, $3, $4) returning id",
    [d.nome, d.domestica, d.equipamentos, profissional.usuarioId]
  );
  return r.rows[0].id;
}

export async function alterarAcademia(profissional: ProfissionalDeTreino, id: string, corpo: unknown) {
  const dados = (corpo ?? {}) as Record<string, unknown>;
  const pode = `id = $1 and ${PODE_ALTERAR_ACADEMIA(profissional).replaceAll("a.", "")}`;
  if (dados.acao === "arquivar" || dados.acao === "reativar") {
    const r = await obterPool().query(
      `update public.treino_academias set arquivada_em = ${dados.acao === "arquivar" ? "now()" : "null"}, atualizada_em = now() where ${pode}`,
      [id]
    );
    return (r.rowCount ?? 0) > 0;
  }
  const d = dadosDaAcademia(dados);
  const r = await obterPool().query(
    `update public.treino_academias set nome = $2, domestica = $3, equipamentos = $4, atualizada_em = now() where ${pode}`,
    [id, d.nome, d.domestica, d.equipamentos]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function academiaDoAluno(patientId: string) {
  const r = await obterPool().query<{ id: string; nome: string; domestica: boolean; equipamentos: string[] }>(
    `select a.id, a.nome, a.domestica, a.equipamentos
       from public.treino_academia_do_aluno x join public.treino_academias a on a.id = x.academia_id
      where x.patient_id = $1`,
    [patientId]
  );
  return r.rows[0] ?? null;
}

// O profissional que acompanha o aluno define (ou tira) a academia dele.
export async function definirAcademiaDoAluno(profissional: ProfissionalDeTreino, patientId: string, academiaId: unknown) {
  if (!(await podeAcompanharAluno(profissional, patientId))) return false;
  if (academiaId === null) {
    await obterPool().query("delete from public.treino_academia_do_aluno where patient_id = $1", [patientId]);
    return true;
  }
  if (typeof academiaId !== "string") throw new DadoInvalido("Academia inválida.");
  const existe = await obterPool().query("select 1 from public.treino_academias where id = $1 and arquivada_em is null", [academiaId]);
  if (!existe.rowCount) throw new DadoInvalido("Academia não encontrada.");
  await obterPool().query(
    `insert into public.treino_academia_do_aluno (patient_id, academia_id, definida_por) values ($1, $2, $3)
     on conflict (patient_id) do update set academia_id = excluded.academia_id, definida_por = excluded.definida_por, definida_em = now()`,
    [patientId, academiaId, profissional.usuarioId]
  );
  return true;
}

// ---------------------------------------------------------------------------
// Modelos

export async function listarModelos(profissional: ProfissionalDeTreino) {
  const r = await obterPool().query<{ id: string; nome: string; compartilhado: boolean; meu: boolean; sessoes: number; criado_em: string }>(
    `select id, nome, compartilhado, criado_por = $1 as meu, jsonb_array_length(plano->'dias') as sessoes, criado_em
       from public.treino_modelos
      where arquivado_em is null and modalidade = 'musculacao' and (compartilhado or criado_por = $1)
      order by nome`,
    [profissional.usuarioId]
  );
  return r.rows;
}

// "Salvar como modelo": o plano sem dados do aluno (cargas e observações
// livres saem; ficam exercícios, séries, repetições, descanso e detalhes).
export function planoSemDadosDoAluno(plano: PlanoDeTreino): PlanoDeTreino {
  return {
    dias: plano.dias.map((d) => ({
      ...d,
      observacao: null,
      exercicios: d.exercicios.map((e) => ({ ...e, carga_kg: null, observacao: null, avancado: e.avancado ? { ...e.avancado, notas: null } : null })),
    })),
  };
}

export async function criarModelo(profissional: ProfissionalDeTreino, corpo: unknown) {
  const d = (corpo ?? {}) as Record<string, unknown>;
  const nome = texto(d.nome, 120, true)!;
  const limpo = validarPlanoDoEditor(d.plano);
  if ("erro" in limpo) throw new DadoInvalido(limpo.erro);
  if (!limpo.plano.dias.length) throw new DadoInvalido("O treino não tem sessões.");
  const r = await obterPool().query<{ id: string }>(
    "insert into public.treino_modelos (nome, plano, compartilhado, criado_por) values ($1, $2, $3, $4) returning id",
    [nome, JSON.stringify(planoSemDadosDoAluno(limpo.plano)), d.compartilhado === true, profissional.usuarioId]
  );
  return r.rows[0].id;
}

export async function arquivarModelo(profissional: ProfissionalDeTreino, id: string) {
  const r = await obterPool().query(
    `update public.treino_modelos set arquivado_em = now() where id = $1 and (criado_por = $2 or $3)`,
    [id, profissional.usuarioId, profissional.admin]
  );
  return (r.rowCount ?? 0) > 0;
}

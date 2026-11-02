import { hojeNoBrasil, somarDias } from "@/lib/cronograma";
import { chaveDoExercicio, datasDaSemana, domingoDaSemana, type ChaveDia, type PlanoDeTreino, type SituacaoDaSessao } from "@/lib/treino";
import {
  ADESAO_MINIMA_PADRAO,
  LIMITE_DE_ATRASO,
  adesaoDaSemana,
  causasDeAtencao,
  contarSemana,
  type CausaDeAtencao,
  type DadosDoRelatorio,
  type ExercicioDoRelatorio,
  type SessaoDoRelatorio,
  type ValoresDoExercicio,
} from "@/lib/treinoRelatorio";
import { obterPool } from "./banco";
import { enfileirarAtualizacao } from "./notificacoes";
import type { ProfissionalDeTreino } from "./treinoAcesso";

// Relatório semanal do Treino (T3). Regras em lib/treinoRelatorio.ts.
//
// - Fechamento: a semana (domingo a sábado, Brasília) vira relatório no
//   domingo seguinte, para cada profissional que marcou o aluno "com
//   acompanhamento". O fechamento roda no agendador e também ao abrir o
//   painel; é idempotente (um relatório por aluno, profissional e semana).
// - O relatório guarda uma cópia consolidada da semana: o que o aluno mudar
//   depois não altera um relatório já fechado.
// - Cada profissional responde o próprio relatório (B2). O administrador vê
//   os relatórios dos educadores, mas só responde os dele.

const FUSO = "America/Sao_Paulo";
// Semanas para trás que o fechamento recupera (por exemplo, agendador parado).
const SEMANAS_RECUPERAVEIS = 4;

export class DadosInvalidos extends Error {}

// ---------------------------------------------------------------------------
// Fechamento

type Plano = { id: string; origem: "externa" | "profissional"; versao: number; plano: PlanoDeTreino };

type SessaoGravada = {
  id: string;
  prescricao_id: string;
  dia: ChaveDia;
  data_planejada: string;
  situacao: SituacaoDaSessao | null;
  data_efetiva: string | null;
  motivo: string | null;
  observacao: string | null;
  exercicios: { indice: number; nome: string; series: number | null; repeticoes: number | null; carga_kg: number | null; descanso_segundos: number | null }[];
};

function valores(e: Partial<ValoresDoExercicio> | undefined | null): ValoresDoExercicio {
  return { series: e?.series ?? null, repeticoes: e?.repeticoes ?? null, carga_kg: e?.carga_kg ?? null, descanso_segundos: e?.descanso_segundos ?? null };
}

export async function consolidarSemana(patientId: string, profissionalId: string, semanaInicio: string) {
  const pool = obterPool();
  const semanaFim = somarDias(semanaInicio, 6);

  const [vigente, sessoes, anteriores, desconfortos, metas, pausa] = await Promise.all([
    pool.query<Plano>(
      `select id, origem, versao, plano from public.treino_prescricoes
        where patient_id = $1 and status = 'publicada' and modalidade = 'musculacao'
          and publicada_em < (($2::date + 1)::timestamp at time zone '${FUSO}')
        order by publicada_em desc, criada_em desc limit 1`,
      [patientId, semanaFim]
    ),
    pool.query<SessaoGravada>(
      `select s.id, s.prescricao_id, s.dia, to_char(s.data_planejada, 'YYYY-MM-DD') as data_planejada, s.situacao,
              to_char(s.data_efetiva, 'YYYY-MM-DD') as data_efetiva, s.motivo, s.observacao,
              coalesce(json_agg(json_build_object('indice', e.indice, 'nome', e.nome, 'series', e.series, 'repeticoes', e.repeticoes,
                                                  'carga_kg', e.carga_kg, 'descanso_segundos', e.descanso_segundos)
                                order by e.indice) filter (where e.indice is not null), '[]') as exercicios
         from public.treino_sessoes s
         left join public.treino_exercicios_registro e on e.sessao_id = s.id
        where s.patient_id = $1 and s.data_planejada between $2 and $3
        group by s.id
        order by s.data_planejada`,
      [patientId, semanaInicio, semanaFim]
    ),
    pool.query<{ chave: string; carga_kg: string }>(
      `select distinct on (e.chave) e.chave, e.carga_kg::text
         from public.treino_exercicios_registro e
         join public.treino_sessoes s on s.id = e.sessao_id
        where s.patient_id = $1 and s.data_planejada < $2 and e.carga_kg > 0
        order by e.chave, s.data_planejada desc`,
      [patientId, semanaInicio]
    ),
    pool.query<DadosDoRelatorio["desconfortos"][number]>(
      `select to_char(data, 'YYYY-MM-DD') as data, regiao, intensidade, conduta, exercicio, comentario
         from public.treino_desconfortos
        where patient_id = $1 and data between $2 and $3
        order by criado_em`,
      [patientId, semanaInicio, semanaFim]
    ),
    pool.query<{ id: string; texto: string }>(
      `select id, texto from public.treino_metas
        where patient_id = $1 and profissional_id = $2
          and criada_em < (($3::date + 1)::timestamp at time zone '${FUSO}')
          and (ativa or encerrada_em >= ($4::date::timestamp at time zone '${FUSO}'))
        order by criada_em`,
      [patientId, profissionalId, semanaFim, semanaInicio]
    ),
    pool.query<{ inicio: string; fim: string; motivo: string | null }>(
      `select to_char(inicio, 'YYYY-MM-DD') as inicio, to_char(fim, 'YYYY-MM-DD') as fim, motivo
         from public.treino_pausas
        where patient_id = $1 and inicio <= $3 and fim >= $2
        order by inicio limit 1`,
      [patientId, semanaInicio, semanaFim]
    ),
  ]);

  const prescricao = vigente.rows[0] ?? null;
  const ids = [...new Set(sessoes.rows.map((s) => s.prescricao_id).filter((id) => id !== prescricao?.id))];
  const outros = ids.length
    ? (await pool.query<Plano>("select id, origem, versao, plano from public.treino_prescricoes where id = any($1::uuid[])", [ids])).rows
    : [];
  const planos = new Map<string, PlanoDeTreino>([...outros, ...(prescricao ? [prescricao] : [])].map((p) => [p.id, p.plano]));
  const cargaAnterior = new Map(anteriores.rows.map((l) => [l.chave, Number(l.carga_kg)]));
  const datas = datasDaSemana(semanaInicio);

  function exerciciosDe(plano: PlanoDeTreino | undefined, dia: ChaveDia, gravados: SessaoGravada["exercicios"]): ExercicioDoRelatorio[] {
    const prescritos = plano?.dias.find((d) => d.dia === dia)?.exercicios ?? [];
    const total = Math.max(prescritos.length, ...gravados.map((g) => g.indice + 1));
    const lista: ExercicioDoRelatorio[] = [];
    for (let indice = 0; indice < total; indice++) {
      const prescrito = prescritos[indice];
      const gravado = gravados.find((g) => g.indice === indice);
      const nome = prescrito?.nome ?? gravado?.nome;
      if (!nome) continue;
      lista.push({
        nome,
        prescrito: valores(prescrito),
        registrado: gravado ? valores(gravado) : null,
        anterior_kg: cargaAnterior.get(chaveDoExercicio(nome)) ?? null,
      });
    }
    return lista;
  }

  const usadas = new Set<string>();
  const lista: SessaoDoRelatorio[] = [];
  for (const dia of prescricao?.plano.dias ?? []) {
    const data = datas[dia.dia];
    const gravada =
      sessoes.rows.find((s) => s.dia === dia.dia && s.data_planejada === data && s.prescricao_id === prescricao?.id) ??
      sessoes.rows.find((s) => s.dia === dia.dia && s.data_planejada === data && !usadas.has(s.id));
    if (gravada) usadas.add(gravada.id);
    lista.push({
      dia: dia.dia,
      data_planejada: data,
      situacao: gravada ? (gravada.situacao ?? "sem_situacao") : "sem_registro",
      data_efetiva: gravada?.data_efetiva ?? null,
      motivo: gravada?.motivo ?? null,
      observacao: gravada?.observacao ?? null,
      exercicios: exerciciosDe(planos.get(gravada?.prescricao_id ?? prescricao!.id), dia.dia, gravada?.exercicios ?? []),
    });
  }
  // Sessões de uma prescrição anterior (troca de treino no meio da semana).
  for (const s of sessoes.rows) {
    if (usadas.has(s.id)) continue;
    lista.push({
      dia: s.dia,
      data_planejada: s.data_planejada,
      situacao: s.situacao ?? "sem_situacao",
      data_efetiva: s.data_efetiva,
      motivo: s.motivo,
      observacao: s.observacao,
      exercicios: exerciciosDe(planos.get(s.prescricao_id), s.dia, s.exercicios),
    });
  }
  lista.sort((a, b) => a.data_planejada.localeCompare(b.data_planejada));

  const contagem = contarSemana(lista);
  const temRegistro = sessoes.rows.length > 0 || desconfortos.rows.length > 0;
  const dados: DadosDoRelatorio = {
    prescricao: prescricao ? { id: prescricao.id, origem: prescricao.origem, versao: prescricao.versao } : null,
    sessoes: lista,
    desconfortos: desconfortos.rows,
    contagem,
    metas: metas.rows,
    pausa: pausa.rows[0] ?? null,
  };
  return { semanaFim, dados, semRegistros: !temRegistro, adesao: adesaoDaSemana(contagem, temRegistro), emPausa: Boolean(pausa.rows[0]) };
}

// Última semana fechada (domingo) na data informada.
export function ultimaSemanaFechada(hoje = hojeNoBrasil()) {
  return somarDias(domingoDaSemana(hoje), -7);
}

// Gera os relatórios das semanas já fechadas que ainda não existem.
export async function fecharSemanas(hoje = hojeNoBrasil(), filtro?: { profissionalId?: string; patientId?: string }) {
  const fechada = ultimaSemanaFechada(hoje);
  const limite = somarDias(fechada, -7 * (SEMANAS_RECUPERAVEIS - 1));
  const pendentes = await obterPool().query<{ patient_id: string; profissional_id: string; adesao_minima: number; semana: string }>(
    `select a.patient_id, a.profissional_id, a.adesao_minima, to_char(semana, 'YYYY-MM-DD') as semana
       from public.treino_acompanhamentos a
       cross join lateral generate_series(greatest(a.inicio, $2::date), $1::date, interval '7 days') as semana
      where a.ativo
        and ($3::uuid is null or a.profissional_id = $3)
        and ($4::uuid is null or a.patient_id = $4)
        and (exists (select 1 from public.profiles pr where pr.id = a.profissional_id and pr.role = 'nutricionista')
             or exists (select 1 from public.treino_vinculos v
                          join public.educadores_fisicos e on e.usuario_id = v.profissional_id and e.ativo
                         where v.patient_id = a.patient_id and v.profissional_id = a.profissional_id and v.fim is null))
        and not exists (select 1 from public.treino_relatorios r
                         where r.patient_id = a.patient_id and r.profissional_id = a.profissional_id and r.semana_inicio = semana::date)
      order by semana`,
    [fechada, limite, filtro?.profissionalId ?? null, filtro?.patientId ?? null]
  );

  let criados = 0;
  for (const p of pendentes.rows) {
    const semana = await consolidarSemana(p.patient_id, p.profissional_id, p.semana);
    const r = await obterPool().query(
      `insert into public.treino_relatorios
         (patient_id, profissional_id, semana_inicio, semana_fim, dados, sem_registros, adesao, adesao_minima, em_pausa)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (patient_id, profissional_id, semana_inicio) do nothing`,
      [p.patient_id, p.profissional_id, p.semana, semana.semanaFim, semana.dados, semana.semRegistros, semana.adesao, p.adesao_minima, semana.emPausa]
    );
    criados += r.rowCount ?? 0;
  }
  return criados;
}

// ---------------------------------------------------------------------------
// Painel do profissional: relatórios pendentes, atraso e lista de atenção

export type PendenciaDoAluno = { patient_id: string; nome: string; pendentes: number; atraso: boolean; mais_antigo: string; relatorio_id: string };
export type AlunoEmAtencao = { patient_id: string; nome: string; causas: CausaDeAtencao[]; semanas: string[] };

export async function painelDeRelatorios(profissional: ProfissionalDeTreino) {
  await fecharSemanas(hojeNoBrasil(), { profissionalId: profissional.usuarioId });
  const pool = obterPool();

  const pendentes = await pool.query<PendenciaDoAluno>(
    `select r.patient_id, p.name as nome, count(*)::int as pendentes, count(*) >= $2 as atraso,
            to_char(min(r.semana_inicio), 'YYYY-MM-DD') as mais_antigo,
            (array_agg(r.id order by r.semana_inicio))[1] as relatorio_id
       from public.treino_relatorios r
       join public.patients p on p.id = r.patient_id
      where r.profissional_id = $1 and r.devolutiva is null
      group by r.patient_id, p.name
      order by count(*) desc, min(r.semana_inicio)`,
    [profissional.usuarioId, LIMITE_DE_ATRASO]
  );

  const semanas = await pool.query<{
    patient_id: string;
    nome: string;
    semana_inicio: string;
    sem_registros: boolean;
    adesao: number | null;
    adesao_minima: number;
    em_pausa: boolean;
    meta_nao_atingida: boolean;
  }>(
    `select r.patient_id, p.name as nome, to_char(r.semana_inicio, 'YYYY-MM-DD') as semana_inicio, r.sem_registros,
            r.adesao::float8 as adesao, a.adesao_minima,
            -- Pausa registrada depois do fechamento também vale (B6).
            (r.em_pausa or exists (select 1 from public.treino_pausas z
                                    where z.patient_id = r.patient_id and z.inicio <= r.semana_fim and z.fim >= r.semana_inicio)) as em_pausa,
            exists (select 1 from public.treino_metas_semana m where m.relatorio_id = r.id and not m.atingida) as meta_nao_atingida
       from public.treino_relatorios r
       join public.patients p on p.id = r.patient_id
       join public.treino_acompanhamentos a on a.patient_id = r.patient_id and a.profissional_id = r.profissional_id and a.ativo
      where r.profissional_id = $1 and r.semana_inicio >= $2`,
    [profissional.usuarioId, somarDias(ultimaSemanaFechada(), -7)]
  );

  const porAluno = new Map<string, typeof semanas.rows>();
  for (const s of semanas.rows) porAluno.set(s.patient_id, [...(porAluno.get(s.patient_id) ?? []), s]);
  const atencao: AlunoEmAtencao[] = [];
  for (const [patientId, lista] of porAluno) {
    // O mínimo de adesão vale o atual do aluno (editável pelo profissional).
    const resultado = causasDeAtencao(lista);
    if (resultado.causas.length) atencao.push({ patient_id: patientId, nome: lista[0].nome, ...resultado });
  }
  atencao.sort((a, b) => a.nome.localeCompare(b.nome));

  return { pendentes: pendentes.rows, atencao };
}

// ---------------------------------------------------------------------------
// Relatório (tela do profissional)

export type RelatorioDoTreino = {
  id: string;
  patient_id: string;
  paciente: string;
  profissional_id: string;
  profissional: string;
  semana_inicio: string;
  semana_fim: string;
  dados: DadosDoRelatorio;
  sem_registros: boolean;
  adesao: number | null;
  adesao_minima: number;
  em_pausa: boolean;
  rascunho: string;
  rascunho_revisao: number;
  devolutiva: string | null;
  devolutiva_enviada_em: string | null;
  lida_em: string | null;
  metas_marcadas: Record<string, boolean>;
  adesao_anterior: number | null;
  pode_responder: boolean;
};

const NOME_DO_PROFISSIONAL = `coalesce((select e.nome from public.educadores_fisicos e where e.usuario_id = r.profissional_id), 'Nutricionista')`;

export async function lerRelatorio(profissional: ProfissionalDeTreino, id: string): Promise<RelatorioDoTreino | null> {
  const r = await obterPool().query<Omit<RelatorioDoTreino, "pode_responder">>(
    `select r.id, r.patient_id, p.name as paciente, r.profissional_id, ${NOME_DO_PROFISSIONAL} as profissional,
            to_char(r.semana_inicio, 'YYYY-MM-DD') as semana_inicio, to_char(r.semana_fim, 'YYYY-MM-DD') as semana_fim,
            r.dados, r.sem_registros, r.adesao::float8 as adesao, r.adesao_minima, r.em_pausa, r.rascunho, r.rascunho_revisao,
            r.devolutiva, r.devolutiva_enviada_em, r.lida_em,
            coalesce((select jsonb_object_agg(m.meta_id, m.atingida) from public.treino_metas_semana m where m.relatorio_id = r.id), '{}') as metas_marcadas,
            (select a.adesao::float8 from public.treino_relatorios a
              where a.patient_id = r.patient_id and a.profissional_id = r.profissional_id and a.semana_inicio = r.semana_inicio - 7) as adesao_anterior
       from public.treino_relatorios r
       join public.patients p on p.id = r.patient_id
      where r.id = $1 and ($2 or r.profissional_id = $3)`,
    [id, profissional.admin, profissional.usuarioId]
  );
  const linha = r.rows[0];
  return linha ? { ...linha, pode_responder: linha.profissional_id === profissional.usuarioId && linha.devolutiva === null } : null;
}

// Relatórios de um aluno (painel do aluno no Treino). O educador vê só os
// dele; o administrador vê todos.
export async function relatoriosDoAluno(profissional: ProfissionalDeTreino, patientId: string) {
  await fecharSemanas(hojeNoBrasil(), { patientId });
  const r = await obterPool().query<{
    id: string;
    semana_inicio: string;
    semana_fim: string;
    profissional: string;
    sem_registros: boolean;
    adesao: number | null;
    em_pausa: boolean;
    respondido: boolean;
    meu: boolean;
  }>(
    `select r.id, to_char(r.semana_inicio, 'YYYY-MM-DD') as semana_inicio, to_char(r.semana_fim, 'YYYY-MM-DD') as semana_fim,
            ${NOME_DO_PROFISSIONAL} as profissional, r.sem_registros, r.adesao::float8 as adesao, r.em_pausa,
            r.devolutiva is not null as respondido, r.profissional_id = $3 as meu
       from public.treino_relatorios r
      where r.patient_id = $1 and ($2 or r.profissional_id = $3)
      order by r.semana_inicio desc, profissional
      limit 30`,
    [patientId, profissional.admin, profissional.usuarioId]
  );
  return r.rows;
}

export async function marcarMeta(profissional: ProfissionalDeTreino, relatorioId: string, metaId: string, atingida: boolean | null) {
  const relatorio = await lerRelatorio(profissional, relatorioId);
  if (!relatorio || relatorio.profissional_id !== profissional.usuarioId) return false;
  if (!relatorio.dados.metas.some((m) => m.id === metaId)) throw new DadosInvalidos("Meta inválida.");
  if (atingida === null) {
    await obterPool().query("delete from public.treino_metas_semana where relatorio_id = $1 and meta_id = $2", [relatorioId, metaId]);
  } else {
    await obterPool().query(
      `insert into public.treino_metas_semana (relatorio_id, meta_id, atingida) values ($1, $2, $3)
       on conflict (relatorio_id, meta_id) do update set atingida = excluded.atingida, marcada_em = now()`,
      [relatorioId, metaId, atingida]
    );
  }
  return true;
}

// Rascunho com revisão: uma gravação antiga não apaga um texto mais novo.
export async function salvarRascunho(profissional: ProfissionalDeTreino, id: string, texto: string, revisao: number) {
  const r = await obterPool().query<{ rascunho: string; rascunho_revisao: number }>(
    `update public.treino_relatorios set rascunho = $3, rascunho_revisao = rascunho_revisao + 1
      where id = $1 and profissional_id = $2 and devolutiva is null and rascunho_revisao = $4
      returning rascunho, rascunho_revisao`,
    [id, profissional.usuarioId, texto, revisao]
  );
  return r.rows[0] ?? null;
}

export async function enviarDevolutiva(profissional: ProfissionalDeTreino, id: string, texto: string) {
  const r = await obterPool().query<{ patient_id: string }>(
    `update public.treino_relatorios
        set devolutiva = $3, devolutiva_enviada_em = now(), rascunho = $3, rascunho_revisao = rascunho_revisao + 1
      where id = $1 and profissional_id = $2 and devolutiva is null
      returning patient_id`,
    [id, profissional.usuarioId, texto]
  );
  const linha = r.rows[0];
  if (!linha) return false;
  await enfileirarAtualizacao("devolutiva_treino", linha.patient_id, id);
  return true;
}

// ---------------------------------------------------------------------------
// Acompanhamento, metas e pausas (painel do aluno)

export async function configuracaoDoAluno(profissional: ProfissionalDeTreino, patientId: string) {
  const pool = obterPool();
  const [acompanhamento, metas, pausas] = await Promise.all([
    pool.query<{ ativo: boolean; adesao_minima: number; inicio: string }>(
      "select ativo, adesao_minima, to_char(inicio, 'YYYY-MM-DD') as inicio from public.treino_acompanhamentos where patient_id = $1 and profissional_id = $2",
      [patientId, profissional.usuarioId]
    ),
    pool.query<{ id: string; texto: string; ativa: boolean; criada_em: string }>(
      "select id, texto, ativa, criada_em from public.treino_metas where patient_id = $1 and profissional_id = $2 order by ativa desc, criada_em desc",
      [patientId, profissional.usuarioId]
    ),
    pool.query<{ id: string; inicio: string; fim: string; motivo: string | null }>(
      `select id, to_char(inicio, 'YYYY-MM-DD') as inicio, to_char(fim, 'YYYY-MM-DD') as fim, motivo
         from public.treino_pausas where patient_id = $1 order by inicio desc limit 20`,
      [patientId]
    ),
  ]);
  const a = acompanhamento.rows[0];
  return {
    acompanhamento: a?.ativo ? { adesao_minima: a.adesao_minima, inicio: a.inicio } : null,
    adesao_padrao: ADESAO_MINIMA_PADRAO,
    metas: metas.rows,
    pausas: pausas.rows,
  };
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown, limite: number, obrigatorio: boolean) {
  const t = typeof valor === "string" ? valor.trim() : "";
  if (obrigatorio && !t) throw new DadosInvalidos("Preencha o texto.");
  if (t.length > limite) throw new DadosInvalidos(`Use no máximo ${limite} caracteres.`);
  return t || null;
}

function minimo(valor: unknown) {
  const n = Number(valor ?? ADESAO_MINIMA_PADRAO);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new DadosInvalidos("A adesão mínima deve ser um número inteiro de 1 a 100.");
  return n;
}

export async function alterarConfiguracao(profissional: ProfissionalDeTreino, patientId: string, dados: Record<string, unknown>) {
  const pool = obterPool();
  const quem = profissional.usuarioId;
  switch (dados.acao) {
    case "ativar":
      // A primeira semana do relatório é a atual (fecha no próximo domingo).
      await pool.query(
        `insert into public.treino_acompanhamentos (patient_id, profissional_id, adesao_minima, inicio)
         values ($1, $2, $3, $4)
         on conflict (patient_id, profissional_id) do update
           set ativo = true, adesao_minima = excluded.adesao_minima, atualizado_em = now(),
               inicio = case when treino_acompanhamentos.ativo then treino_acompanhamentos.inicio else excluded.inicio end`,
        [patientId, quem, minimo(dados.adesaoMinima), domingoDaSemana(hojeNoBrasil())]
      );
      return;
    case "desativar":
      await pool.query("update public.treino_acompanhamentos set ativo = false, atualizado_em = now() where patient_id = $1 and profissional_id = $2", [patientId, quem]);
      return;
    case "minimo":
      await pool.query(
        "update public.treino_acompanhamentos set adesao_minima = $3, atualizado_em = now() where patient_id = $1 and profissional_id = $2",
        [patientId, quem, minimo(dados.adesaoMinima)]
      );
      return;
    case "nova_meta":
      await pool.query("insert into public.treino_metas (patient_id, profissional_id, texto) values ($1, $2, $3)", [patientId, quem, texto(dados.texto, 500, true)]);
      return;
    case "encerrar_meta":
      await pool.query(
        "update public.treino_metas set ativa = false, encerrada_em = now() where id = $1 and patient_id = $2 and profissional_id = $3 and ativa",
        [String(dados.id), patientId, quem]
      );
      return;
    case "nova_pausa": {
      const inicio = String(dados.inicio ?? "");
      const fim = String(dados.fim ?? "");
      if (!DATA.test(inicio) || !DATA.test(fim) || fim < inicio) throw new DadosInvalidos("Informe o início e o fim da pausa.");
      await pool.query("insert into public.treino_pausas (patient_id, inicio, fim, motivo, criada_por) values ($1, $2, $3, $4, $5)", [
        patientId,
        inicio,
        fim,
        texto(dados.motivo, 200, false),
        quem,
      ]);
      return;
    }
    case "excluir_pausa":
      await pool.query("delete from public.treino_pausas where id = $1 and patient_id = $2", [String(dados.id), patientId]);
      return;
    default:
      throw new DadosInvalidos("Ação inválida.");
  }
}

// ---------------------------------------------------------------------------
// Aluno: devolutivas recebidas (cartão Relatórios)

export async function devolutivasDoAluno(patientId: string) {
  const r = await obterPool().query<{
    id: string;
    semana_inicio: string;
    semana_fim: string;
    profissional: string;
    devolutiva: string;
    devolutiva_enviada_em: string;
    lida_em: string | null;
  }>(
    `select r.id, to_char(r.semana_inicio, 'YYYY-MM-DD') as semana_inicio, to_char(r.semana_fim, 'YYYY-MM-DD') as semana_fim,
            ${NOME_DO_PROFISSIONAL} as profissional, r.devolutiva, r.devolutiva_enviada_em, r.lida_em
       from public.treino_relatorios r
      where r.patient_id = $1 and r.devolutiva is not null
      order by r.devolutiva_enviada_em desc
      limit 12`,
    [patientId]
  );
  return r.rows;
}

export async function marcarDevolutivasLidas(patientId: string) {
  await obterPool().query("update public.treino_relatorios set lida_em = now() where patient_id = $1 and devolutiva is not null and lida_em is null", [patientId]);
}

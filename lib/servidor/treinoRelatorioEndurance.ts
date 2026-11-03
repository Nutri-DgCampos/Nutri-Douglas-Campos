import { somarDias } from "@/lib/cronograma";
import { rotuloDoConsumo, type Consumo } from "@/lib/treinoAtividades";
import { ordenarSessoesDaSemana, referenciaDaSessao, semanaDoCiclo, type ModalidadeEndurance, type PlanoEndurance } from "@/lib/treinoEndurance";
import {
  adesaoDaSemana,
  contarSemana,
  type DadosDoRelatorio,
  type RegistroDeEndurance,
  type SessaoEnduranceDoRelatorio,
  type TotaisDeEndurance,
} from "@/lib/treinoRelatorio";
import { obterPool } from "./banco";
import { equipamentosDoAluno } from "./treinoAtividades";

// Relatório semanal de corrida ou ciclismo (T3b). Mesmas regras da
// musculação (lib/treinoRelatorio.ts): adesão sobre as sessões planejadas da
// planilha vigente; sem registro ≠ não concluído; reagendado ou feito em
// outra semana fica fora da conta (R4b). Atividade sem sessão planejada
// aparece como "extra" e não entra na adesão. Todos os números são os que o
// aluno informou; somas e médias só do que existe.

const FUSO = "America/Sao_Paulo";
const DESDE_DOMINGO: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

type LinhaAtividade = {
  id: string;
  prescricao_id: string | null;
  sessao_indice: number | null;
  data: string;
  situacao: SessaoEnduranceDoRelatorio["situacao"] | null;
  data_efetiva: string | null;
  motivo: string | null;
  observacao: string | null;
  equipamento: string | null;
  distancia_km: string | null;
  duracao_segundos: number | null;
  fc_media: number | null;
  fc_max: number | null;
  rpe: string | null;
  kcal: number | null;
  elevacao_m: number | null;
  potencia_media: number | null;
  potencia_normalizada: number | null;
  cadencia_media: number | null;
  tss: string | null;
  consumos: Consumo[];
};

const n = (v: string | number | null) => (v === null ? null : Number(v));

function registroDe(a: LinhaAtividade): RegistroDeEndurance {
  return {
    data: a.data,
    distancia_km: n(a.distancia_km),
    duracao_segundos: a.duracao_segundos,
    fc_media: a.fc_media,
    fc_max: a.fc_max,
    rpe: n(a.rpe),
    kcal: a.kcal,
    elevacao_m: a.elevacao_m,
    potencia_media: a.potencia_media,
    potencia_normalizada: a.potencia_normalizada,
    cadencia_media: a.cadencia_media,
    tss: n(a.tss),
    equipamento: a.equipamento,
    consumos: a.consumos.map(rotuloDoConsumo),
  };
}

function soma(valores: (number | null)[]) {
  const v = valores.filter((x): x is number => x !== null);
  return v.length ? Math.round(v.reduce((t, x) => t + x, 0) * 100) / 100 : null;
}

function media(valores: (number | null)[]) {
  const v = valores.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((t, x) => t + x, 0) / v.length) * 10) / 10 : null;
}

// null: nada a relatar (sem planilha na semana e sem atividade registrada).
export async function consolidarEndurance(patientId: string, profissionalId: string, semanaInicio: string, modalidade: ModalidadeEndurance) {
  const pool = obterPool();
  const semanaFim = somarDias(semanaInicio, 6);
  const [vigente, atividades, desconfortos, metas, pausa] = await Promise.all([
    pool.query<{ id: string; versao: number; plano: PlanoEndurance }>(
      `select id, versao, plano from public.treino_prescricoes
        where patient_id = $1 and status = 'publicada' and modalidade = $3 and arquivada_em is null
          and publicada_em < (($2::date + 1)::timestamp at time zone '${FUSO}')
        order by publicada_em desc, criada_em desc limit 1`,
      [patientId, semanaFim, modalidade]
    ),
    pool.query<LinhaAtividade>(
      `select a.id, a.prescricao_id, a.sessao_indice, to_char(a.data, 'YYYY-MM-DD') as data, a.situacao,
              to_char(a.data_efetiva, 'YYYY-MM-DD') as data_efetiva, a.motivo, a.observacao, e.apelido as equipamento,
              a.distancia_km::text, a.duracao_segundos, a.fc_media, a.fc_max, a.rpe::text, a.kcal, a.elevacao_m,
              a.potencia_media, a.potencia_normalizada, a.cadencia_media, a.tss::text,
              coalesce((select json_agg(json_build_object('horario', to_char(c.horario, 'HH24:MI'), 'minuto', c.minuto, 'categoria', c.categoria,
                                                          'descricao', c.descricao, 'quantidade', c.quantidade, 'unidade', c.unidade, 'observacao', c.observacao)
                                        order by c.criado_em)
                          from public.treino_consumos c where c.atividade_id = a.id and c.removido_em is null), '[]') as consumos
         from public.treino_atividades a
         left join public.treino_equipamentos e on e.id = a.equipamento_id
        where a.patient_id = $1 and a.modalidade = $4
          -- A semana e, para sessões reagendadas, as semanas em volta.
          and a.data between $2::date - 42 and $3::date + 42
        order by a.data, a.registrada_em`,
      [patientId, semanaInicio, semanaFim, modalidade]
    ),
    pool.query<DadosDoRelatorio["desconfortos"][number]>(
      `select to_char(data, 'YYYY-MM-DD') as data, regiao, intensidade, conduta, exercicio, comentario
         from public.treino_desconfortos where patient_id = $1 and data between $2 and $3 order by criado_em`,
      [patientId, semanaInicio, semanaFim]
    ),
    pool.query<{ id: string; texto: string }>(
      `select id, texto from public.treino_metas
        where patient_id = $1 and profissional_id = $2
          and criada_em < (($3::date + 1)::timestamp at time zone '${FUSO}')
          and (ativa or encerrada_em >= ($4::date::timestamp at time zone '${FUSO}'))
          and (modalidade is null or modalidade = $5)
        order by criada_em`,
      [patientId, profissionalId, semanaFim, semanaInicio, modalidade]
    ),
    pool.query<{ inicio: string; fim: string; motivo: string | null }>(
      `select to_char(inicio, 'YYYY-MM-DD') as inicio, to_char(fim, 'YYYY-MM-DD') as fim, motivo
         from public.treino_pausas where patient_id = $1 and inicio <= $3 and fim >= $2 order by inicio limit 1`,
      [patientId, semanaInicio, semanaFim]
    ),
  ]);

  const prescricao = vigente.rows[0] ?? null;
  const semana = prescricao ? semanaDoCiclo(prescricao.plano, semanaInicio) : null;
  const planejadas = prescricao && semana !== null ? ordenarSessoesDaSemana(prescricao.plano.semanas[semana].sessoes) : [];
  const daSemana = atividades.rows.filter((a) => a.data >= semanaInicio && a.data <= semanaFim);
  if (!planejadas.length && !daSemana.length) return null;

  const usadas = new Set<string>();
  const sessoes: SessaoEnduranceDoRelatorio[] = planejadas.map(({ s, i }) => {
    const data = somarDias(semanaInicio, DESDE_DOMINGO[s.dia]);
    const ref = referenciaDaSessao(semana!, i);
    const a = atividades.rows.find((x) => !usadas.has(x.id) && x.prescricao_id === prescricao!.id && x.sessao_indice === ref);
    if (a) usadas.add(a.id);
    // Feita em outra semana (R4b): a data da atividade fica como efetiva.
    const efetiva = a ? (a.situacao === "reagendado" ? a.data_efetiva : a.data !== data ? a.data : null) : null;
    return {
      dia: s.dia,
      data_planejada: data,
      tipo: s.tipo,
      descricao: s.descricao,
      planejado: { distancia_km: s.distancia_km, duracao_min: s.duracao_min, zona: s.zona },
      situacao: a ? (a.situacao ?? "sem_situacao") : "sem_registro",
      data_efetiva: efetiva,
      motivo: a?.motivo ?? null,
      observacao: a?.observacao ?? null,
      extra: false,
      registrado: a && a.situacao !== "reagendado" ? registroDe(a) : null,
    };
  });

  // Atividades da semana sem sessão planejada desta semana: "extra". As que
  // pertencem a sessão de outra semana ficam no relatório daquela semana.
  for (const a of daSemana) {
    if (usadas.has(a.id)) continue;
    if (a.prescricao_id === prescricao?.id && a.sessao_indice !== null) continue;
    sessoes.push({
      dia: null,
      data_planejada: null,
      tipo: null,
      descricao: null,
      planejado: null,
      situacao: a.situacao ?? "sem_situacao",
      data_efetiva: a.data_efetiva,
      motivo: a.motivo,
      observacao: a.observacao,
      extra: true,
      registrado: registroDe(a),
    });
  }

  const planejadasNaConta = sessoes.filter((s) => !s.extra);
  const contagem = contarSemana(planejadasNaConta, { inicio: semanaInicio, fim: semanaFim });
  const registros = sessoes
    .filter((s) => s.registrado && s.registrado.data >= semanaInicio && s.registrado.data <= semanaFim)
    .map((s) => s.registrado!);
  const totais: TotaisDeEndurance = {
    planejado_km: soma(planejadas.map(({ s }) => s.distancia_km)),
    planejado_min: soma(planejadas.map(({ s }) => s.duracao_min)),
    registrado_km: soma(registros.map((r) => r.distancia_km)),
    registrado_segundos: soma(registros.map((r) => r.duracao_segundos)),
    kcal: soma(registros.map((r) => r.kcal)),
    elevacao_m: soma(registros.map((r) => r.elevacao_m)),
    tss: modalidade === "ciclismo" ? soma(registros.map((r) => r.tss)) : null,
    fc_media: media(registros.map((r) => r.fc_media)),
    rpe_medio: media(registros.map((r) => r.rpe)),
  };
  const equipamentos = (await equipamentosDoAluno(patientId))
    .filter((e) => e.tipo === (modalidade === "corrida" ? "tenis" : "bicicleta") && !e.aposentado_em)
    .map((e) => ({ apelido: e.apelido, tipo: e.tipo, km_total: e.km_total, alerta_km: e.alerta_km }));

  const temRegistro = daSemana.length > 0 || desconfortos.rows.length > 0;
  const dados: DadosDoRelatorio = {
    modalidade,
    prescricao: prescricao ? { id: prescricao.id, origem: "profissional", versao: prescricao.versao } : null,
    sessoes: [],
    desconfortos: desconfortos.rows,
    contagem,
    metas: metas.rows,
    pausa: pausa.rows[0] ?? null,
    kcal: totais.kcal,
    endurance: { sessoes, totais, equipamentos },
  };
  return { semanaFim, dados, semRegistros: !temRegistro, adesao: adesaoDaSemana(contagem, temRegistro), emPausa: Boolean(pausa.rows[0]) };
}

import { hojeNoBrasil, somarDias } from "@/lib/cronograma";
import { domingoDaSemana } from "@/lib/treino";
import { ALERTA_TENIS_PADRAO_KM, CATEGORIAS_DE_BICICLETA, validarAtividade, type Atividade, type Consumo, type Equipamento } from "@/lib/treinoAtividades";
import {
  ordenarSessoesDaSemana,
  planoEnduranceParaAluno,
  referenciaDaSessao,
  semanaDoCiclo,
  sessaoDaReferencia,
  type ModalidadeEndurance,
  type PlanoEndurance,
  type SessaoEndurance,
} from "@/lib/treinoEndurance";
import { obterPool } from "./banco";

// Corrida e ciclismo do aluno (T4b): atividades, tênis, bicicletas e
// consumo durante o treino. Regras em lib/treinoAtividades.ts.
//
// - O aluno registra e corrige as próprias atividades. A data vai do domingo
//   da semana anterior até hoje (a semana anterior ainda pode ser
//   completada antes do relatório de domingo; o relatório guarda cópia).
// - O mesmo envio (chave_cliente) atualiza, não duplica (base do T5).
// - Quilometragem de tênis e bicicleta: soma das distâncias registradas com
//   o equipamento + km inicial. Trocar o equipamento corrige a soma.

export class AtividadeInvalida extends Error {}

const numero = (v: string | number | null) => (v === null || v === undefined ? null : Number(v));

type LinhaEquipamento = Omit<Equipamento, "km_inicial" | "alerta_km" | "km_registrados" | "km_total"> & {
  km_inicial: string;
  alerta_km: string | null;
  km_registrados: string;
};

export async function equipamentosDoAluno(patientId: string): Promise<Equipamento[]> {
  const r = await obterPool().query<LinhaEquipamento>(
    `select e.id, e.tipo, e.apelido, e.marca, e.modelo, e.categoria, e.km_inicial::text, to_char(e.inicio_uso, 'YYYY-MM-DD') as inicio_uso,
            e.alerta_km::text, e.aposentado_em,
            coalesce((select sum(a.distancia_km) from public.treino_atividades a where a.equipamento_id = e.id), 0)::text as km_registrados
       from public.treino_equipamentos e
      where e.patient_id = $1
      order by e.aposentado_em nulls first, e.tipo, e.apelido`,
    [patientId]
  );
  return r.rows.map((l) => {
    const kmInicial = Number(l.km_inicial);
    const kmRegistrados = Number(l.km_registrados);
    return { ...l, km_inicial: kmInicial, alerta_km: numero(l.alerta_km), km_registrados: kmRegistrados, km_total: Math.round((kmInicial + kmRegistrados) * 10) / 10 };
  });
}

function textoCurto(valor: unknown, limite: number, obrigatorio = false) {
  if (valor === null || valor === undefined || valor === "") {
    if (obrigatorio) throw new AtividadeInvalida("Dê um nome ao equipamento (ex.: Tênis azul).");
    return null;
  }
  if (typeof valor !== "string") throw new AtividadeInvalida("Texto inválido.");
  const t = valor.trim();
  if (t.length > limite) throw new AtividadeInvalida(`Texto com mais de ${limite} caracteres.`);
  if (obrigatorio && !t) throw new AtividadeInvalida("Dê um nome ao equipamento (ex.: Tênis azul).");
  return t || null;
}

function dadosDoEquipamento(d: Record<string, unknown>, tipo: "tenis" | "bicicleta") {
  const kmInicial = d.km_inicial === null || d.km_inicial === undefined || d.km_inicial === "" ? 0 : d.km_inicial;
  if (typeof kmInicial !== "number" || !Number.isFinite(kmInicial) || kmInicial < 0 || kmInicial > 100000) throw new AtividadeInvalida("Quilometragem inicial inválida.");
  const inicio = d.inicio_uso === null || d.inicio_uso === undefined || d.inicio_uso === "" ? null : String(d.inicio_uso);
  if (inicio !== null && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) throw new AtividadeInvalida("Data de início inválida.");
  const categoria = tipo === "bicicleta" ? (CATEGORIAS_DE_BICICLETA.find((c) => c.valor === d.categoria)?.valor ?? null) : null;
  return {
    apelido: textoCurto(d.apelido, 60, true)!,
    marca: textoCurto(d.marca, 60),
    modelo: textoCurto(d.modelo, 60),
    categoria,
    km_inicial: Math.round(kmInicial * 10) / 10,
    inicio_uso: inicio,
  };
}

// Aluno: cadastra tênis ou bicicleta (cadastro livre, P4).
export async function cadastrarEquipamento(patientId: string, corpo: unknown) {
  const d = (corpo ?? {}) as Record<string, unknown>;
  if (d.tipo !== "tenis" && d.tipo !== "bicicleta") throw new AtividadeInvalida("Escolha tênis ou bicicleta.");
  const e = dadosDoEquipamento(d, d.tipo);
  const r = await obterPool().query<{ id: string }>(
    `insert into public.treino_equipamentos (patient_id, tipo, apelido, marca, modelo, categoria, km_inicial, inicio_uso, alerta_km)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [patientId, d.tipo, e.apelido, e.marca, e.modelo, e.categoria, e.km_inicial, e.inicio_uso, d.tipo === "tenis" ? ALERTA_TENIS_PADRAO_KM : null]
  );
  return r.rows[0].id;
}

// Aluno: altera os dados, aposenta ou reativa (o histórico fica).
export async function alterarEquipamento(patientId: string, id: string, corpo: unknown) {
  const d = (corpo ?? {}) as Record<string, unknown>;
  if (d.acao === "aposentar" || d.acao === "reativar") {
    const r = await obterPool().query(
      `update public.treino_equipamentos set aposentado_em = ${d.acao === "aposentar" ? "now()" : "null"}, atualizado_em = now()
        where id = $1 and patient_id = $2`,
      [id, patientId]
    );
    return (r.rowCount ?? 0) > 0;
  }
  const atual = await obterPool().query<{ tipo: "tenis" | "bicicleta" }>("select tipo from public.treino_equipamentos where id = $1 and patient_id = $2", [id, patientId]);
  if (!atual.rows[0]) return false;
  const e = dadosDoEquipamento(d, atual.rows[0].tipo);
  await obterPool().query(
    `update public.treino_equipamentos
        set apelido = $3, marca = $4, modelo = $5, categoria = $6, km_inicial = $7, inicio_uso = $8, atualizado_em = now()
      where id = $1 and patient_id = $2`,
    [id, patientId, e.apelido, e.marca, e.modelo, e.categoria, e.km_inicial, e.inicio_uso]
  );
  return true;
}

// Profissional: limite de troca do tênis deste aluno (R1).
export async function definirAlertaDoTenis(patientId: string, id: string, alertaKm: unknown) {
  if (typeof alertaKm !== "number" || !Number.isFinite(alertaKm) || alertaKm < 1 || alertaKm > 10000) throw new AtividadeInvalida("Informe o limite em km (1 a 10.000).");
  const r = await obterPool().query(
    "update public.treino_equipamentos set alerta_km = $3, atualizado_em = now() where id = $1 and patient_id = $2 and tipo = 'tenis'",
    [id, patientId, Math.round(alertaKm)]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Atividades

type LinhaAtividade = Record<string, unknown> & { id: string; consumos: (Consumo & { quantidade: string | number | null })[] };

const NUMERICOS = ["distancia_km", "rpe", "tss"] as const;

function atividadeDe(l: LinhaAtividade): Atividade & { id: string; registrada_em: string; equipamento: string | null } {
  const a = { ...l } as Record<string, unknown>;
  for (const c of NUMERICOS) a[c] = numero(a[c] as string | null);
  a.consumos = l.consumos.map((c) => ({ ...c, quantidade: numero(c.quantidade as string | null) }));
  return a as Atividade & { id: string; registrada_em: string; equipamento: string | null };
}

// Atividades do aluno desde a data (inclusive), com consumo e equipamento.
export async function atividadesDoAluno(patientId: string, desde: string) {
  const r = await obterPool().query<LinhaAtividade>(
    `select a.id, a.chave_cliente, a.modalidade, a.prescricao_id, a.sessao_indice, to_char(a.data, 'YYYY-MM-DD') as data, a.situacao,
            to_char(a.data_efetiva, 'YYYY-MM-DD') as data_efetiva, a.motivo, a.observacao, a.equipamento_id,
            e.apelido as equipamento, a.distancia_km::text, a.duracao_segundos, a.fc_media, a.fc_max, a.rpe::text, a.kcal,
            a.elevacao_m, a.potencia_media, a.potencia_normalizada, a.cadencia_media, a.tss::text, a.registrada_em,
            coalesce((select json_agg(json_build_object('id', c.id, 'horario', to_char(c.horario, 'HH24:MI'), 'minuto', c.minuto,
                                                        'categoria', c.categoria, 'descricao', c.descricao, 'quantidade', c.quantidade,
                                                        'unidade', c.unidade, 'observacao', c.observacao)
                                      order by coalesce(c.minuto, extract(epoch from c.horario) / 60), c.criado_em)
                        from public.treino_consumos c where c.atividade_id = a.id and c.removido_em is null), '[]') as consumos
       from public.treino_atividades a
       left join public.treino_equipamentos e on e.id = a.equipamento_id
      where a.patient_id = $1 and a.data >= $2
      order by a.data desc, a.registrada_em desc
      limit 300`,
    [patientId, desde]
  );
  return r.rows.map(atividadeDe);
}

// Primeiro dia aceito para registrar: domingo da semana anterior.
export function primeiroDiaDeRegistro(hoje = hojeNoBrasil()) {
  return somarDias(domingoDaSemana(hoje), -7);
}

// Aluno: registra ou corrige (mesma chave_cliente) uma corrida ou pedal.
// Sessão de profissional com o plano vencido (T8, S2) ou, sem sessão, aluno
// sem nenhum profissional liberado: recusa.
export class AtividadeBloqueada extends Error {}

export async function salvarAtividade(
  patientId: string,
  corpo: unknown,
  hoje = hojeNoBrasil(),
  bloqueio: { bloqueados: string[]; total: boolean } = { bloqueados: [], total: false }
) {
  // Sem nenhum profissional liberado, a orientação vem antes de qualquer erro.
  if (bloqueio.total && !(corpo as { prescricao_id?: unknown } | null)?.prescricao_id) throw new AtividadeBloqueada("total");
  const v = validarAtividade(corpo);
  if ("erro" in v) throw new AtividadeInvalida(v.erro);
  const a = v.atividade;
  if (a.data > hoje) throw new AtividadeInvalida("A data não pode ser no futuro.");
  if (a.data < primeiroDiaDeRegistro(hoje)) throw new AtividadeInvalida("Só dá para registrar atividades desta semana e da semana passada.");

  const pool = obterPool();
  // Sessão prescrita: precisa ser de uma planilha deste aluno, da mesma
  // modalidade, e a sessão precisa existir na versão.
  if (a.prescricao_id) {
    const p = await pool.query<{ plano: PlanoEndurance; criada_por: string | null }>(
      "select plano, criada_por from public.treino_prescricoes where id = $1 and patient_id = $2 and status = 'publicada' and modalidade = $3",
      [a.prescricao_id, patientId, a.modalidade]
    );
    if (p.rows[0]?.criada_por && bloqueio.bloqueados.includes(p.rows[0].criada_por)) throw new AtividadeBloqueada();
    const ref = a.sessao_indice === null || a.sessao_indice === undefined ? null : sessaoDaReferencia(a.sessao_indice);
    if (!p.rows[0] || !ref || !p.rows[0].plano.semanas?.[ref.semana]?.sessoes?.[ref.indice]) throw new AtividadeInvalida("Sessão prescrita não encontrada. Recarregue a página.");
  }
  if (a.equipamento_id) {
    const e = await pool.query<{ tipo: string }>("select tipo from public.treino_equipamentos where id = $1 and patient_id = $2", [a.equipamento_id, patientId]);
    const esperado = a.modalidade === "corrida" ? "tenis" : "bicicleta";
    if (e.rows[0]?.tipo !== esperado) throw new AtividadeInvalida(a.modalidade === "corrida" ? "Escolha um dos seus tênis." : "Escolha uma das suas bicicletas.");
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    // Mesma chave de outro aluno: recusa (nunca sobrescreve dado alheio).
    const dono = await cliente.query<{ patient_id: string }>("select patient_id from public.treino_atividades where chave_cliente = $1", [a.chave_cliente]);
    if (dono.rows[0] && dono.rows[0].patient_id !== patientId) throw new AtividadeInvalida("Registro inválido.");
    const gravada = await cliente.query<{ id: string }>(
      `insert into public.treino_atividades
         (patient_id, modalidade, chave_cliente, data, situacao, data_efetiva, motivo, observacao, equipamento_id, distancia_km,
          duracao_segundos, fc_media, fc_max, rpe, kcal, elevacao_m, potencia_media, potencia_normalizada, cadencia_media, tss,
          prescricao_id, sessao_indice, registrada_em)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, coalesce($23::timestamptz, now()))
       on conflict (chave_cliente) do update
         set modalidade = excluded.modalidade, data = excluded.data, prescricao_id = excluded.prescricao_id, sessao_indice = excluded.sessao_indice, situacao = excluded.situacao, data_efetiva = excluded.data_efetiva,
             motivo = excluded.motivo, observacao = excluded.observacao, equipamento_id = excluded.equipamento_id,
             distancia_km = excluded.distancia_km, duracao_segundos = excluded.duracao_segundos, fc_media = excluded.fc_media,
             fc_max = excluded.fc_max, rpe = excluded.rpe, kcal = excluded.kcal, elevacao_m = excluded.elevacao_m,
             potencia_media = excluded.potencia_media, potencia_normalizada = excluded.potencia_normalizada,
             cadencia_media = excluded.cadencia_media, tss = excluded.tss, atualizada_em = now()
       returning id`,
      [
        patientId, a.modalidade, a.chave_cliente, a.data, a.situacao, a.data_efetiva, a.motivo, a.observacao, a.equipamento_id, a.distancia_km,
        a.duracao_segundos, a.fc_media, a.fc_max, a.rpe, a.kcal, a.elevacao_m, a.potencia_media, a.potencia_normalizada, a.cadencia_media, a.tss,
        a.prescricao_id ?? null, a.prescricao_id ? (a.sessao_indice ?? null) : null, a.registrada_em ?? null,
      ]
    );
    const id = gravada.rows[0].id;

    // Consumo: o que saiu da lista fica marcado como removido; o que mudou é
    // regravado como item novo (correção registrada); o resto fica.
    const atuais = await cliente.query<Consumo & { id: string; quantidade: string | null }>(
      `select id, to_char(horario, 'HH24:MI') as horario, minuto, categoria, descricao, quantidade::text as quantidade, unidade, observacao
         from public.treino_consumos where atividade_id = $1 and removido_em is null`,
      [id]
    );
    const igual = (x: Consumo, y: Consumo) =>
      x.horario === y.horario && x.minuto === y.minuto && x.categoria === y.categoria && x.descricao === y.descricao &&
      numero(x.quantidade) === numero(y.quantidade) && x.unidade === y.unidade && x.observacao === y.observacao;
    const mantidos = new Set<string>();
    for (const c of a.consumos) {
      const existente = c.id ? atuais.rows.find((x) => x.id === c.id) : undefined;
      if (existente && igual(existente, c)) {
        mantidos.add(existente.id);
        continue;
      }
      await cliente.query(
        `insert into public.treino_consumos (atividade_id, horario, minuto, categoria, descricao, quantidade, unidade, observacao)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, c.horario, c.minuto, c.categoria, c.descricao, c.quantidade, c.unidade, c.observacao]
      );
    }
    const removidos = atuais.rows.filter((x) => !mantidos.has(x.id)).map((x) => x.id);
    if (removidos.length) await cliente.query("update public.treino_consumos set removido_em = now() where id = any($1::uuid[])", [removidos]);

    await cliente.query("commit");
    return id;
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

// Aluno: apaga uma atividade registrada por engano (só dentro do período em
// que ainda pode registrar; relatórios já fechados guardam a própria cópia).
export async function excluirAtividade(patientId: string, id: string, hoje = hojeNoBrasil()) {
  const r = await obterPool().query("delete from public.treino_atividades where id = $1 and patient_id = $2 and data >= $3", [id, patientId, primeiroDiaDeRegistro(hoje)]);
  return (r.rowCount ?? 0) > 0;
}

// Calorias informadas pelo aluno na semana (musculação + corrida + pedal).
export async function caloriasInformadasNaSemana(patientId: string, hoje = hojeNoBrasil()) {
  const inicio = domingoDaSemana(hoje);
  const fim = somarDias(inicio, 6);
  const r = await obterPool().query<{ total: string | null; registros: string }>(
    `select sum(kcal)::text as total, count(kcal)::text as registros from (
       select kcal from public.treino_sessoes where patient_id = $1 and data_planejada between $2 and $3 and kcal is not null
       union all
       select kcal from public.treino_atividades where patient_id = $1 and data between $2 and $3 and kcal is not null
     ) x`,
    [patientId, inicio, fim]
  );
  const linha = r.rows[0];
  return Number(linha.registros) ? Number(linha.total) : null;
}

// ---------------------------------------------------------------------------
// Sessões prescritas de corrida e ciclismo (T4c) na semana do aluno

export type SessaoPlanejada = SessaoEndurance & {
  modalidade: ModalidadeEndurance;
  prescricao_id: string;
  referencia: number;
  data: string;
  titulo: string | null;
};

const DESDE_DOMINGO: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

// Planilhas vigentes (a versão publicada mais recente de cada modalidade) e
// as sessões da semana da data. O aluno não recebe notas nem a Opção oculta.
// Sem as planilhas dos profissionais com o plano vencido (T8, S2).
export async function sessoesPlanejadas(patientId: string, hoje = hojeNoBrasil(), bloqueados: string[] = []): Promise<SessaoPlanejada[]> {
  const r = await obterPool().query<{ id: string; modalidade: ModalidadeEndurance; titulo: string | null; plano: PlanoEndurance }>(
    `select distinct on (modalidade) id, modalidade, titulo, plano from public.treino_prescricoes
      where patient_id = $1 and status = 'publicada' and modalidade in ('corrida', 'ciclismo') and arquivada_em is null
        and (criada_por is null or criada_por <> all($2::uuid[]))
      order by modalidade, publicada_em desc, criada_em desc`,
    [patientId, bloqueados]
  );
  const lista: SessaoPlanejada[] = [];
  for (const p of r.rows) {
    const semana = semanaDoCiclo(p.plano, hoje);
    if (semana === null) continue;
    const plano = planoEnduranceParaAluno(p.plano);
    const domingo = somarDias(p.plano.ciclo.inicio!, semana * 7);
    for (const { s, i } of ordenarSessoesDaSemana(plano.semanas[semana].sessoes)) {
      lista.push({ ...s, modalidade: p.modalidade, prescricao_id: p.id, referencia: referenciaDaSessao(semana, i), data: somarDias(domingo, DESDE_DOMINGO[s.dia]), titulo: p.titulo });
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}
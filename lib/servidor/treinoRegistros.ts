import { hojeNoBrasil, somarDias } from "@/lib/cronograma";
import {
  DIAS,
  chaveDoExercicio,
  datasDaSemana,
  domingoDaSemana,
  momentoDoAparelho,
  type ChaveDia,
  type ExercicioRegistrado,
  type PlanoDeTreino,
  type SessaoRegistrada,
  type SituacaoDaSessao,
} from "@/lib/treino";
import { planoParaAluno } from "@/lib/treinoEditor";
import { obterPool } from "./banco";

// Módulo de Treino, etapa T1: prescrição vigente e registros do aluno.
//
// - A prescrição publicada nunca é alterada pelo aluno.
// - O aluno registra a sessão da semana atual (domingo a sábado, Brasília):
//   uma sessão por dia planejado; salvar de novo atualiza, não duplica.
// - "Anterior": última carga registrada para o mesmo exercício em data
//   anterior à desta sessão (o aluno vê só isso; o histórico completo é do
//   profissional).

export type Prescricao = {
  id: string;
  origem: "externa" | "profissional";
  versao: number;
  plano: PlanoDeTreino;
  publicada_em: string;
  criada_por: string | null;
};

// Treino que vale hoje. Para o aluno, sem os treinos dos profissionais com o
// plano vencido além da tolerância (T8, S2): vale o mais recente dos demais.
export async function prescricaoVigente(patientId: string, bloqueados: string[] = []): Promise<Prescricao | null> {
  const linha = await obterPool().query<Prescricao>(
    `select id, origem, versao, plano, publicada_em, criada_por from public.treino_prescricoes
      where patient_id = $1 and status = 'publicada' and modalidade = 'musculacao' and arquivada_em is null
        and (criada_por is null or criada_por <> all($2::uuid[]))
      order by publicada_em desc, criada_em desc limit 1`,
    [patientId, bloqueados]
  );
  return linha.rows[0] ?? null;
}

// O treino é de um profissional com o plano vencido (T8, S2).
export class RegistroBloqueado extends Error {}

// Treino importado (arquivo ou texto organizado pela IA) vira prescrição
// externa publicada. Chamado quando a IA conclui. "Ler novamente" com
// resultado diferente publica uma nova versão (a anterior fica); com o mesmo
// resultado, nada muda.
export async function publicarPrescricaoExterna(treinoId: string) {
  await obterPool().query(
    `insert into public.treino_prescricoes (patient_id, origem, treino_id, versao, plano)
     select t.patient_id, 'externa', t.id,
            (select count(*) + 1 from public.treino_prescricoes p where p.treino_id = t.id), t.plano
       from public.treinos t
      where t.id = $1 and t.status = 'concluido' and t.plano is not null
        and not exists (select 1 from public.treino_prescricoes p where p.treino_id = t.id and p.plano = t.plano)`,
    [treinoId]
  );
}

type LinhaRegistro = {
  sessao_id: string;
  dia: ChaveDia;
  data_planejada: string;
  situacao: SituacaoDaSessao | null;
  data_efetiva: string | null;
  motivo: string | null;
  observacao: string | null;
  kcal: number | null;
  atualizado_em: string;
  prescricao_id: string;
  indice: number | null;
  chave: string | null;
  series: string | null;
  repeticoes: string | null;
  carga_kg: string | null;
  descanso_segundos: number | null;
};

const numero = (v: string | number | null) => (v === null || v === undefined ? null : Number(v));

async function registrosDoAluno(patientId: string) {
  const linhas = await obterPool().query<LinhaRegistro>(
    `select s.id as sessao_id, s.dia, to_char(s.data_planejada, 'YYYY-MM-DD') as data_planejada, s.situacao,
            to_char(s.data_efetiva, 'YYYY-MM-DD') as data_efetiva, s.motivo, s.observacao, s.kcal, s.atualizado_em, s.prescricao_id,
            e.indice, e.chave, e.series::text, e.repeticoes::text, e.carga_kg::text, e.descanso_segundos
       from public.treino_sessoes s
       left join public.treino_exercicios_registro e on e.sessao_id = s.id
      where s.patient_id = $1
      order by s.data_planejada desc, s.atualizado_em desc, e.indice
      limit 5000`,
    [patientId]
  );
  return linhas.rows;
}

function exercicioDe(l: LinhaRegistro): ExercicioRegistrado {
  return {
    indice: l.indice as number,
    series: numero(l.series),
    repeticoes: numero(l.repeticoes),
    carga_kg: numero(l.carga_kg),
    descanso_segundos: l.descanso_segundos,
  };
}

// Tudo o que a tela "Meu treino" precisa.
export async function treinoDoAluno(patientId: string, hoje = hojeNoBrasil(), bloqueados: string[] = []) {
  const prescricao = await prescricaoVigente(patientId, bloqueados);
  if (!prescricao) return null;

  const datas = datasDaSemana(hoje);
  const linhas = await registrosDoAluno(patientId);

  // Sessões desta semana (da prescrição vigente).
  const sessoes: Partial<Record<ChaveDia, SessaoRegistrada>> = {};
  for (const l of linhas) {
    if (l.prescricao_id !== prescricao.id || l.data_planejada !== datas[l.dia]) continue;
    const sessao = (sessoes[l.dia] ??= {
      id: l.sessao_id,
      dia: l.dia,
      data_planejada: l.data_planejada,
      situacao: l.situacao,
      data_efetiva: l.data_efetiva,
      motivo: l.motivo,
      observacao: l.observacao,
      kcal: l.kcal,
      atualizado_em: l.atualizado_em,
      exercicios: [],
    });
    if (l.indice !== null) sessao.exercicios.push(exercicioDe(l));
  }

  // Valores mais recentes de cada exercício desta prescrição (painel).
  const ultimos: Record<string, Record<number, ExercicioRegistrado>> = {};
  for (const l of linhas) {
    if (l.prescricao_id !== prescricao.id || l.indice === null) continue;
    const doDia = (ultimos[l.dia] ??= {});
    if (!doDia[l.indice]) doDia[l.indice] = exercicioDe(l);
  }

  // "Anterior": última carga válida do mesmo exercício antes da data do dia.
  const anteriores: Partial<Record<ChaveDia, Record<number, { carga_kg: number; data: string }>>> = {};
  for (const dia of prescricao.plano.dias) {
    const doDia: Record<number, { carga_kg: number; data: string }> = {};
    dia.exercicios.forEach((exercicio, indice) => {
      const chave = chaveDoExercicio(exercicio.nome);
      const anterior = linhas.find((l) => l.chave === chave && l.carga_kg !== null && Number(l.carga_kg) > 0 && l.data_planejada < datas[dia.dia]);
      if (anterior) doDia[indice] = { carga_kg: Number(anterior.carga_kg), data: anterior.data_planejada };
    });
    anteriores[dia.dia] = doDia;
  }

  // O aluno não recebe os detalhes do editor nem a Opção oculta (C3, P1).
  return { prescricao: { ...prescricao, plano: planoParaAluno(prescricao.plano) }, datas, sessoes, ultimos, anteriores };
}

// ---------------------------------------------------------------------------
// Gravação do registro (aluno)

export class RegistroInvalido extends Error {}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function numeroValido(valor: unknown, maximo: number) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > maximo) throw new RegistroInvalido("Valor inválido.");
  return valor;
}

function textoValido(valor: unknown, limite: number) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") throw new RegistroInvalido("Texto inválido.");
  const texto = valor.trim();
  if (texto.length > limite) throw new RegistroInvalido(`Texto com mais de ${limite} caracteres.`);
  return texto || null;
}

export async function salvarRegistro(patientId: string, corpo: unknown, hoje = hojeNoBrasil(), bloqueados: string[] = []) {
  const dados = (corpo ?? {}) as Record<string, unknown>;
  const dia = dados.dia as ChaveDia;
  if (!DIAS.some((d) => d.chave === dia)) throw new RegistroInvalido("Dia inválido.");

  // Registro feito sem internet (T5): pode chegar depois de uma nova versão
  // do treino ou na semana seguinte. Vale a prescrição em que foi feito (se
  // é deste aluno) e a semana informada (esta ou a anterior).
  const vigente = await prescricaoVigente(patientId, bloqueados);
  let prescricao = vigente;
  if (typeof dados.prescricaoId === "string" && dados.prescricaoId !== vigente?.id && /^[0-9a-f-]{36}$/i.test(dados.prescricaoId)) {
    const anterior = await obterPool().query<Prescricao>(
      `select id, origem, versao, plano, publicada_em, criada_por from public.treino_prescricoes
        where id = $1 and patient_id = $2 and status = 'publicada' and modalidade = 'musculacao'`,
      [dados.prescricaoId, patientId]
    );
    prescricao = anterior.rows[0] ?? null;
  }
  if (prescricao?.criada_por && bloqueados.includes(prescricao.criada_por)) throw new RegistroBloqueado();
  if (!prescricao || prescricao.id !== dados.prescricaoId) throw new RegistroInvalido("O treino mudou. Recarregue a página.");
  const registradaEm = momentoDoAparelho(dados.registradaEm);
  if (registradaEm === undefined) throw new RegistroInvalido("Data do registro inválida.");
  let dataPlanejada = datasDaSemana(hoje)[dia];
  if (dados.dataPlanejada !== undefined && dados.dataPlanejada !== null) {
    const informada = String(dados.dataPlanejada);
    if (!DATA.test(informada) || datasDaSemana(informada)[dia] !== informada) throw new RegistroInvalido("Data do treino inválida.");
    if (informada > datasDaSemana(hoje).sab || informada < datasDaSemana(somarDias(domingoDaSemana(hoje), -7)).dom)
      throw new RegistroInvalido("Este registro é de uma semana já fechada e não pode mais ser enviado.");
    dataPlanejada = informada;
  }
  const diaDoPlano = prescricao.plano.dias.find((d) => d.dia === dia);
  if (!diaDoPlano) throw new RegistroInvalido("Dia sem treino.");

  const situacao = dados.situacao === null || dados.situacao === undefined || dados.situacao === "" ? null : String(dados.situacao);
  if (situacao !== null && !["concluido", "parcial", "nao_concluido", "reagendado"].includes(situacao)) throw new RegistroInvalido("Situação inválida.");
  const dataEfetiva = situacao === "reagendado" ? String(dados.dataEfetiva ?? "") : null;
  if (situacao === "reagendado" && !DATA.test(dataEfetiva ?? "")) throw new RegistroInvalido("Informe a nova data do treino reagendado.");
  const motivo = situacao && situacao !== "concluido" ? textoValido(dados.motivo, 500) : null;
  const observacao = textoValido(dados.observacao, 2000);
  // Calorias do relógio do aluno (C1): informadas, nunca estimadas.
  const kcal = numeroValido(dados.kcal, 20000);

  const lista = Array.isArray(dados.exercicios) ? dados.exercicios : [];
  if (lista.length > diaDoPlano.exercicios.length) throw new RegistroInvalido("Exercícios inválidos.");
  const exercicios = lista.map((item) => {
    const e = (item ?? {}) as Record<string, unknown>;
    const indice = Number(e.indice);
    if (!Number.isInteger(indice) || indice < 0 || indice >= diaDoPlano.exercicios.length) throw new RegistroInvalido("Exercício inválido.");
    const nome = diaDoPlano.exercicios[indice].nome;
    return {
      indice,
      nome,
      chave: chaveDoExercicio(nome),
      series: numeroValido(e.series, 10000),
      repeticoes: numeroValido(e.repeticoes, 10000),
      carga_kg: numeroValido(e.carga_kg, 10000),
      descanso_segundos: numeroValido(e.descanso_segundos, 10000),
    };
  });

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const sessao = await cliente.query<{ id: string }>(
      `insert into public.treino_sessoes (patient_id, prescricao_id, dia, data_planejada, situacao, data_efetiva, motivo, observacao, kcal, registrada_em)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       on conflict (patient_id, prescricao_id, dia, data_planejada) do update
         set situacao = excluded.situacao, data_efetiva = excluded.data_efetiva, motivo = excluded.motivo,
             observacao = excluded.observacao, kcal = excluded.kcal, registrada_em = excluded.registrada_em, atualizado_em = now()
       returning id`,
      [patientId, prescricao.id, dia, dataPlanejada, situacao, dataEfetiva, motivo, observacao, kcal === null ? null : Math.round(kcal), registradaEm]
    );
    const sessaoId = sessao.rows[0].id;
    await cliente.query("delete from public.treino_exercicios_registro where sessao_id = $1", [sessaoId]);
    for (const e of exercicios) {
      if (e.series === null && e.repeticoes === null && e.carga_kg === null && e.descanso_segundos === null) continue;
      await cliente.query(
        `insert into public.treino_exercicios_registro (sessao_id, indice, nome, chave, series, repeticoes, carga_kg, descanso_segundos)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sessaoId, e.indice, e.nome, e.chave, e.series, e.repeticoes, e.carga_kg, e.descanso_segundos]
      );
    }
    await cliente.query("commit");
    return sessaoId;
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

// ---------------------------------------------------------------------------
// Profissional: sessões registradas e histórico de cargas

export async function registrosParaProfissional(patientId: string) {
  const linhas = await registrosDoAluno(patientId);
  const sessoes = new Map<string, SessaoRegistrada & { nomes: Record<number, string> }>();
  const cargas: Record<string, { nome: string; pontos: { data: string; carga_kg: number; series: number | null; repeticoes: number | null }[] }> = {};
  const nomes = await obterPool().query<{ sessao_id: string; indice: number; nome: string }>(
    `select e.sessao_id, e.indice, e.nome from public.treino_exercicios_registro e
       join public.treino_sessoes s on s.id = e.sessao_id where s.patient_id = $1`,
    [patientId]
  );
  const nomeDe = new Map(nomes.rows.map((n) => [`${n.sessao_id}:${n.indice}`, n.nome]));

  for (const l of linhas) {
    const sessao =
      sessoes.get(l.sessao_id) ??
      sessoes
        .set(l.sessao_id, {
          id: l.sessao_id,
          dia: l.dia,
          data_planejada: l.data_planejada,
          situacao: l.situacao,
          data_efetiva: l.data_efetiva,
          motivo: l.motivo,
          observacao: l.observacao,
          kcal: l.kcal,
          atualizado_em: l.atualizado_em,
          exercicios: [],
          nomes: {},
        })
        .get(l.sessao_id)!;
    if (l.indice === null) continue;
    sessao.exercicios.push(exercicioDe(l));
    const nome = nomeDe.get(`${l.sessao_id}:${l.indice}`) ?? "";
    sessao.nomes[l.indice] = nome;
    if (l.chave && l.carga_kg !== null && Number(l.carga_kg) > 0) {
      (cargas[l.chave] ??= { nome, pontos: [] }).pontos.push({
        data: l.data_planejada,
        carga_kg: Number(l.carga_kg),
        series: numero(l.series),
        repeticoes: numero(l.repeticoes),
      });
    }
  }
  return { sessoes: [...sessoes.values()], cargas };
}

import { hojeNoBrasil } from "@/lib/cronograma";
import type { RelatoDeDesconforto } from "@/lib/treino";
import { obterPool } from "./banco";
import { enfileirarParaProfissionais } from "./pushProfissional";
import { prescricaoVigente } from "./treinoRegistros";
import { responsaveisPeloAluno, type ProfissionalDeTreino } from "./treinoAcesso";

// Relatos de desconforto do aluno (T2): gravados na hora. O push ao
// profissional responsável sai só para os mais fortes (o aluno parou o
// exercício, resposta A3 do cliente); os leves ficam no painel.

export type Desconforto = {
  id: string;
  patient_id: string;
  paciente: string;
  dia: string | null;
  data: string;
  exercicio: string | null;
  regiao: string;
  intensidade: number;
  conduta: "continuei" | "parei";
  comentario: string | null;
  criado_em: string;
  visto_em: string | null;
  visto_por_nome: string | null;
};

// Grava o relato. Reenviar o mesmo relato (mesma chaveCliente) devolve o
// já gravado, sem duplicar o registro nem o aviso.
export async function registrarDesconforto(patientId: string, relato: RelatoDeDesconforto) {
  const prescricao = await prescricaoVigente(patientId);
  const inserido = await obterPool().query<{ id: string }>(
    `insert into public.treino_desconfortos
       (patient_id, prescricao_id, dia, data, exercicio, regiao, intensidade, conduta, comentario, chave_cliente)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (chave_cliente) do nothing
     returning id`,
    [patientId, prescricao?.id ?? null, relato.dia, hojeNoBrasil(), relato.exercicio, relato.regiao, relato.intensidade, relato.conduta, relato.comentario, relato.chaveCliente]
  );

  if (!inserido.rows[0]) {
    const existente = await obterPool().query<{ id: string }>(
      "select id from public.treino_desconfortos where chave_cliente = $1 and patient_id = $2",
      [relato.chaveCliente, patientId]
    );
    return { id: existente.rows[0]?.id ?? null, novo: false };
  }

  const id = inserido.rows[0].id;
  if (relato.conduta !== "parei") return { id, novo: true };

  const nome = await obterPool().query<{ name: string }>("select name from public.patients where id = $1", [patientId]);
  const primeiroNome = nome.rows[0]?.name.trim().split(/\s+/)[0] ?? "Aluno";

  // No aviso (aparece na tela bloqueada), só o mínimo: nome e intensidade.
  await enfileirarParaProfissionais(await responsaveisPeloAluno(patientId), {
    tipo: "desconforto",
    pacienteId: patientId,
    titulo: "Relato de desconforto no treino",
    corpo: `${primeiroNome} relatou desconforto (intensidade ${relato.intensidade}/10) e parou o exercício.`,
    destino: `/treino/alunos/${patientId}`,
    referenciaId: id,
  });

  return { id, novo: true };
}

const CAMPOS = `d.id, d.patient_id, p.name as paciente, d.dia, d.data::text as data, d.exercicio, d.regiao, d.intensidade,
                d.conduta, d.comentario, d.criado_em, d.visto_em,
                coalesce(e.nome, case when d.visto_por is not null then 'Nutricionista' end) as visto_por_nome`;

function filtroDoProfissional(profissional: ProfissionalDeTreino, parametro: string) {
  return profissional.admin
    ? "true"
    : `exists (select 1 from public.treino_vinculos v where v.patient_id = d.patient_id and v.profissional_id = ${parametro} and v.fim is null)`;
}

// Relatos de um aluno (o profissional já foi autorizado para ele).
export async function desconfortosDoAluno(patientId: string, limite = 50) {
  const r = await obterPool().query<Desconforto>(
    `select ${CAMPOS}
       from public.treino_desconfortos d
       join public.patients p on p.id = d.patient_id
       left join public.educadores_fisicos e on e.usuario_id = d.visto_por
      where d.patient_id = $1
      order by d.criado_em desc
      limit $2`,
    [patientId, limite]
  );
  return r.rows;
}

// Relatos ainda não vistos, de todos os alunos do profissional.
export async function desconfortosNaoVistos(profissional: ProfissionalDeTreino) {
  const r = await obterPool().query<Desconforto>(
    `select ${CAMPOS}
       from public.treino_desconfortos d
       join public.patients p on p.id = d.patient_id
       left join public.educadores_fisicos e on e.usuario_id = d.visto_por
      where d.visto_em is null and ${filtroDoProfissional(profissional, "$1")}
      order by d.criado_em desc
      limit 100`,
    profissional.admin ? [] : [profissional.usuarioId]
  );
  return r.rows;
}

// Marca como visto, só se o relato é de um aluno do profissional.
export async function marcarDesconfortoVisto(profissional: ProfissionalDeTreino, id: string) {
  const r = await obterPool().query(
    `update public.treino_desconfortos d set visto_em = now(), visto_por = $1
      where d.id = $2 and d.visto_em is null and ${filtroDoProfissional(profissional, "$1")}`,
    [profissional.usuarioId, id]
  );
  return (r.rowCount ?? 0) > 0;
}

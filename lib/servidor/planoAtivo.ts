import { after } from "next/server";
import { hojeNoBrasil, normalizarFrequencia, relatorioParaLiberar } from "@/lib/cronograma";
import { obterPool } from "./banco";
import { processarFila } from "./filaDeNotificacoes";

// Plano do paciente com o ciclo ativo (SPEC Plano Ativo, 04/11/2026).
//
// O calendário dos relatórios lê diet_cycles.followup_frequency; a edição do
// paciente gravava só patients.plan. Aqui os dois são gravados juntos, numa
// transação, e:
// - o relatório previsto mais recente já devido é liberado (Opção B), aberto
//   só hoje até 23h59 (S11) ou, na segunda e na terça da semana prevista, na
//   janela normal (S12); semanas anteriores não são regularizadas;
// - um único aviso "Seu relatório está disponível!" entra na fila de
//   notificações (mesmo texto do agendador), sem duplicar;
// - datas do ciclo, pagamentos, acesso, dieta e histórico não mudam (RF-09);
// - a troca na edição é sempre correção do ciclo atual (S9); a mudança
//   comercial futura segue pela renovação. Sem motivo (S10).

export class PlanoInvalido extends Error {}

export const PLANOS_DO_PACIENTE = ["Semanal", "Quinzenal", "Mensal"] as const;

const TITULO = "Seu relatório está disponível!";
const CORPO = "Está na hora de preencher seu relatório de acompanhamento nutricional.";

type Ciclo = {
  id: string;
  numero: number;
  start_date: string;
  end_date: string;
  followup_frequency: string;
  retroactive_registered_at: string | null;
  relatorio_liberado_semana: string | null;
  relatorio_liberado_ate: string | null;
};

type Executor = { query: ReturnType<typeof obterPool>["query"] };

async function lerSituacao(executor: Executor, patientId: string, bloquear: boolean) {
  const paciente = await executor.query<{ plan: string | null; retroactive_registration: boolean | null; retroactive_completed_weeks: number | null }>(
    `select plan, retroactive_registration, retroactive_completed_weeks from public.patients
      where id = $1 and educador_dono_id is null ${bloquear ? "for update" : ""}`,
    [patientId]
  );
  if (!paciente.rows[0]) return null;
  const ciclo = await executor.query<Ciclo>(
    `select id, cycle_number as numero, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date,
            followup_frequency, to_char(retroactive_registered_at, 'YYYY-MM-DD') as retroactive_registered_at,
            to_char(relatorio_liberado_semana, 'YYYY-MM-DD') as relatorio_liberado_semana,
            to_char(relatorio_liberado_ate, 'YYYY-MM-DD') as relatorio_liberado_ate
       from public.diet_cycles where patient_id = $1 and status = 'ativo'
      order by start_date desc limit 1 ${bloquear ? "for update" : ""}`,
    [patientId]
  );
  const c = ciclo.rows[0] ?? null;
  const respondidas = c
    ? new Set(
        (
          await executor.query<{ semana: string }>(
            "select to_char(scheduled_week_start, 'YYYY-MM-DD') as semana from public.patient_reports where cycle_id = $1 and scheduled_week_start is not null",
            [c.id]
          )
        ).rows.map((l) => l.semana)
      )
    : new Set<string>();
  const p = paciente.rows[0];
  return { plano: p.plan, semanasConcluidas: p.retroactive_registration ? Number(p.retroactive_completed_weeks ?? 0) : 0, ciclo: c, respondidas };
}

function planoValido(valor: unknown) {
  const plano = PLANOS_DO_PACIENTE.find((p) => p === valor);
  if (!plano) throw new PlanoInvalido("Escolha o plano: Semanal, Quinzenal ou Mensal.");
  return plano;
}

function simular(situacao: NonNullable<Awaited<ReturnType<typeof lerSituacao>>>, planoNovo: string, hoje: string) {
  const c = situacao.ciclo;
  if (!c) return null;
  const liberar = relatorioParaLiberar({ ...c, followup_frequency: planoNovo }, situacao.semanasConcluidas, hoje, situacao.respondidas);
  // A mesma semana já foi liberada num dia anterior: não reabre (é oferecida
  // uma vez só; salvar de novo não estende o prazo).
  if (liberar?.modo === "liberacao" && c.relatorio_liberado_semana === liberar.segunda && (c.relatorio_liberado_ate ?? "") < hoje) return null;
  return liberar;
}

// Prévia para a confirmação na tela (RF-11).
export async function previaDoPlano(patientId: string, planoNovo: unknown, hoje = hojeNoBrasil()) {
  const plano = planoValido(planoNovo);
  const situacao = await lerSituacao(obterPool(), patientId, false);
  if (!situacao) return null;
  const c = situacao.ciclo;
  return {
    hoje,
    planoAtual: situacao.plano,
    planoNovo: plano,
    ciclo: c ? { id: c.id, numero: c.numero, inicio: c.start_date, fim: c.end_date, frequencia: c.followup_frequency } : null,
    // Cadastro e ciclo com planos diferentes (CA-15): reaplicar corrige.
    divergente: Boolean(c && normalizarFrequencia(c.followup_frequency) !== normalizarFrequencia(situacao.plano)),
    liberar: simular(situacao, plano, hoje),
  };
}

// Grava o plano no cadastro e no ciclo ativo, libera o relatório devido e
// registra. Reaplicar o mesmo plano é seguro (RF-07). null: paciente não
// encontrado.
export async function aplicarPlano(usuarioId: string, patientId: string, planoNovo: unknown, hoje = hojeNoBrasil()) {
  const plano = planoValido(planoNovo);
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const situacao = await lerSituacao(cliente, patientId, true);
    if (!situacao) {
      await cliente.query("rollback");
      return null;
    }
    const c = situacao.ciclo;
    const liberar = simular(situacao, plano, hoje);

    await cliente.query("update public.patients set plan = $2 where id = $1", [patientId, plano]);

    let avisoEnfileirado = false;
    if (c) {
      // Fora da janela normal: aberto só hoje (S11). Na janela, nada a gravar.
      const liberacao = liberar?.modo === "liberacao" ? { semana: liberar.segunda, ate: hoje } : null;
      await cliente.query(
        `update public.diet_cycles
            set followup_frequency = $2,
                relatorio_liberado_semana = coalesce($3::date, relatorio_liberado_semana),
                relatorio_liberado_ate = coalesce($4::date, relatorio_liberado_ate)
          where id = $1`,
        [c.id, plano, liberacao?.semana ?? null, liberacao?.ate ?? null]
      );
      if (liberar) {
        // Um aviso por ciclo e semana, mesmo salvando de novo (RF-07, D3).
        const aviso = await cliente.query(
          `insert into public.notification_queue
             (patient_id, notification_type, title, body, target_url, reference_id, dedup_key, status)
           values ($1, 'relatorio', $2, $3, '/area-paciente/acompanhamento', $4, $5, 'pendente')
           on conflict (dedup_key) do nothing`,
          [patientId, TITULO, CORPO, c.id, `relatorio_liberado:${c.id}:${liberar.segunda}`]
        );
        avisoEnfileirado = (aviso.rowCount ?? 0) > 0;
      }
    }

    await cliente.query(
      `insert into public.plano_alteracoes
         (patient_id, cycle_id, alterado_por, plano_anterior, plano_novo, frequencia_ciclo_anterior, frequencia_ciclo_nova,
          reaplicacao, relatorio_liberado_semana, modo_liberacao, aviso_enfileirado)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        patientId,
        c?.id ?? null,
        usuarioId,
        situacao.plano,
        plano,
        c?.followup_frequency ?? null,
        c ? plano : null,
        normalizarFrequencia(situacao.plano) === normalizarFrequencia(plano),
        liberar?.segunda ?? null,
        liberar?.modo ?? null,
        avisoEnfileirado,
      ]
    );
    await cliente.query("commit");

    // Envia já; se falhar, a fila guarda o erro e o agendador tenta de novo (CA-05).
    if (avisoEnfileirado) {
      after(() => processarFila(20).catch((erro) => console.error("Erro no envio do aviso do relatório:", erro)));
    }
    const aparelhos = await obterPool().query("select 1 from public.push_subscriptions where patient_id = $1 limit 1", [patientId]);

    return {
      plano,
      ciclo: c ? { id: c.id, numero: c.numero } : null,
      liberado: liberar,
      avisoEnfileirado,
      semAparelho: Boolean(liberar) && (aparelhos.rowCount ?? 0) === 0,
    };
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

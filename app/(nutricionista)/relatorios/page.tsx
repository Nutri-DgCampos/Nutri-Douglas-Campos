"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { Tag } from "primereact/tag";
import AnelDeAdesao from "@/components/AnelDeAdesao";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import DevolutivaERelatorio from "@/components/relatorios/DevolutivaERelatorio";
import { classificacaoDoScore } from "@/lib/relatorios/pontos";
import { segundasPrevistas, somarDias } from "@/lib/cronograma";
function obterSegundaFeiraAtualBrasil() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  const dia = Number(partes.find((p) => p.type === "day")?.value);

  const data = new Date(Date.UTC(ano, mes - 1, dia, 12));

  const diasDesdeSegunda = (data.getUTCDay() + 6) % 7;

  data.setUTCDate(data.getUTCDate() - diasDesdeSegunda);

  return data.toISOString().slice(0, 10);
}

function estaNoPeriodoDeAtraso() {
  const diaDaSemana = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  }).format(new Date());

  return [
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ].includes(diaDaSemana);
}

export default function RelatoriosPage() {
     const [relatorios, setRelatorios] = useState<any[]>([]);
     const [pacientesAtrasados, setPacientesAtrasados] = useState<any[]>([]);
     const [historicoPesos, setHistoricoPesos] = useState<any[]>([]);
     const [historicoAlcool, setHistoricoAlcool] = useState<any[]>([]);

     useEffect(() => {
  async function carregarRelatorios() {
    const { data, error } = await api
      .from("patient_reports")
      .select("*, patients(name, initial_weight, important_note, objective)")
      .eq("status", "pendente")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar relatórios:", error);
      return;
    }

    setRelatorios(data ?? []);
    // Buscar ciclos ativos para verificar relatórios não enviados
const { data: ciclosAtivos, error: erroCiclos } = await api
  .from("diet_cycles")
  .select(`
    id,
    patient_id,
    start_date,
    end_date,
    followup_frequency,
    cycle_number,
    retroactive_registered_at,
    patients (
      name,
      retroactive_registration,
      retroactive_completed_weeks
    )
  `)
  .eq("status", "ativo");

if (erroCiclos) {
  console.error("Erro ao buscar ciclos ativos:", erroCiclos);
} else {
  console.log("Ciclos ativos para verificar atrasos:", ciclosAtivos);
  // Buscar os relatórios de todos os ciclos ativos
const idsCiclos = (ciclosAtivos ?? []).map((ciclo) => ciclo.id);

if (idsCiclos.length > 0) {
  const { data: relatoriosDosCiclos, error: erroRelatoriosDosCiclos } =
    await api
      .from("patient_reports")
      .select("id, patient_id, cycle_id, cycle_report_number, scheduled_week_start, created_at, status")
      .in("cycle_id", idsCiclos);

  if (erroRelatoriosDosCiclos) {
    console.error(
      "Erro ao consultar relatórios dos ciclos:",
      erroRelatoriosDosCiclos
    );
  } else {
    console.log(
      "Relatórios registrados nos ciclos ativos:",
      relatoriosDosCiclos
    );

    const segundaAtual = obterSegundaFeiraAtualBrasil();

const ciclosComRelatorioPrevisto = (ciclosAtivos ?? []).flatMap(
  (ciclo) => {
    const pacienteDoCiclo = (
      Array.isArray(ciclo.patients) ? ciclo.patients[0] : ciclo.patients
    ) as
      | { retroactive_registration?: boolean; retroactive_completed_weeks?: number }
      | null;

    const semanasConcluidas = pacienteDoCiclo?.retroactive_registration
      ? Number(pacienteDoCiclo.retroactive_completed_weeks ?? 0)
      : 0;

    const previstos: {
      cicloId: string;
      pacienteId: string;
      numeroRelatorio: number;
      segundaPrevista: string;
    }[] = [];

    // Regra única em lib/cronograma.ts.
    for (const previsto of segundasPrevistas(ciclo, semanasConcluidas)) {
      // Relatório cujo prazo terminou antes do cadastro não conta como atraso.
      const anteriorAoCadastro =
        Boolean(ciclo.retroactive_registered_at) &&
        somarDias(previsto.segunda, 1) < (ciclo.retroactive_registered_at as string);

      if (previsto.segunda === segundaAtual && !anteriorAoCadastro) {
        previstos.push({
          cicloId: ciclo.id,
          pacienteId: ciclo.patient_id,
          numeroRelatorio: previsto.numero,
          segundaPrevista: previsto.segunda,
        });
      }
    }

    return previstos;
  }
);

console.log(
  "Relatórios previstos para esta semana:",
  ciclosComRelatorioPrevisto
);

const inicioSemana = `${segundaAtual}T00:00:00-03:00`;

const segundaSeguinte = new Date(`${segundaAtual}T12:00:00Z`);
segundaSeguinte.setUTCDate(segundaSeguinte.getUTCDate() + 7);

const fimSemana = `${segundaSeguinte.toISOString().slice(0, 10)}T00:00:00-03:00`;

const relatoriosNaoEnviados = ciclosComRelatorioPrevisto.filter(
  (previsto) => {
    const jaEnviou = (relatoriosDosCiclos ?? []).some(
  (relatorio) =>
    relatorio.cycle_id === previsto.cicloId &&
    (
      relatorio.scheduled_week_start === previsto.segundaPrevista ||
      (
        relatorio.scheduled_week_start == null &&
        relatorio.cycle_report_number === previsto.numeroRelatorio
      )
    )
);

    return !jaEnviou;
  }
);

console.log(
  "Relatórios não enviados nesta semana:",
  relatoriosNaoEnviados
);

console.log("Período de atraso ativo:", estaNoPeriodoDeAtraso());

if (estaNoPeriodoDeAtraso()) {
  const atrasados = relatoriosNaoEnviados.map((previsto) => {
    const ciclo = (ciclosAtivos ?? []).find(
      (item) => item.id === previsto.cicloId
    );

    return {
      ...previsto,
      nome: (
  Array.isArray(ciclo?.patients)
    ? ciclo.patients[0]?.name
    : (ciclo?.patients as unknown as { name?: string } | null)?.name
) ?? "Paciente não identificado",
    };
  });

  setPacientesAtrasados(atrasados);
} else {
  setPacientesAtrasados([]);
}

console.log(
  "Estamos no período de atraso:",
  estaNoPeriodoDeAtraso()
);
  }
}
}
    const { data: historico, error: erroHistorico } = await api
  .from("patient_reports")
  .select("patient_id, weight, created_at")
  .eq("status", "enviado")
  .not("weight", "is", null)
  .order("created_at", { ascending: false });

if (erroHistorico) {
  console.error("Erro ao carregar histórico de pesos:", erroHistorico);
  return;
}

setHistoricoPesos(historico ?? []);
const { data: historicoAlcoolData, error: erroHistoricoAlcool } =
  await api
    .from("patient_reports")
    .select("patient_id, alcohol_use, created_at")
    .eq("status", "enviado")
    .not("alcohol_use", "is", null)
    .order("created_at", { ascending: false });

if (erroHistoricoAlcool) {
  console.error(
    "Erro ao carregar histórico de álcool:",
    erroHistoricoAlcool
  );
} else {
  setHistoricoAlcool(historicoAlcoolData ?? []);
}
  }

    carregarRelatorios();

  const intervaloAtualizacao = setInterval(() => {
    carregarRelatorios();
  }, 60000);

  return () => {
    clearInterval(intervaloAtualizacao);
  };
}, []);

async function publicarDevolutiva(relatorio: any, texto: string) {

  const textoFinal = texto.trim();

  if (!textoFinal) {
    avisar("Gere ou escreva uma devolutiva antes de publicar.");
    return;
  }

  const { data, error } = await api
    .from("patient_reports")
    .update({
      feedback_text: textoFinal,
      status: "enviado",
    })
    .eq("id", relatorio.id)


  if (error) {
    console.error("Erro ao publicar devolutiva:", error);
    avisar("Não foi possível publicar a devolutiva.");
    return;
  }

  try {
  const {
    data: { session },
  } = await api.auth.getSession();

  if (session) {
    const respostaNotificacao = await fetch(
      "/api/notificar-devolutiva",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          relatorioId: relatorio.id,
        }),
      }
    );

    if (!respostaNotificacao.ok) {
      console.error(
        "Não foi possível registrar a notificação:",
        respostaNotificacao.status
      );
    }
  }
} catch (erroNotificacao) {
  console.error(
    "Erro ao solicitar notificação de devolutiva:",
    erroNotificacao
  );
}

const { data: ciclo } = await api
  .from("diet_cycles")
  .select("id, followup_frequency")
  .eq("id", relatorio.cycle_id)
  .maybeSingle();

  const frequencia = ciclo?.followup_frequency
  ?.trim()
  .toLowerCase();

const ultimoRelatorio =
  (frequencia === "semanal" &&
    relatorio.cycle_report_number >= 4) ||
  (frequencia === "quinzenal" &&
    relatorio.cycle_report_number >= 2) ||
  (frequencia === "mensal" &&
    relatorio.cycle_report_number >= 1);

    if (ultimoRelatorio && ciclo) {
  const { error: erroEncerramento } = await api
    .from("diet_cycles")
    .update({
      status: "concluido",
      closed_at: new Date().toISOString(),
    })
    .eq("id", ciclo.id);

  if (erroEncerramento) {
    console.error(
      "Erro ao encerrar ciclo:",
      erroEncerramento
    );
  }
}

  setRelatorios((anteriores) =>
    anteriores.filter((item) => item.id !== relatorio.id)
  );
}

async function excluirRelatorio(relatorio: any) {
  const confirmar = await pedirConfirmacao(
    "Excluir este relatório?\n\nEle não será contabilizado no acompanhamento do paciente."
  );

  if (!confirmar) return;

  const { error } = await api
    .from("patient_reports")
    .delete()
    .eq("id", relatorio.id);

  if (error) {
    console.error("Erro ao excluir relatório:", error);
    avisar("Não foi possível excluir o relatório.");
    return;
  }

  setRelatorios((anteriores) =>
    anteriores.filter((item) => item.id !== relatorio.id)
  );
}

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <CabecalhoPagina
          titulo="Relatórios"
          descricao="Acompanhamentos aguardando sua análise."
          acao={
            relatorios.length > 0 ? (
              <Tag
                value={`${relatorios.length} pendente${relatorios.length === 1 ? "" : "s"}`}
                severity="warning"
              />
            ) : undefined
          }
        />

        <div className="mt-6 space-y-4">
  {relatorios.map((relatorio) => {
   const relatorioAnterior = historicoPesos.find(
  (item) => item.patient_id === relatorio.patient_id
);

const pesoAnterior =
  relatorioAnterior?.weight ?? relatorio.patients?.initial_weight;

const diferencaPeso =
  relatorio.weight != null && pesoAnterior != null
    ? Number(relatorio.weight) - Number(pesoAnterior)
    : null;

    const ultimosRelatorios = historicoPesos
  .filter((item) => item.patient_id === relatorio.patient_id)
  .slice(0, 3)
.reverse();

const pesosParaTendencia = [
  relatorio.patients?.initial_weight,
  ...ultimosRelatorios.map((item) => item.weight),
];

const tendencias = pesosParaTendencia
  .slice(1)
  .map((peso, index) => {
    const anterior = pesosParaTendencia[index];

    if (peso == null || anterior == null) return null;

    const diferenca = Number(peso) - Number(anterior);

    if (diferenca > 0) return "↑";
    if (diferenca < 0) return "↓";
    return "→";
  })
  .filter(Boolean);

  const ultimosRelatoriosAlcool = historicoAlcool
  .filter((item) => item.patient_id === relatorio.patient_id)
  .slice(0, 3)
  .reverse();

const tendenciasAlcool = ultimosRelatoriosAlcool.map((item) => {
  if (item.alcohol_use === "nao") return "↑";
  return "↓";
});

if (relatorio.alcohol_use != null) {
  tendenciasAlcool.push(
    relatorio.alcohol_use === "nao" ? "↑" : "↓"
  );
}

const ultimasTendenciasAlcool = tendenciasAlcool.slice(-3);

  const classificacao = classificacaoDoScore(relatorio.adherence_score);

  return (
    <section key={relatorio.id} className="cartao p-5 lg:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <AnelDeAdesao
          valor={relatorio.adherence_score ?? null}
          tamanho={84}
          rotulo="de 100"
        />

        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-gray-900">
            {relatorio.patients?.name ?? "Paciente não identificado"}
          </h2>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            {relatorio.cycle_report_number && (
              <span className="text-sm font-semibold text-gray-600">
                Relatório {relatorio.cycle_report_number}
              </span>
            )}

            {relatorio.patients?.objective?.trim() && (
              <span className="text-sm font-semibold text-primary-700">
                {relatorio.patients.objective.trim()}
              </span>
            )}

            <Tag
              value={classificacao}
              severity={
                relatorio.adherence_score >= 80
                  ? "success"
                  : relatorio.adherence_score >= 60
                  ? "warning"
                  : "danger"
              }
            />
          </div>
        </div>
      </div>

      {relatorio.patients?.important_note && (
        <p className="mt-4 flex gap-2 rounded-xl bg-atencao-50 p-3 text-sm font-medium text-atencao-700">
          <i className="pi pi-exclamation-triangle mt-0.5" aria-hidden />
          <span>{relatorio.patients.important_note}</span>
        </p>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
        <div className="rounded-xl bg-gray-50 p-3">
          <dt className="text-gray-500">Variação de peso</dt>
          <dd className="mt-0.5 font-semibold text-gray-900">
            {tendencias.map((tendencia, index) => (
              <span
                key={index}
                className={
                  tendencia === "↑"
                    ? "text-red-600"
                    : tendencia === "↓"
                    ? "text-green-600"
                    : "text-gray-500"
                }
              >
                {tendencia}{" "}
              </span>
            ))}
            {diferencaPeso === null
              ? "Não disponível"
              : `${diferencaPeso > 0 ? "+" : ""}${diferencaPeso.toFixed(1)} kg`}
          </dd>
        </div>

        {relatorio.weight != null && (
          <div className="rounded-xl bg-gray-50 p-3">
            <dt className="text-gray-500">Peso atual</dt>
            <dd className="mt-0.5 font-semibold text-gray-900">
              {Number(relatorio.weight).toFixed(1)} kg
            </dd>
          </div>
        )}

        {ultimasTendenciasAlcool.length > 0 && (
          <div className="rounded-xl bg-gray-50 p-3">
            <dt className="text-gray-500">Consumo de álcool</dt>
            <dd className="mt-0.5 font-semibold">
              {ultimasTendenciasAlcool.map((tendencia, index) => (
                <span
                  key={index}
                  className={
                    tendencia === "↑" ? "text-green-600" : "text-red-600"
                  }
                >
                  {tendencia}{" "}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <DevolutivaERelatorio
        relatorio={relatorio}
        onRelatorio={(mudanca) =>
          setRelatorios((atuais) => atuais.map((item) => (item.id === relatorio.id ? { ...item, ...mudanca } : item)))
        }
        onEnviar={(texto) => publicarDevolutiva(relatorio, texto)}
        onExcluir={() => excluirRelatorio(relatorio)}
      />
    </section>
  );
})}

          {relatorios.length === 0 && (
            <div className="cartao p-6 text-center">
              <i className="pi pi-check-circle text-3xl text-primary-500" aria-hidden />
              <p className="mt-3 font-semibold text-gray-900">
                Nenhum relatório aguardando análise.
              </p>
            </div>
          )}
        </div>

        {pacientesAtrasados.length > 0 && (
          <section className="cartao mt-6 p-5 lg:p-6">
            <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
              <i className="pi pi-clock text-atencao-600" aria-hidden />
              Pacientes com relatório atrasado
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Pacientes que não enviaram o relatório previsto para esta semana.
            </p>

            <ul className="mt-4 divide-y divide-gray-200">
              {pacientesAtrasados.map((paciente) => (
                <li
                  key={`${paciente.cicloId}-${paciente.numeroRelatorio}`}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{paciente.nome}</p>
                    <p className="text-sm text-gray-600">
                      Relatório nº {paciente.numeroRelatorio}
                    </p>
                  </div>

                  <Tag value="Não enviado" severity="danger" className="selo-status" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

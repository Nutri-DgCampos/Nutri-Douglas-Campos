"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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

function calcularSemanaDoRelatorio(
  inicioCiclo: string,
  frequencia: string,
  numeroRelatorio: number
) {
  const intervaloDias =
    frequencia === "semanal"
      ? 7
      : frequencia === "quinzenal"
      ? 15
      : 30;

  const dataPrevista = new Date(`${inicioCiclo}T12:00:00Z`);

  dataPrevista.setUTCDate(
    dataPrevista.getUTCDate() + intervaloDias * numeroRelatorio
  );

  const diaSemana = dataPrevista.getUTCDay();

  const diasAteSegundaAnterior = (diaSemana + 6) % 7;
  const diasAteSegundaSeguinte = 7 - diasAteSegundaAnterior;

  const ajuste =
    diasAteSegundaAnterior <= diasAteSegundaSeguinte
      ? -diasAteSegundaAnterior
      : diasAteSegundaSeguinte;

  dataPrevista.setUTCDate(dataPrevista.getUTCDate() + ajuste);

  return dataPrevista.toISOString().slice(0, 10);
}
export default function RelatoriosPage() {
     const [relatorios, setRelatorios] = useState<any[]>([]);
     const [pacientesAtrasados, setPacientesAtrasados] = useState<any[]>([]);
     const [historicoPesos, setHistoricoPesos] = useState<any[]>([]);
     const [historicoAlcool, setHistoricoAlcool] = useState<any[]>([]);
     const [devolutivasIA, setDevolutivasIA] = useState<Record<string, string>>({});
const [gerandoIA, setGerandoIA] = useState<string | null>(null);

     useEffect(() => {
  async function carregarRelatorios() {
    const { data, error } = await supabase
      .from("patient_reports")
      .select("*, patients(name, initial_weight, important_note)")
      .eq("status", "pendente")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar relatórios:", error);
      return;
    }

    setRelatorios(data ?? []);
    // Buscar ciclos ativos para verificar relatórios não enviados
const { data: ciclosAtivos, error: erroCiclos } = await supabase
  .from("diet_cycles")
  .select(`
    id,
    patient_id,
    start_date,
    end_date,
    followup_frequency,
    cycle_number,
    patients (
      name
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
    await supabase
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
    const frequencia = ciclo.followup_frequency
      ?.trim()
      .toLowerCase();

    const quantidadeRelatorios =
      frequencia === "semanal"
        ? 4
        : frequencia === "quinzenal"
        ? 2
        : frequencia === "mensal"
        ? 1
        : 0;

    const previstos: {
  cicloId: string;
  pacienteId: string;
  numeroRelatorio: number;
  segundaPrevista: string;
}[] = [];

    for (let numero = 1; numero <= quantidadeRelatorios; numero++) {
      const segundaPrevista = calcularSemanaDoRelatorio(
        ciclo.start_date,
        frequencia,
        numero
      );

      if (segundaPrevista === segundaAtual) {
        previstos.push({
          cicloId: ciclo.id,
          pacienteId: ciclo.patient_id,
          numeroRelatorio: numero,
          segundaPrevista,
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
    const { data: historico, error: erroHistorico } = await supabase
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
  await supabase
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

async function gerarDevolutivaIA(
  relatorio: any,
  pontosPositivos: string[],
  pontosAtencao: string[]
) {
  setGerandoIA(relatorio.id);

  try {
    const resposta = await fetch("/api/gerar-devolutiva", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paciente: relatorio.patients?.name ?? "Paciente",
        pontuacao: relatorio.adherence_score,
        classificacao:
  relatorio.adherence_score >= 90
    ? "Excelente"
    : relatorio.adherence_score >= 80
    ? "Muito bom"
    : relatorio.adherence_score >= 70
    ? "Bom"
    : relatorio.adherence_score >= 60
    ? "Atenção"
    : "Baixa adesão",
        pontosPositivos,
        pontosAtencao,
        offPlanCount: relatorio.off_plan_count,
offPlanFoods: relatorio.off_plan_foods ?? "",
        observacoes: relatorio.general_notes ?? "",
      }),
    });

    const textoResposta = await resposta.text();

console.log("Status da API de IA:", resposta.status);
console.log("Resposta da API de IA:", textoResposta);

if (!resposta.ok) {
  alert(`Erro ao gerar devolutiva. Código: ${resposta.status}`);
  return;
}

let dados;

try {
  dados = JSON.parse(textoResposta);
} catch {
  alert("A API não retornou um JSON válido.");
  return;
}

    setDevolutivasIA((anterior) => ({
      ...anterior,
      [relatorio.id]: dados.texto ?? "",
    }));
  } catch (error) {
    console.error("Erro ao gerar devolutiva com IA:", error);
  } finally {
    setGerandoIA(null);
  }
}

async function publicarDevolutiva(relatorio: any) {

  const textoFinal = devolutivasIA[relatorio.id]?.trim();

  if (!textoFinal) {
    alert("Gere ou escreva uma devolutiva antes de publicar.");
    return;
  }

  const { data, error } = await supabase
    .from("patient_reports")
    .update({
      feedback_text: textoFinal,
      status: "enviado",
    })
    .eq("id", relatorio.id)


  if (error) {
    console.error("Erro ao publicar devolutiva:", error);
    alert("Não foi possível publicar a devolutiva.");
    return;
  }

  try {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    const respostaNotificacao = await fetch(
      "/api/notificar-devolutiva",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
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

const { data: ciclo } = await supabase
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
  const { error: erroEncerramento } = await supabase
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
  const confirmar = window.confirm(
    "Excluir este relatório?\n\nEle não será contabilizado no acompanhamento do paciente."
  );

  if (!confirmar) return;

  const { error } = await supabase
    .from("patient_reports")
    .delete()
    .eq("id", relatorio.id);

  if (error) {
    console.error("Erro ao excluir relatório:", error);
    alert("Não foi possível excluir o relatório.");
    return;
  }

  setRelatorios((anteriores) =>
    anteriores.filter((item) => item.id !== relatorio.id)
  );
}

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 p-8">
        <button
  type="button"
  onClick={() => window.history.back()}
  className="mb-4 text-sm font-semibold text-blue-600 hover:text-blue-700"
>
  ← Voltar
</button>
        <h1 className="text-3xl font-bold text-gray-900">
         Relatórios
        </h1>

        <p className="mt-2 text-gray-600">
          Acompanhamentos aguardando sua análise.
        </p>

        <p className="mt-4 text-sm font-medium text-gray-700">
  Relatórios pendentes: {relatorios.length}
</p>

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

  const pontosPositivos: string[] = [];
  const pontosAtencao: string[] = [];

  if (relatorio.diet_days != null) {
  if (relatorio.diet_days === 7) {
    pontosPositivos.push(
      `Excelente adesão alimentar: seguiu o plano por ${relatorio.diet_days} dias.`
    );
  } else if (relatorio.diet_days === 6) {
    pontosPositivos.push(
      `Boa adesão alimentar: seguiu o plano por ${relatorio.diet_days} dias.`
    );
  } else if (relatorio.diet_days === 5) {
    pontosAtencao.push(
      `Atenção à adesão alimentar: seguiu o plano por ${relatorio.diet_days} dias.`
    );
  } else {
    pontosAtencao.push(
      `Adesão alimentar muito abaixo do planejado: seguiu o plano por ${relatorio.diet_days} dias.`
    );
  }
}

if (
  relatorio.diet_changed === true &&
  relatorio.diet_change_equivalent === false
) {
  pontosAtencao.push(
    relatorio.diet_change_notes
      ? `Alteração fora da lista de equivalências: ${relatorio.diet_change_notes}`
      : "Realizou alteração fora da lista de equivalências."
  );
}

if (
  relatorio.diet_difficulty &&
  relatorio.diet_difficulty.trim() !== ""
) {
  pontosAtencao.push(
    `Dificuldade com o plano alimentar: ${relatorio.diet_difficulty}`
  );
}

if (relatorio.water_goal_days != null) {
  if (relatorio.water_goal_days === 7) {
    pontosPositivos.push(
      "Meta de hidratação cumprida: atingiu a meta planejada."
    );
  } else if (relatorio.water_goal_days === 6) {
    pontosPositivos.push(
      `Boa hidratação: atingiu a meta de água por ${relatorio.water_goal_days} dias.`
    );
  } else if (relatorio.water_goal_days === 5) {
    pontosAtencao.push(
      `Atenção à hidratação: atingiu a meta de água por ${relatorio.water_goal_days} dias.`
    );
  } else {
    pontosAtencao.push(
      `Hidratação muito abaixo do planejado: atingiu a meta de água por ${relatorio.water_goal_days} dias.`
    );
  }
}

if (relatorio.urine_color === "muito_amarela") {
  pontosAtencao.push(
    "Urina muito amarela: atenção à hidratação."
  );
}

if (relatorio.urine_color === "turva") {
  pontosAtencao.push(
    "Urina turva: merece muita atenção."
  );
}

if (
  relatorio.training_applicable === true &&
  relatorio.training_planned != null &&
  relatorio.training_completed != null &&
  relatorio.training_planned > 0
) {
  const percentualTreino =
    relatorio.training_completed / relatorio.training_planned;

  if (percentualTreino >= 1) {
  pontosPositivos.push(
    "Meta de treinos cumprida: atingiu a meta planejada."
  );
} else if (percentualTreino < 0.7) {
  pontosAtencao.push(
    "Atenção: sua meta de treinos ficou abaixo de 70% do planejado."
  );
}
}

if (
  relatorio.cardio_applicable === true &&
  relatorio.cardio_planned != null &&
  relatorio.cardio_completed != null &&
  relatorio.cardio_planned > 0
) {
  const percentualAerobico =
    relatorio.cardio_completed / relatorio.cardio_planned;

  if (percentualAerobico >= 1) {
  pontosPositivos.push(
    "Meta de atividade aeróbica cumprida: atingiu a meta planejada."
  );
} else if (percentualAerobico < 0.7) {
  pontosAtencao.push(
    "Atenção: sua meta de atividade aeróbica ficou abaixo de 70% do planejado."
  );
}
}

if (relatorio.sleep_hours != null) {
  const horasSono = Number(relatorio.sleep_hours);

  if (horasSono < 6) {
    pontosAtencao.push(
      `Sono muito abaixo do recomendado: média de ${horasSono} horas por noite.`
    );
  } else if (horasSono < 7) {
    pontosAtencao.push(
      `Atenção ao sono: média de ${horasSono} horas por noite.`
    );
  }
}
if (relatorio.sleep_quality === "ruim") {
  pontosAtencao.push(
    "Atenção à qualidade do sono: paciente percebeu o sono como ruim."
  );
}

if (relatorio.sleep_quality === "muito_ruim") {
  pontosAtencao.push(
    "Qualidade do sono muito comprometida: paciente percebeu o sono como muito ruim."
  );
}

if (relatorio.off_plan_count != null) {
  const refeicoesForaPlano = Number(relatorio.off_plan_count);

  if (refeicoesForaPlano === 0) {
    pontosPositivos.push(
      "Excelente adesão: não realizou refeições fora do plano."
    );
  } else if (refeicoesForaPlano === 2) {
    pontosAtencao.push(
      "Atenção às refeições fora do plano: ocorreram 2 vezes nesta semana."
    );
  } else if (refeicoesForaPlano >= 3) {
    pontosAtencao.push(
      `Frequência elevada de refeições fora do plano: ocorreram ${refeicoesForaPlano} vezes nesta semana.`
    );
  }
}

if (
  relatorio.supplements_applicable === true &&
  relatorio.supplements_days != null
) {
  const diasSuplementacao = Number(relatorio.supplements_days);

  if (diasSuplementacao === 7) {
    pontosPositivos.push(
      "Meta de suplementação cumprida: atingiu a meta planejada."
    );
  } else if (diasSuplementacao === 5) {
    pontosAtencao.push(
      "Atenção à suplementação: adesão abaixo do planejado."
    );
  } else if (diasSuplementacao <= 4) {
    pontosAtencao.push(
      "Baixa adesão à suplementação: adesão muito abaixo do planejado."
    );
  }
}

if (
  relatorio.individual_goal_planned != null &&
  relatorio.individual_goal_completed != null &&
  relatorio.individual_goal_planned > 0
) {
  const percentualMetaIndividual =
    relatorio.individual_goal_completed /
    relatorio.individual_goal_planned;

  if (percentualMetaIndividual >= 1) {
    pontosPositivos.push(
      "Meta individual cumprida: atingiu a meta planejada."
    );
  } else if (percentualMetaIndividual < 0.7) {
    pontosAtencao.push(
      "Atenção à meta individual: ficou abaixo de 70% do planejado."
    );
  }
}

if (
  relatorio.individual_goal_difficulty &&
  relatorio.individual_goal_difficulty.trim() !== ""
) {
  pontosAtencao.push(
    `Dificuldade na meta individual: ${relatorio.individual_goal_difficulty}`
  );
}

if (
  relatorio.stool_consistency === "tipo_1" ||
  relatorio.stool_consistency === "tipo_2"
) {
  pontosAtencao.push(
    "Funcionamento intestinal: fezes endurecidas, com tendência à constipação."
  );
} else if (relatorio.stool_consistency === "tipo_5") {
  pontosAtencao.push(
    "Funcionamento intestinal: fezes mais amolecidas que o ideal."
  );
} else if (
  relatorio.stool_consistency === "tipo_6" ||
  relatorio.stool_consistency === "tipo_7"
) {
  pontosAtencao.push(
    "Funcionamento intestinal: fezes muito amolecidas ou líquidas."
  );
}

if (
  relatorio.medication_changes &&
  relatorio.medication_changes !== "nao"
) {
  pontosAtencao.push(
    relatorio.medication_changes.startsWith("sim - ")
      ? `Mudança no uso de medicamentos: ${relatorio.medication_changes.replace(
          "sim - ",
          ""
        )}`
      : "Houve mudança no uso de medicamentos nesta semana."
  );
}

  return (
    <div
      key={relatorio.id}
      className="rounded-2xl bg-white p-6 shadow-sm"
    >
         <div className="mb-2 flex items-center gap-3">
  <p className="text-lg font-bold text-gray-900">
    {relatorio.patients?.name ?? "Paciente não identificado"}
  </p>

  {relatorio.cycle_report_number && (
  <span className="text-sm font-semibold text-blue-600">
    Relatório {relatorio.cycle_report_number}
  </span>
)}

  {relatorio.patients?.important_note && (
    <span className="rounded-lg bg-yellow-100 px-2 py-1 text-sm font-semibold text-yellow-800">
      ⚠ {relatorio.patients.important_note}
    </span>
  )}
</div>
      <p className="font-semibold text-gray-900">
        Score: {relatorio.adherence_score} / 100
      </p>

      <p className="mt-1 text-sm font-semibold text-gray-700">
  {relatorio.adherence_score >= 90
    ? "Excelente"
    : relatorio.adherence_score >= 80
    ? "Muito bom"
    : relatorio.adherence_score >= 70
    ? "Bom"
    : relatorio.adherence_score >= 60
    ? "Atenção"
    : "Baixa adesão"}
</p>

      <p className="mt-2 text-sm text-gray-700">
  Variação de peso:{" "}
  <span className="mr-2">
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
</span>
  <span className="font-semibold">
    {diferencaPeso === null
      ? "Não disponível"
      : `${diferencaPeso > 0 ? "+" : ""}${diferencaPeso.toFixed(1)} kg`}
  </span>
</p>

{ultimasTendenciasAlcool.length > 0 && (
  <p className="mt-2 text-sm text-gray-700">
    Consumo de álcool:{" "}
    <span className="mr-2">
      {ultimasTendenciasAlcool.map((tendencia, index) => (
        <span
          key={index}
          className={
            tendencia === "↑"
              ? "text-green-600"
              : "text-red-600"
          }
        >
          {tendencia}{" "}
        </span>
      ))}
    </span>
  </p>
)}

{pontosPositivos.length > 0 && (
  <div className="mt-4">
    <p className="font-semibold text-green-700">
      Pontos positivos
    </p>

    {pontosPositivos.map((ponto, index) => (
      <p key={index} className="mt-1 text-sm text-gray-700">
        ✓ {ponto}
      </p>
    ))}

    {pontosAtencao.length > 0 && (
  <div className="mt-4">
    <p className="font-semibold text-red-700">
      Pontos de atenção
    </p>

    {pontosAtencao.map((ponto, index) => (
      <p key={index} className="mt-1 text-sm text-gray-700">
        ⚠{" "}
{ponto.startsWith("Dificuldade com o plano alimentar:") ? (
  <>
    Dificuldade com o plano alimentar:{" "}
    <strong>
      {ponto.replace("Dificuldade com o plano alimentar:", "").trim()}
    </strong>
  </>
) : (
  ponto
)}
      </p>
    ))}
  </div>
)}

{relatorio.general_notes &&
  relatorio.general_notes.trim() !== "" && (
    <div className="mt-4">
      <p className="font-semibold text-blue-700">
        📝 Observações do paciente
      </p>

      <p className="mt-1 text-sm text-gray-700">
        {relatorio.general_notes}
      </p>
    </div>
  )}

<button
  onClick={() =>
    gerarDevolutivaIA(relatorio, pontosPositivos, pontosAtencao)
  }
  disabled={gerandoIA === relatorio.id}
  className="mt-6 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
>
  {gerandoIA === relatorio.id
    ? "Gerando devolutiva..."
    : "Gerar devolutiva com IA"}
</button>

  <div className="mt-4">
    <p className="mb-2 font-semibold text-gray-900">
      Devolutiva ao paciente
    </p>

    <textarea
      rows={8}
      value={devolutivasIA[relatorio.id]}
      onChange={(e) =>
        setDevolutivasIA((anterior) => ({
          ...anterior,
          [relatorio.id]: e.target.value,
        }))
      }
      className="w-full resize-y rounded-xl border border-gray-300 bg-white p-4 text-gray-900"
    />
    
  </div>

<button
  onClick={() => publicarDevolutiva(relatorio)}
  className="mt-3 w-full rounded-xl bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"
>
  Enviar devolutiva ao paciente
</button>

<button
  type="button"
  onClick={() => excluirRelatorio(relatorio)}
  className="mt-4 w-full text-center text-sm text-gray-400 hover:text-red-600"
>
  Excluir relatório
</button>


  </div>
)}

</div>
    );
  })}
</div>

{pacientesAtrasados.length > 0 && (
  <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
    <h2 className="text-lg font-bold text-red-800">
      ⚠️ Pacientes com relatório atrasado
    </h2>

    <p className="mt-1 text-sm text-red-700">
      Pacientes que não enviaram o relatório previsto para esta semana.
    </p>

    <div className="mt-4 space-y-3">
      {pacientesAtrasados.map((paciente) => (
        <div
          key={`${paciente.cicloId}-${paciente.numeroRelatorio}`}
          className="rounded-lg border border-red-200 bg-white p-4"
        >
          <p className="font-semibold text-gray-900">
            {paciente.nome}
          </p>

          <p className="mt-1 text-sm text-gray-600">
            Relatório nº {paciente.numeroRelatorio}
          </p>

          <p className="mt-1 text-sm font-semibold text-red-600">
            Não enviado
          </p>
        </div>
      ))}
    </div>
  </div>
)}

      </main>
    </div>
  );
}
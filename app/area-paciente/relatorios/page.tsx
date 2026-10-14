"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function RelatoriosPacientePage() {

    const [pacienteId, setPacienteId] = useState<string | null>(null);
    const [nomePaciente, setNomePaciente] = useState<string>("");
    const [pesoInicial, setPesoInicial] = useState<number | null>(null);
    const [relatorios, setRelatorios] = useState<any[]>([]);
    const [historicoPesos, setHistoricoPesos] = useState<any[]>([]);
    const [historicoAlcool, setHistoricoAlcool] = useState<any[]>([]);

    function baixarRelatorio(relatorioId: string, dataRelatorio: string) {
        const dataFormatada = dataRelatorio
  ? dataRelatorio.slice(0, 10).split("-").reverse().join("-")
  : "sem-data";

const nomeArquivo = `${nomePaciente} - ${dataFormatada}`;
  const relatorio = document.getElementById(`relatorio-${relatorioId}`);

  if (!relatorio) {
    alert("Não foi possível localizar o relatório.");
    return;
  }

  const conteudo = relatorio.innerHTML;

  const janelaImpressao = window.open("", "_blank");

  if (!janelaImpressao) {
    alert("Não foi possível abrir a janela de impressão.");
    return;
  }

  janelaImpressao.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${nomeArquivo}</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 40px;
            line-height: 1.5;
          }

          button {
            display: none !important;
          }
        </style>
      </head>

      <body>
        ${conteudo}
      </body>
    </html>
  `);

  janelaImpressao.document.close();

janelaImpressao.document.title = nomeArquivo;

setTimeout(() => {
  janelaImpressao.focus();
  janelaImpressao.print();
}, 500);
}

useEffect(() => {
  async function carregarPaciente() {
    const {
      data: { user },
    } = await api.auth.getUser();

    if (!user) return;

    const { data, error } = await api
      .from("patients")
      .select("id, name, initial_weight")
      .eq("auth_user_id", user.id)
      .single();

    if (error) {
      console.error("Erro ao identificar paciente:", error);
      return;
    }

    setPacienteId(data.id);
    setNomePaciente(data.name);
    setPesoInicial(data.initial_weight);
    const { data: relatoriosEnviados, error: erroRelatorios } = await api
  .from("patient_reports")
  .select("*")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .order("created_at", { ascending: false })
.limit(4);

if (erroRelatorios) {
  console.error("Erro ao carregar relatórios:", erroRelatorios);
  return;
}

setRelatorios(relatoriosEnviados ?? []);

const idsDevolutivas = (relatoriosEnviados ?? [])
  .filter(
    (relatorio) =>
      typeof relatorio.feedback_text === "string" &&
      relatorio.feedback_text.trim().length > 0
  )
  .map((relatorio) => relatorio.id);

if (idsDevolutivas.length > 0) {
  const { error: erroVisualizacao } = await api
    .from("patient_update_views")
    .upsert(
      idsDevolutivas.map((id) => ({
        patient_id: data.id,
        update_type: "devolutiva",
        reference_id: id,
      })),
      {
        onConflict: "patient_id,update_type,reference_id",
        ignoreDuplicates: true,
      }
    );

  if (erroVisualizacao) {
    console.error(
      "Erro ao registrar visualização das devolutivas:",
      erroVisualizacao
    );
  }
}
const { data: pesosAnteriores, error: erroPesos } = await api
  .from("patient_reports")
  .select("id, weight, created_at, cycle_id")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .not("weight", "is", null)
  .order("created_at", { ascending: true });

if (erroPesos) {
  console.error("Erro ao carregar histórico de pesos:", erroPesos);
} else {
  setHistoricoPesos(pesosAnteriores ?? []);
}

const { data: alcoolAnterior, error: erroAlcool } = await api
  .from("patient_reports")
  .select("id, alcohol_use, created_at")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .not("alcohol_use", "is", null)
  .order("created_at", { ascending: true });

if (erroAlcool) {
  console.error("Erro ao carregar histórico de álcool:", erroAlcool);
} else {
  setHistoricoAlcool(alcoolAnterior ?? []);
}

console.log("RELATÓRIOS ENVIADOS:", relatoriosEnviados);

    console.log("PACIENTE DOS RELATÓRIOS:", data.id);
  }

  carregarPaciente();
}, []);

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-md">
        <button
  type="button"
  onClick={() => window.location.href = "/area-paciente"}
  className="text-sm font-medium text-blue-600 hover:underline"
>
  ← Voltar para área do paciente
</button>

        <h1 className="mt-1 text-3xl font-bold text-gray-900">
          Relatórios
        </h1>

        <p className="mt-2 text-gray-600">
          Acompanhe suas devolutivas.
        </p>

        <div className="mt-6 space-y-4">
  {relatorios.map((relatorio) => {
    const indiceAlcool = historicoAlcool.findIndex(
  (item) => item.id === relatorio.id
);

const tendenciasAlcool =
  indiceAlcool >= 0
    ? historicoAlcool
        .slice(0, indiceAlcool + 1)
        .map((item) => (item.alcohol_use === "nao" ? "↓" : "↑"))
        .slice(-3)
    : [];

    const historicoPesosDoCiclo = relatorio.cycle_id
  ? historicoPesos.filter(
      (item) => item.cycle_id === relatorio.cycle_id
    )
  : historicoPesos.filter(
      (item) => item.cycle_id == null
    );

const indiceHistorico = historicoPesosDoCiclo.findIndex(
  (item) => item.id === relatorio.id
);


const pesoAnterior =
  indiceHistorico > 0
    ? historicoPesosDoCiclo[indiceHistorico - 1]?.weight
    : pesoInicial;

    const diferencaPeso =
  relatorio.weight != null && pesoAnterior != null
    ? Number(relatorio.weight) - Number(pesoAnterior)
    : null;

    const tendenciaPeso =
  diferencaPeso == null
    ? null
    : diferencaPeso > 0
    ? "↑"
    : diferencaPeso < 0
    ? "↓"
    : "→";

    const pesosAteEsteRelatorio =
  indiceHistorico >= 0
    ? [
        pesoInicial,
        ...historicoPesosDoCiclo
          .slice(0, indiceHistorico + 1)
          .map((item) => item.weight),
      ]
    : [];

const tendenciasPeso = pesosAteEsteRelatorio
  .slice(1)
  .map((peso, index) => {
    const anterior = pesosAteEsteRelatorio[index];

    if (peso == null || anterior == null) return null;

    const diferenca = Number(peso) - Number(anterior);

    if (diferenca > 0) return "↑";
    if (diferenca < 0) return "↓";
    return "→";
  })
  .filter(Boolean)
  .slice(-3);

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

if (relatorio.diet_difficulty) {
  const dificuldadeDieta = relatorio.diet_difficulty
    .trim()
    .toLowerCase();

  const respostasSemDificuldade = [
    "nao",
    "não",
    "nao tenho",
    "não tenho",
  ];

  if (
    dificuldadeDieta !== "" &&
    !respostasSemDificuldade.includes(dificuldadeDieta)
  ) {
    pontosAtencao.push(
      `Dificuldade com o plano alimentar: ${relatorio.diet_difficulty}`
    );
  }
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

// SONO
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

// REFEIÇÕES FORA DO PLANO
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

// SUPLEMENTAÇÃO
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

// META INDIVIDUAL
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

if (relatorio.individual_goal_difficulty) {
  const dificuldadeMeta = relatorio.individual_goal_difficulty
    .trim()
    .toLowerCase();

  const respostasSemDificuldade = [
    "nao",
    "não",
    "nao tenho",
    "não tenho",
  ];

  if (
    dificuldadeMeta !== "" &&
    !respostasSemDificuldade.includes(dificuldadeMeta)
  ) {
    pontosAtencao.push(
      `Dificuldade na meta individual: ${relatorio.individual_goal_difficulty}`
    );
  }
}

// FUNCIONAMENTO INTESTINAL
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

// MUDANÇA NO USO DE MEDICAMENTOS
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
      id={`relatorio-${relatorio.id}`}
      className="rounded-2xl bg-white p-5 shadow-sm"
    >
      <h2 className="text-lg font-bold text-gray-900">
        Relatório {relatorio.cycle_report_number ?? "-"}
      </h2>

{diferencaPeso !== null && (
  <p className="mt-2 text-sm text-gray-700">
    Variação de peso:{" "}
    <span className="mr-2">
  {tendenciasPeso.map((tendencia, index) => (
    <span
      key={index}
      className={
  tendencia === "↑"
    ? "font-semibold text-red-600"
    : tendencia === "↓"
    ? "font-semibold text-green-600"
    : "font-semibold text-gray-500"
}
    >
{tendencia}{" "}
    </span>
  ))}
</span>
    <span className="font-semibold">
      {diferencaPeso > 0 ? "+" : ""}
      {diferencaPeso.toFixed(1).replace(".", ",")} kg
    </span>
  </p>
)}

{tendenciasAlcool.length > 0 && (
  <p className="mt-1 text-sm text-gray-700">
    Consumo de álcool:{" "}
    {tendenciasAlcool.map((tendencia, index) => (
      <span
        key={index}
        className={
          tendencia === "↓"
  ? "font-semibold text-green-600"
  : "font-semibold text-red-600"
        }
      >
        {tendencia}{" "}
      </span>
    ))}
  </p>
)}

      <p className="mt-2 font-semibold text-gray-900">
        Score: {relatorio.adherence_score} / 100
      </p>

      <p className="mt-1 text-sm text-gray-600">
  {relatorio.adherence_score >= 80
    ? "Ótima adesão"
    : relatorio.adherence_score >= 60
    ? "Boa adesão"
    : relatorio.adherence_score >= 40
    ? "Baixa adesão"
    : "Adesão muito baixa"}
</p>

{pontosPositivos.length > 0 && (
  <div className="mt-4">
    <p className="font-semibold text-green-700">
      Pontos positivos
    </p>

    <ul className="mt-2 space-y-1 text-sm text-gray-700">
      {pontosPositivos.map((ponto, index) => (
        <li key={index}>
          • {ponto}
        </li>
      ))}
    </ul>
  </div>
)}

{pontosAtencao.length > 0 && (
  <div className="mt-4">
    <p className="font-semibold text-red-700">
      Pontos de atenção
    </p>

    <ul className="mt-2 space-y-1 text-sm text-gray-700">
      {pontosAtencao.map((ponto, index) => (
        <li key={index}>
          • {ponto}
        </li>
      ))}
    </ul>
  </div>
)}

{relatorio.feedback_text && (
  <div className="mt-5 border-t border-gray-200 pt-4">
    <p className="font-semibold text-blue-700">
      Devolutiva do nutricionista
    </p>

    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
      {relatorio.feedback_text}
    </p>
  </div>
)}

<button
  type="button"
  onClick={() =>
  baixarRelatorio(
    relatorio.id,
    relatorio.report_date ?? relatorio.created_at
  )
}
  className="mt-5 w-full rounded-xl border border-blue-600 px-4 py-3 font-semibold text-blue-600 transition hover:bg-blue-50"
>
  Baixar relatório em PDF
</button>

    </div>
    );
})}
</div>

      </div>
    </main>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function RelatorioPage() {
  const router = useRouter();
  const [patientId, setPatientId] = useState<string | null>(null);

const [semanasRetroativasConcluidas, setSemanasRetroativasConcluidas] =
  useState<number>(0);

const [salvando, setSalvando] = useState(false);

  const [diasPlanoAlimentar, setDiasPlanoAlimentar] = useState("");
  const [alterouPlanoAlimentar, setAlterouPlanoAlimentar] = useState("");
  const [alteracaoEquivalente, setAlteracaoEquivalente] = useState("");
  const [observacaoAlteracaoAlimentar, setObservacaoAlteracaoAlimentar] = useState("");
  const [dificuldadeAlimentar, setDificuldadeAlimentar] = useState("");

const [diasMetaAgua, setDiasMetaAgua] = useState("");
const [litrosAgua, setLitrosAgua] = useState("");
const [corUrina, setCorUrina] = useState("");

const [temPlanejamentoTreino, setTemPlanejamentoTreino] = useState("");
const [treinosPlanejados, setTreinosPlanejados] = useState("");
const [treinosRealizados, setTreinosRealizados] = useState("");
const [intensidadeTreino, setIntensidadeTreino] = useState("");
const [tempoMesmoTreino, setTempoMesmoTreino] = useState("");

const [temPlanejamentoAerobico, setTemPlanejamentoAerobico] = useState("");
const [aerobicosPlanejados, setAerobicosPlanejados] = useState("");
const [aerobicosRealizados, setAerobicosRealizados] = useState("");

const [refeicoesForaPlano, setRefeicoesForaPlano] = useState("");
const [alimentosForaPlano, setAlimentosForaPlano] = useState("");
const [motivoForaPlano, setMotivoForaPlano] = useState("");

const [temSuplementos, setTemSuplementos] = useState("");
const [diasSuplementos, setDiasSuplementos] = useState("");
const [motivoSuplementos, setMotivoSuplementos] = useState("");

const [temMetaIndividual, setTemMetaIndividual] = useState("");
const [descricaoMetaIndividual, setDescricaoMetaIndividual] = useState("");
const [metaPlanejada, setMetaPlanejada] = useState("");
const [metaCumprida, setMetaCumprida] = useState("");
const [dificuldadeMetaIndividual, setDificuldadeMetaIndividual] = useState("");

const [pesoAtual, setPesoAtual] = useState("");

const [consistenciaFezes, setConsistenciaFezes] = useState("");

const [acneQuedaCabelo, setAcneQuedaCabelo] = useState("");

const [libido, setLibido] = useState("");

const [consumiuAlcool, setConsumiuAlcool] = useState("");
const [quantidadeAlcool, setQuantidadeAlcool] = useState("");

const [mudancaMedicamentos, setMudancaMedicamentos] = useState("");
const [descricaoMudancaMedicamentos, setDescricaoMudancaMedicamentos] = useState("");

const [observacoesGerais, setObservacoesGerais] = useState("");

const [temMetaSono, setTemMetaSono] = useState("");
const [diasMetaSono, setDiasMetaSono] = useState("");
const [horasSono, setHorasSono] = useState("");
const [qualidadeSono, setQualidadeSono] = useState("");
const [dificuldadeSono, setDificuldadeSono] = useState("");
const [disposicaoAoAcordar, setDisposicaoAoAcordar] = useState("");

useEffect(() => {
  async function carregarMetaTreino() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data, error } = await supabase
      .from("patients")
      .select("id, training_weekly_goal, cardio_weekly_goal, individual_goal, retroactive_registration, retroactive_completed_weeks")
      .eq("auth_user_id", user.id)
      .single();

    if (error) {
      console.error("Erro ao carregar paciente:", error);
      return;
    }

    setPatientId(data.id);

    setSemanasRetroativasConcluidas(
  data.retroactive_registration
    ? (data.retroactive_completed_weeks ?? 0)
    : 0
);

    const metaTreino = data.training_weekly_goal ?? 0;

    setTreinosPlanejados(String(metaTreino));
    setTemPlanejamentoTreino(metaTreino > 0 ? "sim" : "nao");

    const metaAerobico = data.cardio_weekly_goal ?? 0;

    setAerobicosPlanejados(String(metaAerobico));
    setTemPlanejamentoAerobico(metaAerobico > 0 ? "sim" : "nao");

    const metaIndividual = data.individual_goal?.trim() ?? "";

    setDescricaoMetaIndividual(metaIndividual);
    setTemMetaIndividual(metaIndividual !== "" ? "sim" : "nao");
  }

  carregarMetaTreino();
}, [router]);

const pontosAlimentacao =
  diasPlanoAlimentar === ""
    ? 0
    : Math.round((Number(diasPlanoAlimentar) / 7) * 30);

const pontosHidratacao =
  diasMetaAgua === ""
    ? 0
    : Math.round((Number(diasMetaAgua) / 7) * 15);
const pontosTreino =
  temPlanejamentoTreino !== "sim" ||
  treinosPlanejados === "" ||
  Number(treinosPlanejados) <= 0
    ? 0
    : Math.min(
        10,
        Math.round(
          (Number(treinosRealizados || 0) / Number(treinosPlanejados)) * 10
        )
      );
const pontosAerobico =
  temPlanejamentoAerobico !== "sim" ||
  aerobicosPlanejados === "" ||
  Number(aerobicosPlanejados) <= 0
    ? 0
    : Math.min(
        5,
        Math.round(
          (Number(aerobicosRealizados || 0) / Number(aerobicosPlanejados)) * 5
        )
      );
      /*
const pontosMetaSono =
  temMetaSono !== "sim" || diasMetaSono === ""
    ? 0
    : Math.round((Number(diasMetaSono) / 7) * 5);

const pontosQualidadeSono =
  qualidadeSono === "excelente"
    ? 5
    : qualidadeSono === "muito_boa"
    ? 4
    : qualidadeSono === "boa"
    ? 3
    : qualidadeSono === "ruim"
    ? 2
    : qualidadeSono === "muito_ruim"
    ? 1
    : qualidadeSono === "pessima"
    ? 0
    : 0;
*/

    const pontosSono =
  qualidadeSono === "muito_boa"
    ? 10
    : qualidadeSono === "boa"
    ? 8
    : qualidadeSono === "normal"
    ? 6
    : qualidadeSono === "ruim"
    ? 3
    : qualidadeSono === "muito_ruim"
    ? 0
    : 0;

    const pontosRefeicoesForaPlano =
  refeicoesForaPlano === ""
    ? 0
    : refeicoesForaPlano === "0"
    ? 15
    : refeicoesForaPlano === "1"
    ? 12
    : refeicoesForaPlano === "2"
    ? 9
    : refeicoesForaPlano === "3"
    ? 6
    : refeicoesForaPlano === "4"
    ? 3
    : 0;

    const pontosSuplementos =
  temSuplementos !== "sim" || diasSuplementos === ""
    ? 0
    : Math.round((Number(diasSuplementos) / 7) * 5);

    const pontosMetaIndividual =
  temMetaIndividual !== "sim"
    ? 0
    : Math.min(
        10,
        Math.round((Number(metaCumprida || 0) / 7) * 10)
      );

      const scoreTotal =
  pontosAlimentacao +
  pontosHidratacao +
  pontosTreino +
  pontosAerobico +
  pontosSono +
  pontosRefeicoesForaPlano +
  pontosSuplementos +
  pontosMetaIndividual;

  const maximoAplicavel =
  100 -
  (temPlanejamentoTreino === "nao" ? 10 : 0) -
  (temPlanejamentoAerobico === "nao" ? 5 : 0) -
  (temMetaSono === "nao" ? 5 : 0) -
  (temSuplementos === "nao" ? 5 : 0) -
  (temMetaIndividual === "nao" ? 10 : 0);

  const scoreFinal =
  maximoAplicavel > 0
    ? Math.min(100, Math.round((scoreTotal / maximoAplicavel) * 100))
    : 0;

  const classificacaoScore =
  scoreFinal >= 90
    ? "Excelente"
    : scoreFinal >= 80
    ? "Muito bom"
    : scoreFinal >= 70
    ? "Bom"
    : scoreFinal >= 60
    ? "Atenção"
    : "Baixa adesão";
    async function salvarRelatorio() {
        if (!patientId) {
  alert("Não foi possível identificar o paciente. Tente novamente.");
  return;
}
  setSalvando(true);

  try {
    const { data: cicloAtivo, error: erroCiclo } = await supabase
  .from("diet_cycles")
  .select("id, start_date, followup_frequency, retroactive_registered_at")
  .eq("patient_id", patientId)
  .eq("status", "ativo")
  .maybeSingle();

  if (erroCiclo || !cicloAtivo) {
  alert("Não foi possível identificar um ciclo ativo para este acompanhamento.");
  setSalvando(false);
  return;
}

const frequenciaCiclo = cicloAtivo.followup_frequency
  ?.trim()
  .toLowerCase();

const intervaloDias =
  frequenciaCiclo === "semanal"
    ? 7
    : frequenciaCiclo === "quinzenal"
    ? 15
    : frequenciaCiclo === "mensal"
    ? 30
    : null;
   const calcularSegundaPrevista = (numero: number) => {
  if (intervaloDias === null) return null;

  const cadastroRetroativo =
    Boolean(cicloAtivo.retroactive_registered_at) &&
    semanasRetroativasConcluidas > 0;

  let dataPrevista: Date;

  if (cadastroRetroativo && cicloAtivo.retroactive_registered_at) {
    const dataCadastro = new Date(
      `${cicloAtivo.retroactive_registered_at}T12:00:00Z`
    );

    // Segunda-feira da semana do cadastro
    const diasDesdeSegundaCadastro =
      (dataCadastro.getUTCDay() + 6) % 7;

    dataCadastro.setUTCDate(
      dataCadastro.getUTCDate() - diasDesdeSegundaCadastro
    );

    // O tempo já concluído é contado em semanas,
    // independentemente da frequência dos relatórios.
    const diasJaConcluidos =
      semanasRetroativasConcluidas * 7;

    const intervaloRetroativoDias =
  frequenciaCiclo === "semanal"
    ? 7
    : frequenciaCiclo === "quinzenal"
    ? 14
    : 28;

const diasParaRelatorio =
  intervaloRetroativoDias * numero - diasJaConcluidos;

    dataCadastro.setUTCDate(
      dataCadastro.getUTCDate() + diasParaRelatorio
    );

    dataPrevista = dataCadastro;
  } else {
    dataPrevista = new Date(
      `${cicloAtivo.start_date}T12:00:00Z`
    );

    dataPrevista.setUTCDate(
      dataPrevista.getUTCDate() + intervaloDias * numero
    );
  }

  const diaSemana = dataPrevista.getUTCDay();
  const diasDesdeSegunda = (diaSemana + 6) % 7;

  const ajuste =
    diasDesdeSegunda <= 3
      ? -diasDesdeSegunda
      : 7 - diasDesdeSegunda;

  dataPrevista.setUTCDate(
    dataPrevista.getUTCDate() + ajuste
  );

  return dataPrevista.toISOString().slice(0, 10);
};

  const partesDataBrasil = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());

const anoBrasil = Number(
  partesDataBrasil.find((parte) => parte.type === "year")?.value
);

const mesBrasil = Number(
  partesDataBrasil.find((parte) => parte.type === "month")?.value
);

const diaBrasil = Number(
  partesDataBrasil.find((parte) => parte.type === "day")?.value
);

const segundaAtualBrasil = new Date(
  Date.UTC(anoBrasil, mesBrasil - 1, diaBrasil, 12)
);

const diasDesdeSegundaAtual =
  (segundaAtualBrasil.getUTCDay() + 6) % 7;

segundaAtualBrasil.setUTCDate(
  segundaAtualBrasil.getUTCDate() - diasDesdeSegundaAtual
);

const semanaAtualBrasil =
  segundaAtualBrasil.toISOString().slice(0, 10);

  const diaSemanaBrasil = new Date(
  Date.UTC(anoBrasil, mesBrasil - 1, diaBrasil, 12)
).getUTCDay();

const dentroDoPrazoRelatorio =
  diaSemanaBrasil === 1 || diaSemanaBrasil === 2;

  const quantidadePrevista =
  frequenciaCiclo === "semanal"
    ? 4
    : frequenciaCiclo === "quinzenal"
    ? 2
    : frequenciaCiclo === "mensal"
    ? 1
    : 0;

let numeroPrevistoNestaSemana: number | null = null;

for (let numero = 1; numero <= quantidadePrevista; numero++) {
  const segundaPrevista = calcularSegundaPrevista(numero);

  if (segundaPrevista === semanaAtualBrasil) {
    numeroPrevistoNestaSemana = numero;
    break;
  }
}

const { data: semanasRespondidas, error: erroSemanas } =
  await supabase
    .from("patient_reports")
    .select("scheduled_week_start")
    .eq("cycle_id", cicloAtivo.id)
    .not("scheduled_week_start", "is", null);

if (erroSemanas) {
  console.error(
    "Erro ao consultar semanas respondidas:",
    erroSemanas
  );

  alert("Não foi possível verificar os relatórios anteriores.");
  return;
}

const semanasJaRespondidas = new Set(
  (semanasRespondidas ?? []).map(
    (relatorio) => relatorio.scheduled_week_start
  )
);
const semanasFuturasDisponiveis = [];

for (let numero = 1; numero <= quantidadePrevista; numero++) {
  const segundaPrevista = calcularSegundaPrevista(numero);

  if (
    segundaPrevista !== null &&
    segundaPrevista > semanaAtualBrasil &&
    !semanasJaRespondidas.has(segundaPrevista)
  ) {
    semanasFuturasDisponiveis.push(segundaPrevista);
  }
}

if (!dentroDoPrazoRelatorio) {
  alert(
    "O prazo para responder ao relatório nutricional é somente " +
    "às segundas e terças-feiras da semana programada. " +
    "Se você perdeu esse prazo, deverá aguardar o próximo " +
    "relatório previsto no seu acompanhamento."
  );

  return;
}

if (cicloAtivo.retroactive_registered_at) {
  const dataCadastro = new Date(
    `${cicloAtivo.retroactive_registered_at}T12:00:00Z`
  );

  const diasDesdeSegundaCadastro =
    (dataCadastro.getUTCDay() + 6) % 7;

  dataCadastro.setUTCDate(
    dataCadastro.getUTCDate() - diasDesdeSegundaCadastro
  );

  const semanaCadastro =
    dataCadastro.toISOString().slice(0, 10);

  if (semanaAtualBrasil < semanaCadastro) {
    alert(
      "Este relatório pertence a uma semana anterior " +
      "à semana do seu cadastro. " +
      "Aguarde o próximo relatório programado."
    );

    setSalvando(false);
    return;
  }
}

const semanaParaRegistrar =
  numeroPrevistoNestaSemana !== null &&
  !semanasJaRespondidas.has(semanaAtualBrasil)
    ? semanaAtualBrasil
    : null;
    let numeroProgramado: number | null = null;

for (let numero = 1; numero <= quantidadePrevista; numero++) {
  if (calcularSegundaPrevista(numero) === semanaParaRegistrar) {
    numeroProgramado = numero;
    break;
  }
}

if (numeroProgramado === null) {
  alert("Não foi possível identificar o número do relatório programado.");
  return;
}
    if (semanaParaRegistrar === null) {
  alert(
    "Não há um relatório disponível para envio neste momento. " +
    "Você já respondeu o acompanhamento desta semana " +
    "ou não possui outro relatório programado."
  );

  return;
}
    if (semanaParaRegistrar !== null) {
  const { data: relatorioExistente, error: erroVerificacao } =
    await supabase
      .from("patient_reports")
      .select("id")
      .eq("cycle_id", cicloAtivo.id)
      .eq("scheduled_week_start", semanaParaRegistrar)
      .limit(1)
      .maybeSingle();

  if (erroVerificacao) {
    console.error(
      "Erro ao verificar relatório da semana:",
      erroVerificacao
    );

    alert("Não foi possível verificar o relatório desta semana.");
    return;
  }

  if (relatorioExistente) {
    alert(
      "Você já enviou o relatório previsto para esta semana."
    );
    return;
  }
}

for (let numero = 1; numero <= quantidadePrevista; numero++) {
  if (calcularSegundaPrevista(numero) === semanaParaRegistrar) {
    numeroProgramado = numero;
    break;
  }
}

if (numeroProgramado === null) {
  alert("Não foi possível identificar o número do relatório programado.");
  return;
}
    const { error } = await supabase.from("patient_reports").insert({
  patient_id: patientId,
  cycle_id: cicloAtivo?.id ?? null,
  cycle_report_number: numeroProgramado,
    scheduled_week_start: semanaParaRegistrar,

  diet_days: diasPlanoAlimentar === "" ? null : Number(diasPlanoAlimentar),
  diet_score: pontosAlimentacao,

  diet_changed:
  alterouPlanoAlimentar === ""
    ? null
    : alterouPlanoAlimentar === "sim",

    diet_change_equivalent:
  alterouPlanoAlimentar !== "sim" || alteracaoEquivalente === ""
    ? null
    : alteracaoEquivalente === "sim",

    diet_change_notes:
  observacaoAlteracaoAlimentar.trim() === ""
    ? null
    : observacaoAlteracaoAlimentar,

    diet_difficulty:
  dificuldadeAlimentar.trim() === ""
    ? null
    : dificuldadeAlimentar,

  water_goal_days:
  diasMetaAgua === "" ? null : Number(diasMetaAgua),

  water_liters:
  litrosAgua === "" ? null : Number(litrosAgua),

  urine_color:
  corUrina === "" ? null : corUrina,

water_score: pontosHidratacao,

training_applicable:
  temPlanejamentoTreino === "sim",

training_planned:
  treinosPlanejados === "" ? null : Number(treinosPlanejados),

training_completed:
  treinosRealizados === "" ? null : Number(treinosRealizados),

training_score: pontosTreino,

training_intensity:
  intensidadeTreino === "" ? null : intensidadeTreino,

  same_training_time:
  tempoMesmoTreino === "" ? null : tempoMesmoTreino,

cardio_applicable:
  temPlanejamentoAerobico === "sim",

cardio_planned:
  aerobicosPlanejados === "" ? null : Number(aerobicosPlanejados),

cardio_completed:
  aerobicosRealizados === "" ? null : Number(aerobicosRealizados),

cardio_score: pontosAerobico,

sleep_goal_applicable:
  temMetaSono === "sim",

sleep_goal_days:
  diasMetaSono === "" ? null : Number(diasMetaSono),

  sleep_hours:
  horasSono === "" ? null : Number(horasSono),
  
sleep_quality:
  qualidadeSono === "" ? null : qualidadeSono,

sleep_score: pontosSono,

sleep_difficulty:
  dificuldadeSono === "" ? null : dificuldadeSono,

  wake_disposition:
  disposicaoAoAcordar === "" ? null : disposicaoAoAcordar,

off_plan_count:
  refeicoesForaPlano === "" ? null : Number(refeicoesForaPlano),

  off_plan_foods:
  alimentosForaPlano.trim() === "" ? null : alimentosForaPlano,
  
off_plan_reason:
  motivoForaPlano === "" ? null : motivoForaPlano,

  off_plan_score: pontosRefeicoesForaPlano,

supplements_applicable:
  temSuplementos === "sim",

supplements_days:
  diasSuplementos === "" ? null : Number(diasSuplementos),

  supplements_reason:
  motivoSuplementos === "" ? null : motivoSuplementos,

supplements_score: pontosSuplementos,

individual_goal_applicable:
  temMetaIndividual === "sim",

  individual_goal:
  descricaoMetaIndividual.trim() === ""
    ? null
    : descricaoMetaIndividual,

individual_goal_planned:
  temMetaIndividual === "sim" ? 7 : null,

individual_goal_completed:
  metaCumprida === "" ? null : Number(metaCumprida),

  individual_goal_difficulty:
  dificuldadeMetaIndividual.trim() === ""
    ? null
    : dificuldadeMetaIndividual,

individual_goal_score: pontosMetaIndividual,

weight:
  pesoAtual === "" ? null : Number(pesoAtual),

  stool_consistency:
  consistenciaFezes === "" ? null : consistenciaFezes,

  acne_hair_loss:
  acneQuedaCabelo === "" ? null : acneQuedaCabelo,

  libido:
  libido === "" ? null : libido,

  alcohol_use:
  consumiuAlcool === ""
    ? null
    : consumiuAlcool === "nao"
    ? "nao"
    : quantidadeAlcool.trim() === ""
    ? "sim"
    : `sim - ${quantidadeAlcool} doses`,

    medication_changes:
  mudancaMedicamentos === ""
    ? null
    : mudancaMedicamentos === "nao"
    ? "nao"
    : descricaoMudancaMedicamentos.trim() === ""
    ? "sim"
    : `sim - ${descricaoMudancaMedicamentos}`,

    general_notes:
  observacoesGerais.trim() === "" ? null : observacoesGerais,

  applicable_points: maximoAplicavel,
  earned_points: scoreTotal,
  adherence_score: scoreFinal,
});

if (error) {
  console.error("Erro ao salvar relatório:", error);
  alert("Erro ao salvar relatório.");
  return;
}

router.replace("/area-paciente");
  } finally {
    setSalvando(false);
  }
}

    return (
  <div className="flex min-h-screen bg-gray-50">

    <main className="flex-1 p-8">
      <div className="mx-auto max-w-4xl">
        
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-bold text-gray-900">
              Relatório de acompanhamento Nutricional
            </h1>

            <p className="mt-2 text-gray-500">
              Preencha as informações abaixo.
            </p>
          </div>

                    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      🍽️ Alimentação
    </h2>

{/*
    <p className="mt-1 text-sm text-gray-500">
      Adesão ao plano alimentar
    </p>
    {diasPlanoAlimentar !== "" && (
  <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
    Pontuação: {pontosAlimentacao} / 30
  </div>
)}
*/}

  </div>

  <div>
    <label className="font-medium text-gray-900">
      Pensando nos últimos 7 dias, em quantos dias você conseguiu
      seguir corretamente o plano alimentar proposto pelo nutricionista?
    </label>

    <select
  value={diasPlanoAlimentar}
  onChange={(e) => setDiasPlanoAlimentar(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="7">7 dias</option>
      <option value="6">6 dias</option>
      <option value="5">5 dias</option>
      <option value="4">4 dias</option>
      <option value="3">3 dias</option>
      <option value="2">2 dias</option>
      <option value="1">1 dia</option>
      <option value="0">Nenhum dia</option>
    </select>
  </div>
  <div className="mt-6">
  <label className="font-medium text-gray-900">
    Você precisou fazer alguma alteração ou substituição no plano alimentar
    durante esta semana?
  </label>

  <select
  value={alterouPlanoAlimentar}
  onChange={(e) => setAlterouPlanoAlimentar(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
    <option value="">Selecione uma opção</option>
    <option value="nao">Não</option>
    <option value="sim">Sim</option>
  </select>
</div>

{alterouPlanoAlimentar === "sim" && (
  <div className="mt-6">
    <label className="font-medium text-gray-900">
      A alteração foi feita utilizando um alimento da lista de equivalências?
    </label>

    <select
      value={alteracaoEquivalente}
      onChange={(e) => setAlteracaoEquivalente(e.target.value)}
      className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
    >
      <option value="">Selecione uma opção</option>
      <option value="sim">Sim</option>
      <option value="nao">Não</option>
    </select>
  </div>
)}

{alterouPlanoAlimentar === "sim" && (
<div className="mt-6">
  <label className="font-medium text-gray-900">
    Se realizou alguma alteração, conte o que alterou e por quê.
  </label>

  <textarea
    rows={3}
    value={observacaoAlteracaoAlimentar}
    onChange={(e) => setObservacaoAlteracaoAlimentar(e.target.value)}
    placeholder="Ex.: Não consegui realizar o lanche da tarde por causa do trabalho."
    className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
  />
</div>
)}

<div className="mt-6">
  <label className="font-medium text-gray-900">
    Qual foi sua maior dificuldade para seguir o plano alimentar nesta semana?
  </label>

  <textarea
    rows={3}
    value={dificuldadeAlimentar}
onChange={(e) => setDificuldadeAlimentar(e.target.value)}
    placeholder="Se não teve dificuldade, deixe este campo em branco."
    className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
  />
</div>
</section>
<section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      💧 Hidratação
    </h2>

    {/*
    <p className="mt-1 text-sm text-gray-500">
      Cumprimento da meta de água
    </p>
    */}
    
    {/*
    {diasMetaAgua !== "" && (
  <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
    Pontuação: {pontosHidratacao} / 15
  </div>
)}
  */}

  </div>
  

  <div>
    <label className="font-medium text-gray-900">
      Nos últimos 7 dias, em quantos dias você conseguiu atingir a meta
      de água definida pelo nutricionista?
    </label>

    <select
  value={diasMetaAgua}
  onChange={(e) => setDiasMetaAgua(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="7">7 dias</option>
      <option value="6">6 dias</option>
      <option value="5">5 dias</option>
      <option value="4">4 dias</option>
      <option value="3">3 dias</option>
      <option value="2">2 dias</option>
      <option value="1">1 dia</option>
      <option value="0">Nenhum dia</option>
    </select>
  </div>

  {/*
  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Aproximadamente quanto de água você está bebendo por dia?
    </label>

    <div className="mt-3 flex items-center gap-3">
      <input
        type="number"
        min="0"
        step="0.1"
        value={litrosAgua}
        onChange={(e) => setLitrosAgua(e.target.value)}
        placeholder="Ex.: 2.5"
        className="w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
      />

      <span className="font-medium text-gray-600">
        litros
      </span>
    </div>
  </div>
  */}

  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Qual tem sido predominantemente a coloração da sua urina?
    </label>

    <select
  value={corUrina}
  onChange={(e) => setCorUrina(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="transparente">Transparente</option>
      <option value="levemente_amarelada">Levemente amarelada</option>
      <option value="amarelada">Amarelada</option>
      <option value="muito_amarela">Muito amarela</option>
      <option value="turva">Turva</option>
    </select>
  </div>
</section>
<section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      🏋️ Atividade física
    </h2>

{/*
    <p className="mt-1 text-sm text-gray-500">
      Treino e exercício aeróbico
    </p>
    */}

  </div>

  <div>
    <h3 className="font-semibold text-gray-900">
      Treino
    </h3>
{/*
{temPlanejamentoTreino === "sim" &&
  treinosPlanejados !== "" && (
    <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
      Pontuação: {pontosTreino} / 10
    </div>
  )}
    */}

{temPlanejamentoTreino === "nao" && (
  <div className="mt-3 inline-flex rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">
    Não se aplica
  </div>
)}
    {/*
    <div className="mt-4">
      <label className="font-medium text-gray-900">
        Existe planejamento de treino para este paciente?
      </label>

      <select
  value={temPlanejamentoTreino}
  onChange={(e) => setTemPlanejamentoTreino(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
        <option value="">Selecione uma opção</option>
        <option value="sim">Sim</option>
        <option value="nao">
          Não se aplica / não há planejamento de treino
        </option>
      </select>
    </div>
    */}

    <div className="mt-6 grid gap-4 md:grid-cols-2">
      
      {/*
      <div>
        <label className="font-medium text-gray-900">
          Quantos treinos estavam planejados?
        </label>

        <input
          type="number"
          min="0"
          value={treinosPlanejados}
          onChange={(e) => setTreinosPlanejados(e.target.value)}
          placeholder="Ex.: 5"
          className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
        />
      </div>
      */}
      
      {Number(treinosPlanejados) > 0 && (
      <div>
        <label className="font-medium text-gray-900">
          Quantos treinos você realizou?
        </label>

        <input
          type="number"
          min="0"
          value={treinosRealizados}
          onChange={(e) => setTreinosRealizados(e.target.value)}
          placeholder="Ex.: 4"
          className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
        />
      </div>
)}
</div>
    

    {/*
    <div className="mt-6">
      <label className="font-medium text-gray-900">
        Qual foi a intensidade média dos seus treinos nesta semana?
      </label>

      <select
  value={intensidadeTreino}
  onChange={(e) => setIntensidadeTreino(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
        <option value="">Selecione uma opção</option>
        <option value="sem_treino">Não realizei treino</option>
        <option value="muito_facil">Muito fácil</option>
        <option value="facil">Fácil</option>
        <option value="relativamente_facil">Relativamente fácil</option>
        <option value="relativamente_cansativo">
          Relativamente cansativo
        </option>
        <option value="cansativo">Cansativo</option>
        <option value="muito_cansativo">Muito cansativo</option>
        <option value="exaustivo">Exaustivo</option>
      </select>
    </div>

    <div className="mt-6">
      <label className="font-medium text-gray-900">
        Há quanto tempo você está realizando o mesmo programa de treino?
      </label>

      <select
  value={tempoMesmoTreino}
  onChange={(e) => setTempoMesmoTreino(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
        <option value="">Selecione uma opção</option>
        <option value="1_4_semanas">1 a 4 semanas</option>
        <option value="5_8_semanas">5 a 8 semanas</option>
        <option value="mais_8_semanas">Mais de 8 semanas</option>
        <option value="nao_se_aplica">Não se aplica</option>
      </select>
    </div>
    */}
    
  </div>
  <div className="mt-8 border-t border-gray-200 pt-6">
  <h3 className="font-semibold text-gray-900">
    🏃 Aeróbico
  </h3>

{/*
{temPlanejamentoAerobico === "sim" &&
  aerobicosPlanejados !== "" && (
    <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
      Pontuação: {pontosAerobico} / 5
    </div>
  )}
    */}

{temPlanejamentoAerobico === "nao" && (
  <div className="mt-3 inline-flex rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-600">
    Não se aplica
  </div>
)}
{/*
  <div className="mt-4">
    <label className="font-medium text-gray-900">
      Existe planejamento de exercício aeróbico para este paciente?
    </label>

    <select
  value={temPlanejamentoAerobico}
  onChange={(e) => setTemPlanejamentoAerobico(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="sim">Sim</option>
      <option value="nao">
        Não se aplica / não há planejamento de aeróbico
      </option>
    </select>
  </div>
  */}

  <div className="mt-6 grid gap-4 md:grid-cols-2">
    
    {/*
    <div>
      <label className="font-medium text-gray-900">
        Quantas sessões de aeróbico estavam planejadas?
      </label>

      <input
        type="number"
        min="0"
        value={aerobicosPlanejados}
        onChange={(e) => setAerobicosPlanejados(e.target.value)}
        placeholder="Ex.: 3"
        className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
      />
    </div>
    */}

{Number(aerobicosPlanejados) > 0 && (
    <div>
      <label className="font-medium text-gray-900">
        Quantas sessões de aeróbico você realizou?
      </label>

      <input
        type="number"
        min="0"
        value={aerobicosRealizados}
        onChange={(e) => setAerobicosRealizados(e.target.value)}
        placeholder="Ex.: 2"
        className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
      />
    </div>
    )}

  </div>
</div>
</section>
<section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      😴 Sono
    </h2>

    <p className="mt-1 text-sm text-gray-500">
      Meta e qualidade do sono
    </p>

    {/*
    {(diasMetaSono !== "" || qualidadeSono !== "") && (
  <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
    Pontuação: {pontosSono} / 10
  </div>
)}
*/}

  </div>

{/*
  <div>
    <label className="font-medium text-gray-900">
      Existe uma meta de sono definida para este paciente?
    </label>

    <select
  value={temMetaSono}
  onChange={(e) => setTemMetaSono(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="sim">Sim</option>
      <option value="nao">
        Não se aplica / não há meta de sono definida
      </option>
    </select>
  </div>
  */}

  <div>
  <label className="font-medium text-gray-900">
    Em média, quantas horas você dormiu por noite nesta semana?
  </label>

  <input
    type="number"
    step="0.5"
    min="0"
    max="24"
    value={horasSono}
    onChange={(e) => setHorasSono(e.target.value)}
    placeholder="Ex.: 7.5"
    className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
  />
</div>

  {/*
<div className="mt-6">
  <label className="font-medium text-gray-900">
    Nos últimos 7 dias, em quantos dias você conseguiu atingir a meta
    de horas de sono?
  </label>

  <select
    value={diasMetaSono}
    onChange={(e) => setDiasMetaSono(e.target.value)}
    className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
  >
    <option value="">Selecione uma opção</option>
    <option value="7">7 dias</option>
    <option value="6">6 dias</option>
    <option value="5">5 dias</option>
    <option value="4">4 dias</option>
    <option value="3">3 dias</option>
    <option value="2">2 dias</option>
    <option value="1">1 dia</option>
    <option value="0">Nenhum dia</option>
  </select>

  <p className="mt-2 text-sm text-gray-500">
    Esta resposta corresponde a até 5 pontos do Score.
  </p>
</div>
*/}

  <div className="mt-6">
    <label className="font-medium text-gray-900">
      De maneira geral, como você considera a qualidade do seu sono
      nesta semana?
    </label>

    <select
  value={qualidadeSono}
  onChange={(e) => setQualidadeSono(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="muito_boa">Muito boa</option>
<option value="boa">Boa</option>
<option value="normal">Normal</option>
<option value="ruim">Ruim</option>
<option value="muito_ruim">Muito ruim</option>
    </select>

    {/*
<p className="mt-2 text-sm text-gray-500">
  Esta resposta corresponde a até 5 pontos do score.
</p>
*/}

  </div>

  <div className="mt-8 border-t border-gray-200 pt-6">
    <p className="mb-4 text-sm font-medium text-gray-500">
      Informações complementares
    </p>

    <div>
      <label className="font-medium text-gray-900">
        Você teve dificuldade para dormir nesta semana?
      </label>

      <select
  value={dificuldadeSono}
  onChange={(e) => setDificuldadeSono(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
        <option value="">Selecione uma opção</option>
        <option value="nao">Não</option>
        <option value="1_2_dias">Em 1 a 2 dias</option>
        <option value="3_4_dias">Em 3 a 4 dias</option>
        <option value="5_mais_dias">Em 5 dias ou mais</option>
      </select>
    </div>

    <div className="mt-6">
      <label className="font-medium text-gray-900">
        Como você tem acordado na maior parte dos dias?
      </label>

      <select
  value={disposicaoAoAcordar}
  onChange={(e) => setDisposicaoAoAcordar(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
        <option value="">Selecione uma opção</option>
        <option value="muito_indisposto">Muito indisposto</option>
        <option value="indisposto">Indisposto</option>
        <option value="normal">Normal</option>
        <option value="disposto">Disposto</option>
        <option value="muito_disposto">Muito disposto</option>
      </select>
    </div>
  </div>
</section>
<section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      🍕 Refeições fora do planejamento
    </h2>

    <p className="mt-1 text-sm text-gray-500">
      Adesão ao planejamento alimentar
    </p>

{/*
{refeicoesForaPlano !== "" && (
  <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
    Pontuação: {pontosRefeicoesForaPlano} / 15
  </div>
)}
*/}

  </div>

  <div>
    <label className="font-medium text-gray-900">
      Nos últimos 7 dias, quantas vezes você realizou uma refeição ou
      consumiu alimentos fora do que estava planejado com seu nutricionista?
    </label>

    <p className="mt-2 text-sm text-gray-500">
      Não considere refeições livres que já estavam previstas no seu plano.
    </p>

    <select
  value={refeicoesForaPlano}
  onChange={(e) => setRefeicoesForaPlano(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="0">Nenhuma vez</option>
      <option value="1">1 vez</option>
      <option value="2">2 vezes</option>
      <option value="3">3 vezes</option>
      <option value="4">4 vezes</option>
      <option value="5">5 vezes ou mais</option>
    </select>
  </div>

{refeicoesForaPlano !== "" && Number(refeicoesForaPlano) > 0 && (
  <>
  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Se consumiu algo fora do planejamento, o que foi?
    </label>

    <textarea
      rows={3}
      value={alimentosForaPlano}
      onChange={(e) => setAlimentosForaPlano(e.target.value)}
      placeholder="Ex.: Pizza no sábado à noite e chocolate na terça-feira."
      className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
    />
  </div>

  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Qual foi o principal motivo?
    </label>

    <select
  value={motivoForaPlano}
  onChange={(e) => setMotivoForaPlano(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="nao_se_aplica">Não se aplica</option>
      <option value="fome">Fome</option>
      <option value="vontade">Vontade de comer / desejo</option>
      <option value="evento_social">Evento social / festa</option>
      <option value="final_semana">Final de semana</option>
      <option value="falta_opcao">Falta de opção adequada</option>
      <option value="organizacao">
        Falta de organização / tempo
      </option>
      <option value="emocional">
        Ansiedade / estresse / emocional
      </option>
      <option value="viagem_trabalho">Viagem / trabalho</option>
      <option value="outro">Outro</option>
    </select>
  </div>
    </>
)}

  
<div className="mt-6">
  <label className="font-medium text-gray-900">
    Consumiu bebida alcoólica nos últimos 7 dias?
  </label>

  <select
  value={consumiuAlcool}
  onChange={(e) => setConsumiuAlcool(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
    <option value="">Selecione uma opção</option>
    <option value="nao">Não</option>
    <option value="sim">Sim</option>
  </select>
</div>

{consumiuAlcool === "sim" && (
<div className="mt-6">
  <label className="font-medium text-gray-900">
    Quantas doses de bebida alcoólica você consumiu aproximadamente?
  </label>

  <input
  type="number"
  min="1"
  step="1"
  value={quantidadeAlcool}
  onChange={(e) => setQuantidadeAlcool(e.target.value)}
  placeholder="Ex.: 3"
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
/>

<p className="mt-2 text-sm text-gray-500">
  Ex.: 1 latinha de cerveja = 1 dose • 1 garrafa de cerveja de 1 litro = 3 doses • 1 taça de vinho = 1 dose • 1 garrafa de vinho = 5 doses • 1 garrafa de Whisky = 15 doses. 
</p>
</div>
)}

</section>
<section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      💊 Suplementos e manipulados
    </h2>

    <p className="mt-1 text-sm text-gray-500">
      Adesão ao uso orientado
    </p>

    {/*
    {temSuplementos === "sim" && diasSuplementos !== "" && (
  <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
    Pontuação: {pontosSuplementos} / 5
  </div>
)}
  */}

  </div>

  <div>
    <label className="font-medium text-gray-900">
      Você possui suplementos ou manipulados orientados pelo nutricionista
      atualmente?
    </label>

    <select
  value={temSuplementos}
  onChange={(e) => setTemSuplementos(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="sim">Sim</option>
      <option value="nao">
        Não se aplica / não tenho suplementos ou manipulados orientados
      </option>
    </select>
  </div>

{temSuplementos === "sim" && (
  <>
  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Nos últimos 7 dias, em quantos dias você utilizou corretamente os
      suplementos ou manipulados orientados?
    </label>

    <select
  value={diasSuplementos}
  onChange={(e) => setDiasSuplementos(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="7">7 dias</option>
      <option value="6">6 dias</option>
      <option value="5">5 dias</option>
      <option value="4">4 dias</option>
      <option value="3">3 dias</option>
      <option value="2">2 dias</option>
      <option value="1">1 dia</option>
      <option value="0">Nenhum dia</option>
    </select>
  </div>

  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Se não utilizou corretamente, qual foi o principal motivo?
    </label>

    <select
  value={motivoSuplementos}
  onChange={(e) => setMotivoSuplementos(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="nao_se_aplica">Não se aplica</option>
      <option value="esquecimento">Esquecimento</option>
      <option value="acabou">O produto acabou</option>
      <option value="nao_comprei">Não consegui comprar</option>
      <option value="desconforto">Desconforto / efeito indesejado</option>
      <option value="horarios">Dificuldade com os horários</option>
      <option value="decidi_nao_usar">Decidi não utilizar</option>
      <option value="outro">Outro motivo</option>
    </select>
  </div>
    </>
)}
</section>
<section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      🎯 Meta individual
    </h2>

    <p className="mt-1 text-sm text-gray-500">
      Cumprimento da meta definida para o paciente
    </p>

    {/*
    {temMetaIndividual === "sim" &&
  metaPlanejada !== "" &&
  metaCumprida !== "" && (
    <div className="mt-3 inline-flex rounded-lg bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700">
      Pontuação: {pontosMetaIndividual} / 10
    </div>
  )}
    */}

  </div>

{/*
  <div>
    <label className="font-medium text-gray-900">
      Foi definida uma meta individual para este período?
    </label>

    <select
  value={temMetaIndividual}
  onChange={(e) => setTemMetaIndividual(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
      <option value="">Selecione uma opção</option>
      <option value="sim">Sim</option>
      <option value="nao">
        Não se aplica / não foi definida uma meta individual
      </option>
    </select>
  </div>

  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Qual foi a meta definida?
    </label>

    <textarea
      rows={2}
      value={descricaoMetaIndividual}
      onChange={(e) => setDescricaoMetaIndividual(e.target.value)}
      placeholder="Ex.: Levar marmita para o trabalho pelo menos 5 dias."
      className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
    />
  </div>
  */}

  {temMetaIndividual === "sim" ? (
  <div className="mt-6 rounded-xl bg-blue-50 p-4">
    <p className="text-sm text-gray-600">
      Sua meta individual:
    </p>
    <p className="mt-1 font-semibold text-gray-900">
      {descricaoMetaIndividual}
    </p>
  </div>
) : (
  <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
    Não se aplica
  </div>
)}

  <div className="mt-6 grid gap-4 md:grid-cols-2">
    {/*
    <div>
      <label className="font-medium text-gray-900">
        Quantas vezes estavam planejadas?
      </label>

      <input
        type="number"
        min="0"
        value={metaPlanejada}
        placeholder="Ex.: 5"
        onChange={(e) => setMetaPlanejada(e.target.value)}
        className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
      />
    </div>
    */}

    <div>
      <label className="font-medium text-gray-900">
        Em quantos dos últimos 7 dias você conseguiu cumprir essa meta?
      </label>

      <select
  value={metaCumprida}
  onChange={(e) => setMetaCumprida(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
  <option value="">Selecione uma opção</option>
  <option value="7">7 dias</option>
  <option value="6">6 dias</option>
  <option value="5">5 dias</option>
  <option value="4">4 dias</option>
  <option value="3">3 dias</option>
  <option value="2">2 dias</option>
  <option value="1">1 dia</option>
  <option value="0">Nenhum dia</option>
</select>
    </div>
  </div>

  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Teve alguma dificuldade para cumprir essa meta?
    </label>

    <textarea
      rows={3}
      value={dificuldadeMetaIndividual}
onChange={(e) => setDificuldadeMetaIndividual(e.target.value)}
      placeholder="Se não teve dificuldades, deixe este campo em branco e siga para a próxima pergunta."
      className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
    />
  </div>
</section>
<section className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <div className="mb-6">
    <h2 className="text-xl font-bold text-gray-900">
      🩺 Indicadores clínicos
    </h2>

    <p className="mt-1 text-sm text-gray-500">
      Informações complementares para acompanhamento clínico.
      Estes dados não alteram o Score de Adesão.
    </p>
  </div>

  <div>
    <label className="font-medium text-gray-900">
      Qual é o seu peso atual?
    </label>

    <div className="mt-3 flex items-center gap-3">
      <input
        type="number"
        min="0"
        step="0.1"
        value={pesoAtual}
        onChange={(e) => setPesoAtual(e.target.value)}
        placeholder="Ex.: 80.5"
        className="w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
      />

      <span className="font-medium text-gray-600">
        kg
      </span>
    </div>
  </div>

  <div className="mt-6">
    <label className="font-medium text-gray-900">
      Como está a consistência das suas fezes predominantemente?
    </label>

<select
  value={consistenciaFezes}
  onChange={(e) => setConsistenciaFezes(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
          <option value="">Selecione uma opção</option>
<option value="tipo_1">Tipo 1 — Bolinhas duras e separadas</option>
<option value="tipo_2">Tipo 2 — Formato de salsicha, mas irregular e endurecida</option>
<option value="tipo_3">Tipo 3 — Formato de salsicha com pequenas rachaduras</option>
<option value="tipo_4">Tipo 4 — Lisa, macia e bem formada</option>
<option value="tipo_5">Tipo 5 — Pedaços macios e bem definidos</option>
<option value="tipo_6">Tipo 6 — Pedaços pastosos, com bordas irregulares</option>
<option value="tipo_7">Tipo 7 — Líquida, sem partes sólidas</option>
    </select>
  </div>

  {/*
  <div className="mt-6">
  <label className="font-medium text-gray-900">
    Como estão a acne e a queda de cabelo em relação ao seu normal?
  </label>

  <select
  value={acneQuedaCabelo}
  onChange={(e) => setAcneQuedaCabelo(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
    <option value="">Selecione uma opção</option>
    <option value="normal">Não, tudo normal</option>
    <option value="habitual">
      Sim, mas está dentro do que normalmente acontece comigo
    </option>
    <option value="aumentou">
      Sim, aumentou significativamente
    </option>
  </select>
</div>
*/}

{/*
<div className="mt-6">
  <label className="font-medium text-gray-900">
    Como está sua libido em relação ao seu normal?
  </label>

  <select
  value={libido}
  onChange={(e) => setLibido(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
    <option value="">Selecione uma opção</option>
    <option value="baixa">Abaixo do meu normal</option>
    <option value="normal">Normal para mim</option>
    <option value="alta">Acima do meu normal</option>
  </select>
</div>
*/}

<div className="mt-6">
  <label className="font-medium text-gray-900">
    💉 Houve alguma mudança no uso de medicamentos nesta semana?
  </label>

  <select
  value={mudancaMedicamentos}
  onChange={(e) => setMudancaMedicamentos(e.target.value)}
  className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
>
    <option value="">Selecione uma opção</option>

<option value="nao_se_aplica">Não se aplica / não utilizo </option>
<option value="nao">Não houve mudança</option>
<option value="sim">Sim, houve mudança</option>
  </select>
</div>

{mudancaMedicamentos === "sim" && (
<div className="mt-6">
  <label className="font-medium text-gray-900">
    Se houve alguma mudança, descreva qual.
  </label>

  <textarea
    rows={2}
    value={descricaoMudancaMedicamentos}
    onChange={(e) => setDescricaoMudancaMedicamentos(e.target.value)}
    placeholder="Informe o medicamento e o que mudou."
    className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
  />
</div>
)}

<div className="mt-8 border-t border-gray-200 pt-6">
  <label className="font-medium text-gray-900">
    📝 Observações do paciente
  </label>

  <textarea
    rows={4}
    value={observacoesGerais}
    onChange={(e) => setObservacoesGerais(e.target.value)}
    placeholder="Conte qualquer outra informação que considere importante nesta semana."
    className="mt-3 w-full resize-none rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
  />
</div>
</section>

<button
  type="button"
  onClick={salvarRelatorio}
  disabled={salvando}
  className="mt-8 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  {salvando ? "Salvando..." : "Enviar relatório"}
</button>

        </div>
      </main>
    </div>
  );
}
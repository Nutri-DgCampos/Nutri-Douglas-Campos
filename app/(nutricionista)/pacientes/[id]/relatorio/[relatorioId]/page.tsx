"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "primereact/button";
import BotaoVoltar from "@/components/BotaoVoltar";

export default function VisualizarRelatorioPage() {
  const params = useParams();
  const router = useRouter();

  const [relatorio, setRelatorio] = useState<any>(null);

  useEffect(() => {
  async function buscarRelatorio() {
    const { data, error } = await api
      .from("patient_reports")
      .select("*")
      .eq("id", params.relatorioId)
      .single();

    if (error) {
      console.error("Erro ao buscar relatório:", error);
      return;
    }

    setRelatorio(data);
  }

  buscarRelatorio();
}, [params.relatorioId]);

  return (
    <div>

      <main className="mx-auto min-w-0 max-w-3xl flex-1 p-4 lg:p-8">
        <BotaoVoltar rotulo="Voltar" onClick={() => router.back()} />

        <h1 className="text-3xl font-bold text-gray-900">
          Relatório de acompanhamento
        </h1>

            {relatorio && (
  <>
    <p className="mt-4 text-sm text-gray-500">
      {new Date(relatorio.created_at).toLocaleDateString("pt-BR")}
    </p>

    {/*
    <p className="mt-2 text-lg font-semibold text-primary-600">
      Score: {relatorio.adherence_score} / 100
    </p>

    <p className="mt-1 font-semibold text-gray-900">
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
*/}

{relatorio.weight !== null && (
  <p className="mt-4 text-sm text-gray-600">
    Peso:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.weight.toLocaleString("pt-BR")} kg
    </span>
  </p>
)}

<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Alimentação
  </h2>

  <p className="mt-4 text-sm text-gray-600">
    Dias seguindo o plano:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.diet_days ?? "Não informado"} / 7
    </span>
  </p>
{/*
  <p className="mt-2 text-sm text-gray-600">
    Pontuação:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.diet_score} / 30
    </span>
  </p>
  */}

  <p className="mt-2 text-sm text-gray-600">
  Alterou o plano alimentar:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.diet_changed === true
      ? "Sim"
      : relatorio.diet_changed === false
      ? "Não"
      : "Não informado"}
  </span>
</p>

{relatorio.diet_change_notes && (
  <p className="mt-2 text-sm text-gray-600">
    Alteração realizada:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.diet_change_notes}
    </span>
  </p>
)}

{relatorio.diet_difficulty && (
  <p className="mt-2 text-sm text-gray-600">
    Principal dificuldade:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.diet_difficulty}
    </span>
  </p>
)}

</div>

<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Hidratação
  </h2>

  <p className="mt-4 text-sm text-gray-600">
    Dias atingindo a meta de água:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.water_goal_days ?? "Não informado"} / 7
    </span>
  </p>

{/*
  <p className="mt-2 text-sm text-gray-600">
  Consumo médio de água:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.water_liters !== null
      ? `${relatorio.water_liters.toLocaleString("pt-BR")} L`
      : "Não informado"}
  </span>
</p>
*/}

<p className="mt-2 text-sm text-gray-600">
  Cor da urina:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.urine_color === "transparente"
  ? "Transparente"
  : relatorio.urine_color === "levemente_amarelada"
  ? "Levemente amarelada"
  : relatorio.urine_color === "amarela"
  ? "Amarela"
  : relatorio.urine_color === "muito_amarela"
  ? "Muito amarela"
  : relatorio.urine_color === "turva"
  ? "Turva"
  : "Não informado"}
  </span>
</p>

{/*
  <p className="mt-2 text-sm text-gray-600">
    Pontuação:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.water_score} / 15
    </span>
  </p>
*/}
</div>


<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Atividade física
  </h2>

  <p className="mt-4 text-sm text-gray-600">
  Treino:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.training_applicable === false
      ? "Não se aplica"
      : `${relatorio.training_completed ?? "Não informado"} / ${
          relatorio.training_planned ?? "Não informado"
        }`}
  </span>
</p>

{/*
  <p className="mt-2 text-sm text-gray-600">
    Pontuação do treino:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.training_score} / 10
    </span>
  </p>
*/}

{/*
  <p className="mt-2 text-sm text-gray-600">
  Intensidade do treino:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.training_intensity === "sem_treino"
  ? "Não realizei treino"
  : relatorio.training_intensity === "muito_facil"
  ? "Muito fácil"
  : relatorio.training_intensity === "facil"
  ? "Fácil"
  : relatorio.training_intensity === "relativamente_facil"
  ? "Relativamente fácil"
  : relatorio.training_intensity === "relativamente_cansativo"
  ? "Relativamente cansativo"
  : relatorio.training_intensity === "cansativo"
  ? "Cansativo"
  : relatorio.training_intensity === "muito_cansativo"
  ? "Muito cansativo"
  : relatorio.training_intensity === "exaustivo"
  ? "Exaustivo"
  : "Não informado"}
  </span>
</p>

<p className="mt-2 text-sm text-gray-600">
  Tempo no mesmo programa de treino:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.same_training_time === "1_4_semanas"
  ? "1 a 4 semanas"
  : relatorio.same_training_time === "5_8_semanas"
  ? "5 a 8 semanas"
  : relatorio.same_training_time === "mais_8_semanas"
  ? "Mais de 8 semanas"
  : relatorio.same_training_time === "nao_se_aplica"
  ? "Não se aplica"
  : "Não informado"}
  </span>
</p>
*/}

  <p className="mt-4 text-sm text-gray-600">
  Aeróbico:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.cardio_applicable === false
      ? "Não se aplica"
      : `${relatorio.cardio_completed ?? "Não informado"} / ${
          relatorio.cardio_planned ?? "Não informado"
        }`}
  </span>
</p>

{/*
<p className="mt-2 text-sm text-gray-600">
  Pontuação do aeróbico:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.cardio_score} / 5
  </span>
</p>
*/}

<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Sono
  </h2>

  <p className="mt-4 text-sm text-gray-600">
    Dias atingindo a meta de sono:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.sleep_goal_days ?? "Não informado"} / 7
    </span>
  </p>

<p className="mt-2 text-sm text-gray-600">
  Média de horas de sono por noite:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.sleep_hours != null
      ? `${relatorio.sleep_hours} horas`
      : "Não informado"}
  </span>
</p>
  <p className="mt-2 text-sm text-gray-600">
    Qualidade do sono:{" "}
    <span className="font-semibold text-gray-900">
    {relatorio.sleep_quality === "muito_boa"
  ? "Muito boa"
  : relatorio.sleep_quality === "boa"
  ? "Boa"
  : relatorio.sleep_quality === "normal"
  ? "Normal"
  : relatorio.sleep_quality === "ruim"
  ? "Ruim"
  : relatorio.sleep_quality === "muito_ruim"
  ? "Muito ruim"
  : "Não informado"}
    </span>
  </p>

  <p className="mt-2 text-sm text-gray-600">
  Dificuldade para dormir:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.sleep_difficulty === "nao"
  ? "Não"
  : relatorio.sleep_difficulty === "1_2_dias"
  ? "1 a 2 dias"
  : relatorio.sleep_difficulty === "3_4_dias"
  ? "3 a 4 dias"
  : relatorio.sleep_difficulty === "5_mais_dias"
  ? "5 ou mais dias"
  : "Não informado"}
  </span>
</p>

<p className="mt-2 text-sm text-gray-600">
  Disposição ao acordar:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.wake_disposition === "muito_indisposto"
  ? "Muito indisposto"
  : relatorio.wake_disposition === "indisposto"
  ? "Indisposto"
  : relatorio.wake_disposition === "normal"
  ? "Normal"
  : relatorio.wake_disposition === "disposto"
  ? "Disposto"
  : relatorio.wake_disposition === "muito_disposto"
  ? "Muito disposto"
  : "Não informado"}
  </span>
</p>

{/*
  <p className="mt-2 text-sm text-gray-600">
    Pontuação:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.sleep_score} / 10
    </span>
  </p>
  */}
</div>

</div>

<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Refeições fora do planejamento
  </h2>

  <p className="mt-4 text-sm text-gray-600">
    Quantidade de refeições fora do plano:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.off_plan_count ?? "Não informado"}
    </span>
  </p>

  {relatorio.off_plan_foods && (
  <p className="mt-2 text-sm text-gray-600">
    Alimentos consumidos fora do plano:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.off_plan_foods}
    </span>
  </p>
)}

<p className="mt-2 text-sm text-gray-600">
  Principal motivo:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.off_plan_reason === "nao_se_aplica"
  ? "Não se aplica"
  : relatorio.off_plan_reason === "fome"
  ? "Fome"
  : relatorio.off_plan_reason === "vontade"
  ? "Vontade"
  : relatorio.off_plan_reason === "evento_social"
  ? "Evento social"
  : relatorio.off_plan_reason === "final_semana"
  ? "Final de semana"
  : relatorio.off_plan_reason === "falta_opcao"
  ? "Falta de opção"
  : relatorio.off_plan_reason === "organizacao"
  ? "Falta de organização"
  : relatorio.off_plan_reason === "emocional"
  ? "Motivo emocional"
  : relatorio.off_plan_reason === "viagem_trabalho"
  ? "Viagem / trabalho"
  : relatorio.off_plan_reason === "outro"
  ? "Outro"
  : "Não informado"}
  </span>
</p>
{/*
  <p className="mt-2 text-sm text-gray-600">
    Pontuação:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.off_plan_score} / 15
    </span>
  </p>
  */}

  <p className="mt-2 text-sm text-gray-600">
  Consumo de álcool:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.alcohol_use === "nao"
      ? "Não"
      : relatorio.alcohol_use?.startsWith("sim - ")
      ? `Sim — ${relatorio.alcohol_use.replace("sim - ", "")}`
      : relatorio.alcohol_use === "sim"
      ? "Sim"
      : "Não informado"}
  </span>
</p>
</div>

<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Suplementos e manipulados
  </h2>

  <p className="mt-4 text-sm text-gray-600">
    Dias de uso correto:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.supplements_days ?? "Não informado"} / 7
    </span>
  </p>

  <p className="mt-2 text-sm text-gray-600">
  Motivo do uso incorreto:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.supplements_reason === "nao_se_aplica"
  ? "Não se aplica"
  : relatorio.supplements_reason === "esquecimento"
  ? "Esquecimento"
  : relatorio.supplements_reason === "acabou"
  ? "O suplemento acabou"
  : relatorio.supplements_reason === "nao_comprei"
  ? "Não comprei"
  : relatorio.supplements_reason === "desconforto"
  ? "Desconforto"
  : relatorio.supplements_reason === "horarios"
  ? "Dificuldade com os horários"
  : relatorio.supplements_reason === "decidi_nao_usar"
  ? "Decidi não utilizar"
  : relatorio.supplements_reason === "outro"
  ? "Outro"
  : "Não informado"}
  </span>
</p>
{/*
  <p className="mt-2 text-sm text-gray-600">
    Pontuação:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.supplements_score} / 5
    </span>
  </p>
  */}
</div>

<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Meta individual
  </h2>

  <p className="mt-4 text-sm text-gray-600">
    Meta:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.individual_goal ?? "Não informado"}
    </span>
  </p>

  <p className="mt-2 text-sm text-gray-600">
  Cumprimento da meta:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.individual_goal_completed ?? "Não informado"} de 7 dias
  </span>
</p>

  {relatorio.individual_goal_difficulty && (
  <p className="mt-2 text-sm text-gray-600">
    Dificuldade para cumprir a meta:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.individual_goal_difficulty === "nao"
  ? "Não"
  : relatorio.individual_goal_difficulty}
    </span>
  </p>
)}
{/*
  <p className="mt-2 text-sm text-gray-600">
    Pontuação:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.individual_goal_score} / 10
    </span>
  </p>
  */}
</div>

<div className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Indicadores clínicos
  </h2>

  <p className="mt-4 text-sm text-gray-600">
    Peso:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.weight !== null
        ? `${relatorio.weight.toLocaleString("pt-BR")} kg`
        : "Não informado"}
    </span>
  </p>

  <p className="mt-2 text-sm text-gray-600">
    Consistência das fezes:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.stool_consistency === "tipo_1"
  ? "Tipo 1 — Caroços duros separados"
  : relatorio.stool_consistency === "tipo_2"
  ? "Tipo 2 — Em forma de salsicha, mas com caroços"
  : relatorio.stool_consistency === "tipo_3"
  ? "Tipo 3 — Em forma de salsicha, com fissuras na superfície"
  : relatorio.stool_consistency === "tipo_4"
  ? "Tipo 4 — Lisa, macia e em forma de salsicha"
  : relatorio.stool_consistency === "tipo_5"
  ? "Tipo 5 — Pedaços macios com bordas bem definidas"
  : relatorio.stool_consistency === "tipo_6"
  ? "Tipo 6 — Pedaços fofos, pastosos e com bordas irregulares"
  : relatorio.stool_consistency === "tipo_7"
  ? "Tipo 7 — Líquida, sem pedaços sólidos"
  : "Não informado"}
    </span>
  </p>

{/*
  <p className="mt-2 text-sm text-gray-600">
  Acne / queda de cabelo:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.acne_hair_loss === "normal"
  ? "Não, tudo normal"
  : relatorio.acne_hair_loss === "habitual"
  ? "Sim, mas dentro do que normalmente acontece"
  : relatorio.acne_hair_loss === "aumentou"
  ? "Sim, aumentou significativamente"
  : "Não informado"}
  </span>
</p>

<p className="mt-2 text-sm text-gray-600">
  Libido:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.libido === "baixa"
  ? "Abaixo do meu normal"
  : relatorio.libido === "normal"
  ? "Normal para mim"
  : relatorio.libido === "alta"
  ? "Acima do meu normal"
  : "Não informado"}
  </span>
</p>
*/}

{/*
<p className="mt-2 text-sm text-gray-600">
  Consumo de álcool:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.alcohol_use === "nao"
  ? "Não"
  : relatorio.alcohol_use?.startsWith("sim - ")
  ? `Sim - ${relatorio.alcohol_use.replace("sim - ", "")}`
  : relatorio.alcohol_use === "sim"
  ? "Sim"
  : "Não informado"}
  </span>
</p>
*/}

<p className="mt-2 text-sm text-gray-600">
  Mudança no uso de medicamentos:{" "}
  <span className="font-semibold text-gray-900">
    {relatorio.medication_changes === "nao"
  ? "Não"
  : relatorio.medication_changes?.startsWith("sim - ")
  ? `Sim - ${relatorio.medication_changes.replace("sim - ", "")}`
  : relatorio.medication_changes === "sim"
  ? "Sim"
  : "Não informado"}
  </span>
</p>

{relatorio.general_notes && (
  <div className="mt-4 border-t border-gray-200 pt-4">
    <p className="text-sm text-gray-600">
      <span className="font-semibold text-gray-900">
        Observações do paciente:
      </span>{" "}
      {relatorio.general_notes}
    </p>
  </div>
)}

</div>

  </>
)}

      </main>
    </div>
  );
}
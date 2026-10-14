"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { Button } from "primereact/button";

export default function AlertasPage() {
  const [renovacoes, setRenovacoes] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [alertasPacientes, setAlertasPacientes] = useState<any[]>([]);

  useEffect(() => {
  async function carregarRenovacoes() {
    const { data, error } = await api
      .from("renewal_requests")
      .select(`
        *,
        patients (
          name,
          important_note
        )
      `)
      .eq("status", "pendente")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar renovações:", error);
      setCarregando(false);
      return;
    }

    console.log("RENOVAÇÕES PENDENTES:", data);

    const renovacoesComComentario = await Promise.all(
  (data ?? []).map(async (renovacao) => {
    const { data: ultimoRelatorio } = await api
      .from("patient_reports")
      .select("general_notes")
      .eq("patient_id", renovacao.patient_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      ...renovacao,
      ultimo_comentario: ultimoRelatorio?.general_notes ?? null,
    };
  })
);

    setRenovacoes(renovacoesComComentario);
    setCarregando(false);
  }

async function verificarScoreBaixo() {
  const { data, error } = await api
    .from("patient_reports")
    .select("id, patient_id, adherence_score, created_at")
    .lt("adherence_score", 60)
.not("adherence_score", "is", null)
.order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao verificar scores baixos:", error);
    return;
  }

  const quantidadePorPaciente: Record<string, number> = {};

  (data ?? []).forEach((relatorio) => {
    quantidadePorPaciente[relatorio.patient_id] =
      (quantidadePorPaciente[relatorio.patient_id] ?? 0) + 1;
  });

  const ultimoRelatorioBaixoPorPaciente: Record<string, string> = {};

(data ?? []).forEach((relatorio) => {
  if (!ultimoRelatorioBaixoPorPaciente[relatorio.patient_id]) {
    ultimoRelatorioBaixoPorPaciente[relatorio.patient_id] = relatorio.id;
  }
});

  const pacientesComAlerta = Object.entries(quantidadePorPaciente)
    .filter(([, quantidade]) => quantidade >= 2)
    .map(([patientId]) => patientId);

  console.log(
    "PACIENTES COM 2 SCORES ABAIXO DE 60:",
    pacientesComAlerta
  );

  for (const patientId of pacientesComAlerta) {
  const { data: ultimoAlerta, error: erroBusca } = await api
  .from("patient_alerts")
  .select("id, status, last_report_id")
  .eq("patient_id", patientId)
  .eq("alert_type", "score_baixo")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (erroBusca) {
  console.error("Erro ao verificar alerta existente:", erroBusca);
  continue;
}

if (ultimoAlerta?.status === "pendente") {
  console.log("ALERTA DE SCORE JÁ EXISTE:", patientId);
  continue;
}

if (
  ultimoAlerta?.status === "reconhecido" &&
  ultimoAlerta.last_report_id ===
    ultimoRelatorioBaixoPorPaciente[patientId]
) {
  console.log("SCORE BAIXO JÁ RECONHECIDO:", patientId);
  continue;
}

  const { error: erroCriacao } = await api
    .from("patient_alerts")
    .insert({
      patient_id: patientId,
      alert_type: "score_baixo",
      message: "Paciente possui 2 ou mais relatórios com score abaixo de 60.",
      status: "pendente",
      last_report_id: ultimoRelatorioBaixoPorPaciente[patientId],
    });

  if (erroCriacao) {
    console.error("Erro ao criar alerta de score:", erroCriacao);
    continue;
  }

  console.log("ALERTA DE SCORE CRIADO:", patientId);
}
}
async function carregarAlertasPacientes() {
  const { data, error } = await api
    .from("patient_alerts")
    .select(`
      *,
      patients (
        name
      )
    `)
    .eq("status", "pendente")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao carregar alertas de pacientes:", error);
    return;
  }

  console.log("ALERTAS DE PACIENTES:", data);

  setAlertasPacientes(data ?? []);
}
  
async function verificarAusenciaSemanal() {
  const { data: ciclos, error } = await api
    .from("diet_cycles")
    .select(`
      patient_id,
      start_date,
      patients (
        name,
        plan
      )
    `)
    .eq("status", "ativo");

  if (error) {
    console.error("Erro ao verificar ausência:", error);
    return;
  }

  const ciclosSemanais = (ciclos ?? []).filter(
    (ciclo: any) =>
      ciclo.patients?.plan?.trim().toLowerCase() === "semanal"
  );

  console.log("CICLOS SEMANAIS PARA VERIFICAR:", ciclosSemanais);

  for (const ciclo of ciclosSemanais) {
  const { data: ultimoRelatorio, error: erroRelatorio } = await api
    .from("patient_reports")
    .select("id, created_at")
    .eq("patient_id", ciclo.patient_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (erroRelatorio) {
    console.error("Erro ao buscar último relatório:", erroRelatorio);
    continue;
  }

  const dataReferencia = ultimoRelatorio?.created_at
    ? new Date(ultimoRelatorio.created_at)
    : new Date(ciclo.start_date);

  const agora = new Date();

  const diasSemRelatorio = Math.floor(
    (agora.getTime() - dataReferencia.getTime()) /
      (1000 * 60 * 60 * 24)
  );

  console.log(
    "DIAS SEM RELATÓRIO:",
    (ciclo.patients as any)?.name,
    diasSemRelatorio
  );
  if (diasSemRelatorio < 14) {
  continue;
}

if (diasSemRelatorio >= 14) {

  console.log(
    "PACIENTE COM ALERTA DE AUSÊNCIA:",
    (ciclo.patients as any)?.name,
    dataReferencia
  );

const { data: ultimoAlertaAusencia, error: erroBuscaAusencia } =
  await api
    .from("patient_alerts")
    .select("id, status, reference_date")
    .eq("patient_id", ciclo.patient_id)
    .eq("alert_type", "ausencia_14_dias")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

if (erroBuscaAusencia) {
  console.error(
    "Erro ao verificar alerta de ausência:",
    erroBuscaAusencia
  );
  continue;
}

if (ultimoAlertaAusencia?.status === "pendente") {
  console.log(
    "ALERTA DE AUSÊNCIA JÁ EXISTE:",
    ciclo.patient_id
  );
  continue;
}

if (
  ultimoAlertaAusencia?.status === "reconhecido" &&
  ultimoAlertaAusencia.reference_date &&
  new Date(ultimoAlertaAusencia.reference_date).getTime() ===
    dataReferencia.getTime()
) {
  console.log(
    "AUSÊNCIA JÁ RECONHECIDA:",
    ciclo.patient_id
  );
  continue;
}

const { error: erroCriacaoAusencia } = await api
  .from("patient_alerts")
  .insert({
    patient_id: ciclo.patient_id,
    alert_type: "ausencia_14_dias",
    message: "Paciente está há 14 dias ou mais sem enviar relatório.",
    status: "pendente",
    reference_date: dataReferencia.toISOString(),
  });

if (erroCriacaoAusencia) {
  console.error(
    "Erro ao criar alerta de ausência:",
    erroCriacaoAusencia
  );
  continue;
}
}

console.log(
  "ALERTA DE AUSÊNCIA CRIADO:",
  ciclo.patient_id
);
}
}
carregarRenovacoes();
verificarScoreBaixo();
carregarAlertasPacientes();
verificarAusenciaSemanal();
}, []);

async function aprovarRenovacao(renovacao: any) {
  if (!renovacao?.patient_id || !renovacao?.requested_plan) {
    avisar("Dados da renovação incompletos.");
    return;
  }
  

  console.log("RENOVAÇÃO PARA APROVAR:", renovacao);
  const { data: ultimoCiclo, error: erroUltimoCiclo } = await api
  .from("diet_cycles")
  .select("cycle_number")
  .eq("patient_id", renovacao.patient_id)
  .order("cycle_number", { ascending: false })
  .limit(1)
  .maybeSingle();

if (erroUltimoCiclo) {
  console.error("Erro ao buscar último ciclo:", erroUltimoCiclo);
  avisar("Não foi possível localizar o último ciclo do paciente.");
  return;
}

const proximoNumeroCiclo = (ultimoCiclo?.cycle_number ?? 0) + 1;

console.log("PRÓXIMO CICLO:", proximoNumeroCiclo);
const dataInicio = new Date();
const dataFim = new Date(dataInicio);
dataFim.setMonth(dataFim.getMonth() + 1);

console.log("INÍCIO DO NOVO CICLO:", dataInicio);
console.log("FIM DO NOVO CICLO:", dataFim);

const { error: erroNovoCiclo } = await api
  .from("diet_cycles")
  .insert({
    patient_id: renovacao.patient_id,
    start_date: dataInicio.toISOString().split("T")[0],
    end_date: dataFim.toISOString().split("T")[0],
    followup_frequency: renovacao.requested_plan,
    status: "ativo",
    cycle_number: proximoNumeroCiclo,
    closed_at: null,
  });

if (erroNovoCiclo) {
  console.error("Erro ao criar novo ciclo:", erroNovoCiclo);
  avisar("Não foi possível criar o novo ciclo.");
  return;
}

console.log("NOVO CICLO CRIADO COM SUCESSO");

const { error: erroPlano } = await api
  .from("patients")
  .update({
    plan: renovacao.requested_plan,
  })
  .eq("id", renovacao.patient_id);

if (erroPlano) {
  console.error("Erro ao atualizar plano:", erroPlano);
  avisar("Não foi possível atualizar o plano do paciente.");
  return;
}

console.log("PLANO ATUALIZADO COM SUCESSO");

const { error: erroSolicitacao } = await api
  .from("renewal_requests")
  .update({
    status: "aprovada",
  })
  .eq("id", renovacao.id);

if (erroSolicitacao) {
  console.error("Erro ao concluir solicitação:", erroSolicitacao);
  avisar("Novo ciclo criado, mas houve erro ao concluir a solicitação.");
  return;
}

setRenovacoes((anteriores) =>
  anteriores.filter((item) => item.id !== renovacao.id)
);

avisar("Renovação aprovada com sucesso!");

}

async function reconhecerAlerta(alerta: any) {
  const { error } = await api
    .from("patient_alerts")
    .update({
      status: "reconhecido",
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", alerta.id);

  if (error) {
    console.error("Erro ao reconhecer alerta:", error);
    avisar("Não foi possível concluir o alerta.");
    return;
  }

  setAlertasPacientes((anteriores) =>
    anteriores.filter((item) => item.id !== alerta.id)
  );
}

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold text-gray-900">Alertas</h1>

        <p className="mt-1 text-gray-600">
          Acompanhe renovações e pacientes que precisam de atenção.
        </p>

        {/* RENOVAÇÕES */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">
            Renovações
          </h2>

          {carregando ? (
  <div className="mt-3 cartao p-5">
    <p className="text-sm text-gray-500">
      Carregando renovações...
    </p>
  </div>
) : renovacoes.length === 0 ? (
  <div className="mt-3 cartao p-5">
    <p className="text-sm text-gray-500">
      Nenhuma solicitação de renovação pendente.
    </p>
  </div>
) : (
  <div className="mt-3 space-y-3">
    {renovacoes.map((renovacao) => (
      <div
        key={renovacao.id}
        className="cartao p-5"
      >
        <h3 className="font-semibold text-gray-900">
          {renovacao.patients?.name}
        </h3>

        <p className="mt-2 text-sm text-gray-700">
          <strong>Último peso:</strong>{" "}
          {renovacao.last_weight ?? "Não informado"} kg
        </p>

        <p className="mt-1 text-sm text-gray-700">
          <strong>Plano solicitado:</strong>{" "}
          {renovacao.requested_plan ?? "Não informado"}
        </p>

        <p className="mt-1 text-sm text-gray-700">
          <strong>Observação importante:</strong>{" "}
          {renovacao.patients?.important_note || "Nenhuma"}
        </p>

<p className="mt-1 text-sm text-gray-700">
  <strong>Último comentário do paciente:</strong>{" "}
  {renovacao.ultimo_comentario || "Nenhum comentário"}
</p>

        <Button size="small"
  type="button"
  onClick={() => {
    window.location.href = `/dietas?paciente=${renovacao.patient_id}`;
  }}
  className="mt-4"
>
  Preparar nova dieta
</Button>
      </div>
    ))}
  </div>
)}
        </section>

        {/* PACIENTES QUE PRECISAM DE ATENÇÃO */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900">
            Pacientes que precisam de atenção
          </h2>

          {alertasPacientes.length === 0 ? (
  <div className="mt-3 cartao p-5">
    <p className="text-sm text-gray-500">
      Nenhum alerta no momento.
    </p>
  </div>
) : (
  <div className="mt-3 space-y-3">
    {alertasPacientes.map((alerta) => (
      <div
        key={alerta.id}
        className="cartao p-5"
      >
        <h3 className="font-semibold text-gray-900">
          {alerta.patients?.name}
        </h3>

        <p className="mt-2 text-sm text-gray-700">
          {alerta.message}
        </p>

        <Button severity="secondary" outlined size="small"
          type="button"
          onClick={() => reconhecerAlerta(alerta)}
          className="mt-4"
        >
          OK
        </Button>
      </div>
    ))}
  </div>
)}
        </section>
      </div>
    </main>
  );
}
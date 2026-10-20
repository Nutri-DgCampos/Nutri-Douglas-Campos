"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { Button } from "primereact/button";
import BotaoVoltar from "@/components/BotaoVoltar";
import { Tag } from "primereact/tag";
import ComparativoFotos from "@/components/ComparativoFotos";
import { type PlanoDeTreino, nivelDoTreino, volumePorGrupo } from "@/lib/treino";

type Paciente = {
  id: string;
  name: string;
  phone: string | null;
  objective: string | null;
  plan: string;
  payment_status: string;
  access_expires_at: string | null;
  important_note: string | null;
  created_at: string;
};

type Relatorio = {
  id: string;
  report_date: string;
  adherence_score: number;
  earned_points: number;
  applicable_points: number;
  weight: number | null;
  general_notes: string | null;
  created_at: string;
};

type Ciclo = {
  id: string;
  patient_id: string;
  start_date: string;
  end_date: string;
  followup_frequency: string;
  status: string;
  cycle_number: number;
};

export default function PacientePage() {
  const params = useParams();
  const router = useRouter();

  const [paciente, setPaciente] = useState<Paciente | null>(null);
  const [cicloAtivo, setCicloAtivo] = useState<Ciclo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [treino, setTreino] = useState<{ status: string; plano: PlanoDeTreino | null } | null>(null);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [ativandoPaciente, setAtivandoPaciente] = useState(false);
  async function solicitarReativacao() {
  if (!paciente || ativandoPaciente) return;

  const confirmar = await pedirConfirmacao(
    `Deseja colocar ${paciente.name} na lista de pagamentos para reativação?`
  );

  if (!confirmar) return;

  setAtivandoPaciente(true);

  try {
    // Verifica se já existe pagamento pendente
    const { data: pendente, error: erroConsulta } = await api
      .from("payments")
      .select("id")
      .eq("patient_id", paciente.id)
      .eq("status", "pendente")
      .maybeSingle();

    if (erroConsulta) {
      console.error("Erro ao consultar pagamentos:", erroConsulta);
      avisar("Não foi possível verificar os pagamentos.");
      return;
    }

    // Cria somente se ainda não existir
    if (!pendente) {
      const { error: erroPagamento } = await api
        .from("payments")
        .insert({
          patient_id: paciente.id,
          cycle_id: null,
          status: "pendente",
        });

      if (erroPagamento) {
        console.error("Erro ao criar pagamento:", erroPagamento);
        avisar("Não foi possível incluir o paciente nos pagamentos.");
        return;
      }
    }

    // Registra a solicitação de reativação
    const { error: erroReativacao } = await api
      .from("patients")
      .update({
        reactivation_requested_at: new Date().toISOString(),
      })
      .eq("id", paciente.id);

    if (erroReativacao) {
      console.error("Erro ao registrar reativação:", erroReativacao);
      avisar("Pagamento pendente registrado, mas houve erro na solicitação.");
      return;
    }

    avisar("Paciente incluído na lista de pagamentos com sucesso!");
    router.push("/pagamentos");
  } finally {
    setAtivandoPaciente(false);
  }
}

  useEffect(() => {
    async function buscarPaciente() {
      const { data, error } = await api
        .from("patients")
        .select("*")
        .eq("id", params.id)
        .single();

      if (error) {
        console.error("Erro ao buscar paciente:", error);
        setCarregando(false);
        return;
      }

      setPaciente(data);
      setCarregando(false);
    }

async function buscarCicloAtivo() {
  const { data, error } = await api
    .from("diet_cycles")
    .select("*")
    .eq("patient_id", params.id)
    .eq("status", "ativo")
    .maybeSingle();

  if (error) {
    console.error("Erro ao buscar ciclo ativo:", error);
    return;
  }

  setCicloAtivo(data);
}

    async function buscarTreino() {
  const { data } = await api
    .from("treinos")
    .select("status, plano")
    .eq("patient_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  setTreino(data ?? null);
}

async function buscarRelatorios() {
  const { data, error } = await api
    .from("patient_reports")
    .select("*")
    .eq("patient_id", params.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erro ao buscar relatórios:", error);
    return;
  }

  setRelatorios(data || []);
}

    buscarPaciente();
buscarCicloAtivo();
buscarTreino();
buscarRelatorios();

  }, [params.id]);

  if (carregando) {
    return (
      <div>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <p>Carregando paciente...</p>
        </main>
      </div>
    );
  }

  if (!paciente) {
    return (
      <div>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <h1 className="text-2xl font-bold">Paciente não encontrado</h1>
        </main>
      </div>
    );
  }

  return (
    <div>

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">

          <BotaoVoltar rotulo="Voltar para pacientes" onClick={() => router.push("/pacientes")} />

          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
  <div>
<h1 className="text-3xl font-bold text-gray-900">
      {paciente.name}
    </h1>

    <p className="mt-2 text-gray-600">
      Informações e acompanhamento do paciente.
    </p>
  </div>

  <div className="flex flex-wrap gap-2">
  <Button icon="pi pi-th-large"
    type="button"
    label="Módulo de Nutrição"
    onClick={() => router.push(`/nutricao/${paciente.id}`)}
  />
  <Button icon="pi pi-plus" outlined
    type="button"
    onClick={() => router.push(`/pacientes/${paciente.id}/evolucao`)}
   
  >
  Registrar evolução
</Button>
<Button outlined
  type="button"
  onClick={solicitarReativacao}
  disabled={
    ativandoPaciente ||
    !paciente.access_expires_at ||
    new Date(paciente.access_expires_at).getTime() +
      15 * 24 * 60 * 60 * 1000 >
      Date.now()
  }
 
>
  {ativandoPaciente ? "Solicitando..." : "Ativar paciente"}
</Button>

  <Button outlined icon="pi pi-pencil"
    type="button"
    onClick={() => router.push(`/pacientes/${paciente.id}/editar`)}
   
  >
    Editar paciente
  </Button>
</div>
</div>

{cicloAtivo && (
  <div className="mb-6 rounded-2xl border border-primary-100 bg-primary-50 p-5">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-primary-600">
          Ciclo de acompanhamento
        </p>

        <p className="mt-1 text-lg font-bold text-gray-900">
          Ciclo {cicloAtivo.cycle_number}
        </p>
      </div>

      <Tag value="Ativo" severity="success" className="selo-status" />
    </div>
  </div>
)}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">

            <Card
              titulo="Telefone"
              valor={paciente.phone || "Não informado"}
            />

            <Card
              titulo="Objetivo"
              valor={paciente.objective || "Não informado"}
            />

            <Card
              titulo="Plano"
              valor={paciente.plan}
            />

            <Card
              titulo="Status do pagamento"
              valor={paciente.payment_status}
            />

            <Card
              titulo="Data do cadastro"
              valor={new Date(paciente.created_at).toLocaleDateString("pt-BR")}
            />

            <Card
              titulo="Treino"
              valor={
                !treino
                  ? "Não enviado"
                  : treino.status === "concluido" && treino.plano
                    ? nivelDoTreino(volumePorGrupo(treino.plano)).nivel ?? "Ver treino"
                    : treino.status === "falhou"
                      ? "Leitura falhou"
                      : "Em leitura"
              }
              onClick={treino ? () => router.push(`/pacientes/${paciente.id}/treino`) : undefined}
            />

          </div>

          <section className="mt-6 cartao p-5 lg:p-6">
            <h2 className="text-xl font-bold text-gray-900">
              Lembrete importante
            </h2>

            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <p className="text-gray-700">
                {paciente.important_note || "Nenhum lembrete cadastrado."}
              </p>
            </div>
          </section>
          <ComparativoFotos pacienteId={paciente.id} />

<section className="mt-6 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Histórico de relatórios
  </h2>

  <p className="mt-1 text-sm text-gray-500">
    Acompanhe os relatórios de acompanhamento do paciente.
  </p>

  <div className="mt-6">
  {relatorios.length === 0 ? (
    <div className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
      Nenhum relatório registrado.
    </div>
  ) : (
  <div className="space-y-3">
  {relatorios.map((relatorio) => (
    <div
      key={relatorio.id}
      className="rounded-xl border border-gray-200 p-4"
    >
         <p className="mb-2 text-sm font-medium text-gray-700">
  Relatório de{" "}
{new Date(relatorio.created_at).toLocaleDateString("pt-BR")}
</p>

      <p className="text-sm text-gray-500">
        Score de Adesão
      </p>

           <p className="mt-1 text-2xl font-bold text-primary-600">
        {relatorio.adherence_score} / 100
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

      {relatorio.weight !== null && (
  <p className="mt-3 text-sm text-gray-600">
    Peso:{" "}
    <span className="font-semibold text-gray-900">
      {relatorio.weight.toLocaleString("pt-BR")} kg
    </span>
  </p>
)}

{relatorio.general_notes && (
  <p className="mt-3 text-sm text-gray-600">
    <span className="font-semibold text-gray-900">
      Observações:
    </span>{" "}
    {relatorio.general_notes}
  </p>
)}

<Button size="small"
  type="button"
  onClick={() =>
    router.push(`/pacientes/${paciente.id}/relatorio/${relatorio.id}`)
  }
  className="mt-4"
>
  Ver relatório
</Button>

    </div>
  ))}
</div>
)}
</div>

</section>

        </div>
      </main>
    </div>
  );
}

function Card({
  titulo,
  valor,
  onClick,
}: {
  titulo: string;
  valor: string;
  onClick?: () => void;
}) {
  const conteudo = (
    <>
      <span className="block text-sm text-gray-500">
        {titulo}
      </span>

      <span className="mt-1 block break-words font-semibold text-gray-900 lg:text-lg">
        {valor}
      </span>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="cartao flex items-start justify-between gap-2 p-4 text-left transition-colors hover:border-primary-700 lg:p-5"
      >
        <span className="min-w-0">{conteudo}</span>
        <i className="pi pi-chevron-right mt-1 text-gray-400" aria-hidden />
      </button>
    );
  }

  return (
    <div className="cartao p-4 lg:p-5">
      {conteudo}
    </div>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import Selecao from "@/components/Selecao";
import { InputTextarea } from "primereact/inputtextarea";
import BotaoVoltar from "@/components/BotaoVoltar";
import AcessoDoPaciente from "@/components/AcessoDoPaciente";

export default function EditarPaciente() {
  const params = useParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [objective, setObjective] = useState("");
  const [plan, setPlan] = useState("Semanal");
  const [paymentStatus, setPaymentStatus] = useState("Ativo");
  const [importantNote, setImportantNote] = useState("");
  const [initialWeight, setInitialWeight] = useState("");
  const [trainingWeeklyGoal, setTrainingWeeklyGoal] = useState("0");
  const [cardioWeeklyGoal, setCardioWeeklyGoal] = useState("0");
  const [individualGoal, setIndividualGoal] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const id = params.id as string;

  useEffect(() => {
    async function carregarPaciente() {
      const { data, error } = await api
        .from("patients")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        setErro("Não foi possível carregar o paciente.");
        setCarregando(false);
        return;
      }

      setName(data.name ?? "");
      setPhone(data.phone ?? "");
      setObjective(data.objective ?? "");
      setPlan(data.plan ?? "Semanal");
      setPaymentStatus(data.payment_status ?? "Ativo");
      setImportantNote(data.important_note ?? "");
      setInitialWeight(
  data.initial_weight == null ? "" : String(data.initial_weight)
);

setTrainingWeeklyGoal(
  data.training_weekly_goal == null ? "0" : String(data.training_weekly_goal)
);

setCardioWeeklyGoal(
  data.cardio_weekly_goal == null ? "0" : String(data.cardio_weekly_goal)
);

setIndividualGoal(
  data.individual_goal ??
    "Planejar e organizar as refeições do dia seguinte com antecedência."
);

      setCarregando(false);
    }

    carregarPaciente();
  }, [id]);

  async function salvarPaciente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSalvando(true);
    setErro("");

    const { error } = await api
      .from("patients")
      .update({
        name,
        phone,
        objective,
        plan,
        payment_status: paymentStatus,
        important_note: importantNote,
        initial_weight:
  initialWeight === "" ? null : Number(initialWeight),
  training_weekly_goal: Number(trainingWeeklyGoal),
  cardio_weekly_goal: Number(cardioWeeklyGoal),
  individual_goal: individualGoal.trim() === "" ? null : individualGoal.trim(),
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      setErro("Não foi possível salvar as alterações.");
      setSalvando(false);
      return;
    }

    router.push(`/pacientes/${id}`);
    router.refresh();
  }
  if (carregando) {
    return (
      <div>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <p>Carregando paciente...</p>
        </main>
      </div>
    );
  }

  return (
    <div>

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">

          <BotaoVoltar rotulo="Voltar para o paciente" onClick={() => router.push(`/pacientes/${id}`)} />

          <div className="mb-8">
<h1 className="text-3xl font-bold text-gray-900">
              Editar paciente
            </h1>

            <p className="mt-2 text-gray-600">
              Atualize as informações do paciente.
            </p>
          </div>

<AcessoDoPaciente pacienteId={id} nome={name} />

          <form
            onSubmit={salvarPaciente}
            className="cartao p-5 lg:p-8"
          >
            <div className="grid gap-6 md:grid-cols-2">

              <Campo
                titulo="Nome completo"
                valor={name}
                alterar={setName}
              />

              <Campo
                titulo="Telefone"
                valor={phone}
                alterar={setPhone}
              />

              <Campo
  titulo="Peso inicial (kg)"
  valor={initialWeight}
  alterar={setInitialWeight}
/>

<Campo
  titulo="Treinos por semana"
  valor={trainingWeeklyGoal}
  alterar={setTrainingWeeklyGoal}
/>

<Campo
  titulo="Aeróbicos por semana"
  valor={cardioWeeklyGoal}
  alterar={setCardioWeeklyGoal}
/>

<Campo
  titulo="Meta individual"
  valor={individualGoal}
  alterar={setIndividualGoal}
/>

              <Campo
                titulo="Objetivo"
                valor={objective}
                alterar={setObjective}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Plano contratado
                </label>

                <Selecao
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full"
                >
                  <option value="Semanal">Semanal</option>
                  <option value="Quinzenal">Quinzenal</option>
                  <option value="Mensal">Mensal</option>
                </Selecao>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Status do pagamento
                </label>

                <Selecao
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Cancelado">Cancelado</option>
                </Selecao>
              </div>

            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Lembrete importante
              </label>

              <InputTextarea autoResize
                value={importantNote}
                onChange={(e) => setImportantNote(e.target.value)}
                rows={4}
                className="w-full"
              />
            </div>

            {erro && (
              <p className="mt-4 text-sm font-medium text-red-600">
                {erro}
              </p>
            )}

            <div className="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6">

              <Button severity="secondary" outlined
                type="button"
                onClick={() => router.push(`/pacientes/${id}`)}
               
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={salvando}
               
              >
                {salvando ? "Salvando..." : "Salvar alterações"}
              </Button>

            </div>
          </form>

        </div>
      </main>
    </div>
  );
}

function Campo({
  titulo,
  valor,
  alterar,
}: {
  titulo: string;
  valor: string;
  alterar: (valor: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {titulo}
      </label>

      <InputText
        type="text"
        value={valor}
        onChange={(e) => alterar(e.target.value)}
        className="w-full"
      />
    </div>
  );
}
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { api } from "@/lib/api";

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
  const [mostrarRedefinirSenha, setMostrarRedefinirSenha] = useState(false);
const [novaSenha, setNovaSenha] = useState("");
const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false);
const [redefinindoSenha, setRedefinindoSenha] = useState(false);
const [erroSenha, setErroSenha] = useState("");
const [sucessoSenha, setSucessoSenha] = useState("");

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
async function redefinirSenhaPaciente() {
  setErroSenha("");
  setSucessoSenha("");

  if (novaSenha.length < 6) {
    setErroSenha("A nova senha deve ter pelo menos 6 caracteres.");
    return;
  }

  const confirmado = window.confirm(
    "Deseja realmente redefinir a senha deste paciente? A senha anterior deixará de funcionar."
  );

  if (!confirmado) return;

  setRedefinindoSenha(true);

  try {
    const {
      data: { session },
      error: erroSessao,
    } = await api.auth.getSession();

    if (erroSessao || !session) {
      throw new Error("Sua sessão expirou. Entre novamente no sistema.");
    }

    const resposta = await fetch("/api/acesso-paciente", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        acao: "redefinir_senha",
        pacienteId: id,
        senha: novaSenha,
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      throw new Error(
        resultado.erro || "Não foi possível redefinir a senha."
      );
    }

    setSucessoSenha("Senha redefinida com sucesso!");
    setNovaSenha("");
    setMostrarNovaSenha(false);
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);

    setErroSenha(
      error instanceof Error
        ? error.message
        : "Ocorreu um erro ao redefinir a senha."
    );
  } finally {
    setRedefinindoSenha(false);
  }
}
  if (carregando) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />

        <main className="flex-1 p-8">
          <p>Carregando paciente...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 p-8">
        <div className="mx-auto max-w-5xl">

          <button
            type="button"
            onClick={() => router.push(`/pacientes/${id}`)}
            className="mb-6 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            ← Voltar para o paciente
          </button>

          <div className="mb-8">
            <p className="text-sm font-medium text-blue-600">
              Paciente
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Editar paciente
            </h1>

            <p className="mt-2 text-gray-600">
              Atualize as informações do paciente.
            </p>
          </div>

<div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
  <button
    type="button"
    onClick={() => {
      setMostrarRedefinirSenha(!mostrarRedefinirSenha);
      setErroSenha("");
      setSucessoSenha("");
    }}
    className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
  >
    🔑 Redefinir senha do paciente
  </button>

  {mostrarRedefinirSenha && (
    <div className="mt-5">
      <p className="mb-3 text-sm text-gray-600">
        Informe uma nova senha provisória para este paciente.
      </p>

      <div className="flex max-w-md gap-2">
        <input
          type={mostrarNovaSenha ? "text" : "password"}
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          placeholder="Nova senha (mínimo 6 caracteres)"
          autoComplete="new-password"
          className="min-w-0 flex-1 rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
        />

        <button
          type="button"
          onClick={() => setMostrarNovaSenha(!mostrarNovaSenha)}
          className="rounded-xl border border-gray-300 px-3 text-sm text-gray-700"
        >
          {mostrarNovaSenha ? "Ocultar" : "Mostrar"}
        </button>
      </div>

      {erroSenha && (
        <p className="mt-3 text-sm text-red-600">{erroSenha}</p>
      )}

      {sucessoSenha && (
        <p className="mt-3 text-sm text-green-700">{sucessoSenha}</p>
      )}

      <p className="mt-3 text-xs text-gray-500">
        A nova senha substituirá a senha anterior após a confirmação.
      </p>

      <button
  type="button"
  onClick={redefinirSenhaPaciente}
  disabled={redefinindoSenha || novaSenha.length < 6}
  className="mt-4 rounded-xl bg-orange-600 px-5 py-3 font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
>
  {redefinindoSenha ? "Redefinindo..." : "Confirmar nova senha"}
</button>
    </div>
  )}
</div>
          <form
            onSubmit={salvarPaciente}
            className="rounded-2xl bg-white p-8 shadow-sm"
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

                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                >
                  <option value="Semanal">Semanal</option>
                  <option value="Quinzenal">Quinzenal</option>
                  <option value="Mensal">Mensal</option>
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Status do pagamento
                </label>

                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </div>

            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Lembrete importante
              </label>

              <textarea
                value={importantNote}
                onChange={(e) => setImportantNote(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
              />
            </div>

            {erro && (
              <p className="mt-4 text-sm font-medium text-red-600">
                {erro}
              </p>
            )}

            <div className="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6">

              <button
                type="button"
                onClick={() => router.push(`/pacientes/${id}`)}
                className="rounded-xl border border-gray-300 px-5 py-3 font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={salvando}
                className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {salvando ? "Salvando..." : "Salvar alterações"}
              </button>

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

      <input
        type="text"
        value={valor}
        onChange={(e) => alterar(e.target.value)}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
      />
    </div>
  );
}
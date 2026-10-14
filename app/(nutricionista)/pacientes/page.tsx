"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function PacientesPage() {
    const [pacientes, setPacientes] = useState<any[]>([]);
const [busca, setBusca] = useState("");

const [solicitacoes, setSolicitacoes] = useState<
  {
    id: string;
    name: string;
    phone: string;
    objective: string;
    status: string;
    created_at: string;
  }[]
>([]);

const [carregandoSolicitacoes, setCarregandoSolicitacoes] =
  useState(false);

const router = useRouter();

async function concluirSolicitacao(id: string) {
  const confirmou = window.confirm(
    "Você já cadastrou este paciente? A solicitação será marcada como concluída."
  );

  if (!confirmou) return;

  try {
    const {
      data: { session },
    } = await api.auth.getSession();

    if (!session) {
      alert("Sua sessão expirou. Entre novamente.");
      return;
    }

    const resposta = await fetch(
      "/api/solicitacoes-pacientes/concluir",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      }
    );

    const resultado = await resposta.json();

    if (!resposta.ok) {
      alert(resultado.erro || "Não foi possível concluir a solicitação.");
      return;
    }

    setSolicitacoes((anteriores) =>
      anteriores.filter((solicitacao) => solicitacao.id !== id)
    );

    alert("Solicitação concluída com sucesso!");
  } catch (error) {
    console.error("Erro ao concluir solicitação:", error);
    alert("Erro de conexão. Tente novamente.");
  }
}

    useEffect(() => {
  async function carregarPacientes() {
    const {
  data: { user },
} = await api.auth.getUser();

if (!user) {
  router.push("/login");
  return;
}

const { data: pacienteLogado } = await api
  .from("patients")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();

if (pacienteLogado) {
  router.push("/area-paciente");
  return;
}
    const { data, error } = await api
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar pacientes:", error);
      return;
    }

    setPacientes(data ?? []);

    setCarregandoSolicitacoes(true);

try {
  const {
    data: { session },
  } = await api.auth.getSession();

  if (!session) {
    console.error("Sessão não encontrada.");
  } else {
    const resposta = await fetch("/api/solicitacoes-pacientes", {
      method: "GET",
      cache: "no-store",
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      console.error(
        "Erro ao carregar solicitações:",
        resultado.erro
      );
    } else {
      setSolicitacoes(resultado.solicitacoes ?? []);
    }
  }
} catch (error) {
  console.error("Erro ao consultar solicitações:", error);
} finally {
  setCarregandoSolicitacoes(false);
}
  }

  carregarPacientes();
}, []);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Pacientes
        </h1>

        <p className="mt-2 text-gray-600">
          Gerencie seus pacientes.
        </p>

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
  <h2 className="text-xl font-bold text-gray-900">
    Solicitações de novos pacientes
  </h2>

  <p className="mt-2 text-sm text-gray-600">
    Pessoas que solicitaram acompanhamento e ainda não foram cadastradas.
  </p>

  {carregandoSolicitacoes ? (
    <p className="mt-4 text-gray-500">
      Carregando solicitações...
    </p>
  ) : solicitacoes.length === 0 ? (
    <p className="mt-4 text-gray-500">
      Nenhuma solicitação pendente.
    </p>
  ) : (
    <div className="mt-5 space-y-3">
      {solicitacoes.map((solicitacao) => (
        <div
          key={solicitacao.id}
          className="rounded-xl border border-gray-200 bg-gray-50 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-gray-900">
                {solicitacao.name}
              </p>

              <p className="mt-1 text-sm text-gray-700">
                Telefone: {solicitacao.phone}
              </p>

              <p className="mt-1 text-sm text-gray-700">
                Objetivo: {solicitacao.objective}
              </p>
            </div>

            <div className="flex flex-col items-end gap-3">
  <span className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-800">
    Pendente
  </span>

  <button
    type="button"
    onClick={() => concluirSolicitacao(solicitacao.id)}
    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
  >
    Marcar como concluído
  </button>
</div>
          </div>
        </div>
      ))}
    </div>
  )}
</section>

        <input
  type="text"
  placeholder="Buscar paciente pelo nome..."
  value={busca}
  onChange={(e) => setBusca(e.target.value)}
  className="mt-6 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
/>

        <div className="mt-8 space-y-3">
  {pacientes
  .filter((paciente) =>
    paciente.name
      ?.toLowerCase()
      .includes(busca.toLowerCase())
  )
  .map((paciente) => (
    <div
      key={paciente.id}
       className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
    >
      <div>
      <p className="font-semibold text-gray-900">
        {paciente.name}
      </p>

      <p className="mt-1 text-sm text-gray-600">
  {paciente.objective}
</p>

<p className="mt-1 text-xs text-gray-500">
  {paciente.plan} · Pagamento: {paciente.payment_status}
</p>
</div>

<button
  onClick={() => router.push(`/pacientes/${paciente.id}`)}
  className="ml-4 cursor-pointer whitespace-nowrap text-blue-600 hover:underline"
>
  Ver paciente →
</button>
    </div>
  ))}
</div>

      </main>
    </div>
  );
}
"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";

export default function PacientesPage() {
    const [pacientes, setPacientes] = useState<any[]>([]);
    const [busca, setBusca] = useState("");
    const router = useRouter();

    useEffect(() => {
  async function carregarPacientes() {
    const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) {
  router.push("/login");
  return;
}

const { data: pacienteLogado } = await supabase
  .from("patients")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();

if (pacienteLogado) {
  router.push("/area-paciente");
  return;
}
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar pacientes:", error);
      return;
    }

    setPacientes(data ?? []);
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
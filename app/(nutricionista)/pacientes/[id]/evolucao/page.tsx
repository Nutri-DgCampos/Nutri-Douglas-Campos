"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";

export default function EvolucaoPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [nomePaciente, setNomePaciente] = useState("");
  const [peso, setPeso] = useState("");
  const [data, setData] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [observacoes, setObservacoes] = useState("");

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregarPaciente() {
      const { data, error } = await supabase
        .from("patients")
        .select("name")
        .eq("id", id)
        .single();

      if (error) {
        setErro("Não foi possível carregar o paciente.");
        setCarregando(false);
        return;
      }

      setNomePaciente(data.name);
      setCarregando(false);
    }

    if (id) {
      carregarPaciente();
    }
  }, [id]);

  async function salvarEvolucao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!peso) {
      setErro("Informe o peso do paciente.");
      return;
    }

    setSalvando(true);
    setErro("");

    const pesoConvertido = Number(peso.replace(",", "."));

    if (Number.isNaN(pesoConvertido) || pesoConvertido <= 0) {
      setErro("Informe um peso válido.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase
      .from("patient_progress")
      .insert({
        patient_id: id,
        weight: pesoConvertido,
        measured_at: data,
        notes: observacoes.trim() || null,
      });

    if (error) {
      console.error(error);
      setErro("Não foi possível salvar a evolução.");
      setSalvando(false);
      return;
    }

    router.push(`/pacientes/${id}`);
    router.refresh();
  }

  if (carregando) {
    return (
      <div className="flex min-h-screen bg-gray-100">
        <Sidebar />

        <main className="flex-1 p-8">
          <div className="mx-auto max-w-4xl">
            <p className="text-gray-600">Carregando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 p-8">
        <div className="mx-auto max-w-4xl">

          <button
            type="button"
            onClick={() => router.push(`/pacientes/${id}`)}
            className="mb-6 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            ← Voltar para o paciente
          </button>

          <header className="mb-8">
            <p className="text-sm font-medium text-blue-600">
              Evolução
            </p>

            <h1 className="mt-1 text-3xl font-bold text-gray-900">
              Registrar evolução
            </h1>

            <p className="mt-2 text-gray-600">
              {nomePaciente}
            </p>
          </header>

          <form
            onSubmit={salvarEvolucao}
            className="rounded-2xl bg-white p-8 shadow-sm"
          >
            {erro && (
              <div className="mb-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {erro}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2">

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Data da avaliação
                </label>

                <input
                  type="date"
                  value={data}
                  onChange={(event) => setData(event.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Peso (kg)
                </label>

                <input
                  type="text"
                  inputMode="decimal"
                  value={peso}
                  onChange={(event) => setPeso(event.target.value)}
                  placeholder="Ex.: 82,5"
                  required
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
                />
              </div>

            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Observações
              </label>

              <textarea
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Ex.: Paciente apresentou boa adesão ao plano alimentar."
                rows={5}
                className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
              />
            </div>

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
                className="rounded-xl bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {salvando ? "Salvando..." : "Salvar evolução"}
              </button>

            </div>
          </form>

        </div>
      </main>
    </div>
  );
}
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import BotaoVoltar from "@/components/BotaoVoltar";

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
      const { data, error } = await api
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

    const { error } = await api
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
      <div>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <div className="mx-auto max-w-4xl">
            <p className="text-gray-600">Carregando...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div>

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-4xl">

          <BotaoVoltar rotulo="Voltar para o paciente" onClick={() => router.push(`/pacientes/${id}`)} />

          <header className="mb-8">
<h1 className="text-3xl font-bold text-gray-900">
              Registrar evolução
            </h1>

            <p className="mt-2 text-gray-600">
              {nomePaciente}
            </p>
          </header>

          <form
            onSubmit={salvarEvolucao}
            className="cartao p-5 lg:p-8"
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

                <InputText
                  type="date"
                  value={data}
                  onChange={(event) => setData(event.target.value)}
                  required
                  className="w-full"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Peso (kg)
                </label>

                <InputText
                  type="text"
                  inputMode="decimal"
                  value={peso}
                  onChange={(event) => setPeso(event.target.value)}
                  placeholder="Ex.: 82,5"
                  required
                  className="w-full"
                />
              </div>

            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Observações
              </label>

              <InputTextarea autoResize
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Ex.: Paciente apresentou boa adesão ao plano alimentar."
                rows={5}
                className="w-full"
              />
            </div>

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
                {salvando ? "Salvando..." : "Salvar evolução"}
              </Button>

            </div>
          </form>

        </div>
      </main>
    </div>
  );
}
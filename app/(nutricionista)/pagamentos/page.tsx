
"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";




type PacienteRelacionado = {
  name: string;
  payment_status: string;
  access_expires_at: string | null;
  reactivation_requested_at: string | null;
};

type CicloRelacionado = {
  patient_id: string;
  patients: PacienteRelacionado | PacienteRelacionado[] | null;
};

type Pagamento = {
  id: string;
  patient_id: string | null;
  cycle_id: string | null;
  status: string;
  receipt_file_path: string | null;
  receipt_uploaded_at: string | null;
  diet_cycles: CicloRelacionado | CicloRelacionado[] | null;
  patients: PacienteRelacionado | PacienteRelacionado[] | null;
};




export default function PagamentosPage() {
    
  async function confirmarPagamento(pagamentoId: string) {
    const confirmar = window.confirm(
      "Deseja confirmar o recebimento deste pagamento?"
    );

    if (!confirmar) return;

    const { data, error } = await api
      .from("payments")
      .update({
        status: "confirmado",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", pagamentoId)
      .eq("status", "comprovante_enviado")
      .select("id");

    if (error || !data || data.length !== 1) {
      console.error(error);
      alert("Não foi possível confirmar o pagamento.");
      return;
    }

    setPagamentos((anteriores) =>
      anteriores.filter(
        (pagamento) => pagamento.id !== pagamentoId
      )
    );

    alert("Pagamento confirmado com sucesso!");
  }

    
  async function abrirComprovante(caminho: string | null) {
    if (!caminho) {
      alert("Comprovante não encontrado.");
      return;
    }

    const { data, error } = await api.storage
      .from("comprovantes")
      .createSignedUrl(caminho, 60);

    if (error || !data?.signedUrl) {
      console.error(error);
      alert("Não foi possível abrir o comprovante.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function confirmarPagamentoDinheiro(pagamentoId: string) {
    const confirmar = window.confirm(
      "Você recebeu este pagamento em dinheiro? Deseja confirmar?"
    );

    if (!confirmar) return;

    const { data, error } = await api
      .from("payments")
      .update({
        status: "confirmado",
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", pagamentoId)
      .eq("status", "pendente")
      .is("receipt_file_path", null)
      .select("id");

    if (error || !data || data.length !== 1) {
      console.error(error);
      alert("Não foi possível confirmar o pagamento em dinheiro.");
      return;
    }

    setPagamentos((anteriores) =>
      anteriores.filter(
        (pagamento) => pagamento.id !== pagamentoId
      )
    );

    alert("Pagamento em dinheiro confirmado com sucesso!");
  }

  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    async function carregarPagamentos() {
      setCarregando(true);

      
const { data, error } = await api
  .from("payments")
  .select(`
  id,
  patient_id,
  cycle_id,
  status,
  receipt_file_path,
  receipt_uploaded_at,
  patients (
    name,
    payment_status,
    access_expires_at,
    reactivation_requested_at
  ),
  diet_cycles (
    patient_id,
    patients (
      name,
      payment_status,
      access_expires_at,
      reactivation_requested_at
    )
  )
`)
  .order("receipt_uploaded_at", { ascending: false });


      if (error) {
        console.error(error);
        setErro("Erro ao carregar os pagamentos.");
      } else {
        

setPagamentos(data ?? []);

      }

      setCarregando(false);
    }

    carregarPagamentos();
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Pagamentos
        </h1>

        <p className="mt-2 text-gray-600">
          Gerencie os comprovantes de pagamento dos pacientes.
        </p>

        <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Comprovantes aguardando conferência
          </h2>

          {carregando ? (
            <p className="mt-3 text-sm text-gray-500">
              Carregando pagamentos...
            </p>
          ) : erro ? (
            <p className="mt-3 text-sm text-red-600">
              {erro}
            </p>
          ) : pagamentos.filter(
  (pagamento) => pagamento.status === "comprovante_enviado"
).length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">
              Nenhum comprovante aguardando conferência.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {pagamentos
  .filter((pagamento) => pagamento.status === "comprovante_enviado")
  .map((pagamento) => (
                <div
                  key={pagamento.id}
                  className="rounded-xl border border-gray-200 p-4"
                >
                  
<p className="text-sm font-semibold text-gray-900">
  Paciente:{" "}


{(() => {
  const pacientes = pagamento.patients;

  const paciente = Array.isArray(pacientes)
    ? pacientes[0]
    : pacientes;

  return paciente?.name ?? "Paciente não identificado";
})()}



</p>


                  
<p className="mt-1 text-sm text-gray-500">
  Enviado em:{" "}
  {pagamento.receipt_uploaded_at
    ? new Date(
        pagamento.receipt_uploaded_at
      ).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Data não informada"}
</p>

<p className="mt-1 text-sm font-medium text-orange-600">
  Aguardando conferência
</p>


{pagamento.status === "comprovante_enviado" ? (
  <>
    <button
      type="button"
      onClick={() =>
        abrirComprovante(pagamento.receipt_file_path)
      }
      className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
    >
      Ver comprovante
    </button>

    <button
      type="button"
      onClick={() => confirmarPagamento(pagamento.id)}
      className="ml-3 mt-3 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
    >
      ✓ OK
    </button>
  </>
) : pagamento.status === "pendente" ? (
  <button
    type="button"
    onClick={() => confirmarPagamentoDinheiro(pagamento.id)}
    className="mt-3 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
  >
    💵 Recebi em dinheiro
  </button>
) : null}



                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
  <h2 className="text-lg font-bold text-gray-900">
    Pagamentos pendentes
  </h2>

  {carregando ? (
    <p className="mt-3 text-sm text-gray-500">
      Carregando pagamentos...
    </p>
  ) : erro ? (
    <p className="mt-3 text-sm text-red-600">
      {erro}
    </p>
  ) : pagamentos.filter(
      (pagamento) => {
  const relacionados = pagamento.patients;
  const paciente = Array.isArray(relacionados)
    ? relacionados[0]
    : relacionados;

  if (!paciente) return false;

  const carenciaTerminou =
    paciente.access_expires_at !== null &&
    new Date(paciente.access_expires_at).getTime() +
      15 * 24 * 60 * 60 * 1000 <=
      Date.now();

  return (
    pagamento.status === "pendente" &&
    (
      paciente.reactivation_requested_at !== null ||
      (
        paciente.payment_status !== "Inativo" &&
        !carenciaTerminou
      )
    )
  );
}
    ).length === 0 ? (
    <p className="mt-3 text-sm text-gray-500">
      Nenhum pagamento pendente.
    </p>
  ) : (
    <div className="mt-4 space-y-3">
      {pagamentos
        .filter((pagamento) => pagamento.status === "pendente")
        .map((pagamento) => {
          const pacientes = pagamento.patients;

const paciente = Array.isArray(pacientes)
  ? pacientes[0]
  : pacientes;

          return (
            <div
              key={pagamento.id}
              className="rounded-xl border border-gray-200 p-4"
            >
              <p className="text-sm font-semibold text-gray-900">
                Paciente: {paciente?.name ?? "Paciente não identificado"}
              </p>

              <p className="mt-1 text-sm font-medium text-orange-600">
                Pagamento pendente
              </p>

              <button
                type="button"
                onClick={() => confirmarPagamentoDinheiro(pagamento.id)}
                className="mt-3 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
              >
                💵 Recebi em dinheiro
              </button>
            </div>
          );
        })}
    </div>
  )}
</div>
      </main>
    </div>
  );
}

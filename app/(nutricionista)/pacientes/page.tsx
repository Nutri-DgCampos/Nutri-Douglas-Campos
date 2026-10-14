"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { Button } from "primereact/button";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import CabecalhoPagina from "@/components/CabecalhoPagina";

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
  const confirmou = await pedirConfirmacao(
    "Você já cadastrou este paciente? A solicitação será marcada como concluída."
  );

  if (!confirmou) return;

  try {
    const {
      data: { session },
    } = await api.auth.getSession();

    if (!session) {
      avisar("Sua sessão expirou. Entre novamente.");
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
      avisar(resultado.erro || "Não foi possível concluir a solicitação.");
      return;
    }

    setSolicitacoes((anteriores) =>
      anteriores.filter((solicitacao) => solicitacao.id !== id)
    );

    avisar("Solicitação concluída com sucesso!");
  } catch (error) {
    console.error("Erro ao concluir solicitação:", error);
    avisar("Erro de conexão. Tente novamente.");
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

  const pacientesFiltrados = pacientes.filter((paciente) =>
    paciente.name?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <CabecalhoPagina
          titulo="Pacientes"
          descricao="Gerencie seus pacientes."
          acao={
            <Button
              type="button"
              label="Novo paciente"
              icon="pi pi-plus"
              onClick={() => router.push("/pacientes/novo")}
            />
          }
        />

        {(carregandoSolicitacoes || solicitacoes.length > 0) && (
          <section className="cartao mt-6 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">
                Solicitações de novos pacientes
              </h2>

              {solicitacoes.length > 0 && (
                <Tag value={String(solicitacoes.length)} severity="warning" rounded />
              )}
            </div>

            <p className="mt-1 text-sm text-gray-600">
              Pessoas que solicitaram acompanhamento e ainda não foram
              cadastradas.
            </p>

            {carregandoSolicitacoes ? (
              <Skeleton height="4rem" borderRadius="12px" className="mt-4" />
            ) : (
              <ul className="mt-4 divide-y divide-gray-200">
                {solicitacoes.map((solicitacao) => (
                  <li
                    key={solicitacao.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {solicitacao.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Telefone: {solicitacao.phone}
                      </p>
                      <p className="text-sm text-gray-600">
                        Objetivo: {solicitacao.objective}
                      </p>
                    </div>

                    <Button
                      type="button"
                      label="Marcar como concluído"
                      icon="pi pi-check"
                      size="small"
                      outlined
                      onClick={() => concluirSolicitacao(solicitacao.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <IconField iconPosition="left" className="mt-6">
          <InputIcon className="pi pi-search" />
          <InputText
            type="search"
            placeholder="Buscar paciente pelo nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full"
          />
        </IconField>

        <ul className="cartao mt-4 divide-y divide-gray-200">
          {pacientesFiltrados.map((paciente) => (
            <li key={paciente.id}>
              <button
                type="button"
                onClick={() => router.push(`/pacientes/${paciente.id}`)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 sm:gap-4"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 font-[family-name:var(--fonte-titulo)] font-bold text-primary-800"
                  aria-hidden
                >
                  {(paciente.name ?? "?")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((parte: string) => parte[0]?.toUpperCase())
                    .join("")}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-gray-900 sm:truncate">
                    {paciente.name}
                  </span>
                  <span className="block truncate text-sm text-gray-500">
                    {[paciente.objective, `Plano ${String(paciente.plan ?? "").toLowerCase()}`]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </span>

                <Tag
                  value={paciente.payment_status}
                  severity={
                    paciente.payment_status === "Ativo"
                      ? "success"
                      : paciente.payment_status === "Pendente"
                      ? "warning"
                      : "danger"
                  }
                  className="selo-status"
                />

                <i className="pi pi-chevron-right text-sm text-gray-400" aria-hidden />
              </button>
            </li>
          ))}

          {pacientesFiltrados.length === 0 && (
            <li className="p-6 text-center text-gray-500">
              {pacientes.length === 0
                ? "Nenhum paciente cadastrado ainda."
                : "Nenhum paciente encontrado com esse nome."}
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}

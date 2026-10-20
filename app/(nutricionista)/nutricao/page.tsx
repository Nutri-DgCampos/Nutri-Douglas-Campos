"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { api } from "@/lib/api";

type Paciente = { id: string; name: string; objective: string | null; plan: string };

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Início do Módulo de Nutrição: pesquisa dos pacientes já cadastrados.
// Novos pacientes continuam sendo cadastrados em Pacientes.
export default function ModuloNutricaoPage() {
  const router = useRouter();
  const [pacientes, setPacientes] = useState<Paciente[] | null>(null);
  const [emAndamento, setEmAndamento] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");

  useEffect(() => {
    Promise.all([
      api.from("patients").select("id, name, objective, plan").order("name", { ascending: true }),
      api.from("consultas").select("patient_id").eq("status", "em_andamento"),
    ]).then(([lista, consultas]) => {
      if (lista.error) console.error("Erro ao carregar pacientes:", lista.error);
      setPacientes((lista.data ?? []) as Paciente[]);
      setEmAndamento(new Set((consultas.data ?? []).map((c: { patient_id: string }) => c.patient_id)));
    });
  }, []);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return (pacientes ?? []).filter((paciente) => !termo || semAcento(paciente.name).includes(termo));
  }, [pacientes, busca]);

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <CabecalhoPagina
          titulo="Módulo de Nutrição"
          descricao="Consultas, avaliações e elaboração de dietas dos pacientes cadastrados."
          acao={
            <Button
              type="button"
              icon="pi pi-cog"
              label="Configurações"
              outlined
              onClick={() => router.push("/nutricao/configuracoes")}
            />
          }
        />

        <IconField iconPosition="left" className="mt-6">
          <InputIcon className="pi pi-search" />
          <InputText
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar paciente pelo nome"
            className="w-full"
            autoFocus
          />
        </IconField>

        <section className="cartao mt-4 overflow-hidden">
          {pacientes === null ? (
            <div className="space-y-2 p-4">
              <Skeleton height="2.5rem" />
              <Skeleton height="2.5rem" />
              <Skeleton height="2.5rem" />
            </div>
          ) : filtrados.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">
              Nenhum paciente encontrado. Novos pacientes são cadastrados em{" "}
              <Link href="/pacientes" className="font-semibold text-primary-700 underline">
                Pacientes
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filtrados.map((paciente) => (
                <li key={paciente.id}>
                  <Link
                    href={`/nutricao/${paciente.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-primary-50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-gray-900">{paciente.name}</span>
                      <span className="block truncate text-sm text-gray-500">
                        {[paciente.objective, paciente.plan].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {emAndamento.has(paciente.id) && (
                      <Tag value="Consulta em andamento" severity="info" className="selo-status" />
                    )}
                    <i className="pi pi-chevron-right text-gray-400" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}

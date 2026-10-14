"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "primereact/skeleton";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { api } from "@/lib/api";

type Parceiro = {
  id: string;
  nome: string;
  contato: string | null;
  descricao: string | null;
};

// Parceiros cadastrados pelo nutricionista.
export default function ParceirosPacientePage() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .from("parceiros")
      .select("id, nome, contato, descricao")
      .order("nome", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("Erro ao carregar parceiros:", error);
        setParceiros(data ?? []);
        setCarregando(false);
      });
  }, []);

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina
          titulo="Parceiros"
          descricao="Benefícios e contatos indicados pelo seu nutricionista."
        />

        {carregando ? (
          <div className="mt-6 space-y-3">
            <Skeleton height="6rem" borderRadius="16px" />
            <Skeleton height="6rem" borderRadius="16px" />
          </div>
        ) : parceiros.length === 0 ? (
          <div className="cartao mt-6 p-6 text-center">
            <i className="pi pi-briefcase text-3xl text-gray-400" aria-hidden />
            <p className="mt-3 font-semibold text-gray-900">Em breve, novos parceiros.</p>
            <p className="mt-1 text-sm text-gray-500">
              Você terá acesso a benefícios e condições especiais oferecidos
              pelos nossos parceiros.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {parceiros.map((parceiro) => (
              <li key={parceiro.id} className="cartao p-5">
                <h2 className="text-lg font-bold text-gray-900">{parceiro.nome}</h2>

                {parceiro.contato && (
                  <p className="mt-1 flex items-center gap-2 text-sm font-medium text-primary-800">
                    <i className="pi pi-phone" aria-hidden />
                    {parceiro.contato}
                  </p>
                )}

                {parceiro.descricao && (
                  <p className="mt-2 whitespace-pre-line text-sm text-gray-600">
                    {parceiro.descricao}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

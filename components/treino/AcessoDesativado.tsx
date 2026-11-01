"use client";

import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { api } from "@/lib/api";

// Conta sem acesso ao Módulo de Treino (por exemplo, educador desativado).
export default function AcessoDesativado() {
  const router = useRouter();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="cartao max-w-md p-6 text-center">
        <i className="pi pi-lock text-3xl text-gray-400" aria-hidden />
        <p className="mt-3 font-semibold text-gray-900">Seu acesso ao Módulo de Treino está desativado.</p>
        <p className="mt-1 text-sm text-gray-600">Fale com o administrador para reativar.</p>
        <Button
          type="button"
          label="Sair"
          icon="pi pi-sign-out"
          className="mt-4"
          onClick={async () => {
            await api.auth.signOut();
            router.push("/login");
          }}
        />
      </div>
    </main>
  );
}

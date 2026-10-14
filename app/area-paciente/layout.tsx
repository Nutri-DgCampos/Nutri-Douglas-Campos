"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NavegacaoPaciente } from "@/components/Navegacao";
import { api } from "@/lib/api";

export default function AreaPacienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    // Sem sessão não há o que mostrar: volta para o login.
    api.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
      } else if (user.deveTrocarSenha) {
        router.replace("/trocar-senha");
      }
    });
  }, [router]);

  return (
    <div className="estrutura-paciente">
      {children}
      <NavegacaoPaciente />
    </div>
  );
}

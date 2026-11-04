"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NavegacaoPaciente } from "@/components/Navegacao";
import RegistrarAcesso from "@/components/RegistrarAcesso";
import { api } from "@/lib/api";

// Aluno próprio de educador físico (T7b) usa só estas telas.
const TELAS_DO_ALUNO_DO_TREINO = ["/area-paciente", "/area-paciente/treino", "/area-paciente/relatorios"];
const SOMENTE_TREINO = "area-paciente:somente-treino";

export default function AreaPacienteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const caminho = usePathname();
  const [somenteTreino, setSomenteTreino] = useState(false);

  useEffect(() => {
    // Sem sessão não há o que mostrar: volta para o login. Sem internet (T5),
    // fica: o "Meu treino" abre com a cópia guardada no aparelho.
    api.auth.getUser().then(({ data: { user }, error }) => {
      if (error?.code === "REDE") {
        try {
          setSomenteTreino(localStorage.getItem(SOMENTE_TREINO) === "1");
        } catch {
          // Sem armazenamento: menu completo.
        }
        return;
      }
      if (!user) {
        router.replace("/login");
      } else if (user.deveTrocarSenha) {
        router.replace("/trocar-senha");
      } else {
        setSomenteTreino(user.somenteTreino);
        try {
          localStorage.setItem(SOMENTE_TREINO, user.somenteTreino ? "1" : "0");
        } catch {
          // Preferência visual apenas.
        }
      }
    });
  }, [router]);

  useEffect(() => {
    if (somenteTreino && !TELAS_DO_ALUNO_DO_TREINO.includes(caminho)) {
      router.replace("/area-paciente");
    }
  }, [somenteTreino, caminho, router]);

  return (
    <div className="estrutura-paciente">
      <RegistrarAcesso />
      {children}
      <NavegacaoPaciente somenteTreino={somenteTreino} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { NavegacaoNutri } from "@/components/Navegacao";
import { obterContexto } from "@/lib/servidor/sessao";

// Área do nutricionista. Quem pode entrar é decidido no servidor, antes de
// qualquer conteúdo aparecer: o paciente vai direto para a área dele (o
// aplicativo instalado abre em "/", que é a tela inicial do nutricionista).
export default async function NutricionistaLayout({ children }: { children: React.ReactNode }) {
  const contexto = await obterContexto({ permitirSenhaProvisoria: true });

  if (!contexto) redirect("/login");
  if (contexto.deveTrocarSenha) redirect("/trocar-senha");
  if (contexto.pacienteId) redirect("/area-paciente");

  return (
    <div className="estrutura-nutri">
      <NavegacaoNutri />
      <div className="estrutura-nutri__conteudo">{children}</div>
    </div>
  );
}

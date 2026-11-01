import { redirect } from "next/navigation";
import { NavegacaoNutri } from "@/components/Navegacao";
import { obterContexto } from "@/lib/servidor/sessao";
import { profissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import AcessoDesativado from "@/components/treino/AcessoDesativado";

// Módulo de Treino: nutricionista (administrador) e educadores físicos ativos.
// Quem entra é decidido no servidor; as rotas da API conferem de novo.
export default async function TreinoLayout({ children }: { children: React.ReactNode }) {
  const contexto = await obterContexto({ permitirSenhaProvisoria: true });

  if (!contexto) redirect("/login");
  if (contexto.deveTrocarSenha) redirect("/trocar-senha");
  if (contexto.pacienteId) redirect("/area-paciente");

  const profissional = await profissionalDeTreino(contexto);
  if (!profissional) return <AcessoDesativado />;

  return (
    <div className="estrutura-nutri">
      <NavegacaoNutri perfil={profissional.admin ? "admin" : "educador"} />
      <div className="estrutura-nutri__conteudo">{children}</div>
    </div>
  );
}

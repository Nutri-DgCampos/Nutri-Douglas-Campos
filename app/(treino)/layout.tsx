import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NavegacaoNutri } from "@/components/Navegacao";
import { obterPool } from "@/lib/servidor/banco";
import { obterContexto } from "@/lib/servidor/sessao";
import { profissionalDeTreino } from "@/lib/servidor/treinoAcesso";
import AcessoDesativado from "@/components/treino/AcessoDesativado";

// Título da janela (barra superior do app instalado = document.title): para o
// educador físico, "Olá, <nome do educador conectado>" (SPEC de correções
// 10/11, item 004). Nutricionista e paciente continuam com o título original.
// Calculado no servidor a cada sessão: nunca mostra o nome de outra sessão.
export async function generateMetadata(): Promise<Metadata> {
  const contexto = await obterContexto({ permitirSenhaProvisoria: true });
  const profissional = contexto ? await profissionalDeTreino(contexto) : null;
  if (!profissional || profissional.admin) return {};
  const r = await obterPool().query<{ nome: string }>("select nome from public.educadores_fisicos where usuario_id = $1", [profissional.usuarioId]);
  const nome = r.rows[0]?.nome?.trim();
  return nome ? { title: `Olá, ${nome}` } : {};
}

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

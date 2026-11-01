import { redirect } from "next/navigation";
import { abrirAviso } from "@/lib/servidor/avisos";
import { obterContexto } from "@/lib/servidor/sessao";
import { profissionalDeTreino } from "@/lib/servidor/treinoAcesso";

// Abre um aviso do sino ou do push: exige login (volta para cá depois),
// marca só este aviso como lido e leva ao conteúdo. O link em si não mostra
// nada protegido.
export default async function AbrirAvisoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/");

  const contexto = await obterContexto();
  if (!contexto) redirect(`/login?voltar=${encodeURIComponent(`/avisos/${id}`)}`);

  const profissional = await profissionalDeTreino(contexto);
  if (!profissional) redirect("/");

  const destino = await abrirAviso(profissional.usuarioId, id);
  redirect(destino ?? "/");
}

import { redirect } from "next/navigation";

// O treino do paciente agora fica no Módulo de Treino (painel geral do aluno).
export default async function TreinoDoPacientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/treino/alunos/${id}?de=ficha`);
}

import { obterPool } from "./banco";
import { recusar } from "./http";
import type { Contexto } from "./permissoes";

// Pacientes da clínica × alunos próprios de educadores físicos (T7b).
//
// Aluno cadastrado por um educador (patients.educador_dono_id preenchido) é
// invisível ao nutricionista: nenhuma rota da Nutrição lê ou grava os dados
// dele, mesmo recebendo o id direto. E ele, na Área do Paciente, só usa o
// Treino.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pacienteDaClinica(id: unknown) {
  if (typeof id !== "string" || !UUID.test(id)) return false;
  const r = await obterPool().query("select 1 from public.patients where id = $1 and educador_dono_id is null", [id]);
  return (r.rowCount ?? 0) > 0;
}

// Para as rotas da Nutrição usadas pelo paciente: o aluno próprio não chega nelas.
export function recusarAlunoDoTreino(contexto: Pick<Contexto, "somenteTreino">) {
  return contexto.somenteTreino ? recusar("Disponível somente para pacientes do acompanhamento nutricional.", 403) : null;
}

import { origemPermitida, recusar } from "./http";
import { obterContexto } from "./sessao";

// Paciente conectado (rotas do Treino na Área do Paciente). Vale para o
// paciente da clínica e para o aluno próprio do educador (T7b).
export async function alunoConectado(request: Request) {
  if (!origemPermitida(request)) return recusar("Origem não permitida.", 403);
  const contexto = await obterContexto();
  if (!contexto) return recusar("Usuário não autenticado.", 401);
  if (!contexto.pacienteId) return recusar("Somente pacientes.", 403);
  return contexto.pacienteId;
}

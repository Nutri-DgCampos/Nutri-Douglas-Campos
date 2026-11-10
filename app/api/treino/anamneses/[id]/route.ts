import { rotaDelete, rotaGet, rotaPatch, rotaPut } from "@/lib/servidor/formulariosNutricionista";
import { ACESSO_TREINO } from "@/lib/servidor/treinoFormularios";

export const runtime = "nodejs";

// Ficha de anamnese no Treino: as mesmas rotas da Nutrição, com a regra do
// Treino (só o autor altera; quem acompanha o aluno lê as preenchidas).
export const GET = rotaGet("anamnese", ACESSO_TREINO);
export const PUT = rotaPut("anamnese", ACESSO_TREINO);
export const PATCH = rotaPatch("anamnese", ACESSO_TREINO);
export const DELETE = rotaDelete("anamnese", ACESSO_TREINO);

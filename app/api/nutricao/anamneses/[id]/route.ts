import { rotaDelete, rotaGet, rotaPatch, rotaPut } from "@/lib/servidor/formulariosNutricionista";

export const runtime = "nodejs";

// Ficha de anamnese: abrir, salvar, mudar a situação e excluir rascunho.
export const GET = rotaGet("anamnese");
export const PUT = rotaPut("anamnese");
export const PATCH = rotaPatch("anamnese");
export const DELETE = rotaDelete("anamnese");

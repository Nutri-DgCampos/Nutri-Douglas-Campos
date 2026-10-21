import { rotaDelete, rotaGet, rotaPatch, rotaPut } from "@/lib/servidor/formulariosNutricionista";

export const runtime = "nodejs";

// Recordatório alimentar: abrir, salvar, mudar a situação e excluir rascunho.
export const GET = rotaGet("recordatorio");
export const PUT = rotaPut("recordatorio");
export const PATCH = rotaPatch("recordatorio");
export const DELETE = rotaDelete("recordatorio");

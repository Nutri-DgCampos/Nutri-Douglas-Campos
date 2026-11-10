import { rotaPdf } from "@/lib/servidor/pdfDoFormulario";
import { ACESSO_TREINO } from "@/lib/servidor/treinoFormularios";

export const runtime = "nodejs";

export const GET = rotaPdf("anamnese", ACESSO_TREINO);

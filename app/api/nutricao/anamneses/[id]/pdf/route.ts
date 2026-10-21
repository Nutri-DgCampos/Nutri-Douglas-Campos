import { rotaPdf } from "@/lib/servidor/pdfDoFormulario";

export const runtime = "nodejs";

export const GET = rotaPdf("anamnese");

import OpenAI from "openai";
import { CAMPOS_BIOIMPEDANCIA, type CampoBio } from "@/lib/nutricao/avaliacao";
import { lerArquivo } from "./arquivos";
import { registrarUsoDaIa } from "./ia";

// Leitura do PDF de bioimpedância por IA. Só extrai: o nutricionista confere
// e confirma cada valor antes de ir para a avaliação (nada é aplicado sozinho).

const INSTRUCOES = `
Você lê o laudo de um exame de bioimpedância anexado e extrai os resultados.
Regras:
- Copie somente valores que estão escritos no laudo. Se um campo não aparece ou está ilegível, use null.
- Não calcule, não estime e não converta valores. Use ponto como separador decimal.
- Se o laudo tiver mais de uma medição, use a mais recente.
- Para água corporal, informe a unidade usada no laudo (por exemplo "L", "kg" ou "%").
- Para gordura visceral, informe a escala ou unidade do equipamento (por exemplo "nível 1–59", "cm²", "kg").
- Para massa visceral, informe a unidade usada no laudo.
- Em "observacoes", cite em uma frase o equipamento ou a data do exame, se aparecerem.
`.trim();

const CAMPOS = Object.keys(CAMPOS_BIOIMPEDANCIA) as CampoBio[];

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: [...CAMPOS, "agua_unidade", "gordura_visceral_escala", "massa_visceral_unidade", "observacoes"],
  properties: {
    ...Object.fromEntries(CAMPOS.map((c) => [c, { type: ["number", "null"] }])),
    agua_unidade: { type: ["string", "null"] },
    gordura_visceral_escala: { type: ["string", "null"] },
    massa_visceral_unidade: { type: ["string", "null"] },
    observacoes: { type: ["string", "null"] },
  },
} as const;

export type LeituraBioimpedancia = {
  valores: Partial<Record<CampoBio, number | null>>;
  aguaUnidade: string | null;
  gorduraVisceralEscala: string | null;
  massaVisceralUnidade: string | null;
  observacoes: string | null;
};

export async function lerPdfDeBioimpedancia(destino: string, nome: string, pacienteId: string | null = null): Promise<LeituraBioimpedancia> {
  if (!process.env.OPENAI_API_KEY) throw new Error("A chave da OpenAI não está configurada no servidor.");

  const base64 = (await lerArquivo(destino)).toString("base64");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const resposta = await openai.responses.create({
    model: "gpt-5.4-mini",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: INSTRUCOES },
          { type: "input_file", filename: nome, file_data: `data:application/pdf;base64,${base64}` },
        ],
      },
    ],
    text: { format: { type: "json_schema", name: "bioimpedancia", strict: true, schema: ESQUEMA } },
  });

  void registrarUsoDaIa({ recurso: "bioimpedancia", modelo: "gpt-5.4-mini", uso: resposta.usage, pacienteId });
  const dados = JSON.parse(resposta.output_text) as Record<string, unknown>;
  const valores: Partial<Record<CampoBio, number | null>> = {};
  for (const campo of CAMPOS) {
    const v = dados[campo];
    valores[campo] = typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000 ? v : null;
  }
  const textoOuNulo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null);

  return {
    valores,
    aguaUnidade: textoOuNulo(dados.agua_unidade),
    gorduraVisceralEscala: textoOuNulo(dados.gordura_visceral_escala),
    massaVisceralUnidade: textoOuNulo(dados.massa_visceral_unidade),
    observacoes: textoOuNulo(dados.observacoes),
  };
}

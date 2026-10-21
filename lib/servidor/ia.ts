import OpenAI from "openai";
import { LIMITE_DIARIO_DA_IA } from "@/lib/nutricao/assistente";
import { obterPool } from "./banco";

// Uso da IA (OpenAI): registro de cada chamada e limite diário de pedidos.
//
// - O registro guarda recurso, modelo, tokens e paciente; nunca o conteúdo
//   enviado. É a base do futuro painel de uso e custo.
// - O limite (validação 7.7: 200 pedidos por dia, no horário de Brasília)
//   vale para os recursos da Fase 7: assistente do editor e resumo da
//   anamnese. Os recursos anteriores só registram (validação 7.5).
// - IA_SIMULADA=1 (só para testes locais): nenhuma chamada sai do servidor.

export type RecursoDaIa = "assistente_dieta" | "resumo_anamnese" | "exame" | "treino" | "bioimpedancia" | "devolutiva";

const COM_LIMITE: RecursoDaIa[] = ["assistente_dieta", "resumo_anamnese"];

export const MODELO_PADRAO = "gpt-5.4-mini";

export function modeloDoAssistente() {
  return process.env.OPENAI_MODELO_ASSISTENTE?.trim() || MODELO_PADRAO;
}

export function iaSimulada() {
  return process.env.IA_SIMULADA === "1" && process.env.NODE_ENV !== "production";
}

export function iaDisponivel() {
  return iaSimulada() || Boolean(process.env.OPENAI_API_KEY);
}

export function clienteDaIa() {
  if (!process.env.OPENAI_API_KEY) throw new Error("A chave da OpenAI não está configurada no servidor.");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

type UsoDaResposta = { input_tokens?: number; output_tokens?: number } | null | undefined;

export async function registrarUsoDaIa(registro: {
  recurso: RecursoDaIa;
  modelo: string;
  uso?: UsoDaResposta;
  sucesso?: boolean;
  pacienteId?: string | null;
  usuarioId?: string | null;
}) {
  try {
    await obterPool().query(
      `insert into public.ia_uso (recurso, modelo, tokens_entrada, tokens_saida, sucesso, patient_id, usuario_id)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        registro.recurso,
        registro.modelo,
        registro.uso?.input_tokens ?? null,
        registro.uso?.output_tokens ?? null,
        registro.sucesso ?? true,
        registro.pacienteId ?? null,
        registro.usuarioId ?? null,
      ]
    );
  } catch (erro) {
    // O registro nunca impede o recurso de funcionar.
    console.error("Erro ao registrar uso da IA:", erro);
  }
}

// Pedidos de hoje (Brasília) que contam para o limite.
export async function pedidosDeHoje() {
  const resultado = await obterPool().query<{ total: string }>(
    `select count(*) as total from public.ia_uso
      where recurso = any($1::text[])
        and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date`,
    [COM_LIMITE]
  );
  return Number(resultado.rows[0]?.total ?? 0);
}

export async function situacaoDoLimite() {
  const hoje = await pedidosDeHoje();
  return { hoje, limite: LIMITE_DIARIO_DA_IA, restantes: Math.max(0, LIMITE_DIARIO_DA_IA - hoje) };
}

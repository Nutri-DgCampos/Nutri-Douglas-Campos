import type { PoolClient } from "pg";
import type { Sexo } from "@/lib/nutricao/avaliacao";
import { calcularAvaliacao, type AvaliacaoDoc, type ResultadoAvaliacao } from "@/lib/nutricao/avaliacaoDocumento";
import { idadeEm } from "@/lib/nutricao/paciente";
import { obterPool } from "./banco";

// Leitura das avaliações físicas (Fase 4).

export type LinhaAvaliacao = {
  id: string;
  patient_id: string;
  consulta_id: string;
  data: string;
  status: "rascunho" | "finalizada";
  documento: AvaliacaoDoc;
  resultados: ResultadoAvaliacao | null;
  revisao: number;
  finalizada_em: string | null;
  criada_em: string;
};

const COLUNAS = `id, patient_id, consulta_id, to_char(data, 'YYYY-MM-DD') as data, status, documento,
                 resultados, revisao, finalizada_em, criada_em`;

export async function buscarAvaliacao(id: string, cliente?: PoolClient, bloquear = false) {
  const resultado = await (cliente ?? obterPool()).query<LinhaAvaliacao>(
    `select ${COLUNAS} from public.avaliacoes_fisicas where id = $1 ${bloquear ? "for update" : ""}`,
    [id]
  );
  return resultado.rows[0] ?? null;
}

export async function pessoaDoPaciente(pacienteId: string) {
  const resultado = await obterPool().query<{
    name: string;
    birth_date: string | null;
    sex: Sexo | null;
    height_cm: string | null;
  }>(
    "select name, to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, height_cm::text from public.patients where id = $1",
    [pacienteId]
  );
  const p = resultado.rows[0];
  if (!p) return null;
  return { nome: p.name, nascimento: p.birth_date, sexo: p.sex, alturaCm: p.height_cm === null ? null : Number(p.height_cm) };
}

// Resultados de uma avaliação: congelados se finalizada; senão, calculados
// agora (preliminares).
export function resultadosDe(avaliacao: LinhaAvaliacao, pessoa: { sexo: Sexo | null; nascimento: string | null }) {
  if (avaliacao.status === "finalizada" && avaliacao.resultados) return avaliacao.resultados;
  return calcularAvaliacao(avaliacao.documento, { sexo: pessoa.sexo, idade: idadeEm(pessoa.nascimento, avaliacao.data) });
}

export type PontoDoHistorico = {
  id: string;
  data: string;
  status: string;
  peso: number | null;
  percentualGordura: number | null;
  massaGorda: number | null;
  massaLivre: number | null;
  metodo: "dobras" | "bioimpedancia" | null;
  perimetria: AvaliacaoDoc["perimetria"];
};

// Histórico até a avaliação indicada (nunca com avaliações posteriores):
// as finalizadas e a própria avaliação, mesmo em rascunho.
export async function historicoAte(avaliacao: LinhaAvaliacao, pessoa: { sexo: Sexo | null; nascimento: string | null }) {
  const resultado = await obterPool().query<LinhaAvaliacao>(
    `select ${COLUNAS} from public.avaliacoes_fisicas
      where patient_id = $1
        and (id = $2 or (status = 'finalizada' and (data < $3 or (data = $3 and criada_em <= $4))))
      order by data, criada_em`,
    [avaliacao.patient_id, avaliacao.id, avaliacao.data, avaliacao.criada_em]
  );

  return resultado.rows.map((linha): PontoDoHistorico => {
    const r = resultadosDe(linha, pessoa);
    return {
      id: linha.id,
      data: linha.data,
      status: linha.status,
      peso: linha.documento.peso,
      percentualGordura: r.percentualGordura,
      massaGorda: r.massaGorda,
      massaLivre: r.massaLivre,
      metodo: r.metodoComposicao,
      perimetria: linha.documento.perimetria ?? {},
    };
  });
}

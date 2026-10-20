import type { PoolClient } from "pg";
import { alimentosDoDocumento, documentoVazio, type DocumentoDieta } from "@/lib/nutricao/dieta";
import { ORIGENS_DE_PESO, idadeEm } from "@/lib/nutricao/paciente";
import { composicoes } from "./alimentos";
import { obterPool } from "./banco";

// Leitura e gravação das dietas do editor (Módulo de Nutrição, Fase 2).

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type LinhaDieta = {
  id: string;
  patient_id: string;
  consulta_id: string;
  ordem: number;
  rascunho: DocumentoDieta;
  rascunho_em: string;
  salvo: DocumentoDieta | null;
  salvo_em: string | null;
  revisao: number;
  arquivada_em: string | null;
  criada_em: string;
};

const COLUNAS = `id, patient_id, consulta_id, ordem, rascunho, rascunho_em, salvo, salvo_em,
                 revisao, arquivada_em, criada_em`;

export async function buscarDieta(id: string, cliente?: PoolClient, bloquear = false) {
  const resultado = await (cliente ?? obterPool()).query<LinhaDieta>(
    `select ${COLUNAS} from public.dietas where id = $1 ${bloquear ? "for update" : ""}`,
    [id]
  );
  return resultado.rows[0] ?? null;
}

// Resumo das versões enviadas de uma ou mais dietas.
export async function versoesDasDietas(ids: string[]) {
  if (ids.length === 0) return [];
  const resultado = await obterPool().query<{
    id: string;
    dieta_id: string;
    numero: number;
    modelo_pdf: string;
    novo_ciclo: boolean;
    enviada_em: string;
    entrega_id: string;
    arquivo: string | null;
  }>(
    `select v.id, v.dieta_id, v.numero, v.modelo_pdf, v.novo_ciclo, v.enviada_em, v.entrega_id,
            (select f.storage_path from public.diet_delivery_files f
              where f.delivery_id = v.entrega_id order by f.created_at limit 1) as arquivo
       from public.dietas_versoes v
      where v.dieta_id = any($1::uuid[])
      order by v.dieta_id, v.numero desc`,
    [ids]
  );
  return resultado.rows;
}

export async function dadosDoPaciente(pacienteId: string) {
  const resultado = await obterPool().query<{
    id: string;
    name: string;
    birth_date: string | null;
    sex: string | null;
    height_cm: string | null;
    objective: string | null;
    important_note: string | null;
    plan: string;
  }>(
    `select id, name, to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, height_cm::text,
            objective, important_note, plan
       from public.patients where id = $1`,
    [pacienteId]
  );
  const linha = resultado.rows[0];
  if (!linha) return null;
  return { ...linha, height_cm: linha.height_cm === null ? null : Number(linha.height_cm) };
}

// Peso mais recente do histórico unificado (cadastro, evoluções, relatórios),
// sugerido como peso de referência de uma dieta nova.
export async function pesoMaisRecente(pacienteId: string) {
  const resultado = await obterPool().query<{ peso: string; data: string; origem: string }>(
    `select peso::text, to_char(data, 'YYYY-MM-DD') as data, origem
       from public.historico_peso
      where patient_id = $1 and peso > 0
      order by data desc, origem desc
      limit 1`,
    [pacienteId]
  );
  const linha = resultado.rows[0];
  if (!linha) return null;
  return { valor: Number(linha.peso), data: linha.data, origem: ORIGENS_DE_PESO[linha.origem] ?? linha.origem };
}

export async function novoDocumento(pacienteId: string, titulo: string) {
  const [paciente, peso, preferencias] = await Promise.all([
    dadosDoPaciente(pacienteId),
    pesoMaisRecente(pacienteId),
    obterPool().query<{ nutrientes_painel: string[] }>(
      "select nutrientes_painel from public.configuracoes_documentos where id = 1"
    ),
  ]);

  // O objetivo do cadastro é só a sugestão inicial; a dieta tem o seu.
  const documento = documentoVazio(titulo, paciente?.objective?.trim() ?? "");
  if (peso) documento.pesoReferencia = { valor: peso.valor, origem: peso.origem, data: peso.data };
  documento.nutrientesAcompanhados = preferencias.rows[0]?.nutrientes_painel ?? [];
  return documento;
}

// ---------------------------------------------------------------------------
// Alimentos usados no editor: composição, medidas e substituições cadastradas.

export type DadosDoAlimento = {
  id: string;
  nome: string;
  fonte: string;
  unidade_base: "g" | "ml";
  arquivado: boolean;
  medidas: { id: string; nome_singular: string; nome_plural: string; quantidade: number; padrao: boolean }[];
  substituicoes: {
    substituto_id: string;
    quantidade_referencia: number;
    quantidade_substituto: number;
    medida_caseira_id: string | null;
    quantidade_medidas: number | null;
  }[];
};

export async function dadosDosAlimentos(ids: string[]) {
  const unicos = [...new Set(ids)].filter((id) => UUID.test(id)).slice(0, 500);
  if (unicos.length === 0) return { alimentos: {}, composicoes: {} };

  const pool = obterPool();
  const [alimentos, medidas, substituicoes] = await Promise.all([
    pool.query<Omit<DadosDoAlimento, "medidas" | "substituicoes">>(
      "select id, nome, fonte, unidade_base, arquivado from public.alimentos where id = any($1::uuid[])",
      [unicos]
    ),
    pool.query<DadosDoAlimento["medidas"][number] & { alimento_id: string }>(
      `select id, alimento_id, nome_singular, nome_plural, quantidade::float as quantidade, padrao
         from public.medidas_caseiras where alimento_id = any($1::uuid[])
        order by padrao desc, ordem, created_at`,
      [unicos]
    ),
    pool.query<DadosDoAlimento["substituicoes"][number] & { alimento_id: string }>(
      `select alimento_id, substituto_id, quantidade_referencia::float as quantidade_referencia,
              quantidade_substituto::float as quantidade_substituto, medida_caseira_id,
              quantidade_medidas::float as quantidade_medidas
         from public.substituicoes where alimento_id = any($1::uuid[])
        order by ordem, created_at`,
      [unicos]
    ),
  ]);

  const mapa: Record<string, DadosDoAlimento> = {};
  for (const alimento of alimentos.rows) mapa[alimento.id] = { ...alimento, medidas: [], substituicoes: [] };
  for (const { alimento_id, ...medida } of medidas.rows) mapa[alimento_id]?.medidas.push(medida);
  for (const { alimento_id, ...sub } of substituicoes.rows) mapa[alimento_id]?.substituicoes.push(sub);

  return { alimentos: mapa, composicoes: await composicoes(Object.keys(mapa)) };
}

// ---------------------------------------------------------------------------
// Gravação

export type ResultadoGravacao =
  | { ok: true; linha: LinhaDieta }
  | { ok: false; status: number; erro: string; linha?: LinhaDieta };

// Grava o rascunho (e, se pedido, também como última versão salva), desde
// que ninguém tenha gravado outra revisão no meio do caminho.
export async function gravarDieta(
  id: string,
  documento: DocumentoDieta,
  revisaoEsperada: number,
  salvar: boolean
): Promise<ResultadoGravacao> {
  const resultado = await obterPool().query<LinhaDieta>(
    `update public.dietas
        set rascunho = $2, rascunho_em = now(), revisao = revisao + 1
            ${salvar ? ", salvo = $2, salvo_em = now()" : ""}
      where id = $1 and revisao = $3 and arquivada_em is null
      returning ${COLUNAS}`,
    [id, JSON.stringify(documento), revisaoEsperada]
  );

  if (resultado.rows[0]) return { ok: true, linha: resultado.rows[0] };

  const atual = await buscarDieta(id);
  if (!atual) return { ok: false, status: 404, erro: "Dieta não encontrada." };
  if (atual.arquivada_em) return { ok: false, status: 409, erro: "A dieta está arquivada." };

  return {
    ok: false,
    status: 409,
    erro: "A dieta foi alterada em outra janela. Recarregue para continuar de onde ela parou.",
    linha: atual,
  };
}

// ---------------------------------------------------------------------------
// Dados do PDF e da versão enviada (identificação do paciente na emissão)

export async function dadosDaEmissao(dieta: LinhaDieta, documento: DocumentoDieta) {
  const [paciente, consulta, alimentos] = await Promise.all([
    dadosDoPaciente(dieta.patient_id),
    obterPool().query<{ data: string }>(
      "select to_char(data, 'YYYY-MM-DD') as data from public.consultas where id = $1",
      [dieta.consulta_id]
    ),
    dadosDosAlimentos(alimentosDoDocumento(documento)),
  ]);

  if (!paciente || !consulta.rows[0]) return null;

  const dataConsulta = consulta.rows[0].data;

  return {
    documento,
    composicoes: alimentos.composicoes,
    // Nome e unidade de cada alimento como estavam no envio.
    alimentos: Object.fromEntries(
      Object.values(alimentos.alimentos).map((a) => [a.id, { nome: a.nome, fonte: a.fonte, unidade_base: a.unidade_base }])
    ),
    paciente: {
      nome: paciente.name,
      idade: idadeEm(paciente.birth_date, dataConsulta),
      sexo: paciente.sex,
      alturaCm: paciente.height_cm,
    },
    dataConsulta,
  };
}

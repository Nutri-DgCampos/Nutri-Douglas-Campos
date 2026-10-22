import type { PoolClient } from "pg";
import { obterPool } from "./banco";
import { enfileirarAtualizacao } from "./notificacoes";

// Documentos publicados na área do paciente (aba Dietas: Fórmulas e
// Avaliações Físicas).
//
// - Cada envio ou reenvio é um registro novo que aponta para o MESMO arquivo
//   já gravado (PDF emitido de fórmulas ou PDF da avaliação): nada é copiado.
// - O paciente vê cada documento uma vez (data do envio mais recente), com
//   aviso de novidade até abrir aquele documento.
// - O paciente pode excluir da área dele um documento enviado por engano
//   (D9): todos os envios ativos daquele arquivo deixam de valer para ele; o
//   histórico profissional continua mostrando os envios e a exclusão.
// - Nada aqui toca em dietas, ciclo de 33 dias ou pagamentos.

export type TipoDePublicacao = "formulas" | "avaliacao";

export const ROTULOS_DE_PUBLICACAO: Record<TipoDePublicacao, string> = { formulas: "Fórmulas", avaliacao: "Avaliação física" };

type Origem = { patientId: string; bucket: "documentos" | "avaliacoes"; caminho: string; titulo: string; arquivo: string };

function dataBr(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

// Arquivo de origem do envio, conferido no banco (nunca vem do navegador).
export async function origemDaPublicacao(tipo: TipoDePublicacao, origemId: string, cliente?: PoolClient): Promise<Origem | null> {
  const db = cliente ?? obterPool();
  if (tipo === "avaliacao") {
    const linha = await db.query<{ patient_id: string; storage_path: string; file_name: string; data: string; numero: number }>(
      `select e.patient_id, e.storage_path, e.file_name, to_char(a.data, 'YYYY-MM-DD') as data, e.numero
         from public.avaliacoes_envios e join public.avaliacoes_fisicas a on a.id = e.avaliacao_id
        where e.id = $1`,
      [origemId]
    );
    const o = linha.rows[0];
    return o ? { patientId: o.patient_id, bucket: "avaliacoes", caminho: o.storage_path, titulo: `Avaliação física de ${dataBr(o.data)}${o.numero > 1 ? ` (versão corrigida ${o.numero})` : ""}`, arquivo: o.file_name } : null;
  }
  const linha = await db.query<{ patient_id: string; storage_path: string; file_name: string; titulo: string }>(
    "select patient_id, storage_path, file_name, titulo from public.documentos_emitidos where id = $1 and tipo = any(array['formula', 'formulas'])",
    [origemId]
  );
  const o = linha.rows[0];
  return o ? { patientId: o.patient_id, bucket: "documentos", caminho: o.storage_path, titulo: o.titulo || "Fórmulas", arquivo: o.file_name } : null;
}

export async function publicar(tipo: TipoDePublicacao, origemId: string, usuarioId: string | null, cliente?: PoolClient) {
  const origem = await origemDaPublicacao(tipo, origemId, cliente);
  if (!origem) return null;
  const linha = await (cliente ?? obterPool()).query<{ id: string; enviado_em: string }>(
    `insert into public.publicacoes_paciente (patient_id, tipo, origem_id, bucket, storage_path, titulo, file_name, enviado_por)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, enviado_em`,
    [origem.patientId, tipo, origemId, origem.bucket, origem.caminho, origem.titulo, origem.arquivo, usuarioId]
  );
  return { id: linha.rows[0].id, enviadoEm: linha.rows[0].enviado_em, patientId: origem.patientId };
}

// Aviso no celular (D10), depois de gravado o envio. Um aviso por envio.
export function avisarPublicacao(tipo: TipoDePublicacao, patientId: string, publicacaoId: string) {
  enfileirarAtualizacao(tipo === "avaliacao" ? "avaliacao" : "formula", patientId, publicacaoId).catch((erro) =>
    console.error("Erro ao registrar aviso do documento:", erro)
  );
}

export type EnvioNoHistorico = { id: string; enviado_em: string; excluido_paciente_em: string | null; lido: boolean };

// Histórico profissional dos envios de cada origem.
export async function enviosDasOrigens(origens: string[]) {
  if (origens.length === 0) return {} as Record<string, EnvioNoHistorico[]>;
  const linhas = await obterPool().query<EnvioNoHistorico & { origem_id: string }>(
    `select p.id, p.origem_id, p.enviado_em, p.excluido_paciente_em,
            exists (select 1 from public.patient_update_views v
                     where v.patient_id = p.patient_id and v.update_type = 'publicacao' and v.reference_id = p.id) as lido
       from public.publicacoes_paciente p
      where p.origem_id = any($1::uuid[])
      order by p.enviado_em desc`,
    [origens]
  );
  const mapa: Record<string, EnvioNoHistorico[]> = {};
  for (const { origem_id, ...envio } of linhas.rows) (mapa[origem_id] ??= []).push(envio);
  return mapa;
}

// Área do paciente: um item por documento, com o envio mais recente.
export async function documentosDoPaciente(patientId: string) {
  const linhas = await obterPool().query<{
    caminho: string;
    tipo: TipoDePublicacao;
    bucket: string;
    titulo: string;
    file_name: string;
    enviado_em: string;
    novo: boolean;
  }>(
    `select p.storage_path as caminho, max(p.tipo) as tipo, max(p.bucket) as bucket,
            (array_agg(p.titulo order by p.enviado_em desc))[1] as titulo,
            (array_agg(p.file_name order by p.enviado_em desc))[1] as file_name,
            max(p.enviado_em) as enviado_em,
            bool_or(not exists (select 1 from public.patient_update_views v
                                 where v.patient_id = p.patient_id and v.update_type = 'publicacao' and v.reference_id = p.id)) as novo
       from public.publicacoes_paciente p
      where p.patient_id = $1 and p.excluido_paciente_em is null
      group by p.storage_path
      order by max(p.enviado_em) desc`,
    [patientId]
  );
  return linhas.rows;
}

// Abrir um documento marca como lidos só os envios daquele arquivo.
export async function marcarDocumentoLido(patientId: string, caminho: string) {
  await obterPool().query(
    `insert into public.patient_update_views (patient_id, update_type, reference_id)
     select p.patient_id, 'publicacao', p.id from public.publicacoes_paciente p
      where p.patient_id = $1 and p.storage_path = $2 and p.excluido_paciente_em is null
     on conflict (patient_id, update_type, reference_id) do nothing`,
    [patientId, caminho]
  );
}

export async function excluirDocumentoDoPaciente(patientId: string, caminho: string) {
  const resultado = await obterPool().query(
    `update public.publicacoes_paciente set excluido_paciente_em = now()
      where patient_id = $1 and storage_path = $2 and excluido_paciente_em is null`,
    [patientId, caminho]
  );
  return (resultado.rowCount ?? 0) > 0;
}

// Há envio ativo deste arquivo para este paciente? (autorização de download)
export async function publicacaoAtiva(patientId: string, caminho: string) {
  const linha = await obterPool().query(
    "select 1 from public.publicacoes_paciente where patient_id = $1 and storage_path = $2 and excluido_paciente_em is null limit 1",
    [patientId, caminho]
  );
  return (linha.rowCount ?? 0) > 0;
}

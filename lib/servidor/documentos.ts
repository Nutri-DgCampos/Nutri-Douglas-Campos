import type { PoolClient } from "pg";
import { gravarArquivo, resolverCaminho } from "./arquivos";

// Documentos enviados à área do paciente (solicitação de exames,
// orientações): o PDF é gravado no envio e não muda mais. Chamado dentro da
// transação do envio; devolve o caminho gravado para limpeza em caso de erro.

export type TipoDeDocumento = "solicitacao_exames" | "orientacao";

export async function registrarDocumentoEnviado(
  cliente: PoolClient,
  dados: {
    pacienteId: string;
    tipo: TipoDeDocumento;
    referenciaId: string;
    titulo: string;
    nomeArquivo: string;
    pdf: Buffer;
    usuarioId: string | null;
  }
) {
  const caminho = `${dados.pacienteId}/${dados.tipo}-${dados.referenciaId}-${Date.now()}.pdf`;
  const destino = resolverCaminho("documentos", caminho);
  if (!destino) throw new Error("Caminho inválido.");
  await gravarArquivo(destino, dados.pdf, false);
  const linha = await cliente.query<{ id: string }>(
    `insert into public.documentos_enviados (patient_id, tipo, referencia_id, titulo, file_name, storage_path, enviado_por)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [dados.pacienteId, dados.tipo, dados.referenciaId, dados.titulo, dados.nomeArquivo, caminho, dados.usuarioId]
  );
  return { id: linha.rows[0].id, destino, caminho };
}

// PDFs emitidos e guardados no histórico da consulta (medicações, fórmulas):
// não vão para a área do paciente.
export async function registrarDocumentoEmitido(
  cliente: PoolClient,
  dados: {
    pacienteId: string;
    consultaId: string;
    tipo: "medicacoes" | "formula" | "formulas";
    titulo: string;
    nomeArquivo: string;
    pdf: Buffer;
    usuarioId: string | null;
  }
) {
  const caminho = `${dados.pacienteId}/emitido-${dados.tipo}-${dados.consultaId}-${Date.now()}.pdf`;
  const destino = resolverCaminho("documentos", caminho);
  if (!destino) throw new Error("Caminho inválido.");
  await gravarArquivo(destino, dados.pdf, false);
  const linha = await cliente.query<{ id: string }>(
    `insert into public.documentos_emitidos (patient_id, consulta_id, tipo, titulo, file_name, storage_path, emitido_por)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [dados.pacienteId, dados.consultaId, dados.tipo, dados.titulo, dados.nomeArquivo, caminho, dados.usuarioId]
  );
  return { id: linha.rows[0].id, destino, caminho };
}

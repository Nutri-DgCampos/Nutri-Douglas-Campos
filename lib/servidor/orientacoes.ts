import type { PoolClient } from "pg";
import { formatarData } from "@/lib/nutricao/paciente";
import { preencherVariaveis, validarOrientacao, type ConteudoOrientacao } from "@/lib/nutricao/orientacao";

// Cópia de um modelo de orientação para a consulta (independente do modelo;
// {paciente} e {data_consulta} preenchidos).
export async function copiarModeloParaConsulta(
  cliente: PoolClient,
  dados: { modeloId: string; consultaId: string; usuarioId: string | null }
) {
  const linha = await cliente.query<{ nome: string; conteudo: ConteudoOrientacao; patient_id: string; paciente: string; data: string }>(
    `select m.nome, m.conteudo, c.patient_id, p.name as paciente, to_char(c.data, 'YYYY-MM-DD') as data
       from public.modelos_orientacoes m, public.consultas c join public.patients p on p.id = c.patient_id
      where m.id = $1 and c.id = $2 and m.arquivado_em is null`,
    [dados.modeloId, dados.consultaId]
  );
  const l = linha.rows[0];
  if (!l) return null;
  const validado = validarOrientacao(l.conteudo);
  if ("erro" in validado) return null;
  const conteudo = preencherVariaveis(validado.valor, { paciente: l.paciente, dataConsulta: formatarData(l.data) });
  const criada = await cliente.query<{ id: string }>(
    `insert into public.orientacoes (patient_id, consulta_id, modelo_id, titulo, conteudo, criada_por)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [l.patient_id, dados.consultaId, dados.modeloId, l.nome, JSON.stringify(conteudo), dados.usuarioId]
  );
  await cliente.query("update public.modelos_orientacoes set usos = usos + 1 where id = $1", [dados.modeloId]);
  return criada.rows[0].id;
}

// Nova consulta: inclui as orientações marcadas como automáticas.
export async function incluirOrientacoesAutomaticas(cliente: PoolClient, consultaId: string, usuarioId: string | null) {
  const modelos = await cliente.query<{ id: string }>(
    "select id from public.modelos_orientacoes where arquivado_em is null and (conteudo->>'automatica')::boolean is true order by nome"
  );
  for (const m of modelos.rows) await copiarModeloParaConsulta(cliente, { modeloId: m.id, consultaId, usuarioId });
}

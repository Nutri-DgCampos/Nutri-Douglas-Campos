import { NextResponse } from "next/server";
import { medicacaoVazia, validarMedicacao } from "@/lib/nutricao/medicacao";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { consultaAnteriorComMedicacoes, medicacoesDaConsulta } from "@/lib/servidor/medicacoes";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

async function consulta(id: string) {
  const r = await obterPool().query<{ patient_id: string; paciente: string; data: string }>(
    `select c.patient_id, p.name as paciente, to_char(c.data, 'YYYY-MM-DD') as data
       from public.consultas c join public.patients p on p.id = c.patient_id where c.id = $1`,
    [id]
  );
  return r.rows[0] ?? null;
}

// Medicações, receitas e anotações da consulta.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const c = await consulta(id);
  if (!c) return recusar("Consulta não encontrada.", 404);
  const pool = obterPool();
  const [medicacoes, receitas, anotacoes, anterior, emitidos] = await Promise.all([
    medicacoesDaConsulta(id),
    pool.query("select id, file_name, storage_path, prescritor, criada_em from public.receitas where consulta_id = $1 order by criada_em", [id]),
    pool.query<{ texto: string; revisao: number }>("select texto, revisao from public.medicacoes_anotacoes where consulta_id = $1", [id]),
    consultaAnteriorComMedicacoes(id),
    pool.query(
      "select id, file_name, storage_path, emitido_em from public.documentos_emitidos where consulta_id = $1 and tipo = 'medicacoes' order by emitido_em desc",
      [id]
    ),
  ]);
  return NextResponse.json({
    paciente: c.paciente,
    data: c.data,
    medicacoes,
    receitas: receitas.rows,
    anotacoes: anotacoes.rows[0] ?? { texto: "", revisao: 0 },
    anterior,
    emitidos: emitidos.rows,
  });
}

// Ações da lista: nova medicação, trazer da consulta anterior, confirmar
// todas, reordenar.
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const c = await consulta(id);
  if (!c) return recusar("Consulta não encontrada.", 404);
  const dados = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const acao = dados?.acao;

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    await cliente.query("select 1 from public.consultas where id = $1 for update", [id]);
    const registro = (registroId: string) => ({ pacienteId: c.patient_id, tabela: "medicacoes", registroId, usuarioId: contexto.usuarioId });
    let resposta: unknown = { ok: true };

    if (acao === "nova") {
      let base = medicacaoVazia();
      let medicamentoId: string | null = null;
      if (typeof dados?.medicamentoId === "string" && UUID.test(dados.medicamentoId)) {
        const m = await cliente.query<{ nome: string; dados: Record<string, unknown> }>(
          "select nome, dados from public.medicamentos where id = $1 and arquivado_em is null",
          [dados.medicamentoId]
        );
        if (!m.rows[0]) throw Object.assign(new Error(), { recusa: recusar("Medicamento não encontrado.", 404) });
        const v = validarMedicacao({ ...medicacaoVazia(m.rows[0].nome), ...m.rows[0].dados, nome: m.rows[0].nome });
        if ("valor" in v) base = v.valor;
        medicamentoId = dados.medicamentoId;
        await cliente.query("update public.medicamentos set usos = usos + 1 where id = $1", [medicamentoId]);
      } else if (typeof dados?.nome === "string") {
        base = medicacaoVazia(dados.nome.slice(0, 200));
      }
      const criada = await cliente.query<{ id: string }>(
        `insert into public.medicacoes (patient_id, consulta_id, medicamento_id, ordem, status, dados, criada_por)
         values ($1, $2, $3, (select coalesce(max(ordem), 0) + 1 from public.medicacoes where consulta_id = $2), 'em_uso', $4, $5)
         returning id`,
        [c.patient_id, id, medicamentoId, JSON.stringify(base), contexto.usuarioId]
      );
      await registrarAcao(cliente, registro(criada.rows[0].id), "criacao", { nome: base.nome });
      resposta = { id: criada.rows[0].id };
    } else if (acao === "trazer_anteriores") {
      const anterior = await consultaAnteriorComMedicacoes(id);
      if (!anterior) throw Object.assign(new Error(), { recusa: recusar("Não há consulta anterior com medicações.", 404) });
      const ja = await cliente.query("select 1 from public.medicacoes m join public.medicacoes o on o.id = m.origem_id where m.consulta_id = $1 and o.consulta_id = $2 limit 1", [id, anterior.id]);
      if (ja.rowCount) throw Object.assign(new Error(), { recusa: recusar("As medicações da consulta anterior já foram trazidas.", 409) });
      // Cópias independentes, não confirmadas (referência em cinza).
      const copias = await cliente.query<{ id: string }>(
        `insert into public.medicacoes (patient_id, consulta_id, medicamento_id, origem_id, ordem, status, dados, criada_por)
         select patient_id, $1, medicamento_id, id,
                (select coalesce(max(ordem), 0) from public.medicacoes where consulta_id = $1) + row_number() over (order by ordem, criada_em),
                'nao_confirmado', dados, $3
           from public.medicacoes where consulta_id = $2 and excluida_em is null
         returning id`,
        [id, anterior.id, contexto.usuarioId]
      );
      for (const linha of copias.rows) await registrarAcao(cliente, registro(linha.id), "criacao", { trazida_da_consulta: anterior.data });
      resposta = { trazidas: copias.rowCount };
    } else if (acao === "confirmar_todos") {
      const r = await cliente.query(
        "update public.medicacoes set status = 'em_uso', revisao = revisao + 1, atualizada_em = now() where consulta_id = $1 and status = 'nao_confirmado' and excluida_em is null",
        [id]
      );
      resposta = { confirmadas: r.rowCount };
    } else if (acao === "ordem" && Array.isArray(dados?.ids)) {
      const ids = (dados.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x));
      for (const [n, medId] of ids.entries()) {
        await cliente.query("update public.medicacoes set ordem = $3 where id = $1 and consulta_id = $2", [medId, id, n + 1]);
      }
    } else {
      throw Object.assign(new Error(), { recusa: recusar("Ação inválida.", 400) });
    }
    await cliente.query("commit");
    return NextResponse.json(resposta);
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    const recusa = (erro as { recusa?: NextResponse }).recusa;
    if (recusa) return recusa;
    console.error("Erro nas medicações:", erro);
    return recusar("Não foi possível concluir.", 500);
  } finally {
    cliente.release();
  }
}

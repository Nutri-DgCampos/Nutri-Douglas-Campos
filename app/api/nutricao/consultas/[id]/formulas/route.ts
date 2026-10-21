import { NextResponse } from "next/server";
import { copiarFormula, formulaVazia, validarFormula, type Formula } from "@/lib/nutricao/formula";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const pool = obterPool();
  const c = await pool.query<{ patient_id: string; paciente: string; data: string }>(
    `select c.patient_id, p.name as paciente, to_char(c.data, 'YYYY-MM-DD') as data
       from public.consultas c join public.patients p on p.id = c.patient_id where c.id = $1`,
    [id]
  );
  if (!c.rows[0]) return recusar("Consulta não encontrada.", 404);
  const [formulas, dietas, emitidos] = await Promise.all([
    pool.query("select id, dieta_id, ordem, conteudo, origem, pendente_revisao, salva_em, revisao from public.formulas where consulta_id = $1 order by ordem, criada_em", [id]),
    pool.query("select id, rascunho->>'titulo' as titulo from public.dietas where consulta_id = $1 and arquivada_em is null order by ordem", [id]),
    pool.query(
      "select id, tipo, titulo, file_name, storage_path, emitido_em from public.documentos_emitidos where consulta_id = $1 and tipo in ('formula', 'formulas') order by emitido_em desc",
      [id]
    ),
  ]);
  return NextResponse.json({ ...c.rows[0], formulas: formulas.rows, dietas: dietas.rows, emitidos: emitidos.rows });
}

// Nova fórmula (em branco ou importada) e reordenação. Importar sempre cria
// um registro novo; nada é substituído.
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);
  const dados = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const c = await cliente.query<{ patient_id: string }>("select patient_id from public.consultas where id = $1 for update", [id]);
    if (!c.rows[0]) throw Object.assign(new Error(), { recusa: recusar("Consulta não encontrada.", 404) });
    const pacienteId = c.rows[0].patient_id;
    const dietaId = typeof dados?.dietaId === "string" && UUID.test(dados.dietaId) ? dados.dietaId : null;

    if (dados?.acao === "ordem" && Array.isArray(dados.ids)) {
      for (const [n, fid] of (dados.ids as unknown[]).entries()) {
        if (typeof fid === "string" && UUID.test(fid)) await cliente.query("update public.formulas set ordem = $3 where id = $1 and consulta_id = $2", [fid, id, n + 1]);
      }
      await cliente.query("commit");
      return NextResponse.json({ ok: true });
    }

    let conteudo: Formula = formulaVazia();
    let origem: Record<string, unknown> | null = null;
    let pendente = false;
    const fonte = dados?.origem as { tipo?: string; id?: string } | undefined;
    if (dados?.acao === "importar" && fonte && typeof fonte.id === "string" && UUID.test(fonte.id)) {
      if (fonte.tipo === "modelo") {
        const m = await cliente.query<{ nome: string; conteudo: unknown }>("select nome, conteudo from public.modelos_formulas where id = $1 and arquivado_em is null", [fonte.id]);
        const v = validarFormula(m.rows[0]?.conteudo);
        if (!m.rows[0] || "erro" in v) throw Object.assign(new Error(), { recusa: recusar("Modelo não encontrado.", 404) });
        conteudo = { ...copiarFormula(v.valor, true), nome: m.rows[0].nome };
        await cliente.query("update public.modelos_formulas set usos = usos + 1 where id = $1", [fonte.id]);
        origem = { tipo: "modelo", id: fonte.id };
      } else if (fonte.tipo === "formula") {
        const f = await cliente.query<{ conteudo: unknown; patient_id: string; consulta_id: string }>("select conteudo, patient_id, consulta_id from public.formulas where id = $1", [fonte.id]);
        const v = validarFormula(f.rows[0]?.conteudo);
        if (!f.rows[0] || "erro" in v) throw Object.assign(new Error(), { recusa: recusar("Fórmula de origem não encontrada.", 404) });
        const outroPaciente = f.rows[0].patient_id !== pacienteId;
        // De outro paciente: só a estrutura (sem observação nem orientações ao paciente).
        conteudo = copiarFormula(v.valor, outroPaciente);
        // Da consulta anterior do mesmo paciente: chega em cinza, para revisar.
        pendente = !outroPaciente && f.rows[0].consulta_id !== id;
        origem = { tipo: outroPaciente ? "outro_paciente" : "consulta", id: fonte.id };
      } else {
        throw Object.assign(new Error(), { recusa: recusar("Origem inválida.", 400) });
      }
    } else if (dados?.acao !== "nova") {
      throw Object.assign(new Error(), { recusa: recusar("Ação inválida.", 400) });
    }

    const criada = await cliente.query<{ id: string }>(
      `insert into public.formulas (patient_id, consulta_id, dieta_id, ordem, conteudo, origem, pendente_revisao, criada_por)
       values ($1, $2, $3, (select coalesce(max(ordem), 0) + 1 from public.formulas where consulta_id = $2), $4, $5, $6, $7) returning id`,
      [pacienteId, id, dietaId, JSON.stringify(conteudo), origem ? JSON.stringify(origem) : null, pendente, contexto.usuarioId]
    );
    await registrarAcao(
      cliente,
      { pacienteId, tabela: "formulas", registroId: criada.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { origem }
    );
    await cliente.query("commit");
    return NextResponse.json({ id: criada.rows[0].id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    const recusa = (erro as { recusa?: NextResponse }).recusa;
    if (recusa) return recusa;
    console.error("Erro nas fórmulas:", erro);
    return recusar("Não foi possível concluir.", 500);
  } finally {
    cliente.release();
  }
}

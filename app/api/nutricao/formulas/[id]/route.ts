import { NextResponse } from "next/server";
import { copiarFormula, validarFormula, type Formula } from "@/lib/nutricao/formula";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Rascunho automático; "salvar" marca a gravação explícita (botão Salvar).
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Fórmula inválida.", 400);
  const dados = await request.json().catch(() => null);
  const v = validarFormula(dados?.conteudo);
  if ("erro" in v) return recusar(v.erro, 400);
  const dietaId = typeof dados?.dietaId === "string" && UUID.test(dados.dietaId) ? dados.dietaId : null;
  const r = await obterPool().query<{ revisao: number; salva_em: string | null }>(
    `update public.formulas
        set conteudo = $2, revisao = revisao + 1, atualizada_em = now(),
            dieta_id = (select d.id from public.dietas d where d.id = $4 and d.consulta_id = formulas.consulta_id),
            salva_em = case when $5 then now() else salva_em end
      where id = $1 and revisao = $3 returning revisao, salva_em`,
    [id, JSON.stringify(v.valor), dados?.revisao, dietaId, dados?.salvar === true]
  );
  if (!r.rows[0]) return recusar("A fórmula foi alterada em outra janela. Recarregue.", 409);
  return NextResponse.json(r.rows[0]);
}

// Duplicar, aprovar (sair do cinza) e salvar como modelo.
export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Fórmula inválida.", 400);
  const dados = await request.json().catch(() => null);
  const pool = obterPool();
  const f = await pool.query<{ patient_id: string; consulta_id: string; dieta_id: string | null; ordem: number; conteudo: Formula }>(
    "select patient_id, consulta_id, dieta_id, ordem, conteudo from public.formulas where id = $1",
    [id]
  );
  const linha = f.rows[0];
  if (!linha) return recusar("Fórmula não encontrada.", 404);

  if (dados?.acao === "aprovar") {
    await pool.query("update public.formulas set pendente_revisao = false, revisao = revisao + 1 where id = $1", [id]);
    return NextResponse.json({ ok: true });
  }
  if (dados?.acao === "duplicar") {
    const copia = await pool.query<{ id: string }>(
      `insert into public.formulas (patient_id, consulta_id, dieta_id, ordem, conteudo, origem, criada_por)
       values ($1, $2, $3, $4 + 1, $5, $6, $7) returning id`,
      [linha.patient_id, linha.consulta_id, linha.dieta_id, linha.ordem, JSON.stringify(copiarFormula(linha.conteudo, false)), JSON.stringify({ tipo: "duplicada", id }), contexto.usuarioId]
    );
    await pool.query("update public.formulas set ordem = ordem + 1 where consulta_id = $1 and ordem > $2 and id <> $3", [linha.consulta_id, linha.ordem, copia.rows[0].id]);
    return NextResponse.json({ id: copia.rows[0].id });
  }
  if (dados?.acao === "salvar_como_modelo") {
    // O modelo não leva observação nem orientações ao paciente.
    const modelo = copiarFormula(linha.conteudo, true);
    const nome = typeof dados?.nome === "string" && dados.nome.trim() ? dados.nome.trim().slice(0, 200) : modelo.nome.trim() || "Fórmula";
    const r = await pool.query<{ id: string }>(
      "insert into public.modelos_formulas (nome, conteudo, criado_por) values ($1, $2, $3) returning id",
      [nome, JSON.stringify({ ...modelo, nome }), contexto.usuarioId]
    );
    return NextResponse.json({ modeloId: r.rows[0].id });
  }
  return recusar("Ação inválida.", 400);
}

// Apagar a fórmula do atendimento (o modelo e os PDFs já emitidos ficam).
export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Fórmula inválida.", 400);
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const f = await cliente.query<{ patient_id: string; conteudo: Formula }>("delete from public.formulas where id = $1 returning patient_id, conteudo", [id]);
    if (!f.rows[0]) {
      await cliente.query("rollback");
      return recusar("Fórmula não encontrada.", 404);
    }
    await registrarAcao(
      cliente,
      { pacienteId: f.rows[0].patient_id, tabela: "formulas", registroId: id, usuarioId: contexto.usuarioId },
      "exclusao",
      { nome: f.rows[0].conteudo.nome }
    );
    await cliente.query("commit");
    return NextResponse.json({ ok: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao apagar fórmula:", erro);
    return recusar("Não foi possível apagar.", 500);
  } finally {
    cliente.release();
  }
}

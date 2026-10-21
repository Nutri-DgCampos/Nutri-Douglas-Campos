import { NextResponse } from "next/server";
import { validarMedicacao } from "@/lib/nutricao/medicacao";
import { registrarAcao, registrarAlteracoes } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import type { LinhaMedicacao } from "@/lib/servidor/medicacoes";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Salvamento automático dos dados e do status.
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Medicação inválida.", 400);
  const dados = await request.json().catch(() => null);
  const v = validarMedicacao(dados?.dados);
  if ("erro" in v) return recusar(v.erro, 400);
  const status = ["em_uso", "suspenso", "nao_confirmado"].includes(dados?.status) ? dados.status : null;
  if (!status) return recusar("Status inválido.", 400);

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const atual = await cliente.query<LinhaMedicacao>("select * from public.medicacoes where id = $1 for update", [id]);
    const m = atual.rows[0];
    if (!m || m.excluida_em) {
      await cliente.query("rollback");
      return recusar("Medicação não encontrada.", 404);
    }
    if (m.revisao !== dados?.revisao) {
      await cliente.query("rollback");
      return recusar("A medicação foi alterada em outra janela. Recarregue.", 409);
    }
    // Só as receitas desta consulta podem ser vinculadas.
    const receitasValidas = v.valor.receitas.length
      ? (await cliente.query<{ id: string }>("select id from public.receitas where consulta_id = $1 and id = any($2::uuid[])", [m.consulta_id, v.valor.receitas.map((r) => r.id)])).rows.map((r) => r.id)
      : [];
    const valor = { ...v.valor, receitas: v.valor.receitas.filter((r) => receitasValidas.includes(r.id)) };
    const gravado = await cliente.query<{ revisao: number }>(
      "update public.medicacoes set dados = $2, status = $3, revisao = revisao + 1, atualizada_em = now() where id = $1 returning revisao",
      [id, JSON.stringify(valor), status]
    );
    if (status !== m.status) {
      await registrarAlteracoes(
        cliente,
        { pacienteId: m.patient_id, tabela: "medicacoes", registroId: id, usuarioId: contexto.usuarioId },
        { status: m.status },
        { status }
      );
    }
    await cliente.query("commit");
    return NextResponse.json(gravado.rows[0]);
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao salvar medicação:", erro);
    return recusar("Não foi possível salvar.", 500);
  } finally {
    cliente.release();
  }
}

// Excluir (lógico, pode desfazer), restaurar, duplicar, salvar na biblioteca.
export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Medicação inválida.", 400);
  const acao = (await request.json().catch(() => null))?.acao;

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const atual = await cliente.query<LinhaMedicacao>("select * from public.medicacoes where id = $1 for update", [id]);
    const m = atual.rows[0];
    if (!m) {
      await cliente.query("rollback");
      return recusar("Medicação não encontrada.", 404);
    }
    const registro = { pacienteId: m.patient_id, tabela: "medicacoes", registroId: id, usuarioId: contexto.usuarioId };
    let resposta: unknown = { ok: true };
    if (acao === "excluir") {
      await cliente.query("update public.medicacoes set excluida_em = now(), revisao = revisao + 1 where id = $1", [id]);
      await registrarAcao(cliente, registro, "exclusao", { nome: m.dados.nome, recuperavel: true });
    } else if (acao === "restaurar") {
      await cliente.query("update public.medicacoes set excluida_em = null, revisao = revisao + 1 where id = $1", [id]);
      await registrarAlteracoes(cliente, registro, { excluida: true }, { excluida: false });
    } else if (acao === "duplicar") {
      // Cópia independente, não confirmada; as receitas são as mesmas (não copia arquivo).
      const copia = await cliente.query<{ id: string }>(
        `insert into public.medicacoes (patient_id, consulta_id, medicamento_id, ordem, status, dados, criada_por)
         values ($1, $2, $3, $4 + 1, 'nao_confirmado', $5, $6) returning id`,
        [m.patient_id, m.consulta_id, m.medicamento_id, m.ordem, JSON.stringify(m.dados), contexto.usuarioId]
      );
      await cliente.query("update public.medicacoes set ordem = ordem + 1 where consulta_id = $1 and ordem > $2 and id <> $3", [m.consulta_id, m.ordem, copia.rows[0].id]);
      await registrarAcao(cliente, { ...registro, registroId: copia.rows[0].id }, "criacao", { duplicada_de: id });
      resposta = { id: copia.rows[0].id };
    } else if (acao === "salvar_na_biblioteca") {
      const { principioAtivo, apresentacao, concentracao, unidadeAtivo, unidadeQuantidade } = m.dados;
      const novo = await cliente.query<{ id: string }>(
        "insert into public.medicamentos (nome, dados, usos, criado_por) values ($1, $2, 1, $3) returning id",
        [m.dados.nome.trim() || "Medicamento", JSON.stringify({ principioAtivo, apresentacao, concentracao, unidadeAtivo, unidadeQuantidade }), contexto.usuarioId]
      );
      await cliente.query("update public.medicacoes set medicamento_id = $2 where id = $1", [id, novo.rows[0].id]);
      resposta = { medicamentoId: novo.rows[0].id };
    } else {
      await cliente.query("rollback");
      return recusar("Ação inválida.", 400);
    }
    await cliente.query("commit");
    return NextResponse.json(resposta);
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro na medicação:", erro);
    return recusar("Não foi possível concluir.", 500);
  } finally {
    cliente.release();
  }
}

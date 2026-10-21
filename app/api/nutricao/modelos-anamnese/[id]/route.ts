import { NextResponse } from "next/server";
import { validarPerguntas } from "@/lib/nutricao/anamnese";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  const resultado = await obterPool().query(
    `select m.*, (select count(*)::int from public.anamneses a where a.modelo_id = m.id) as fichas
       from public.modelos_anamnese m where m.id = $1`,
    [id]
  );
  if (!resultado.rows[0]) return recusar("Modelo não encontrado.", 404);
  return NextResponse.json({ modelo: resultado.rows[0] });
}

// Salvamento automático. Se a versão atual já foi usada em alguma ficha, a
// alteração gera uma nova versão (as fichas antigas guardam a delas).
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  const dados = await request.json().catch(() => null);
  const nome = typeof dados?.nome === "string" ? dados.nome.slice(0, 200) : "";
  const perguntas = validarPerguntas(dados?.perguntas ?? []);
  if ("erro" in perguntas) return recusar(perguntas.erro, 400);

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const atual = await cliente.query<{ revisao: number; versao: number; arquivado_em: string | null }>(
      "select revisao, versao, arquivado_em from public.modelos_anamnese where id = $1 for update",
      [id]
    );
    if (!atual.rows[0]) {
      await cliente.query("rollback");
      return recusar("Modelo não encontrado.", 404);
    }
    if (atual.rows[0].revisao !== dados?.revisao) {
      await cliente.query("rollback");
      return recusar("O modelo foi alterado em outra janela. Recarregue antes de continuar.", 409);
    }
    const usada = await cliente.query(
      "select 1 from public.anamneses where modelo_id = $1 and modelo_versao = $2 limit 1",
      [id, atual.rows[0].versao]
    );
    const gravado = await cliente.query<{ revisao: number; versao: number }>(
      `update public.modelos_anamnese
          set nome = $2, perguntas = $3, revisao = revisao + 1, versao = versao + $4, atualizado_em = now()
        where id = $1 returning revisao, versao`,
      [id, nome.trim() || "Nova anamnese", JSON.stringify(perguntas.valor), usada.rowCount ? 1 : 0]
    );
    await cliente.query("commit");
    return NextResponse.json(gravado.rows[0]);
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro ao salvar modelo de anamnese:", erro);
    return recusar("Não foi possível salvar o modelo.", 500);
  } finally {
    cliente.release();
  }
}

export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  const dados = await request.json().catch(() => null);
  if (dados?.acao !== "arquivar" && dados?.acao !== "reativar") return recusar("Ação inválida.", 400);
  const resultado = await obterPool().query(
    `update public.modelos_anamnese set arquivado_em = ${dados.acao === "arquivar" ? "now()" : "null"}, atualizado_em = now()
      where id = $1 returning id`,
    [id]
  );
  if (!resultado.rowCount) return recusar("Modelo não encontrado.", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  try {
    const resultado = await obterPool().query("delete from public.modelos_anamnese where id = $1", [id]);
    if (!resultado.rowCount) return recusar("Modelo não encontrado.", 404);
    return NextResponse.json({ ok: true });
  } catch {
    return recusar("Este modelo já foi usado em anamneses: arquive em vez de excluir.", 409);
  }
}

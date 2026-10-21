import { NextResponse } from "next/server";
import { copiarDocumento, validarDocumento } from "@/lib/nutricao/dieta";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, buscarDieta } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// "Duplicar dieta": cópia completa e independente da dieta aberta (o
// rascunho atual), na mesma consulta, como nova aba "em elaboração". Não
// leva versões, envios nem PDFs da original.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const dados = await request.json().catch(() => null);
  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");
    const original = await buscarDieta(id, cliente, true);
    if (!original) {
      await cliente.query("rollback");
      return recusar("Dieta não encontrada.", 404);
    }

    // Duplica o que o nutricionista está vendo: exige a revisão atual.
    if (Number.isInteger(dados?.revisao) && dados.revisao !== original.revisao) {
      await cliente.query("rollback");
      return recusar("A dieta foi alterada em outra janela. Recarregue antes de duplicar.", 409);
    }

    const validacao = validarDocumento(original.rascunho);
    if ("erro" in validacao) {
      await cliente.query("rollback");
      return recusar(validacao.erro, 400);
    }

    const copia = copiarDocumento(validacao.documento);
    copia.titulo = `${validacao.documento.titulo.trim() || "Dieta"} — Cópia`.slice(0, 200);
    copia.pesoReferencia = validacao.documento.pesoReferencia;
    if (validacao.documento.gastoReferencia !== undefined) copia.gastoReferencia = validacao.documento.gastoReferencia;

    const criada = await cliente.query<{ id: string }>(
      `insert into public.dietas (patient_id, consulta_id, ordem, rascunho, criada_por, origens)
       values ($1, $2, (select coalesce(max(ordem), 0) + 1 from public.dietas where consulta_id = $2), $3, $4, $5)
       returning id`,
      [
        original.patient_id,
        original.consulta_id,
        JSON.stringify(copia),
        contexto.usuarioId,
        JSON.stringify([{ tipo: "duplicacao", id, em: new Date().toISOString() }]),
      ]
    );

    await registrarAcao(
      cliente,
      { pacienteId: original.patient_id, tabela: "dietas", registroId: criada.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { titulo: copia.titulo, duplicada_de: id }
    );

    await cliente.query("commit");
    return NextResponse.json({ id: criada.rows[0].id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro ao duplicar dieta:", erro);
    return recusar("Não foi possível duplicar a dieta.", 500);
  } finally {
    cliente.release();
  }
}

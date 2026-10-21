import { NextResponse } from "next/server";
import { validarDocumento } from "@/lib/nutricao/dieta";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, buscarDieta } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Auxílio da IA: "Criar nova dieta" com as alterações escolhidas na prévia.
// A dieta aberta não muda; a nova fica na mesma consulta, em elaboração, com
// o peso e os nutrientes acompanhados da dieta de origem. Nada é enviado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);
  const origem = await buscarDieta(id);
  if (!origem) return recusar("Dieta não encontrada.", 404);

  const dados = await request.json().catch(() => null);
  const validacao = validarDocumento(dados?.documento);
  if ("erro" in validacao) return recusar(validacao.erro, 400);

  const documento = {
    ...validacao.documento,
    titulo: validacao.documento.titulo.trim() || "Nova dieta (auxílio da IA)",
    pesoReferencia: origem.rascunho.pesoReferencia,
    nutrientesAcompanhados: origem.rascunho.nutrientesAcompanhados,
  };
  const registroDeOrigem = { tipo: "ia", id, em: new Date().toISOString() };

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    await cliente.query("select 1 from public.consultas where id = $1 for update", [origem.consulta_id]);
    const criada = await cliente.query<{ id: string }>(
      `insert into public.dietas (patient_id, consulta_id, ordem, rascunho, criada_por, origens)
       values ($1, $2, (select coalesce(max(ordem), 0) + 1 from public.dietas where consulta_id = $2), $3, $4, $5)
       returning id`,
      [origem.patient_id, origem.consulta_id, JSON.stringify(documento), contexto.usuarioId, JSON.stringify([registroDeOrigem])]
    );
    await registrarAcao(
      cliente,
      { pacienteId: origem.patient_id, tabela: "dietas", registroId: criada.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { titulo: documento.titulo, auxilio_ia: registroDeOrigem }
    );
    await cliente.query("commit");
    return NextResponse.json({ id: criada.rows[0].id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro ao criar dieta pelo auxílio da IA:", erro);
    return recusar("Não foi possível criar a dieta.", 500);
  } finally {
    cliente.release();
  }
}

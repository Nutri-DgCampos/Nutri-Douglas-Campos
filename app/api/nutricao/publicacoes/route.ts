import { NextResponse } from "next/server";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { avisarPublicacao, enviosDasOrigens, publicar, type TipoDePublicacao } from "@/lib/servidor/publicacoes";

export const runtime = "nodejs";

// Envio e reenvio de Fórmulas (PDF emitido) e Avaliação Física (PDF já
// enviado) à área do paciente. Reenviar = novo registro apontando para o
// mesmo arquivo. Não mexe em dietas nem no ciclo de 33 dias.

// GET ?origens=id1,id2: histórico de envios de cada origem.
export async function GET(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const origens = (new URL(request.url).searchParams.get("origens") ?? "").split(",").filter((id) => UUID.test(id)).slice(0, 200);
  return NextResponse.json({ envios: await enviosDasOrigens(origens) });
}

export async function POST(request: Request) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const dados = await request.json().catch(() => null);
  const tipo = dados?.tipo as TipoDePublicacao;
  if (tipo !== "formulas" && tipo !== "avaliacao") return recusar("Tipo de documento inválido.", 400);
  if (!UUID.test(String(dados?.origemId))) return recusar("Documento inválido.", 400);

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const publicacao = await publicar(tipo, dados.origemId, contexto.usuarioId, cliente);
    if (!publicacao) {
      await cliente.query("rollback");
      return recusar("Documento não encontrado.", 404);
    }
    await registrarAcao(
      cliente,
      { pacienteId: publicacao.patientId, tabela: "publicacoes_paciente", registroId: publicacao.id, usuarioId: contexto.usuarioId },
      "criacao",
      { tipo, origem_id: dados.origemId }
    );
    await cliente.query("commit");
    avisarPublicacao(tipo, publicacao.patientId, publicacao.id);
    return NextResponse.json({ id: publicacao.id, enviado_em: publicacao.enviadoEm }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao enviar documento ao paciente:", erro);
    return recusar("Não foi possível enviar. Nada foi publicado; tente novamente.", 500);
  } finally {
    cliente.release();
  }
}

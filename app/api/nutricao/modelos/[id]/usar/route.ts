import { NextResponse } from "next/server";
import { alimentosDoDocumento, documentoVazio, type Refeicao } from "@/lib/nutricao/dieta";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, dadosDosAlimentos } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Usar um modelo de observação ou de refeição no editor: devolve o conteúdo
// (o editor faz a cópia com identificadores novos) e conta o uso, para o
// modelo passar a ser arquivado em vez de excluído.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  const resultado = await obterPool().query<{ tipo: string; nome: string; conteudo: unknown }>(
    `update public.modelos_nutricao set usos = usos + 1
      where id = $1 and arquivado_em is null and tipo in ('observacao', 'refeicao')
      returning tipo, nome, conteudo`,
    [id]
  );
  const modelo = resultado.rows[0];
  if (!modelo) return recusar("Modelo não encontrado ou arquivado.", 404);

  const ids =
    modelo.tipo === "refeicao"
      ? alimentosDoDocumento({ ...documentoVazio(), refeicoes: [modelo.conteudo as Refeicao] })
      : [];

  return NextResponse.json({ ...modelo, ...(await dadosDosAlimentos(ids)) });
}

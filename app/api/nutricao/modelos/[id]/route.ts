import { NextResponse } from "next/server";
import { alimentosDoDocumento, documentoVazio, type DocumentoDieta, type Refeicao } from "@/lib/nutricao/dieta";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, dadosDosAlimentos } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { nomeValido, validarConteudoDoModelo, type TipoDeModelo } from "@/lib/servidor/modelos";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

type Linha = {
  id: string;
  tipo: TipoDeModelo;
  nome: string;
  conteudo: unknown;
  usos: number;
  revisao: number;
  arquivado_em: string | null;
  atualizado_em: string;
};

// Modelo completo, com os dados dos alimentos usados (editor do modelo).
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  const resultado = await obterPool().query<Linha>(
    "select id, tipo, nome, conteudo, usos, revisao, arquivado_em, atualizado_em from public.modelos_nutricao where id = $1",
    [id]
  );
  const modelo = resultado.rows[0];
  if (!modelo) return recusar("Modelo não encontrado.", 404);

  let ids: string[] = [];
  if (modelo.tipo === "dieta") ids = alimentosDoDocumento(modelo.conteudo as DocumentoDieta);
  if (modelo.tipo === "refeicao") {
    ids = alimentosDoDocumento({ ...documentoVazio(), refeicoes: [modelo.conteudo as Refeicao] });
  }

  const nutrientes = await obterPool().query("select codigo, nome, unidade, grupo, ordem from public.nutrientes order by ordem");

  return NextResponse.json({ modelo, nutrientes: nutrientes.rows, ...(await dadosDosAlimentos(ids)) });
}

// Salvar alterações do modelo. Vale só para usos futuros.
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  const dados = await request.json().catch(() => null);
  const nome = nomeValido(dados?.nome);
  if (!nome) return recusar("Informe o nome do modelo.", 400);
  if (!Number.isInteger(dados?.revisao)) return recusar("Revisão do modelo não informada.", 400);

  const pool = obterPool();
  const atual = await pool.query<{ tipo: TipoDeModelo }>("select tipo from public.modelos_nutricao where id = $1", [id]);
  if (!atual.rows[0]) return recusar("Modelo não encontrado.", 404);

  const validacao = validarConteudoDoModelo(atual.rows[0].tipo, dados?.conteudo);
  if ("erro" in validacao) return recusar(validacao.erro, 400);

  const resultado = await pool.query<{ revisao: number; atualizado_em: string }>(
    `update public.modelos_nutricao
        set nome = $2, conteudo = $3, revisao = revisao + 1, atualizado_em = now()
      where id = $1 and revisao = $4
      returning revisao, atualizado_em`,
    [id, nome, JSON.stringify(validacao.conteudo), dados.revisao]
  );

  if (!resultado.rows[0]) {
    return recusar("O modelo foi alterado em outra janela. Recarregue antes de salvar.", 409);
  }

  return NextResponse.json(resultado.rows[0]);
}

// Arquivar ou reativar.
export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  const dados = await request.json().catch(() => null);
  if (dados?.acao !== "arquivar" && dados?.acao !== "reativar") return recusar("Ação inválida.", 400);

  const resultado = await obterPool().query(
    `update public.modelos_nutricao
        set arquivado_em = ${dados.acao === "arquivar" ? "now()" : "null"}, revisao = revisao + 1
      where id = $1 returning id`,
    [id]
  );
  if (!resultado.rows[0]) return recusar("Modelo não encontrado.", 404);
  return NextResponse.json({ sucesso: true });
}

// Excluir: só modelo nunca usado (o banco também garante).
export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Modelo inválido.", 400);

  try {
    const resultado = await obterPool().query("delete from public.modelos_nutricao where id = $1 returning id", [id]);
    if (!resultado.rows[0]) return recusar("Modelo não encontrado.", 404);
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    if ((erro as { code?: string }).code === "P0001") return recusar((erro as Error).message, 409);
    console.error("Erro ao excluir modelo:", erro);
    return recusar("Não foi possível excluir o modelo.", 500);
  }
}

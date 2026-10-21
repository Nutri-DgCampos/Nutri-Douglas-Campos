import { NextResponse } from "next/server";
import { obterPool } from "./banco";
import { UUID } from "./dietas";
import { exigirNutricionista, recusar } from "./http";

// Rotas comuns das bibliotecas de Configurações (modelos de exames,
// orientações, fórmulas, medicamentos e ingredientes). Todas as tabelas têm
// id, nome, um campo jsonb de conteúdo, usos, revisao, arquivado_em,
// criado_por, criado_em e atualizado_em. Excluir só o que nunca foi usado
// (a tabela tem gatilho que impede); o resto se arquiva.

export type ConfiguracaoDaBiblioteca = {
  tabela: string;
  campo: string;
  // Validação do conteúdo (a API nunca confia no navegador).
  validar: (valor: unknown) => { valor: unknown } | { erro: string };
  conteudoInicial: unknown;
  // Expressão SQL extra da listagem (ex.: quantidade de itens).
  resumo?: string;
  nomePadrao: string;
};

function palavrasDaBusca(url: URL) {
  return (url.searchParams.get("q") ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
}

export function rotasDaLista(c: ConfiguracaoDaBiblioteca) {
  async function GET(request: Request) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const url = new URL(request.url);
    const parametros: unknown[] = [];
    const condicoes = [url.searchParams.get("arquivados") === "1" ? "true" : "arquivado_em is null"];
    for (const palavra of palavrasDaBusca(url)) {
      parametros.push(`%${palavra.replace(/[%_\\]/g, (x) => `\\${x}`)}%`);
      condicoes.push(`public.normalizar_texto(nome) like $${parametros.length}`);
    }
    const resultado = await obterPool().query(
      `select id, nome, usos, arquivado_em, atualizado_em${c.resumo ? `, ${c.resumo}` : ""}
         from public.${c.tabela}
        where ${condicoes.join(" and ")}
        order by arquivado_em nulls first, nome
        limit 300`,
      parametros
    );
    return NextResponse.json({ modelos: resultado.rows });
  }

  async function POST(request: Request) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const dados = await request.json().catch(() => null);
    const nome = typeof dados?.nome === "string" ? dados.nome.trim().slice(0, 200) : "";
    const conteudo = c.validar(dados?.[c.campo] ?? c.conteudoInicial);
    if ("erro" in conteudo) return recusar(conteudo.erro, 400);
    const criado = await obterPool().query<{ id: string; revisao: number }>(
      `insert into public.${c.tabela} (nome, ${c.campo}, criado_por) values ($1, $2, $3) returning id, revisao`,
      [nome || c.nomePadrao, JSON.stringify(conteudo.valor), contexto.usuarioId]
    );
    return NextResponse.json(criado.rows[0], { status: 201 });
  }

  return { GET, POST };
}

type Parametros = { params: Promise<{ id: string }> };

export function rotasDoItem(c: ConfiguracaoDaBiblioteca) {
  async function GET(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Registro inválido.", 400);
    const resultado = await obterPool().query(`select * from public.${c.tabela} where id = $1`, [id]);
    if (!resultado.rows[0]) return recusar("Registro não encontrado.", 404);
    return NextResponse.json({ modelo: resultado.rows[0] });
  }

  // Salvamento automático com controle de revisão.
  async function PUT(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Registro inválido.", 400);
    const dados = await request.json().catch(() => null);
    const nome = typeof dados?.nome === "string" ? dados.nome.slice(0, 200) : "";
    const conteudo = c.validar(dados?.[c.campo]);
    if ("erro" in conteudo) return recusar(conteudo.erro, 400);
    const gravado = await obterPool().query<{ revisao: number }>(
      `update public.${c.tabela}
          set nome = $2, ${c.campo} = $3, revisao = revisao + 1, atualizado_em = now()
        where id = $1 and revisao = $4 returning revisao`,
      [id, nome.trim() || c.nomePadrao, JSON.stringify(conteudo.valor), dados?.revisao]
    );
    if (!gravado.rows[0]) return recusar("O registro foi alterado em outra janela. Recarregue antes de continuar.", 409);
    return NextResponse.json(gravado.rows[0]);
  }

  async function PATCH(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Registro inválido.", 400);
    const acao = (await request.json().catch(() => null))?.acao;
    if (acao !== "arquivar" && acao !== "reativar") return recusar("Ação inválida.", 400);
    const resultado = await obterPool().query(
      `update public.${c.tabela} set arquivado_em = ${acao === "arquivar" ? "now()" : "null"}, atualizado_em = now() where id = $1`,
      [id]
    );
    if (!resultado.rowCount) return recusar("Registro não encontrado.", 404);
    return NextResponse.json({ ok: true });
  }

  async function DELETE(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Registro inválido.", 400);
    try {
      const resultado = await obterPool().query(`delete from public.${c.tabela} where id = $1`, [id]);
      if (!resultado.rowCount) return recusar("Registro não encontrado.", 404);
      return NextResponse.json({ ok: true });
    } catch {
      return recusar("Já foi usado em atendimentos: arquive em vez de excluir.", 409);
    }
  }

  return { GET, PUT, PATCH, DELETE };
}

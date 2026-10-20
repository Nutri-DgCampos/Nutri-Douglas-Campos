import { NextResponse } from "next/server";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, novoDocumento, versoesDasDietas } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Dietas da consulta (abas do editor), com a situação de cada uma.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);

  const resultado = await obterPool().query<{
    id: string;
    ordem: number;
    titulo: string;
    rascunho_em: string;
    salvo_em: string | null;
    arquivada_em: string | null;
    alterada_desde_o_envio: boolean;
  }>(
    `select d.id, d.ordem, d.rascunho->>'titulo' as titulo, d.rascunho_em, d.salvo_em, d.arquivada_em,
            coalesce(d.rascunho <> (select v.conteudo->'documento' from public.dietas_versoes v
                                      where v.dieta_id = d.id order by v.numero desc limit 1), true)
              as alterada_desde_o_envio
       from public.dietas d
      where d.consulta_id = $1
      order by d.ordem, d.criada_em`,
    [id]
  );

  const versoes = await versoesDasDietas(resultado.rows.map((linha) => linha.id));

  return NextResponse.json({
    dietas: resultado.rows.map((linha) => {
      const daDieta = versoes.filter((versao) => versao.dieta_id === linha.id);
      return { ...linha, versoes: daDieta.length, ultimoEnvio: daDieta[0]?.enviada_em ?? null };
    }),
  });
}

// "Gerar nova dieta": dieta em branco, vinculada ao paciente e à consulta,
// com título próprio. Não publica nada.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);

  const dados = await request.json().catch(() => null);
  const titulo = typeof dados?.titulo === "string" && dados.titulo.trim() ? dados.titulo.trim().slice(0, 200) : "Nova dieta";

  const consulta = await obterPool().query<{ patient_id: string }>(
    "select patient_id from public.consultas where id = $1",
    [id]
  );
  if (!consulta.rows[0]) return recusar("Consulta não encontrada.", 404);

  const pacienteId = consulta.rows[0].patient_id;
  const documento = await novoDocumento(pacienteId, titulo);

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");

    // Trava a consulta para a ordem das abas não repetir com cliques duplos.
    await cliente.query("select 1 from public.consultas where id = $1 for update", [id]);

    const criada = await cliente.query<{ id: string }>(
      `insert into public.dietas (patient_id, consulta_id, ordem, rascunho, criada_por)
       values ($1, $2, (select coalesce(max(ordem), 0) + 1 from public.dietas where consulta_id = $2), $3, $4)
       returning id`,
      [pacienteId, id, JSON.stringify(documento), contexto.usuarioId]
    );

    await registrarAcao(
      cliente,
      { pacienteId, tabela: "dietas", registroId: criada.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { titulo, consulta_id: id }
    );

    await cliente.query("commit");
    return NextResponse.json({ id: criada.rows[0].id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback");
    console.error("Erro ao criar dieta:", erro);
    return recusar("Não foi possível criar a dieta.", 500);
  } finally {
    cliente.release();
  }
}

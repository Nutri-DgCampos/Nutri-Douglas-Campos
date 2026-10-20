import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { registrarAcao, registrarAlteracoes } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Consulta = { patient_id: string; data: string; tipo: string; status: string };

async function carregar(cliente: PoolClient, id: string) {
  const resultado = await cliente.query<Consulta>(
    `select patient_id, to_char(data, 'YYYY-MM-DD') as data, tipo, status
       from public.consultas where id = $1 for update`,
    [id]
  );
  return resultado.rows[0] ?? null;
}

function erroDaTrava(erro: unknown) {
  return Boolean(erro && typeof erro === "object" && "code" in erro && erro.code === "P0001");
}

// Corrige data/tipo ou finaliza a consulta. Toda alteração fica na auditoria.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Consulta inválida.", 400);
  }

  const dados = await request.json().catch(() => null);
  const mudancas: Partial<Pick<Consulta, "data" | "tipo">> = {};

  if (dados?.data !== undefined) {
    if (typeof dados.data !== "string" || !DATA.test(dados.data)) {
      return recusar("Data inválida.", 400);
    }
    mudancas.data = dados.data;
  }

  if (dados?.tipo !== undefined) {
    if (dados.tipo !== "primeira" && dados.tipo !== "retorno") {
      return recusar("Tipo inválido.", 400);
    }
    mudancas.tipo = dados.tipo;
  }

  const finalizar = dados?.finalizar === true;

  if (!finalizar && Object.keys(mudancas).length === 0) {
    return recusar("Nada para alterar.", 400);
  }

  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");

    const atual = await carregar(cliente, id);

    if (!atual) {
      await cliente.query("rollback");
      return recusar("Consulta não encontrada.", 404);
    }

    const registro = {
      pacienteId: atual.patient_id,
      tabela: "consultas",
      registroId: id,
      usuarioId: contexto.usuarioId,
    };

    if (Object.keys(mudancas).length > 0) {
      await cliente.query(
        `update public.consultas
            set data = coalesce($2::date, data), tipo = coalesce($3, tipo), updated_at = now()
          where id = $1`,
        [id, mudancas.data ?? null, mudancas.tipo ?? null]
      );

      await registrarAlteracoes(cliente, registro, atual, mudancas);
    }

    if (finalizar) {
      if (atual.status === "finalizada") {
        await cliente.query("rollback");
        return recusar("A consulta já está finalizada.", 409);
      }

      // Finalizar não publica dietas nem documentos.
      await cliente.query(
        `update public.consultas
            set status = 'finalizada', finalizada_em = now(), updated_at = now()
          where id = $1`,
        [id]
      );

      await registrarAcao(cliente, registro, "finalizacao");
    }

    await cliente.query("commit");
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    console.error("Erro ao alterar consulta:", erro);
    return recusar("Não foi possível alterar a consulta.", 500);
  } finally {
    cliente.release();
  }
}

// Exclui a consulta vigente. O banco recusa consultas finalizadas ou com
// registros clínicos vinculados.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Consulta inválida.", 400);
  }

  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");

    const atual = await carregar(cliente, id);

    if (!atual) {
      await cliente.query("rollback");
      return recusar("Consulta não encontrada.", 404);
    }

    await cliente.query("delete from public.consultas where id = $1", [id]);

    await registrarAcao(
      cliente,
      { pacienteId: atual.patient_id, tabela: "consultas", registroId: id, usuarioId: contexto.usuarioId },
      "exclusao",
      { data: atual.data, tipo: atual.tipo }
    );

    await cliente.query("commit");
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});

    if (erroDaTrava(erro)) {
      return recusar(erro instanceof Error ? erro.message : "Exclusão não permitida.", 409);
    }

    console.error("Erro ao excluir consulta:", erro);
    return recusar("Não foi possível excluir a consulta.", 500);
  } finally {
    cliente.release();
  }
}

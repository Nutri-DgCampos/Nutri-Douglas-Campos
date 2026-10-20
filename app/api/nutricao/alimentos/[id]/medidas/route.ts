import { NextResponse } from "next/server";
import { fonteDoAlimento } from "@/lib/servidor/alimentos";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MedidaEnviada = {
  id?: string;
  nome_singular: string;
  nome_plural: string;
  quantidade: number;
  padrao: boolean;
};

// Grava a lista completa de medidas caseiras do alimento, na ordem enviada.
// Medidas fora da lista são removidas (substituições que as usavam ficam sem
// medida, mantendo a quantidade em g/mL).
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const { id } = await params;

  if (!UUID.test(id)) {
    return recusar("Alimento inválido.", 400);
  }

  const dados = await request.json().catch(() => null);
  const lista: unknown = dados?.medidas;

  if (!Array.isArray(lista) || lista.length > 50) {
    return recusar("Lista de medidas inválida.", 400);
  }

  const medidas: MedidaEnviada[] = [];

  for (const item of lista) {
    const singular = typeof item?.nome_singular === "string" ? item.nome_singular.trim() : "";
    const plural = typeof item?.nome_plural === "string" ? item.nome_plural.trim() : "";
    const quantidade = Number(item?.quantidade);

    if (!singular || !plural || singular.length > 80 || plural.length > 80) {
      return recusar("Informe o nome da medida no singular e no plural.", 400);
    }

    if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 100000) {
      return recusar(`A equivalência de "${singular}" deve ser maior que zero.`, 400);
    }

    if (item?.id !== undefined && (typeof item.id !== "string" || !UUID.test(item.id))) {
      return recusar("Medida inválida.", 400);
    }

    medidas.push({ id: item?.id, nome_singular: singular, nome_plural: plural, quantidade, padrao: item?.padrao === true });
  }

  if (medidas.filter((medida) => medida.padrao).length > 1) {
    return recusar("Escolha só uma medida padrão.", 400);
  }

  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");

    if (!(await fonteDoAlimento(cliente, id))) {
      await cliente.query("rollback");
      return recusar("Alimento não encontrado.", 404);
    }

    const manter = medidas.filter((medida) => medida.id).map((medida) => medida.id as string);

    await cliente.query(
      "delete from public.medidas_caseiras where alimento_id = $1 and not (id = any($2::uuid[]))",
      [id, manter]
    );
    // Libera a medida padrão antes de gravar a nova escolha (índice único).
    await cliente.query("update public.medidas_caseiras set padrao = false where alimento_id = $1", [id]);

    for (const [ordem, medida] of medidas.entries()) {
      if (medida.id) {
        const atualizada = await cliente.query(
          `update public.medidas_caseiras
              set nome_singular = $3, nome_plural = $4, quantidade = $5, padrao = $6, ordem = $7
            where id = $1 and alimento_id = $2`,
          [medida.id, id, medida.nome_singular, medida.nome_plural, medida.quantidade, medida.padrao, ordem]
        );
        if (atualizada.rowCount === 0) throw new Error("Medida de outro alimento.");
      } else {
        await cliente.query(
          `insert into public.medidas_caseiras (alimento_id, nome_singular, nome_plural, quantidade, padrao, ordem)
           values ($1, $2, $3, $4, $5, $6)`,
          [id, medida.nome_singular, medida.nome_plural, medida.quantidade, medida.padrao, ordem]
        );
      }
    }

    await cliente.query("commit");
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    console.error("Erro ao salvar medidas caseiras:", erro);
    return recusar("Não foi possível salvar as medidas caseiras.", 500);
  } finally {
    cliente.release();
  }
}

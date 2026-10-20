import { NextResponse } from "next/server";
import { fonteDoAlimento } from "@/lib/servidor/alimentos";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Grava a lista completa de substituições do alimento, na ordem enviada.
// As quantidades são definidas pelo nutricionista; o sistema não ajusta nada
// sozinho. Dietas já publicadas guardam a própria cópia e não mudam.
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
  const lista: unknown = dados?.substituicoes;

  if (!Array.isArray(lista) || lista.length > 100) {
    return recusar("Lista de substituições inválida.", 400);
  }

  type Substituicao = {
    substitutoId: string;
    quantidadeReferencia: number;
    quantidadeSubstituto: number;
    medidaId: string | null;
    quantidadeMedidas: number | null;
    observacao: string | null;
  };

  const substituicoes: Substituicao[] = [];
  const vistos = new Set<string>();

  for (const item of lista) {
    const substitutoId = item?.substitutoId;
    const quantidadeReferencia = Number(item?.quantidadeReferencia);
    const quantidadeSubstituto = Number(item?.quantidadeSubstituto);
    const medidaId = item?.medidaId ?? null;
    const quantidadeMedidas = item?.quantidadeMedidas == null ? null : Number(item.quantidadeMedidas);
    const observacao = typeof item?.observacao === "string" && item.observacao.trim() ? item.observacao.trim().slice(0, 300) : null;

    if (typeof substitutoId !== "string" || !UUID.test(substitutoId) || substitutoId === id) {
      return recusar("Substituto inválido.", 400);
    }
    if (vistos.has(substitutoId)) return recusar("O mesmo substituto aparece duas vezes.", 400);
    vistos.add(substitutoId);

    if (!(quantidadeReferencia > 0) || !(quantidadeSubstituto > 0) || quantidadeReferencia > 100000 || quantidadeSubstituto > 100000) {
      return recusar("As quantidades das substituições devem ser maiores que zero.", 400);
    }
    if (medidaId !== null && (typeof medidaId !== "string" || !UUID.test(medidaId))) {
      return recusar("Medida da substituição inválida.", 400);
    }
    if (quantidadeMedidas !== null && !(quantidadeMedidas > 0)) {
      return recusar("Quantidade de medidas inválida.", 400);
    }

    substituicoes.push({ substitutoId, quantidadeReferencia, quantidadeSubstituto, medidaId, quantidadeMedidas, observacao });
  }

  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");

    if (!(await fonteDoAlimento(cliente, id))) {
      await cliente.query("rollback");
      return recusar("Alimento não encontrado.", 404);
    }

    await cliente.query("delete from public.substituicoes where alimento_id = $1", [id]);

    for (const [ordem, item] of substituicoes.entries()) {
      // A medida, quando informada, precisa ser do próprio substituto.
      if (item.medidaId) {
        const medida = await cliente.query(
          "select 1 from public.medidas_caseiras where id = $1 and alimento_id = $2",
          [item.medidaId, item.substitutoId]
        );
        if (medida.rowCount === 0) {
          await cliente.query("rollback");
          return recusar("A medida escolhida não pertence ao alimento substituto.", 400);
        }
      }

      await cliente.query(
        `insert into public.substituicoes
           (alimento_id, substituto_id, quantidade_referencia, quantidade_substituto,
            medida_caseira_id, quantidade_medidas, observacao, ordem)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, item.substitutoId, item.quantidadeReferencia, item.quantidadeSubstituto, item.medidaId, item.medidaId ? item.quantidadeMedidas : null, item.observacao, ordem]
      );
    }

    await cliente.query("commit");
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    console.error("Erro ao salvar substituições:", erro);
    return recusar("Não foi possível salvar as substituições.", 500);
  } finally {
    cliente.release();
  }
}

import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

// Abre uma nova consulta para o paciente. Se já houver uma em andamento,
// devolve 409 com ela, para a tela oferecer "continuar a existente".
export async function POST(request: Request) {
  const contexto = await exigirNutricionista(request);

  if (contexto instanceof NextResponse) {
    return contexto;
  }

  const dados = await request.json().catch(() => null);
  const pacienteId = typeof dados?.pacienteId === "string" ? dados.pacienteId : "";
  const tipo = dados?.tipo === "primeira" || dados?.tipo === "retorno" ? dados.tipo : null;
  const data =
    typeof dados?.data === "string" && DATA.test(dados.data) ? dados.data : hojeNoBrasil();

  if (!UUID.test(pacienteId) || !tipo) {
    return recusar("Informe o paciente e o tipo de consulta.", 400);
  }

  const cliente = await obterPool().connect();

  try {
    await cliente.query("begin");

    const paciente = await cliente.query("select 1 from public.patients where id = $1", [pacienteId]);

    if (paciente.rowCount === 0) {
      await cliente.query("rollback");
      return recusar("Paciente não encontrado.", 404);
    }

    // O índice único parcial impede duas consultas em andamento, inclusive
    // com cliques repetidos ou requisições simultâneas.
    const resultado = await cliente.query<{ id: string }>(
      `insert into public.consultas (patient_id, data, tipo, nutricionista_id)
       values ($1, $2, $3, $4)
       on conflict (patient_id) where status = 'em_andamento' do nothing
       returning id`,
      [pacienteId, data, tipo, contexto.usuarioId]
    );

    if (resultado.rowCount === 0) {
      await cliente.query("rollback");

      const existente = await obterPool().query<{ id: string; data: string }>(
        `select id, to_char(data, 'YYYY-MM-DD') as data from public.consultas
          where patient_id = $1 and status = 'em_andamento'`,
        [pacienteId]
      );

      return NextResponse.json(
        {
          erro: "Este paciente já possui uma consulta em andamento.",
          consultaEmAndamento: existente.rows[0] ?? null,
        },
        { status: 409 }
      );
    }

    const id = resultado.rows[0].id;

    await registrarAcao(
      cliente,
      { pacienteId, tabela: "consultas", registroId: id, usuarioId: contexto.usuarioId },
      "criacao",
      { data, tipo }
    );

    await cliente.query("commit");

    return NextResponse.json({ id }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    console.error("Erro ao criar consulta:", erro);
    return recusar("Não foi possível criar a consulta.", 500);
  } finally {
    cliente.release();
  }
}

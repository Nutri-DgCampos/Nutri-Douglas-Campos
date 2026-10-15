import { NextResponse } from "next/server";
import { removerPasta } from "@/lib/servidor/arquivos";
import { obterPool } from "@/lib/servidor/banco";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Exclui o paciente com todo o histórico: ciclos, relatórios, dietas,
// pagamentos, exames, o acesso ao sistema e os arquivos enviados.
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
    return recusar("Paciente inválido.", 400);
  }

  const cliente = await obterPool().connect();
  let usuarioId: string | null = null;

  try {
    await cliente.query("begin");

    const paciente = await cliente.query<{ auth_user_id: string | null }>(
      "select auth_user_id from public.patients where id = $1 for update",
      [id]
    );

    if (paciente.rowCount === 0) {
      await cliente.query("rollback");
      return recusar("Paciente não encontrado.", 404);
    }

    usuarioId = paciente.rows[0].auth_user_id;

    // Tabelas que apontam para o paciente ou para os ciclos sem exclusão em cascata.
    await cliente.query(
      `delete from public.payments
        where patient_id = $1
           or cycle_id in (select c.id from public.diet_cycles c where c.patient_id = $1)`,
      [id]
    );
    await cliente.query("delete from public.renewal_requests where patient_id = $1", [id]);
    await cliente.query("delete from public.patient_reports where patient_id = $1", [id]);
    await cliente.query("delete from public.diet_deliveries where patient_id = $1", [id]);
    await cliente.query("delete from public.diet_cycles where patient_id = $1", [id]);

    // O restante (alertas, evolução, push, notificações, exames) sai em cascata.
    await cliente.query("delete from public.patients where id = $1", [id]);

    if (usuarioId) {
      // O perfil sai em cascata junto com o usuário.
      await cliente.query("delete from public.users where id = $1", [usuarioId]);
    }

    await cliente.query("commit");
  } catch (erro) {
    await cliente.query("rollback").catch(() => {});
    console.error("Erro ao excluir paciente:", erro);
    return recusar("Não foi possível excluir o paciente.", 500);
  } finally {
    cliente.release();
  }

  // Arquivos: só depois que o banco confirmou a exclusão.
  try {
    await removerPasta("dietas", id);
    await removerPasta("exames", id);
    await removerPasta("treinos", id);
    await removerPasta("fotos", id);

    if (usuarioId) {
      await removerPasta("comprovantes", usuarioId);
    }
  } catch (erro) {
    console.error("Paciente excluído, mas houve erro ao remover arquivos:", erro);
  }

  return NextResponse.json({ sucesso: true });
}

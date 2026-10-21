import { NextResponse } from "next/server";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

// Vincular o exame à consulta e à solicitação; nome e data do exame. O
// arquivo original não é copiado nem alterado.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Exame inválido.", 400);
  const dados = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!dados) return recusar("Dados inválidos.", 400);

  const pool = obterPool();
  const exame = await pool.query<{ patient_id: string }>("select patient_id from public.blood_exams where id = $1", [id]);
  if (!exame.rows[0]) return recusar("Exame não encontrado.", 404);
  const pacienteId = exame.rows[0].patient_id;

  const campos: string[] = [];
  const valores: unknown[] = [id];
  const definir = (coluna: string, valor: unknown) => {
    valores.push(valor);
    campos.push(`${coluna} = $${valores.length}`);
  };

  if ("consultaId" in dados) {
    const consultaId = dados.consultaId === null ? null : String(dados.consultaId);
    if (consultaId) {
      if (!UUID.test(consultaId)) return recusar("Consulta inválida.", 400);
      const c = await pool.query("select 1 from public.consultas where id = $1 and patient_id = $2", [consultaId, pacienteId]);
      if (!c.rowCount) return recusar("A consulta é de outro paciente.", 400);
    }
    definir("consulta_id", consultaId);
  }
  if ("solicitacaoId" in dados) {
    const solicitacaoId = dados.solicitacaoId === null ? null : String(dados.solicitacaoId);
    if (solicitacaoId) {
      if (!UUID.test(solicitacaoId)) return recusar("Solicitação inválida.", 400);
      const s = await pool.query("select 1 from public.solicitacoes_exames where id = $1 and patient_id = $2", [solicitacaoId, pacienteId]);
      if (!s.rowCount) return recusar("A solicitação é de outro paciente.", 400);
    }
    definir("solicitacao_id", solicitacaoId);
  }
  if ("nome" in dados) definir("exam_name", typeof dados.nome === "string" && dados.nome.trim() ? dados.nome.trim().slice(0, 200) : null);
  if ("data" in dados) {
    const data = typeof dados.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dados.data) ? dados.data : null;
    definir("exam_date", data);
  }
  if (!campos.length) return recusar("Nada para alterar.", 400);
  await pool.query(`update public.blood_exams set ${campos.join(", ")} where id = $1`, valores);
  return NextResponse.json({ ok: true });
}

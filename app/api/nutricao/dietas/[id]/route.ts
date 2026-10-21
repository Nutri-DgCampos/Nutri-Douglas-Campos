import { NextResponse } from "next/server";
import { alimentosDoDocumento, validarDocumento } from "@/lib/nutricao/dieta";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import {
  UUID,
  buscarDieta,
  dadosDoPaciente,
  dadosDosAlimentos,
  gastosDasAvaliacoes,
  gravarDieta,
  pesoMaisRecente,
  versoesDasDietas,
} from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Tudo o que o editor precisa para abrir uma dieta.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const dieta = await buscarDieta(id);
  if (!dieta) return recusar("Dieta não encontrada.", 404);

  const pool = obterPool();
  const ids = [...alimentosDoDocumento(dieta.rascunho), ...(dieta.salvo ? alimentosDoDocumento(dieta.salvo) : [])];

  const [paciente, consulta, versoes, anteriores, nutrientes, alimentos, pesoAtual, ciclo, gastos] = await Promise.all([
    dadosDoPaciente(dieta.patient_id),
    pool.query<{ data: string; tipo: string; status: string }>(
      "select to_char(data, 'YYYY-MM-DD') as data, tipo, status from public.consultas where id = $1",
      [dieta.consulta_id]
    ),
    versoesDasDietas([id]),
    // Dietas já enviadas ao paciente, para o "Total da dieta anterior".
    pool.query(
      `select v.id, v.dieta_id, v.numero, v.enviada_em, v.totais,
              v.conteudo->'documento'->>'titulo' as titulo,
              (v.conteudo->'documento'->'pesoReferencia'->>'valor')::float as peso
         from public.dietas_versoes v
        where v.patient_id = $1
        order by v.enviada_em desc
        limit 50`,
      [dieta.patient_id]
    ),
    pool.query("select codigo, nome, unidade, grupo, ordem from public.nutrientes order by ordem"),
    dadosDosAlimentos(ids),
    pesoMaisRecente(dieta.patient_id),
    // Ciclo ativo e dietas desta consulta já enviadas nele: o envio de uma
    // dieta complementar (ex.: dias sem treino) sugere manter o ciclo.
    pool.query<{ id: string; inicio: string; fim: string; enviadas_da_consulta: number }>(
      `select c.id, to_char(c.start_date, 'YYYY-MM-DD') as inicio, to_char(c.end_date, 'YYYY-MM-DD') as fim,
              (select count(*)::int from public.dietas_versoes v
                 join public.diet_deliveries e on e.id = v.entrega_id
                 join public.dietas d on d.id = v.dieta_id
                where e.cycle_id = c.id and d.consulta_id = $2) as enviadas_da_consulta
         from public.diet_cycles c
        where c.patient_id = $1 and c.status = 'ativo'
        limit 1`,
      [dieta.patient_id, dieta.consulta_id]
    ),
    gastosDasAvaliacoes(dieta.patient_id),
  ]);

  if (!paciente) return recusar("Paciente não encontrado.", 404);

  return NextResponse.json({
    dieta,
    versoes,
    paciente,
    consulta: consulta.rows[0] ?? null,
    // Lembrete da anamnese chega com a Fase 5 (anamnese).
    lembretes: { cadastro: paciente.important_note?.trim() || null, anamnese: null },
    anteriores: anteriores.rows,
    nutrientes: nutrientes.rows,
    pesoAtual,
    cicloAtivo: ciclo.rows[0] ?? null,
    gastos,
    ...alimentos,
  });
}

// Salvamento automático (rascunho) ou botão Salvar (rascunho + versão salva).
export async function PUT(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const dados = await request.json().catch(() => null);
  const revisao = dados?.revisao;
  if (!Number.isInteger(revisao)) return recusar("Revisão da dieta não informada.", 400);

  const validacao = validarDocumento(dados?.documento);
  if ("erro" in validacao) return recusar(validacao.erro, 400);

  const resultado = await gravarDieta(id, validacao.documento, revisao, dados?.salvar === true);

  if (!resultado.ok) {
    return NextResponse.json(
      { erro: resultado.erro, revisaoAtual: resultado.linha?.revisao ?? null },
      { status: resultado.status }
    );
  }

  const { revisao: nova, rascunho_em, salvo_em } = resultado.linha;
  return NextResponse.json({ revisao: nova, rascunho_em, salvo_em });
}

// Ações sobre a dieta: descartar o rascunho (voltar à última versão salva),
// arquivar e reativar.
export async function PATCH(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const dados = await request.json().catch(() => null);
  const acao = dados?.acao;
  const pool = obterPool();

  if (acao === "descartar_rascunho") {
    const resultado = await pool.query(
      `update public.dietas
          set rascunho = salvo, rascunho_em = now(), revisao = revisao + 1
        where id = $1 and salvo is not null and arquivada_em is null
        returning revisao`,
      [id]
    );
    if (!resultado.rows[0]) return recusar("Não há versão salva para restaurar.", 409);
    return NextResponse.json({ revisao: resultado.rows[0].revisao });
  }

  if (acao === "arquivar" || acao === "reativar") {
    const resultado = await pool.query(
      `update public.dietas set arquivada_em = ${acao === "arquivar" ? "now()" : "null"}, revisao = revisao + 1
        where id = $1 returning revisao`,
      [id]
    );
    if (!resultado.rows[0]) return recusar("Dieta não encontrada.", 404);
    return NextResponse.json({ revisao: resultado.rows[0].revisao });
  }

  return recusar("Ação inválida.", 400);
}

// Botão Apagar: só dietas que nunca foram enviadas (o banco também garante).
export async function DELETE(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const dieta = await buscarDieta(id, cliente, true);

    if (!dieta) {
      await cliente.query("rollback");
      return recusar("Dieta não encontrada.", 404);
    }

    await cliente.query("delete from public.dietas where id = $1", [id]);
    await registrarAcao(
      cliente,
      { pacienteId: dieta.patient_id, tabela: "dietas", registroId: id, usuarioId: contexto.usuarioId },
      "exclusao",
      { titulo: dieta.rascunho.titulo }
    );
    await cliente.query("commit");
    return NextResponse.json({ sucesso: true });
  } catch (erro) {
    await cliente.query("rollback");
    if ((erro as { code?: string }).code === "P0001") return recusar((erro as Error).message, 409);
    console.error("Erro ao apagar dieta:", erro);
    return recusar("Não foi possível apagar a dieta.", 500);
  } finally {
    cliente.release();
  }
}

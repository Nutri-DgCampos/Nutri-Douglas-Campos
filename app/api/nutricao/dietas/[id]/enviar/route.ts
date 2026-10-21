import { NextResponse } from "next/server";
import { hojeNoBrasil } from "@/lib/cronograma";
import { NUTRIENTES_DO_PAINEL, pendenciasDoEnvio, totaisDaDieta, validarDocumento } from "@/lib/nutricao/dieta";
import { gravarArquivo, removerArquivo, resolverCaminho } from "@/lib/servidor/arquivos";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID, buscarDieta, dadosDaEmissao, gastosDasAvaliacoes } from "@/lib/servidor/dietas";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { enfileirarAtualizacao } from "@/lib/servidor/notificacoes";
import { nomeDoArquivo } from "@/lib/servidor/pdf/documento";
import { gerarPdfDaDieta } from "@/lib/servidor/pdf/dieta";
import { carregarIdentidade } from "@/lib/servidor/pdf/identidade";

export const runtime = "nodejs";

class Recusa extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(mensagem);
  }
}

// "Enviar ao paciente": publica a versão atual da dieta.
//
// Tudo numa transação: entrega da dieta com o PDF gerado (o mesmo registro
// do envio por upload, que a área do paciente já mostra), ciclo de 33 dias
// (novo ou o atual, por escolha explícita), versão imutável da dieta e
// auditoria. Se algo falhar, nada fica publicado e o ciclo não começa. O
// aviso no celular sai só depois de tudo gravado.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;

  const { id } = await params;
  if (!UUID.test(id)) return recusar("Dieta inválida.", 400);

  const dados = await request.json().catch(() => null);
  const revisao = dados?.revisao;
  const modelo = dados?.modelo === "detalhado" ? "detalhado" : "simples";
  const novoCiclo = dados?.novoCiclo;

  if (!Number.isInteger(revisao)) return recusar("Revisão da dieta não informada.", 400);
  if (typeof novoCiclo !== "boolean") return recusar("Informe se o envio inicia um novo ciclo.", 400);

  const pool = obterPool();
  const cliente = await pool.connect();
  let arquivoGravado: string | null = null;
  let entregaId: string | null = null;
  let pacienteId: string | null = null;

  try {
    await cliente.query("begin");

    const dieta = await buscarDieta(id, cliente, true);
    if (!dieta) throw new Recusa("Dieta não encontrada.", 404);
    if (dieta.arquivada_em) throw new Recusa("A dieta está arquivada.", 409);

    // Envia exatamente a revisão que o nutricionista está vendo.
    if (dieta.revisao !== revisao) {
      throw new Recusa("A dieta foi alterada em outra janela. Recarregue antes de enviar.", 409);
    }

    const validacao = validarDocumento(dieta.rascunho);
    if ("erro" in validacao) throw new Recusa(validacao.erro, 400);
    const documento = validacao.documento;

    const pendencias = pendenciasDoEnvio(documento);
    if (pendencias.length > 0) throw new Recusa("Corrija as pendências antes de enviar.", 400, { pendencias });

    pacienteId = dieta.patient_id;

    // Sem escolha do nutricionista, a versão guarda a avaliação mais recente.
    if (documento.gastoReferencia === undefined) {
      documento.gastoReferencia = (await gastosDasAvaliacoes(pacienteId, cliente))[0] ?? null;
    }

    // Trava o paciente: dois envios simultâneos não se cruzam.
    await cliente.query("select 1 from public.patients where id = $1 for update", [pacienteId]);

    const incompleta = await cliente.query(
      "select 1 from public.diet_deliveries where patient_id = $1 and status = 'em_andamento' limit 1",
      [pacienteId]
    );
    if (incompleta.rowCount) {
      throw new Recusa(
        "Este paciente tem uma entrega de dieta que não foi concluída. Verifique essa entrega antes de enviar.",
        409
      );
    }

    const emissao = await dadosDaEmissao(dieta, documento);
    if (!emissao) throw new Recusa("Paciente ou consulta não encontrados.", 404);

    const hoje = hojeNoBrasil();

    // 1. Ciclo: novo (envio principal) ou o atual (dieta complementar ou revisão).
    let cicloId: string;
    const renovacoes = await cliente.query<{ id: string; requested_plan: string | null }>(
      "select id, requested_plan from public.renewal_requests where patient_id = $1 and status = 'pendente'",
      [pacienteId]
    );

    if (novoCiclo) {
      const paciente = await cliente.query<{ plan: string }>("select plan from public.patients where id = $1", [pacienteId]);
      const planoNovo = renovacoes.rows.find((r) => r.requested_plan)?.requested_plan ?? paciente.rows[0].plan;

      const numero = await cliente.query<{ numero: number }>(
        "select public.iniciar_ciclo_dieta($1, $2::date, ($2::date + 33), $3) as numero",
        [pacienteId, hoje, planoNovo]
      );
      const ciclo = await cliente.query<{ id: string }>(
        "select id from public.diet_cycles where patient_id = $1 and cycle_number = $2 and status = 'ativo'",
        [pacienteId, numero.rows[0].numero]
      );
      if (!ciclo.rows[0]) throw new Error("Ciclo recém-criado não encontrado.");
      cicloId = ciclo.rows[0].id;

      if (planoNovo !== paciente.rows[0].plan) {
        await cliente.query("update public.patients set plan = $2 where id = $1", [pacienteId, planoNovo]);
      }
      if (renovacoes.rowCount) {
        await cliente.query(
          "update public.renewal_requests set status = 'aprovada' where id = any($1::uuid[]) and status = 'pendente'",
          [renovacoes.rows.map((r) => r.id)]
        );
      }
    } else {
      const ativo = await cliente.query<{ id: string }>(
        "select id from public.diet_cycles where patient_id = $1 and status = 'ativo' limit 1",
        [pacienteId]
      );
      if (!ativo.rows[0]) {
        throw new Recusa("O paciente não tem ciclo ativo. Envie como novo ciclo de 33 dias.", 409);
      }
      cicloId = ativo.rows[0].id;
    }

    // 2. Entrega da dieta (mesmo registro do envio por upload).
    const entrega = await cliente.query<{ id: string }>(
      `insert into public.diet_deliveries (patient_id, diet_date, status, cycle_id)
       values ($1, $2, 'em_andamento', $3) returning id`,
      [pacienteId, hoje, cicloId]
    );
    entregaId = entrega.rows[0].id;

    // 3. PDF da versão enviada.
    const pdf = await gerarPdfDaDieta({ ...emissao, modelo }, await carregarIdentidade());
    const nome = nomeDoArquivo("Dieta", emissao.paciente.nome, hoje);
    const caminho = `${pacienteId}/${entregaId}/${Date.now()}-${nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const destino = resolverCaminho("dietas", caminho);
    if (!destino) throw new Error("Caminho do PDF inválido.");

    await gravarArquivo(destino, pdf, false);
    arquivoGravado = destino;

    await cliente.query(
      "insert into public.diet_delivery_files (delivery_id, file_name, storage_path) values ($1, $2, $3)",
      [entregaId, nome, caminho]
    );

    await cliente.query("update public.diet_deliveries set status = 'concluida' where id = $1", [entregaId]);

    // 4. Versão imutável, com a composição usada e os totais do painel.
    const versao = await cliente.query<{ id: string; numero: number }>(
      `insert into public.dietas_versoes
         (dieta_id, patient_id, numero, conteudo, totais, modelo_pdf, entrega_id, novo_ciclo, enviada_por)
       values ($1, $2, (select coalesce(max(numero), 0) + 1 from public.dietas_versoes where dieta_id = $1),
               $3, $4, $5, $6, $7, $8)
       returning id, numero`,
      [
        id,
        pacienteId,
        JSON.stringify(emissao),
        JSON.stringify(totaisDaDieta(documento, emissao.composicoes, NUTRIENTES_DO_PAINEL)),
        modelo,
        entregaId,
        novoCiclo,
        contexto.usuarioId,
      ]
    );

    // O que foi enviado passa a ser também a última versão salva.
    const atualizada = await cliente.query<{ revisao: number }>(
      `update public.dietas set salvo = rascunho, salvo_em = now(), revisao = revisao + 1
        where id = $1 returning revisao`,
      [id]
    );

    await registrarAcao(
      cliente,
      { pacienteId, tabela: "dietas_versoes", registroId: versao.rows[0].id, usuarioId: contexto.usuarioId },
      "criacao",
      { dieta_id: id, numero: versao.rows[0].numero, titulo: documento.titulo, novo_ciclo: novoCiclo, entrega_id: entregaId }
    );

    await cliente.query("commit");
    arquivoGravado = null;

    // Aviso no celular; uma falha aqui não desfaz o envio.
    enfileirarAtualizacao("dieta", pacienteId, entregaId).catch((erro) =>
      console.error("Erro ao registrar notificação de dieta:", erro)
    );

    return NextResponse.json({
      versao: versao.rows[0].numero,
      revisao: atualizada.rows[0].revisao,
      arquivo: caminho,
    });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    if (arquivoGravado) await removerArquivo(arquivoGravado).catch(() => undefined);

    if (erro instanceof Recusa) {
      return NextResponse.json({ erro: erro.message, ...erro.extra }, { status: erro.status });
    }

    // Índice único: outra entrega em andamento foi criada no mesmo instante.
    if ((erro as { code?: string }).code === "23505") {
      return recusar("Já existe um envio de dieta em andamento para este paciente.", 409);
    }

    console.error("Erro ao enviar dieta:", { erro, dietaId: id, pacienteId, entregaId });
    return recusar("Não foi possível enviar a dieta. Nada foi publicado; tente novamente.", 500);
  } finally {
    cliente.release();
  }
}

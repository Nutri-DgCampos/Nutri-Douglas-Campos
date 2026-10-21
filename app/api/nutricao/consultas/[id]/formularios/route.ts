import { NextResponse } from "next/server";
import { pendenciasDoModelo, perguntasParaFicha, recordatorioVazio, type Pergunta } from "@/lib/nutricao/anamnese";
import { registrarAcao } from "@/lib/servidor/auditoria";
import { obterPool } from "@/lib/servidor/banco";
import { UUID } from "@/lib/servidor/dietas";
import type { LinhaFormulario } from "@/lib/servidor/formularios";
import { resumoDoFormulario } from "@/lib/servidor/formulariosNutricionista";
import { exigirNutricionista, recusar } from "@/lib/servidor/http";
import { enfileirarAtualizacao } from "@/lib/servidor/notificacoes";

export const runtime = "nodejs";

type Contexto = { params: Promise<{ id: string }> };

// Anamneses e recordatórios da consulta, e os modelos disponíveis.
export async function GET(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);

  const pool = obterPool();
  const [anamneses, recordatorios, modelos] = await Promise.all([
    pool.query<LinhaFormulario>("select * from public.anamneses where consulta_id = $1 order by criado_em", [id]),
    pool.query<LinhaFormulario>("select * from public.recordatorios where consulta_id = $1 order by criado_em", [id]),
    pool.query("select id, nome, versao from public.modelos_anamnese where arquivado_em is null order by nome"),
  ]);
  return NextResponse.json({
    anamneses: anamneses.rows.map(resumoDoFormulario),
    recordatorios: recordatorios.rows.map(resumoDoFormulario),
    modelos: modelos.rows,
  });
}

// Nova ficha de anamnese (a partir de um modelo) ou novo recordatório.
// Se a consulta já tem a mesma ficha, devolve a existente (409) e só cria
// outra com "duplicar". "enviar" já disponibiliza ao paciente.
export async function POST(request: Request, { params }: Contexto) {
  const contexto = await exigirNutricionista(request);
  if (contexto instanceof NextResponse) return contexto;
  const { id } = await params;
  if (!UUID.test(id)) return recusar("Consulta inválida.", 400);

  const dados = await request.json().catch(() => null);
  const tipo = dados?.tipo;
  if (tipo !== "anamnese" && tipo !== "recordatorio") return recusar("Tipo inválido.", 400);
  const enviar = dados?.enviar === true;
  const duplicar = dados?.duplicar === true;

  const pool = obterPool();
  const consulta = await pool.query<{ patient_id: string }>("select patient_id from public.consultas where id = $1", [id]);
  if (!consulta.rows[0]) return recusar("Consulta não encontrada.", 404);
  const pacienteId = consulta.rows[0].patient_id;

  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    await cliente.query("select 1 from public.consultas where id = $1 for update", [id]);
    let novoId: string;

    if (tipo === "anamnese") {
      if (!UUID.test(String(dados?.modeloId))) {
        await cliente.query("rollback");
        return recusar("Escolha o modelo de anamnese.", 400);
      }
      const modelo = await cliente.query<{ id: string; nome: string; perguntas: Pergunta[]; versao: number }>(
        "select id, nome, perguntas, versao from public.modelos_anamnese where id = $1 and arquivado_em is null for update",
        [dados.modeloId]
      );
      if (!modelo.rows[0]) {
        await cliente.query("rollback");
        return recusar("Modelo não encontrado ou arquivado.", 404);
      }
      const pendencias = pendenciasDoModelo(modelo.rows[0].nome, modelo.rows[0].perguntas);
      if (pendencias.length) {
        await cliente.query("rollback");
        return recusar(`O modelo precisa de ajustes: ${pendencias[0]}`, 400);
      }
      if (!duplicar) {
        const existente = await cliente.query<{ id: string }>(
          "select id from public.anamneses where consulta_id = $1 and modelo_id = $2 and arquivado_em is null order by criado_em limit 1",
          [id, dados.modeloId]
        );
        if (existente.rows[0]) {
          await cliente.query("rollback");
          return NextResponse.json({ erro: "Esta consulta já tem uma ficha deste modelo.", existente: existente.rows[0].id }, { status: 409 });
        }
      }
      const criada = await cliente.query<{ id: string }>(
        `insert into public.anamneses (patient_id, consulta_id, modelo_id, modelo_versao, titulo, perguntas, enviado_em, criado_por)
         values ($1, $2, $3, $4, $5, $6, ${enviar ? "now()" : "null"}, $7) returning id`,
        [pacienteId, id, modelo.rows[0].id, modelo.rows[0].versao, modelo.rows[0].nome, JSON.stringify(perguntasParaFicha(modelo.rows[0].perguntas)), contexto.usuarioId]
      );
      await cliente.query("update public.modelos_anamnese set usos = usos + 1 where id = $1", [modelo.rows[0].id]);
      novoId = criada.rows[0].id;
      await registrarAcao(
        cliente,
        { pacienteId, tabela: "anamneses", registroId: novoId, usuarioId: contexto.usuarioId },
        "criacao",
        { modelo: modelo.rows[0].nome, versao: modelo.rows[0].versao, enviada_ao_paciente: enviar }
      );
    } else {
      if (!duplicar) {
        const existente = await cliente.query<{ id: string }>(
          "select id from public.recordatorios where consulta_id = $1 and arquivado_em is null order by criado_em limit 1",
          [id]
        );
        if (existente.rows[0]) {
          await cliente.query("rollback");
          return NextResponse.json({ erro: "Esta consulta já tem um recordatório.", existente: existente.rows[0].id }, { status: 409 });
        }
      }
      const criado = await cliente.query<{ id: string }>(
        `insert into public.recordatorios (patient_id, consulta_id, conteudo, enviado_em, criado_por)
         values ($1, $2, $3, ${enviar ? "now()" : "null"}, $4) returning id`,
        [pacienteId, id, JSON.stringify(recordatorioVazio()), contexto.usuarioId]
      );
      novoId = criado.rows[0].id;
      await registrarAcao(
        cliente,
        { pacienteId, tabela: "recordatorios", registroId: novoId, usuarioId: contexto.usuarioId },
        "criacao",
        { enviado_ao_paciente: enviar }
      );
    }

    await cliente.query("commit");
    if (enviar) {
      enfileirarAtualizacao("formulario", pacienteId, novoId, `${novoId}:${Date.now()}`).catch((e) =>
        console.error("Erro ao registrar aviso do formulário:", e)
      );
    }
    return NextResponse.json({ id: novoId }, { status: 201 });
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    console.error("Erro ao criar formulário:", erro);
    return recusar("Não foi possível criar.", 500);
  } finally {
    cliente.release();
  }
}

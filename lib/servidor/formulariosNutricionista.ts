import { NextResponse } from "next/server";
import {
  LIMITES_ANAMNESE,
  situacaoDoFormulario,
  validarRecordatorio,
  validarRespostas,
} from "@/lib/nutricao/anamnese";
import { registrarAcao, registrarAlteracoes } from "./auditoria";
import { obterPool } from "./banco";
import { UUID } from "./dietas";
import { TABELA, buscarFormulario, comOPaciente, type LinhaFormulario, type TipoDeFormulario } from "./formularios";
import { exigirNutricionista, recusar } from "./http";
import { enfileirarAtualizacao } from "./notificacoes";

// Rotas do nutricionista para uma ficha de anamnese ou um recordatório.

type Parametros = { params: Promise<{ id: string }> };

const NOME: Record<TipoDeFormulario, string> = { anamnese: "Anamnese", recordatorio: "Recordatório" };

export function resumoDoFormulario(f: LinhaFormulario) {
  return {
    id: f.id,
    consulta_id: f.consulta_id,
    status: f.status,
    situacao: situacaoDoFormulario(f),
    enviado_em: f.enviado_em,
    respondido_em: f.respondido_em,
    lido_em: f.lido_em,
    concluido_em: f.concluido_em,
    arquivado_em: f.arquivado_em,
    criado_em: f.criado_em,
    atualizado_em: f.atualizado_em,
    titulo: f.titulo ?? null,
  };
}

// Abrir a ficha. O primeiro acesso depois da resposta do paciente encerra a
// edição pelo paciente (ele continua podendo ler).
export function rotaGet(tipo: TipoDeFormulario) {
  return async function GET(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Formulário inválido.", 400);

    const pool = obterPool();
    let f = await buscarFormulario(tipo, id);
    if (!f) return recusar(`${NOME[tipo]} não encontrado(a).`, 404);

    if (f.respondido_em && !f.lido_em && f.status === "rascunho") {
      await pool.query(`update public.${TABELA[tipo]} set lido_em = now() where id = $1 and lido_em is null`, [id]);
      f = (await buscarFormulario(tipo, id))!;
    }

    const [paciente, consulta] = await Promise.all([
      pool.query<{ id: string; name: string; phone: string | null; sex: string | null; birth_date: string | null }>(
        "select id, name, phone, sex, to_char(birth_date, 'YYYY-MM-DD') as birth_date from public.patients where id = $1",
        [f.patient_id]
      ),
      pool.query<{ data: string; tipo: string; status: string }>(
        "select to_char(data, 'YYYY-MM-DD') as data, tipo, status from public.consultas where id = $1",
        [f.consulta_id]
      ),
    ]);

    return NextResponse.json({
      formulario: { ...f, situacao: situacaoDoFormulario(f), comPaciente: comOPaciente(f) },
      paciente: paciente.rows[0] ?? null,
      consulta: consulta.rows[0] ?? null,
    });
  };
}

// Salvamento automático do nutricionista. Enquanto o formulário está com o
// paciente, as respostas não mudam aqui (só observações e lembrete).
export function rotaPut(tipo: TipoDeFormulario) {
  return async function PUT(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Formulário inválido.", 400);
    const dados = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!dados) return recusar("Dados inválidos.", 400);

    const texto = (valor: unknown, limite: number) => (typeof valor === "string" ? valor.slice(0, limite) : undefined);

    const cliente = await obterPool().connect();
    try {
      await cliente.query("begin");
      const f = await buscarFormulario(tipo, id, cliente, true);
      if (!f) throw Object.assign(new Error(), { recusa: recusar("Formulário não encontrado.", 404) });
      if (f.status === "concluido" || f.arquivado_em) {
        throw Object.assign(new Error(), { recusa: recusar("Formulário concluído ou arquivado: reabra para alterar.", 409) });
      }

      const observacoes = tipo === "anamnese" ? texto(dados.observacoes, LIMITES_ANAMNESE.observacoes) : undefined;
      const lembrete = tipo === "anamnese" ? texto(dados.lembrete, 2000) : undefined;

      if (comOPaciente(f)) {
        // Campos só do nutricionista: não mexem na revisão das respostas.
        if (tipo === "anamnese" && (observacoes !== undefined || lembrete !== undefined)) {
          await cliente.query(
            `update public.anamneses
                set observacoes = coalesce($2, observacoes),
                    lembrete_em = case when $3::text is not null and $3 <> lembrete then now() else lembrete_em end,
                    lembrete = coalesce($3, lembrete),
                    atualizado_em = now()
              where id = $1`,
            [id, observacoes ?? null, lembrete ?? null]
          );
        }
        await cliente.query("commit");
        return NextResponse.json({ revisao: f.revisao, somenteObservacoes: true });
      }

      if (dados.revisao !== f.revisao) {
        throw Object.assign(new Error(), {
          recusa: recusar("O formulário foi alterado em outra janela ou pelo paciente. Recarregue antes de continuar.", 409),
        });
      }

      let gravado;
      if (tipo === "anamnese") {
        const respostas = validarRespostas(dados.respostas, f.perguntas ?? []);
        if ("erro" in respostas) throw Object.assign(new Error(), { recusa: recusar(respostas.erro, 400) });
        gravado = await cliente.query<{ revisao: number }>(
          `update public.anamneses
              set respostas = $2, observacoes = coalesce($3, observacoes),
                  lembrete_em = case when $4::text is not null and $4 <> lembrete then now() else lembrete_em end,
                  lembrete = coalesce($4, lembrete),
                  revisao = revisao + 1, atualizado_em = now()
            where id = $1 returning revisao`,
          [id, JSON.stringify(respostas.valor), observacoes ?? null, lembrete ?? null]
        );
      } else {
        const conteudo = validarRecordatorio(dados.conteudo);
        if ("erro" in conteudo) throw Object.assign(new Error(), { recusa: recusar(conteudo.erro, 400) });
        gravado = await cliente.query<{ revisao: number }>(
          `update public.recordatorios set conteudo = $2, revisao = revisao + 1, atualizado_em = now()
            where id = $1 returning revisao`,
          [id, JSON.stringify(conteudo.valor)]
        );
      }
      await cliente.query("commit");
      return NextResponse.json({ revisao: gravado.rows[0].revisao });
    } catch (erro) {
      await cliente.query("rollback").catch(() => undefined);
      const recusa = (erro as { recusa?: NextResponse }).recusa;
      if (recusa) return recusa;
      console.error("Erro ao salvar formulário:", erro);
      return recusar("Não foi possível salvar.", 500);
    } finally {
      cliente.release();
    }
  };
}

// Mudanças de situação: enviar ao paciente, cancelar o envio, concluir,
// reabrir, arquivar e desarquivar. Tudo fica na auditoria.
export function rotaPatch(tipo: TipoDeFormulario) {
  return async function PATCH(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Formulário inválido.", 400);
    const acao = (await request.json().catch(() => null))?.acao as string | undefined;

    const cliente = await obterPool().connect();
    try {
      await cliente.query("begin");
      const f = await buscarFormulario(tipo, id, cliente, true);
      if (!f) {
        await cliente.query("rollback");
        return recusar("Formulário não encontrado.", 404);
      }

      let sql: string | null = null;
      let erro: string | null = null;
      let antes: Record<string, unknown> = {};
      let depois: Record<string, unknown> = {};

      if (acao === "enviar") {
        if (f.status !== "rascunho" || f.arquivado_em) erro = "Reabra o formulário antes de enviar.";
        else if (comOPaciente(f)) erro = "O formulário já está com o paciente.";
        else {
          // Novo envio: o paciente volta a poder editar (as respostas ficam).
          sql = "enviado_em = now(), paciente_editou_em = null, respondido_em = null, lido_em = null";
          antes = { envio: f.enviado_em ? "respondido" : "no consultório" };
          depois = { envio: "enviado ao paciente" };
        }
      } else if (acao === "cancelar_envio") {
        if (!comOPaciente(f)) erro = "O formulário não está aguardando o paciente.";
        else {
          sql = "enviado_em = null, paciente_editou_em = null";
          antes = { envio: "enviado ao paciente" };
          depois = { envio: "envio cancelado (volta ao consultório)" };
        }
      } else if (acao === "concluir") {
        if (f.status !== "rascunho") erro = "O formulário já está concluído.";
        else if (comOPaciente(f)) erro = "O paciente ainda está preenchendo. Cancele o envio antes de concluir.";
        else {
          sql = "status = 'concluido', concluido_em = now()";
          antes = { status: "rascunho" };
          depois = { status: "concluído" };
        }
      } else if (acao === "reabrir") {
        if (f.status !== "concluido") erro = "O formulário não está concluído.";
        else {
          sql = "status = 'rascunho', concluido_em = null";
          antes = { status: "concluído" };
          depois = { status: "rascunho (reaberto para correção)" };
        }
      } else if (acao === "arquivar" || acao === "desarquivar") {
        sql = acao === "arquivar" ? "arquivado_em = now()" : "arquivado_em = null";
        antes = { arquivado: Boolean(f.arquivado_em) };
        depois = { arquivado: acao === "arquivar" };
      } else {
        erro = "Ação inválida.";
      }

      if (erro || !sql) {
        await cliente.query("rollback");
        return recusar(erro ?? "Ação inválida.", 409);
      }

      const gravado = await cliente.query<{ revisao: number }>(
        `update public.${TABELA[tipo]} set ${sql}, revisao = revisao + 1, atualizado_em = now() where id = $1 returning revisao`,
        [id]
      );
      await registrarAlteracoes(
        cliente,
        { pacienteId: f.patient_id, tabela: TABELA[tipo], registroId: id, usuarioId: contexto.usuarioId },
        antes,
        depois
      );
      await cliente.query("commit");

      if (acao === "enviar") {
        enfileirarAtualizacao("formulario", f.patient_id, id, `${id}:${Date.now()}`).catch((e) =>
          console.error("Erro ao registrar aviso do formulário:", e)
        );
      }
      return NextResponse.json({ revisao: gravado.rows[0].revisao });
    } catch (erro) {
      await cliente.query("rollback").catch(() => undefined);
      console.error("Erro ao alterar formulário:", erro);
      return recusar("Não foi possível alterar o formulário.", 500);
    } finally {
      cliente.release();
    }
  };
}

// Só rascunhos que nunca foram ao paciente.
export function rotaDelete(tipo: TipoDeFormulario) {
  return async function DELETE(request: Request, { params }: Parametros) {
    const contexto = await exigirNutricionista(request);
    if (contexto instanceof NextResponse) return contexto;
    const { id } = await params;
    if (!UUID.test(id)) return recusar("Formulário inválido.", 400);

    const cliente = await obterPool().connect();
    try {
      await cliente.query("begin");
      const f = await buscarFormulario(tipo, id, cliente, true);
      if (!f) {
        await cliente.query("rollback");
        return recusar("Formulário não encontrado.", 404);
      }
      if (f.status !== "rascunho" || f.enviado_em || f.respondido_em) {
        await cliente.query("rollback");
        return recusar("Formulário enviado, respondido ou concluído não pode ser excluído: arquive.", 409);
      }
      await cliente.query(`delete from public.${TABELA[tipo]} where id = $1`, [id]);
      await registrarAcao(
        cliente,
        { pacienteId: f.patient_id, tabela: TABELA[tipo], registroId: id, usuarioId: contexto.usuarioId },
        "exclusao",
        { titulo: f.titulo ?? NOME[tipo] }
      );
      await cliente.query("commit");
      return NextResponse.json({ ok: true });
    } catch (erro) {
      await cliente.query("rollback").catch(() => undefined);
      console.error("Erro ao excluir formulário:", erro);
      return recusar("Não foi possível excluir.", 500);
    } finally {
      cliente.release();
    }
  };
}

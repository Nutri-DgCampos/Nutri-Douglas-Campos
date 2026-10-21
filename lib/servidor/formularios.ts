import crypto from "node:crypto";
import type { PoolClient } from "pg";
import {
  obrigatoriasEmBranco,
  pendenciasDoRecordatorio,
  validarRecordatorio,
  validarRespostas,
  type Pergunta,
} from "@/lib/nutricao/anamnese";
import { obterPool } from "./banco";

// Anamnese e recordatório (Fase 5): link individual do paciente e as regras
// de edição comuns aos dois formulários.
//
// Quem edita o quê:
// - No consultório (não enviado): só o nutricionista.
// - Enviado ao paciente: o paciente preenche e pode corrigir, mesmo depois de
//   "Enviar respostas", até o primeiro acesso do nutricionista à resposta
//   (lido_em). Enquanto está com o paciente, o nutricionista só lê as
//   respostas (pode escrever observações e o lembrete).
// - Concluído ou arquivado: ninguém edita (o nutricionista pode reabrir).

export type TipoDeFormulario = "anamnese" | "recordatorio";

export const TABELA: Record<TipoDeFormulario, string> = { anamnese: "anamneses", recordatorio: "recordatorios" };

export type LinhaFormulario = {
  id: string;
  patient_id: string;
  consulta_id: string;
  status: "rascunho" | "concluido";
  enviado_em: string | null;
  paciente_editou_em: string | null;
  respondido_em: string | null;
  lido_em: string | null;
  aviso_visto_em: string | null;
  concluido_em: string | null;
  arquivado_em: string | null;
  revisao: number;
  criado_em: string;
  atualizado_em: string;
  // anamnese
  titulo?: string;
  modelo_id?: string | null;
  modelo_versao?: number | null;
  perguntas?: Pergunta[];
  respostas?: Record<string, unknown>;
  respostas_paciente?: Record<string, unknown> | null;
  observacoes?: string;
  lembrete?: string;
  // recordatório
  conteudo?: unknown;
  conteudo_paciente?: unknown;
};

export async function buscarFormulario(tipo: TipoDeFormulario, id: string, cliente?: PoolClient, travar = false) {
  const resultado = await (cliente ?? obterPool()).query<LinhaFormulario>(
    `select * from public.${TABELA[tipo]} where id = $1${travar ? " for update" : ""}`,
    [id]
  );
  return resultado.rows[0] ?? null;
}

// O paciente pode alterar as respostas?
export function pacientePodeEditar(f: LinhaFormulario) {
  return Boolean(f.enviado_em) && !f.lido_em && f.status === "rascunho" && !f.arquivado_em;
}

// Está com o paciente (enviado e ainda sem resposta)?
export function comOPaciente(f: LinhaFormulario) {
  return Boolean(f.enviado_em) && !f.respondido_em && f.status === "rascunho" && !f.arquivado_em;
}

// ---------------------------------------------------------------------------
// Link individual: token = id do link + assinatura HMAC com a chave do
// servidor. Pode ser mostrado de novo a qualquer momento; gerar outro revoga
// o anterior.

function chave() {
  const valor = process.env.SESSAO_SEGREDO;
  if (!valor || valor.length < 32) throw new Error("SESSAO_SEGREDO ausente ou com menos de 32 caracteres.");
  return valor;
}

function assinatura(linkId: string) {
  return crypto.createHmac("sha256", chave()).update(`formulario:${linkId}`).digest().subarray(0, 24).toString("base64url");
}

export function tokenDoLink(linkId: string) {
  return `${Buffer.from(linkId.replace(/-/g, ""), "hex").toString("base64url")}${assinatura(linkId)}`;
}

function linkDoToken(token: string) {
  if (!/^[A-Za-z0-9_-]{54}$/.test(token)) return null;
  const hex = Buffer.from(token.slice(0, 22), "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const esperada = Buffer.from(assinatura(id));
  const recebida = Buffer.from(token.slice(22));
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;
  return id;
}

export async function pacienteDoToken(token: string) {
  const linkId = linkDoToken(token);
  if (!linkId) return null;
  const resultado = await obterPool().query<{ patient_id: string }>(
    `update public.formularios_links set ultimo_acesso_em = now()
      where id = $1 and revogado_em is null
      returning patient_id`,
    [linkId]
  );
  return resultado.rows[0]?.patient_id ?? null;
}

// Link ativo do paciente (cria se não houver; "novo" revoga o atual).
export async function linkDoPaciente(pacienteId: string, usuarioId: string | null, novo = false) {
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    await cliente.query("select 1 from public.patients where id = $1 for update", [pacienteId]);
    if (novo) {
      await cliente.query("update public.formularios_links set revogado_em = now() where patient_id = $1 and revogado_em is null", [pacienteId]);
    }
    const atual = await cliente.query<{ id: string }>(
      "select id from public.formularios_links where patient_id = $1 and revogado_em is null",
      [pacienteId]
    );
    const id =
      atual.rows[0]?.id ??
      (
        await cliente.query<{ id: string }>(
          "insert into public.formularios_links (patient_id, criado_por) values ($1, $2) returning id",
          [pacienteId, usuarioId]
        )
      ).rows[0].id;
    await cliente.query("commit");
    return tokenDoLink(id);
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}

// ---------------------------------------------------------------------------
// Lado do paciente (pelo link ou pela área do paciente)

export async function formulariosDoPaciente(pacienteId: string) {
  const pool = obterPool();
  const [paciente, anamneses, recordatorios] = await Promise.all([
    pool.query<{ name: string }>("select name from public.patients where id = $1", [pacienteId]),
    pool.query<LinhaFormulario>(
      `select * from public.anamneses
        where patient_id = $1 and enviado_em is not null and arquivado_em is null
        order by enviado_em desc limit 20`,
      [pacienteId]
    ),
    pool.query<LinhaFormulario>(
      `select * from public.recordatorios
        where patient_id = $1 and enviado_em is not null and arquivado_em is null
        order by enviado_em desc limit 20`,
      [pacienteId]
    ),
  ]);

  const comum = (f: LinhaFormulario) => ({
    id: f.id,
    enviado_em: f.enviado_em,
    respondido_em: f.respondido_em,
    editavel: pacientePodeEditar(f),
    revisao: f.revisao,
  });

  return {
    primeiroNome: paciente.rows[0]?.name.trim().split(/\s+/)[0] ?? "",
    anamneses: anamneses.rows.map((f) => ({ ...comum(f), titulo: f.titulo, perguntas: f.perguntas, respostas: f.respostas })),
    recordatorios: recordatorios.rows.map((f) => ({ ...comum(f), conteudo: f.conteudo })),
  };
}

export class Recusa extends Error {
  constructor(
    mensagem: string,
    public status: number,
    public extra?: Record<string, unknown>
  ) {
    super(mensagem);
  }
}

// Rascunho do paciente (salvamento automático) ou "Enviar respostas".
export async function gravarDoPaciente(tipo: TipoDeFormulario, pacienteId: string, id: string, corpo: unknown, enviar: boolean) {
  const dados = (corpo ?? {}) as { respostas?: unknown; conteudo?: unknown; revisao?: unknown };
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const f = await buscarFormulario(tipo, id, cliente, true);
    if (!f || f.patient_id !== pacienteId || !f.enviado_em || f.arquivado_em) throw new Recusa("Formulário não encontrado.", 404);
    if (!pacientePodeEditar(f)) {
      throw new Recusa("O nutricionista já recebeu suas respostas. Para mudar algo, fale com ele.", 423);
    }
    if (dados.revisao !== f.revisao) throw new Recusa("O formulário foi alterado em outra janela. Recarregue a página.", 409);

    let valor: unknown;
    if (tipo === "anamnese") {
      const v = validarRespostas(dados.respostas, f.perguntas ?? []);
      if ("erro" in v) throw new Recusa(v.erro, 400);
      valor = v.valor;
      if (enviar) {
        const faltando = obrigatoriasEmBranco(f.perguntas ?? [], v.valor);
        if (faltando.length) {
          throw new Recusa("Responda as perguntas obrigatórias.", 400, { obrigatorias: faltando.map((p) => p.id) });
        }
      }
    } else {
      const v = validarRecordatorio(dados.conteudo);
      if ("erro" in v) throw new Recusa(v.erro, 400);
      valor = v.valor;
      if (enviar) {
        const pendencias = pendenciasDoRecordatorio(v.valor);
        if (pendencias.length) throw new Recusa(pendencias[0], 400, { pendencias });
      }
    }

    const campo = tipo === "anamnese" ? "respostas" : "conteudo";
    const copia = tipo === "anamnese" ? "respostas_paciente" : "conteudo_paciente";
    const gravado = await cliente.query<{ revisao: number }>(
      `update public.${TABELA[tipo]}
          set ${campo} = $2, paciente_editou_em = now(), revisao = revisao + 1, atualizado_em = now()
              ${enviar ? `, ${copia} = $2, respondido_em = now(), aviso_visto_em = null` : ""}
        where id = $1 returning revisao`,
      [id, JSON.stringify(valor)]
    );
    await cliente.query("commit");
    return { revisao: gravado.rows[0].revisao };
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

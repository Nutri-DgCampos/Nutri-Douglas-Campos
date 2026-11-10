import { validarPerguntas, type Pergunta } from "@/lib/nutricao/anamnese";
import { PERGUNTAS_DA_ANAMNESE } from "@/lib/treinoAnamnese";
import { obterPool } from "./banco";
import type { LinhaFormulario } from "./formularios";
import { preenchida, resumoDoFormulario, type AcessoAoFormulario } from "./formulariosNutricionista";
import { exigirProfissionalDeTreino, podeAcompanharAluno, type ProfissionalDeTreino } from "./treinoAcesso";

// Anamnese no Treino com a rotina da Nutrição (SPEC 06/11, anamnese;
// decisões do cliente em 10/11).
//
// - Fichas na tabela anamneses (modulo = 'treino', sem consulta, autor em
//   criado_por): mesmas perguntas, respostas, link do paciente, salvamento
//   e envio da Nutrição.
// - Só o autor altera. Quem acompanha o paciente (vínculo) lê as
//   preenchidas, do Treino e da Nutrição, sem as notas do autor.
// - Modelos em treino_modelos_anamnese: de cada profissional, privados por
//   padrão; "compartilhado" segue a biblioteca de modelos de treino (todos os
//   profissionais do Treino veem; usar = cópia; só o autor altera).
// - O modelo inicial de cada profissional são as 7 perguntas da anamnese
//   simples aprovada na R6. As respostas antigas (treino_anamneses) não
//   mudam e continuam privadas.

export class AnamneseInvalida extends Error {}

export const ACESSO_TREINO: AcessoAoFormulario = {
  exigir: exigirProfissionalDeTreino,
  permitir: async (contexto, f: LinhaFormulario) => {
    const profissional = contexto as ProfissionalDeTreino;
    if (!(await podeAcompanharAluno(profissional, f.patient_id))) return null;
    if (f.modulo === "treino" && f.criado_por === profissional.usuarioId) return "escrita";
    return preenchida(f) ? "leitura" : null;
  },
  aviso: "formulario_treino",
};

// As 7 perguntas da R6, no formato das perguntas da Nutrição (campo longo;
// identificadores no padrão do editor).
export function perguntasIniciais(): Pergunta[] {
  return PERGUNTAS_DA_ANAMNESE.map((p) => ({
    id: globalThis.crypto.randomUUID(),
    texto: p.pergunta,
    tipo: "longo",
    obrigatoria: false,
    opcoes: [],
    variasRespostas: false,
  }));
}

// Primeiro acesso do profissional: cria o modelo inicial (uma vez só).
async function garantirModeloInicial(profissional: ProfissionalDeTreino) {
  await obterPool().query(
    `insert into public.treino_modelos_anamnese (nome, perguntas, criado_por)
     select 'Anamnese do treino', $2::jsonb, $1
      where not exists (select 1 from public.treino_modelos_anamnese where criado_por = $1)`,
    [profissional.usuarioId, JSON.stringify(perguntasIniciais())]
  );
}

const AUTOR = "coalesce(e.nome, case when pr.role = 'nutricionista' then 'Nutricionista' end, 'Profissional')";

export async function listarModelos(profissional: ProfissionalDeTreino, comArquivados = false) {
  await garantirModeloInicial(profissional);
  const r = await obterPool().query(
    `select m.id, m.nome, m.versao, m.compartilhado, m.arquivado_em, m.atualizado_em, m.criado_por = $1 as meu,
            jsonb_array_length(m.perguntas) as quantidade, ${AUTOR} as autor
       from public.treino_modelos_anamnese m
       left join public.educadores_fisicos e on e.usuario_id = m.criado_por
       left join public.profiles pr on pr.id = m.criado_por
      where (m.criado_por = $1 and ($2 or m.arquivado_em is null))
         or (m.compartilhado and m.arquivado_em is null and m.criado_por <> $1)
      order by (m.criado_por = $1) desc, m.arquivado_em nulls first, m.nome`,
    [profissional.usuarioId, comArquivados]
  );
  return r.rows;
}

// Modelo para o editor: o do autor (editável) ou um compartilhado (leitura).
export async function lerModelo(profissional: ProfissionalDeTreino, id: string) {
  const r = await obterPool().query(
    `select m.*, m.criado_por = $2 as meu, ${AUTOR} as autor,
            (select count(*)::int from public.anamneses a where a.treino_modelo_id = m.id) as fichas
       from public.treino_modelos_anamnese m
       left join public.educadores_fisicos e on e.usuario_id = m.criado_por
       left join public.profiles pr on pr.id = m.criado_por
      where m.id = $1 and (m.criado_por = $2 or (m.compartilhado and m.arquivado_em is null))`,
    [id, profissional.usuarioId]
  );
  return r.rows[0] ?? null;
}

export async function criarModelo(profissional: ProfissionalDeTreino, dados: Record<string, unknown>) {
  const nome = typeof dados.nome === "string" ? dados.nome.trim().slice(0, 200) : "";
  const perguntas = validarPerguntas(dados.perguntas ?? []);
  if ("erro" in perguntas) throw new AnamneseInvalida(perguntas.erro);
  const r = await obterPool().query<{ id: string; revisao: number }>(
    "insert into public.treino_modelos_anamnese (nome, perguntas, criado_por) values ($1, $2, $3) returning id, revisao",
    [nome || "Nova anamnese", JSON.stringify(perguntas.valor), profissional.usuarioId]
  );
  return r.rows[0];
}

// Salvamento automático (só o autor). Versão já usada em ficha: a alteração
// gera nova versão; as fichas antigas guardam a delas (como na Nutrição).
export async function salvarModelo(profissional: ProfissionalDeTreino, id: string, dados: Record<string, unknown>) {
  const nome = typeof dados.nome === "string" ? dados.nome.slice(0, 200) : "";
  const perguntas = validarPerguntas(dados.perguntas ?? []);
  if ("erro" in perguntas) throw new AnamneseInvalida(perguntas.erro);
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const atual = await cliente.query<{ revisao: number; versao: number }>(
      "select revisao, versao from public.treino_modelos_anamnese where id = $1 and criado_por = $2 for update",
      [id, profissional.usuarioId]
    );
    if (!atual.rows[0]) {
      await cliente.query("rollback");
      return null;
    }
    if (atual.rows[0].revisao !== dados.revisao) {
      await cliente.query("rollback");
      throw new AnamneseInvalida("O modelo foi alterado em outra janela. Recarregue antes de continuar.");
    }
    const usada = await cliente.query("select 1 from public.anamneses where treino_modelo_id = $1 and modelo_versao = $2 limit 1", [id, atual.rows[0].versao]);
    const gravado = await cliente.query<{ revisao: number; versao: number }>(
      `update public.treino_modelos_anamnese
          set nome = $2, perguntas = $3, revisao = revisao + 1, versao = versao + $4, atualizado_em = now()
        where id = $1 returning revisao, versao`,
      [id, nome.trim() || "Nova anamnese", JSON.stringify(perguntas.valor), usada.rowCount ? 1 : 0]
    );
    await cliente.query("commit");
    return gravado.rows[0];
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

// Arquivar, reativar, compartilhar ou deixar privado (só o autor). Deixar de
// compartilhar só impede novos usos: fichas já feitas não mudam.
export async function alterarModelo(profissional: ProfissionalDeTreino, id: string, acao: unknown) {
  const sql: Record<string, string> = {
    arquivar: "arquivado_em = now()",
    reativar: "arquivado_em = null",
    compartilhar: "compartilhado = true",
    privar: "compartilhado = false",
  };
  if (typeof acao !== "string" || !sql[acao]) throw new AnamneseInvalida("Ação inválida.");
  const r = await obterPool().query(
    `update public.treino_modelos_anamnese set ${sql[acao]}, atualizado_em = now() where id = $1 and criado_por = $2`,
    [id, profissional.usuarioId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function excluirModelo(profissional: ProfissionalDeTreino, id: string) {
  const usado = await obterPool().query("select 1 from public.anamneses where treino_modelo_id = $1 limit 1", [id]);
  if (usado.rowCount) throw new AnamneseInvalida("Este modelo já foi usado em anamneses: arquive em vez de excluir.");
  const r = await obterPool().query("delete from public.treino_modelos_anamnese where id = $1 and criado_por = $2", [id, profissional.usuarioId]);
  return (r.rowCount ?? 0) > 0;
}

// Fichas do aluno que este profissional vê: as dele (todas) e as
// preenchidas dos outros profissionais vinculados (Treino e Nutrição).
export async function anamnesesDoAluno(profissional: ProfissionalDeTreino, patientId: string) {
  const r = await obterPool().query<LinhaFormulario & { autor: string }>(
    `select f.*, case when f.modulo = 'nutricao' and e.nome is null then 'Nutricionista' else ${AUTOR} end as autor
       from public.anamneses f
       left join public.educadores_fisicos e on e.usuario_id = f.criado_por
       left join public.profiles pr on pr.id = f.criado_por
      where f.patient_id = $1
        and ((f.modulo = 'treino' and f.criado_por = $2) or f.respondido_em is not null or f.status = 'concluido')
      order by coalesce(f.respondido_em, f.atualizado_em) desc`,
    [patientId, profissional.usuarioId]
  );
  return r.rows.map((f) => ({
    ...resumoDoFormulario(f),
    modulo: f.modulo ?? "nutricao",
    autor: f.autor,
    minha: f.modulo === "treino" && f.criado_por === profissional.usuarioId,
  }));
}

// Nova ficha a partir de um modelo visível ao profissional (cópia das
// perguntas da versão atual; mudar o modelo depois não altera a ficha).
export async function criarAnamnese(profissional: ProfissionalDeTreino, patientId: string, modeloId: unknown) {
  if (typeof modeloId !== "string") throw new AnamneseInvalida("Escolha o modelo.");
  const modelo = await lerModelo(profissional, modeloId);
  if (!modelo || modelo.arquivado_em) throw new AnamneseInvalida("Modelo não encontrado.");
  const r = await obterPool().query<{ id: string }>(
    `insert into public.anamneses (patient_id, consulta_id, modulo, treino_modelo_id, modelo_versao, titulo, perguntas, criado_por)
     values ($1, null, 'treino', $2, $3, $4, $5, $6) returning id`,
    [patientId, modelo.id, modelo.versao, modelo.nome, JSON.stringify(modelo.perguntas), profissional.usuarioId]
  );
  return r.rows[0].id;
}

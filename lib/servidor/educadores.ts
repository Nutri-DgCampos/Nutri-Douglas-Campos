import { obterPool } from "./banco";
import { PAPEL_EDUCADOR } from "./treinoAcesso";
import { criarUsuario, definirSenha, excluirUsuario } from "./usuarios";

// Cadastro de educadores físicos (feito pelo administrador) e vínculos com
// os alunos. A senha inicial é provisória: o educador troca no primeiro acesso.

export class DadosInvalidos extends Error {}

export type Educador = {
  usuario_id: string;
  nome: string;
  email: string;
  cref: string | null;
  telefone: string | null;
  ativo: boolean;
  alunos: number;
  criado_em: string;
};

function texto(valor: unknown, limite: number, obrigatorio = false) {
  if (valor === null || valor === undefined || valor === "") {
    if (obrigatorio) throw new DadosInvalidos("Preencha os campos obrigatórios.");
    return null;
  }
  if (typeof valor !== "string") throw new DadosInvalidos("Dados inválidos.");
  const limpo = valor.trim();
  if (limpo.length > limite) throw new DadosInvalidos(`Texto com mais de ${limite} caracteres.`);
  if (obrigatorio && limpo.length < 2) throw new DadosInvalidos("Preencha os campos obrigatórios.");
  return limpo || null;
}

export async function listarEducadores(): Promise<Educador[]> {
  const r = await obterPool().query<Educador>(
    `select e.usuario_id, e.nome, u.email, e.cref, e.telefone, e.ativo, e.criado_em,
            (select count(*)::int from public.treino_vinculos v where v.profissional_id = e.usuario_id and v.fim is null) as alunos
       from public.educadores_fisicos e
       join public.users u on u.id = e.usuario_id
      order by e.ativo desc, e.nome`
  );
  return r.rows;
}

export async function criarEducador(dados: Record<string, unknown>, criadoPor: string) {
  const nome = texto(dados.nome, 120, true)!;
  const email = texto(dados.email, 200, true)!.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DadosInvalidos("Informe um e-mail válido.");
  const senha = typeof dados.senha === "string" ? dados.senha : "";
  if (senha.length < 6) throw new DadosInvalidos("A senha inicial precisa ter pelo menos 6 caracteres.");
  const cref = texto(dados.cref, 40);
  const telefone = texto(dados.telefone, 40);

  // criarUsuario recusa e-mail repetido (EmailJaCadastrado).
  const usuarioId = await criarUsuario(email, senha, true);
  try {
    await obterPool().query("insert into public.profiles (id, role) values ($1, $2)", [usuarioId, PAPEL_EDUCADOR]);
    await obterPool().query(
      `insert into public.educadores_fisicos (usuario_id, nome, cref, telefone, criado_por) values ($1, $2, $3, $4, $5)`,
      [usuarioId, nome, cref, telefone, criadoPor]
    );
  } catch (erro) {
    await excluirUsuario(usuarioId).catch(() => undefined);
    throw erro;
  }
  return usuarioId;
}

export async function atualizarEducador(usuarioId: string, dados: Record<string, unknown>) {
  const existe = await obterPool().query("select 1 from public.educadores_fisicos where usuario_id = $1", [usuarioId]);
  if (!existe.rowCount) return false;

  if (dados.acao === "redefinir_senha") {
    const senha = typeof dados.senha === "string" ? dados.senha : "";
    if (senha.length < 6) throw new DadosInvalidos("A senha precisa ter pelo menos 6 caracteres.");
    return definirSenha(usuarioId, senha, true);
  }

  if (typeof dados.ativo === "boolean" && Object.keys(dados).length === 1) {
    await obterPool().query("update public.educadores_fisicos set ativo = $2, atualizado_em = now() where usuario_id = $1", [usuarioId, dados.ativo]);
    return true;
  }

  await obterPool().query(
    `update public.educadores_fisicos set nome = $2, cref = $3, telefone = $4, atualizado_em = now() where usuario_id = $1`,
    [usuarioId, texto(dados.nome, 120, true), texto(dados.cref, 40), texto(dados.telefone, 40)]
  );
  return true;
}

// ---------------------------------------------------------------------------
// Vínculos aluno × educador

export async function vinculosDoAluno(patientId: string) {
  const r = await obterPool().query<{ profissional_id: string; nome: string; ativo: boolean; inicio: string }>(
    `select v.profissional_id, e.nome, e.ativo, v.inicio
       from public.treino_vinculos v
       join public.educadores_fisicos e on e.usuario_id = v.profissional_id
      where v.patient_id = $1 and v.fim is null
      order by e.nome`,
    [patientId]
  );
  return r.rows;
}

export async function vincular(patientId: string, educadorId: string, criadoPor: string) {
  const educador = await obterPool().query("select 1 from public.educadores_fisicos where usuario_id = $1 and ativo", [educadorId]);
  if (!educador.rowCount) throw new DadosInvalidos("Educador físico não encontrado ou desativado.");
  await obterPool().query(
    `insert into public.treino_vinculos (patient_id, profissional_id, criado_por) values ($1, $2, $3)
     on conflict (patient_id, profissional_id) where fim is null do nothing`,
    [patientId, educadorId, criadoPor]
  );
}

// Encerra o vínculo (o histórico fica).
export async function desvincular(patientId: string, educadorId: string, encerradoPor: string) {
  await obterPool().query(
    `update public.treino_vinculos set fim = now(), encerrado_por = $3
      where patient_id = $1 and profissional_id = $2 and fim is null`,
    [patientId, educadorId, encerradoPor]
  );
}

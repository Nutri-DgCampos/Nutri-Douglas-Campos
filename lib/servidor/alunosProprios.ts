import { obterPool } from "./banco";
import { DadosInvalidos } from "./educadores";
import type { ProfissionalDeTreino } from "./treinoAcesso";
import { criarUsuario, definirEmail, definirSenha, emailDoUsuario, excluirUsuario } from "./usuarios";

// Alunos próprios do educador físico (T7b, resposta A7 do cliente).
//
// O educador cadastra o aluno com e-mail e senha provisória. O cadastro fica
// marcado com o dono (patients.educador_dono_id) e já nasce vinculado a ele.
// O nutricionista não vê esses alunos, e o aluno entra na Área do Paciente
// vendo só o Treino. O dono não muda depois (gatilho da migração 026).

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function email(valor: unknown) {
  const limpo = texto(valor, 200, true)!.toLowerCase();
  if (!EMAIL.test(limpo)) throw new DadosInvalidos("Informe um e-mail válido.");
  return limpo;
}

function senha(valor: unknown) {
  const limpa = typeof valor === "string" ? valor : "";
  if (limpa.length < 6 || limpa.length > 200) throw new DadosInvalidos("A senha provisória precisa ter pelo menos 6 caracteres.");
  return limpa;
}

export async function criarAlunoProprio(educador: ProfissionalDeTreino, dados: Record<string, unknown>) {
  const nome = texto(dados.nome, 120, true)!;
  const telefone = texto(dados.telefone, 40);
  const login = email(dados.email);
  const senhaInicial = senha(dados.senha);

  // criarUsuario recusa e-mail repetido (EmailJaCadastrado).
  const usuarioId = await criarUsuario(login, senhaInicial, true);
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    await cliente.query("insert into public.profiles (id, role) values ($1, 'paciente')", [usuarioId]);
    const aluno = await cliente.query<{ id: string }>(
      `insert into public.patients (name, phone, plan, payment_status, auth_user_id, educador_dono_id)
       values ($1, $2, null, 'Ativo', $3, $4)
       returning id`,
      [nome, telefone, usuarioId, educador.usuarioId]
    );
    const id = aluno.rows[0].id;
    await cliente.query(
      "insert into public.treino_vinculos (patient_id, profissional_id, criado_por) values ($1, $2, $2)",
      [id, educador.usuarioId]
    );
    await cliente.query("commit");
    return id;
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    await excluirUsuario(usuarioId).catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

// Cadastro do aluno, só para o educador dono (null: não é aluno próprio dele).
export async function cadastroDoAlunoProprio(educador: ProfissionalDeTreino, patientId: string) {
  if (educador.admin) return null;
  const r = await obterPool().query<{ nome: string; telefone: string | null; auth_user_id: string | null }>(
    "select name as nome, phone as telefone, auth_user_id from public.patients where id = $1 and educador_dono_id = $2",
    [patientId, educador.usuarioId]
  );
  const aluno = r.rows[0];
  if (!aluno) return null;
  return {
    nome: aluno.nome,
    telefone: aluno.telefone,
    email: aluno.auth_user_id ? await emailDoUsuario(aluno.auth_user_id) : null,
    usuarioId: aluno.auth_user_id,
  };
}

// Dados do cadastro ou senha provisória nova. false: não é aluno próprio do educador.
export async function alterarAlunoProprio(educador: ProfissionalDeTreino, patientId: string, dados: Record<string, unknown>) {
  const atual = await cadastroDoAlunoProprio(educador, patientId);
  if (!atual?.usuarioId) return false;

  if (dados.acao === "redefinir_senha") {
    return definirSenha(atual.usuarioId, senha(dados.senha), true);
  }

  const nome = texto(dados.nome, 120, true)!;
  const telefone = texto(dados.telefone, 40);
  const login = email(dados.email);
  if (login !== atual.email) await definirEmail(atual.usuarioId, login);
  await obterPool().query("update public.patients set name = $2, phone = $3 where id = $1 and educador_dono_id = $4", [
    patientId,
    nome,
    telefone,
    educador.usuarioId,
  ]);
  return true;
}

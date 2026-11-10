import { dadosParaBanco, type LinhaDadosPessoais } from "@/lib/nutricao/dadosPessoais";
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

// Dados pessoais comuns (nascimento, sexo, altura, e-mail de contato), com
// as mesmas regras do cadastro da Nutrição (SPEC 06/11, cadastro). Sem plano
// nem pagamento da Nutrição.
function dadosPessoais(dados: Record<string, unknown>): Required<LinhaDadosPessoais> {
  const t = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
  const r = dadosParaBanco({ nascimento: t(dados.nascimento), sexo: t(dados.sexo), altura: t(dados.altura), emailContato: t(dados.emailContato) });
  if ("erro" in r) throw new DadosInvalidos(r.erro);
  return r.valores;
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
  const pessoais = dadosPessoais(dados);

  // criarUsuario recusa e-mail repetido (EmailJaCadastrado).
  const usuarioId = await criarUsuario(login, senhaInicial, true);
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    await cliente.query("insert into public.profiles (id, role) values ($1, 'paciente')", [usuarioId]);
    const aluno = await cliente.query<{ id: string }>(
      `insert into public.patients (name, phone, plan, payment_status, auth_user_id, educador_dono_id, birth_date, sex, height_cm, contact_email)
       values ($1, $2, null, 'Ativo', $3, $4, $5, $6, $7, $8)
       returning id`,
      [nome, telefone, usuarioId, educador.usuarioId, pessoais.birth_date, pessoais.sex, pessoais.height_cm, pessoais.contact_email]
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
  const r = await obterPool().query<
    { nome: string; telefone: string | null; auth_user_id: string | null; desativado_em: string | null } & LinhaDadosPessoais
  >(
    `select name as nome, phone as telefone, auth_user_id, desativado_em,
            to_char(birth_date, 'YYYY-MM-DD') as birth_date, sex, height_cm::text as height_cm, contact_email
       from public.patients where id = $1 and educador_dono_id = $2`,
    [patientId, educador.usuarioId]
  );
  const aluno = r.rows[0];
  if (!aluno) return null;
  return {
    nome: aluno.nome,
    telefone: aluno.telefone,
    email: aluno.auth_user_id ? await emailDoUsuario(aluno.auth_user_id) : null,
    usuarioId: aluno.auth_user_id,
    desativado_em: aluno.desativado_em,
    birth_date: aluno.birth_date ?? null,
    sex: aluno.sex ?? null,
    height_cm: aluno.height_cm ?? null,
    contact_email: aluno.contact_email ?? null,
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
  const pessoais = dadosPessoais(dados);
  if (login !== atual.email) await definirEmail(atual.usuarioId, login);
  await obterPool().query(
    `update public.patients set name = $2, phone = $3, birth_date = $5, sex = $6, height_cm = $7, contact_email = $8
      where id = $1 and educador_dono_id = $4`,
    [patientId, nome, telefone, educador.usuarioId, pessoais.birth_date, pessoais.sex, pessoais.height_cm, pessoais.contact_email]
  );
  return true;
}

// ---------------------------------------------------------------------------
// Desativar e excluir (T8, resposta R10)

// Desativa (o acesso cai na hora; nada é apagado) ou reativa o aluno próprio.
export async function definirAlunoProprioAtivo(educador: ProfissionalDeTreino, patientId: string, ativo: boolean) {
  if (educador.admin) return false;
  const r = await obterPool().query(
    `update public.patients
        set desativado_em = ${ativo ? "null" : "coalesce(desativado_em, now())"},
            desativado_por = ${ativo ? "null" : "$2"}
      where id = $1 and educador_dono_id = $2`,
    [patientId, educador.usuarioId]
  );
  return (r.rowCount ?? 0) > 0;
}

// Exclusão definitiva, só a pedido do aluno: o educador confirma o pedido e
// digita o nome do aluno. Sai tudo do aluno (em cascata) e o acesso dele.
// Devolve o usuário de acesso (para remover os arquivos) ou null.
export async function excluirAlunoProprio(educador: ProfissionalDeTreino, patientId: string, dados: Record<string, unknown>) {
  if (educador.admin) return null;
  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const r = await cliente.query<{ nome: string; auth_user_id: string | null }>(
      "select name as nome, auth_user_id from public.patients where id = $1 and educador_dono_id = $2 for update",
      [patientId, educador.usuarioId]
    );
    const aluno = r.rows[0];
    if (!aluno) {
      await cliente.query("rollback");
      return null;
    }
    if (dados.pedidoDoAluno !== true) throw new DadosInvalidos("A exclusão definitiva só é feita a pedido do aluno.");
    const normalizar = (t: unknown) => (typeof t === "string" ? t.trim().replace(/\s+/g, " ").toLowerCase() : "");
    if (normalizar(dados.confirmacao) !== normalizar(aluno.nome)) throw new DadosInvalidos("Digite o nome do aluno exatamente como está no cadastro.");

    // Mesmas tabelas sem cascata que a exclusão da Nutrição limpa antes.
    await cliente.query(
      `delete from public.payments
        where patient_id = $1 or cycle_id in (select c.id from public.diet_cycles c where c.patient_id = $1)`,
      [patientId]
    );
    for (const tabela of ["renewal_requests", "patient_reports", "diet_deliveries", "diet_cycles"]) {
      await cliente.query(`delete from public.${tabela} where patient_id = $1`, [patientId]);
    }
    await cliente.query("delete from public.patients where id = $1", [patientId]);
    if (aluno.auth_user_id) await cliente.query("delete from public.users where id = $1", [aluno.auth_user_id]);
    await cliente.query("commit");
    return { usuarioId: aluno.auth_user_id };
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}


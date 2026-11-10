import { obterPool } from "./banco";
import { DadosInvalidos, vincular } from "./educadores";
import { enfileirarParaProfissionais } from "./pushProfissional";
import { podeAcompanharAluno, type ProfissionalDeTreino } from "./treinoAcesso";

// Pedido de vínculo quando o e-mail do aluno já tem cadastro (SPEC de
// correções do Treino 10/11, item 003; Opção A; decisões do cliente em 10/11).
//
// - Decide quem cadastrou o aluno: o educador dono do aluno próprio
//   (educador_dono_id, que não muda) ou, para paciente da clínica, o
//   nutricionista. Educador dono desativado: o pedido não é criado.
// - Nunca cria outro usuário nem dá acesso antes da aprovação. Aprovar cria
//   só o vínculo do Treino com quem pediu (o acesso do papel dele).
// - Mensagens mínimas: o solicitante não vê dados do aluno antes da
//   aprovação.

export class PedidoRecusado extends Error {}

export const MENSAGEM_INATIVO = "O profissional responsável por este aluno está inativo. Fale com o administrador.";
const NAO_ELEGIVEL = "Não é possível pedir vínculo para este e-mail.";

async function nomeDoProfissional(usuarioId: string) {
  const r = await obterPool().query<{ nome: string | null; cref: string | null }>(
    `select coalesce(e.nome, case when p.role = 'nutricionista' then 'Nutricionista' end) as nome, e.cref
       from public.users u left join public.educadores_fisicos e on e.usuario_id = u.id left join public.profiles p on p.id = u.id
      where u.id = $1`,
    [usuarioId]
  );
  return r.rows[0] ?? { nome: null, cref: null };
}

export async function solicitarVinculo(profissional: ProfissionalDeTreino, dados: Record<string, unknown>) {
  if (profissional.admin) throw new PedidoRecusado("O administrador vincula os pacientes da clínica diretamente, na ficha do aluno.");
  const email = typeof dados.email === "string" ? dados.email.trim().toLowerCase() : "";
  const mensagem = typeof dados.mensagem === "string" ? dados.mensagem.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new PedidoRecusado("Informe um e-mail válido.");
  if (mensagem.length > 1000) throw new PedidoRecusado("Mensagem com mais de 1000 caracteres.");

  // Só e-mail de aluno (paciente); conta de profissional não é elegível.
  const aluno = await obterPool().query<{ id: string; nome: string; dono: string | null; dono_ativo: boolean | null }>(
    `select p.id, p.name as nome, p.educador_dono_id as dono, e.ativo as dono_ativo
       from public.users u
       join public.patients p on p.auth_user_id = u.id
       left join public.educadores_fisicos e on e.usuario_id = p.educador_dono_id
      where lower(u.email) = $1
      order by p.created_at limit 1`,
    [email]
  );
  const a = aluno.rows[0];
  if (!a) throw new PedidoRecusado(NAO_ELEGIVEL);
  if (await podeAcompanharAluno(profissional, a.id)) throw new PedidoRecusado("Este aluno já está vinculado a você.");
  if (a.dono && a.dono_ativo !== true) throw new PedidoRecusado(MENSAGEM_INATIVO);

  const criado = await obterPool().query<{ id: string }>(
    `insert into public.treino_pedidos_vinculo (patient_id, solicitante_id, destinatario_id, para_admin, email_informado, mensagem)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (patient_id, solicitante_id) where status = 'pendente' do nothing
     returning id`,
    [a.id, profissional.usuarioId, a.dono, a.dono === null, email, mensagem]
  );
  if (!criado.rows[0]) throw new PedidoRecusado("Você já tem um pedido pendente para este aluno. Aguarde a resposta.");

  const solicitante = await nomeDoProfissional(profissional.usuarioId);
  const destinatarios = a.dono
    ? [a.dono]
    : (await obterPool().query<{ id: string }>("select id from public.profiles where role = 'nutricionista'")).rows.map((r) => r.id);
  await enfileirarParaProfissionais(destinatarios, {
    tipo: "vinculo",
    pacienteId: a.id,
    titulo: "Pedido de vínculo",
    corpo: `${solicitante.nome ?? "Um profissional"} pediu vínculo com ${a.nome}.`,
    destino: "/treino",
    referenciaId: criado.rows[0].id,
  });
  return criado.rows[0].id;
}

// Pedidos que este profissional pode decidir e os que ele mesmo fez.
export async function pedidosDoProfissional(profissional: ProfissionalDeTreino) {
  const [recebidos, enviados] = await Promise.all([
    obterPool().query(
      `select v.id, v.mensagem, v.criado_em, p.name as aluno,
              coalesce(e.nome, 'Profissional') as solicitante, e.cref as solicitante_cref
         from public.treino_pedidos_vinculo v
         join public.patients p on p.id = v.patient_id
         left join public.educadores_fisicos e on e.usuario_id = v.solicitante_id
        where v.status = 'pendente' and (v.destinatario_id = $1 or (v.para_admin and $2))
        order by v.criado_em`,
      [profissional.usuarioId, profissional.admin]
    ),
    // Do aluno, o solicitante só vê o nome depois de aprovado.
    obterPool().query(
      `select v.id, v.status, v.email_informado, v.criado_em, v.decidido_em,
              case when v.status = 'aprovado' then p.name end as aluno
         from public.treino_pedidos_vinculo v
         join public.patients p on p.id = v.patient_id
        where v.solicitante_id = $1
        order by v.criado_em desc limit 20`,
      [profissional.usuarioId]
    ),
  ]);
  return { recebidos: recebidos.rows, enviados: enviados.rows };
}

// Aprovar ou recusar: só o destinatário (o educador que cadastrou o aluno ou,
// para paciente da clínica, o nutricionista). O solicitante nunca decide.
export async function decidirPedido(profissional: ProfissionalDeTreino, id: string, acao: unknown) {
  if (acao !== "aprovar" && acao !== "recusar") throw new PedidoRecusado("Ação inválida.");
  const cliente = await obterPool().connect();
  let pedido: { patient_id: string; solicitante_id: string } | undefined;
  try {
    await cliente.query("begin");
    const r = await cliente.query<{ patient_id: string; solicitante_id: string; destinatario_id: string | null; para_admin: boolean; status: string }>(
      "select patient_id, solicitante_id, destinatario_id, para_admin, status from public.treino_pedidos_vinculo where id = $1 for update",
      [id]
    );
    const p = r.rows[0];
    const podeDecidir = p && (p.destinatario_id === profissional.usuarioId || (p.para_admin && profissional.admin));
    if (!p || !podeDecidir || p.solicitante_id === profissional.usuarioId) {
      await cliente.query("rollback");
      return null;
    }
    if (p.status !== "pendente") {
      await cliente.query("rollback");
      throw new PedidoRecusado("Este pedido já foi decidido.");
    }
    await cliente.query(
      "update public.treino_pedidos_vinculo set status = $2, decidido_em = now(), decidido_por = $3 where id = $1",
      [id, acao === "aprovar" ? "aprovado" : "recusado", profissional.usuarioId]
    );
    await cliente.query("commit");
    pedido = p;
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }

  if (acao === "aprovar") {
    try {
      await vincular(pedido.patient_id, pedido.solicitante_id, profissional.usuarioId);
    } catch (erro) {
      // Solicitante desativado entre o pedido e a decisão: volta a pendente.
      await obterPool().query("update public.treino_pedidos_vinculo set status = 'pendente', decidido_em = null, decidido_por = null where id = $1", [id]);
      if (erro instanceof DadosInvalidos) throw new PedidoRecusado("Quem pediu está desativado; o vínculo não foi criado.");
      throw erro;
    }
  }
  await enfileirarParaProfissionais([pedido.solicitante_id], {
    tipo: "vinculo",
    pacienteId: pedido.patient_id,
    titulo: acao === "aprovar" ? "Pedido de vínculo aprovado" : "Pedido de vínculo recusado",
    corpo: acao === "aprovar" ? "O aluno já aparece na sua lista." : "O profissional responsável recusou o vínculo.",
    destino: "/treino",
    referenciaId: id,
  });
  return acao;
}

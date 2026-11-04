import { randomUUID } from "node:crypto";
import { hojeNoBrasil, somarDias } from "@/lib/cronograma";
import { acessoAoTreino, situacaoDoContrato, vencimentoDe, type SituacaoDoContrato } from "@/lib/treinoContrato";
import { BUCKETS, gravarArquivo, removerArquivo, resolverCaminho } from "./arquivos";
import { obterPool } from "./banco";
import { enfileirarParaProfissionais } from "./pushProfissional";
import type { ProfissionalDeTreino } from "./treinoAcesso";

// Planos, contratos e pagamentos do Treino (T8, respostas G1–G5 e R9).
//
// - Cada profissional (educador ou administrador) cria os próprios planos e
//   confirma o pagamento dos próprios contratos (G1, G2).
// - O contrato guarda cópia do plano: mudar o plano não muda contratos feitos.
// - Pagamento por comprovante anexado pelo aluno ou em dinheiro (G3); o
//   comprovante sozinho não confirma nada.
// - Nada aqui toca nos pagamentos da Nutrição (G5).

export class ContratoInvalido extends Error {}

const MODALIDADES = ["musculacao", "corrida", "ciclismo"];
const DATA = /^\d{4}-\d{2}-\d{2}$/;
export const TOLERANCIA_PADRAO = 7;

function texto(valor: unknown, limite: number, obrigatorio = false) {
  if (valor === null || valor === undefined || (typeof valor === "string" && !valor.trim())) {
    if (obrigatorio) throw new ContratoInvalido("Preencha os campos obrigatórios.");
    return null;
  }
  if (typeof valor !== "string") throw new ContratoInvalido("Dados inválidos.");
  const limpo = valor.trim();
  if (limpo.length > limite) throw new ContratoInvalido(`Texto com mais de ${limite} caracteres.`);
  return limpo;
}

function inteiro(valor: unknown, minimo: number, maximo: number, mensagem: string) {
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() ? Number(valor) : NaN;
  if (!Number.isInteger(n) || n < minimo || n > maximo) throw new ContratoInvalido(mensagem);
  return n;
}

// ---------------------------------------------------------------------------
// Tolerância (G4)

export async function toleranciaDoProfissional(profissionalId: string) {
  const r = await obterPool().query<{ tolerancia_dias: number }>(
    "select tolerancia_dias from public.treino_configuracoes where profissional_id = $1",
    [profissionalId]
  );
  return r.rows[0]?.tolerancia_dias ?? TOLERANCIA_PADRAO;
}

export async function definirTolerancia(profissionalId: string, valor: unknown) {
  const dias = inteiro(valor, 0, 60, "A tolerância vai de 0 a 60 dias.");
  await obterPool().query(
    `insert into public.treino_configuracoes (profissional_id, tolerancia_dias) values ($1, $2)
     on conflict (profissional_id) do update set tolerancia_dias = excluded.tolerancia_dias, atualizada_em = now()`,
    [profissionalId, dias]
  );
  return dias;
}

// ---------------------------------------------------------------------------
// Planos (G1)

export type PlanoDoTreino = {
  id: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  duracao_dias: number;
  modalidades: string[];
  inclui_relatorio: boolean;
  arquivado_em: string | null;
};

const COLUNAS_DO_PLANO = "id, nome, descricao, preco_centavos, duracao_dias, modalidades, inclui_relatorio, arquivado_em";

export async function planosDoProfissional(profissionalId: string, comArquivados = false) {
  const r = await obterPool().query<PlanoDoTreino>(
    `select ${COLUNAS_DO_PLANO} from public.treino_planos
      where profissional_id = $1 ${comArquivados ? "" : "and arquivado_em is null"}
      order by arquivado_em nulls first, preco_centavos, nome`,
    [profissionalId]
  );
  return r.rows;
}

function dadosDoPlano(dados: Record<string, unknown>) {
  const nome = texto(dados.nome, 80, true)!;
  if (nome.length < 2) throw new ContratoInvalido("Dê um nome ao plano.");
  const modalidades = Array.isArray(dados.modalidades) ? [...new Set(dados.modalidades)] : [];
  if (!modalidades.length || modalidades.some((m) => typeof m !== "string" || !MODALIDADES.includes(m))) {
    throw new ContratoInvalido("Escolha ao menos uma modalidade.");
  }
  return {
    nome,
    descricao: texto(dados.descricao, 500),
    preco: inteiro(dados.preco_centavos, 0, 100000000, "Informe o preço."),
    duracao: inteiro(dados.duracao_dias, 1, 730, "A duração vai de 1 a 730 dias."),
    modalidades: modalidades as string[],
    relatorio: dados.inclui_relatorio !== false,
  };
}

export async function criarPlano(profissionalId: string, dados: Record<string, unknown>) {
  const p = dadosDoPlano(dados);
  const r = await obterPool().query<{ id: string }>(
    `insert into public.treino_planos (profissional_id, nome, descricao, preco_centavos, duracao_dias, modalidades, inclui_relatorio)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [profissionalId, p.nome, p.descricao, p.preco, p.duracao, p.modalidades, p.relatorio]
  );
  return r.rows[0].id;
}

// Alterar, arquivar ou reativar. false: não é plano deste profissional.
export async function alterarPlano(profissionalId: string, id: string, dados: Record<string, unknown>) {
  if (dados.acao === "arquivar" || dados.acao === "reativar") {
    const r = await obterPool().query(
      `update public.treino_planos set arquivado_em = ${dados.acao === "arquivar" ? "now()" : "null"}
        where id = $1 and profissional_id = $2`,
      [id, profissionalId]
    );
    return (r.rowCount ?? 0) > 0;
  }
  const p = dadosDoPlano(dados);
  const r = await obterPool().query(
    `update public.treino_planos
        set nome = $3, descricao = $4, preco_centavos = $5, duracao_dias = $6, modalidades = $7, inclui_relatorio = $8
      where id = $1 and profissional_id = $2`,
    [id, profissionalId, p.nome, p.descricao, p.preco, p.duracao, p.modalidades, p.relatorio]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Contratos

export type ContratoDoTreino = {
  id: string;
  profissional_id: string;
  profissional: string;
  plano_id: string | null;
  plano_nome: string;
  preco_centavos: number;
  modalidades: string[];
  inicio: string;
  vencimento: string;
  tolerancia_dias: number;
  tem_comprovante: boolean;
  comprovante_em: string | null;
  forma_pagamento: "comprovante" | "dinheiro" | null;
  confirmado_em: string | null;
  cancelado_em: string | null;
  observacao: string | null;
  criado_em: string;
  situacao: SituacaoDoContrato;
};

type LinhaDoContrato = Omit<ContratoDoTreino, "situacao">;

async function contratos(patientId: string, profissionalId: string | null, hoje = hojeNoBrasil()): Promise<ContratoDoTreino[]> {
  const r = await obterPool().query<LinhaDoContrato>(
    `select c.id, c.profissional_id,
            coalesce(e.nome, case when pr.role = 'nutricionista' then 'Administrador' end, 'Profissional') as profissional,
            c.plano_id, c.plano_nome, c.preco_centavos, c.modalidades,
            to_char(c.inicio, 'YYYY-MM-DD') as inicio, to_char(c.vencimento, 'YYYY-MM-DD') as vencimento,
            c.tolerancia_dias, c.comprovante_path is not null as tem_comprovante, c.comprovante_em,
            c.forma_pagamento, c.confirmado_em, c.cancelado_em, c.observacao, c.criado_em
       from public.treino_contratos c
       left join public.educadores_fisicos e on e.usuario_id = c.profissional_id
       left join public.profiles pr on pr.id = c.profissional_id
      where c.patient_id = $1 and ($2::uuid is null or c.profissional_id = $2)
      order by c.vencimento desc, c.criado_em desc`,
    [patientId, profissionalId]
  );
  return r.rows.map((c) => ({ ...c, situacao: situacaoDoContrato(c, hoje) }));
}

// Situação do aluno no Treino hoje (R9): bloqueado quando tem contratos e
// nenhum libera. Sem contrato, como antes da T8.
export async function acessoDoAluno(patientId: string, hoje = hojeNoBrasil()) {
  const lista = await contratos(patientId, null, hoje);
  return { ...acessoAoTreino(lista, hoje), contratos: lista };
}

export async function alunoBloqueado(patientId: string, hoje = hojeNoBrasil()) {
  return (await acessoDoAluno(patientId, hoje)).bloqueado;
}

export const MENSAGEM_DE_BLOQUEIO =
  "Seu plano do Treino venceu. O histórico continua disponível, mas treino novo e registros voltam depois da renovação. Fale com o seu profissional.";

// Resumo para a lista de alunos: bloqueado (R9), comprovante a conferir e
// renovação pedida ao profissional conectado.
export async function resumoDePagamentos(profissionalId: string, alunos: string[], hoje = hojeNoBrasil()) {
  const resumo = new Map<string, { bloqueado: boolean; comprovante: boolean; renovacao: boolean }>();
  if (!alunos.length) return resumo;
  const [lista, pedidos] = await Promise.all([
    obterPool().query<{ patient_id: string; profissional_id: string; inicio: string; vencimento: string; tolerancia_dias: number; confirmado_em: string | null; comprovante_em: string | null; cancelado_em: string | null }>(
      `select patient_id, profissional_id, to_char(inicio, 'YYYY-MM-DD') as inicio, to_char(vencimento, 'YYYY-MM-DD') as vencimento,
              tolerancia_dias, confirmado_em, comprovante_em, cancelado_em
         from public.treino_contratos where patient_id = any($1) and cancelado_em is null`,
      [alunos]
    ),
    obterPool().query<{ patient_id: string }>(
      "select distinct patient_id from public.treino_renovacoes where patient_id = any($1) and profissional_id = $2 and atendida_em is null",
      [alunos, profissionalId]
    ),
  ]);
  const renovacoes = new Set(pedidos.rows.map((l) => l.patient_id));
  for (const id of alunos) {
    const deles = lista.rows.filter((c) => c.patient_id === id);
    resumo.set(id, {
      bloqueado: acessoAoTreino(deles, hoje).bloqueado,
      comprovante: deles.some((c) => c.profissional_id === profissionalId && c.comprovante_em && !c.confirmado_em),
      renovacao: renovacoes.has(id),
    });
  }
  return resumo;
}

// Painel do profissional na ficha do aluno: os contratos dele, os pedidos de
// renovação feitos a ele, os planos ativos e a situação geral do aluno.
export async function contratosParaProfissional(profissional: ProfissionalDeTreino, patientId: string) {
  const hoje = hojeNoBrasil();
  const [acesso, meus, planos, tolerancia, renovacoes] = await Promise.all([
    acessoDoAluno(patientId, hoje),
    contratos(patientId, profissional.usuarioId, hoje),
    planosDoProfissional(profissional.usuarioId),
    toleranciaDoProfissional(profissional.usuarioId),
    obterPool().query(
      `select r.id, r.plano_id, p.nome as plano_nome, r.observacao, r.criada_em
         from public.treino_renovacoes r
         left join public.treino_planos p on p.id = r.plano_id
        where r.patient_id = $1 and r.profissional_id = $2 and r.atendida_em is null
        order by r.criada_em desc`,
      [patientId, profissional.usuarioId]
    ),
  ]);
  return {
    hoje,
    bloqueado: acesso.bloqueado,
    outrosProfissionais: acesso.contratos.some((c) => c.profissional_id !== profissional.usuarioId && !c.cancelado_em),
    contratos: meus,
    planos,
    tolerancia,
    inicioSugerido: inicioSugerido(meus, hoje),
    renovacoes: renovacoes.rows,
  };
}

// Renovação continua o ciclo: começa no dia seguinte ao último vencimento,
// se ele ainda não ficou para trás da tolerância; senão, hoje.
function inicioSugerido(lista: ContratoDoTreino[], hoje: string) {
  const ultimo = lista.find((c) => !c.cancelado_em);
  if (!ultimo) return hoje;
  const seguinte = somarDias(ultimo.vencimento, 1);
  return seguinte >= somarDias(hoje, -ultimo.tolerancia_dias) ? seguinte : hoje;
}

export async function criarContrato(profissional: ProfissionalDeTreino, patientId: string, dados: Record<string, unknown>) {
  if (typeof dados.planoId !== "string") throw new ContratoInvalido("Escolha o plano.");
  const plano = await obterPool().query<PlanoDoTreino>(
    `select ${COLUNAS_DO_PLANO} from public.treino_planos where id = $1 and profissional_id = $2 and arquivado_em is null`,
    [dados.planoId, profissional.usuarioId]
  );
  const p = plano.rows[0];
  if (!p) throw new ContratoInvalido("Plano não encontrado.");
  const inicio = typeof dados.inicio === "string" && DATA.test(dados.inicio) ? dados.inicio : hojeNoBrasil();
  const tolerancia = await toleranciaDoProfissional(profissional.usuarioId);
  const forma = dados.pagoEmDinheiro === true ? "dinheiro" : null;

  const cliente = await obterPool().connect();
  try {
    await cliente.query("begin");
    const r = await cliente.query<{ id: string }>(
      `insert into public.treino_contratos
         (patient_id, profissional_id, plano_id, plano_nome, preco_centavos, modalidades, inicio, vencimento,
          tolerancia_dias, forma_pagamento, confirmado_em, confirmado_por, observacao, criado_por)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, case when $10::text is null then null else now() end,
               case when $10::text is null then null else $2::uuid end, $11, $2)
       returning id`,
      [patientId, profissional.usuarioId, p.id, p.nome, p.preco_centavos, p.modalidades, inicio, vencimentoDe(inicio, p.duracao_dias), tolerancia, forma, texto(dados.observacao, 500)]
    );
    // O contrato novo atende os pedidos de renovação feitos a este profissional.
    await cliente.query(
      "update public.treino_renovacoes set atendida_em = now() where patient_id = $1 and profissional_id = $2 and atendida_em is null",
      [patientId, profissional.usuarioId]
    );
    await cliente.query("commit");
    return r.rows[0].id;
  } catch (erro) {
    await cliente.query("rollback").catch(() => undefined);
    throw erro;
  } finally {
    cliente.release();
  }
}

export type AcaoNoContrato = "confirmar_comprovante" | "confirmar_dinheiro" | "desfazer_confirmacao" | "cancelar";

// Confirmar o pagamento, desfazer (engano) ou cancelar. Só o profissional do
// contrato (G2). false: contrato não encontrado.
export async function alterarContrato(profissional: ProfissionalDeTreino, contratoId: string, acao: unknown) {
  const atual = await obterPool().query<{ patient_id: string; comprovante_path: string | null; confirmado_em: string | null; cancelado_em: string | null }>(
    "select patient_id, comprovante_path, confirmado_em, cancelado_em from public.treino_contratos where id = $1 and profissional_id = $2",
    [contratoId, profissional.usuarioId]
  );
  const c = atual.rows[0];
  if (!c) return false;
  if (c.cancelado_em) throw new ContratoInvalido("Este contrato foi cancelado.");

  if (acao === "confirmar_comprovante" || acao === "confirmar_dinheiro") {
    if (c.confirmado_em) throw new ContratoInvalido("O pagamento já foi confirmado.");
    if (acao === "confirmar_comprovante" && !c.comprovante_path) throw new ContratoInvalido("O aluno ainda não anexou o comprovante.");
    await obterPool().query(
      "update public.treino_contratos set forma_pagamento = $2, confirmado_em = now(), confirmado_por = $3 where id = $1",
      [contratoId, acao === "confirmar_comprovante" ? "comprovante" : "dinheiro", profissional.usuarioId]
    );
  } else if (acao === "desfazer_confirmacao") {
    await obterPool().query("update public.treino_contratos set forma_pagamento = null, confirmado_em = null, confirmado_por = null where id = $1", [contratoId]);
  } else if (acao === "cancelar") {
    if (c.confirmado_em) throw new ContratoInvalido("Desfaça a confirmação do pagamento antes de cancelar.");
    await obterPool().query("update public.treino_contratos set cancelado_em = now() where id = $1", [contratoId]);
  } else {
    throw new ContratoInvalido("Ação inválida.");
  }
  return true;
}

// Caminho do comprovante para o profissional do contrato.
export async function comprovanteParaProfissional(profissional: ProfissionalDeTreino, contratoId: string) {
  const r = await obterPool().query<{ comprovante_path: string | null }>(
    "select comprovante_path from public.treino_contratos where id = $1 and profissional_id = $2",
    [contratoId, profissional.usuarioId]
  );
  return r.rows[0]?.comprovante_path ?? null;
}

// ---------------------------------------------------------------------------
// Lado do aluno

// Contratos, planos dos profissionais com quem ele tem contrato (para pedir a
// renovação) e pedidos pendentes. Os preços são os de hoje do plano.
export async function planoDoAluno(patientId: string) {
  const hoje = hojeNoBrasil();
  const acesso = await acessoDoAluno(patientId, hoje);
  const profissionais = [...new Set(acesso.contratos.filter((c) => !c.cancelado_em).map((c) => c.profissional_id))];
  const [planos, pedidos] = await Promise.all([
    profissionais.length
      ? obterPool().query<PlanoDoTreino & { profissional_id: string }>(
          `select ${COLUNAS_DO_PLANO}, profissional_id from public.treino_planos
            where profissional_id = any($1) and arquivado_em is null order by preco_centavos, nome`,
          [profissionais]
        )
      : Promise.resolve({ rows: [] }),
    obterPool().query<{ id: string; plano_nome: string | null; criada_em: string }>(
      `select r.id, p.nome as plano_nome, r.criada_em from public.treino_renovacoes r
         left join public.treino_planos p on p.id = r.plano_id
        where r.patient_id = $1 and r.atendida_em is null order by r.criada_em desc`,
      [patientId]
    ),
  ]);
  return {
    hoje,
    bloqueado: acesso.bloqueado,
    mensagem: acesso.bloqueado ? MENSAGEM_DE_BLOQUEIO : null,
    contratos: acesso.contratos.filter((c) => !c.cancelado_em).map((c) => ({ ...c, observacao: null })),
    planos: planos.rows,
    pedidos: pedidos.rows,
  };
}

async function nomeDoAluno(patientId: string) {
  const r = await obterPool().query<{ name: string }>("select name from public.patients where id = $1", [patientId]);
  return r.rows[0]?.name ?? "Aluno";
}

export async function pedirRenovacao(patientId: string, dados: Record<string, unknown>) {
  if (typeof dados.planoId !== "string") throw new ContratoInvalido("Escolha o plano.");
  const plano = await obterPool().query<{ id: string; nome: string; profissional_id: string }>(
    `select p.id, p.nome, p.profissional_id from public.treino_planos p
      where p.id = $1 and p.arquivado_em is null
        and exists (select 1 from public.treino_contratos c
                     where c.patient_id = $2 and c.profissional_id = p.profissional_id and c.cancelado_em is null)`,
    [dados.planoId, patientId]
  );
  const p = plano.rows[0];
  if (!p) throw new ContratoInvalido("Plano não encontrado.");
  const pendente = await obterPool().query(
    "select 1 from public.treino_renovacoes where patient_id = $1 and profissional_id = $2 and atendida_em is null",
    [patientId, p.profissional_id]
  );
  if (pendente.rowCount) throw new ContratoInvalido("Você já pediu a renovação. Aguarde o seu profissional.");
  const r = await obterPool().query<{ id: string }>(
    "insert into public.treino_renovacoes (patient_id, profissional_id, plano_id, observacao) values ($1, $2, $3, $4) returning id",
    [patientId, p.profissional_id, p.id, texto(dados.observacao, 500)]
  );
  await enfileirarParaProfissionais([p.profissional_id], {
    tipo: "renovacao_treino",
    pacienteId: patientId,
    titulo: "Pedido de renovação do Treino",
    corpo: `${await nomeDoAluno(patientId)} pediu a renovação: ${p.nome}.`,
    destino: `/treino/alunos/${patientId}`,
    referenciaId: r.rows[0].id,
  });
  return r.rows[0].id;
}

const EXTENSOES_DO_COMPROVANTE = ["pdf", "jpg", "jpeg", "png"];

// Comprovante do aluno (bucket "comprovantes", pasta do usuário dele, como
// na Nutrição). Troca o anterior enquanto o pagamento não foi confirmado.
export async function anexarComprovante(patientId: string, usuarioId: string, contratoId: string, arquivo: File) {
  const atual = await obterPool().query<{ profissional_id: string; plano_nome: string; comprovante_path: string | null; confirmado_em: string | null; cancelado_em: string | null }>(
    "select profissional_id, plano_nome, comprovante_path, confirmado_em, cancelado_em from public.treino_contratos where id = $1 and patient_id = $2",
    [contratoId, patientId]
  );
  const c = atual.rows[0];
  if (!c || c.cancelado_em) throw new ContratoInvalido("Contrato não encontrado.");
  if (c.confirmado_em) throw new ContratoInvalido("O pagamento deste plano já foi confirmado.");
  const extensao = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  if (!EXTENSOES_DO_COMPROVANTE.includes(extensao)) throw new ContratoInvalido("Envie o comprovante em PDF, JPG ou PNG.");
  if (arquivo.size === 0 || arquivo.size > BUCKETS.comprovantes.tamanhoMaximo) throw new ContratoInvalido("Arquivo vazio ou maior que 20 MB.");

  const envio = randomUUID();
  const caminho = `${usuarioId}/treino-${envio}.${extensao}`;
  const destino = resolverCaminho("comprovantes", caminho);
  if (!destino) throw new ContratoInvalido("Arquivo inválido.");
  await gravarArquivo(destino, Buffer.from(await arquivo.arrayBuffer()), false);
  await obterPool().query("update public.treino_contratos set comprovante_path = $2, comprovante_em = now() where id = $1", [contratoId, caminho]);
  const antigo = c.comprovante_path ? resolverCaminho("comprovantes", c.comprovante_path) : null;
  if (antigo) await removerArquivo(antigo).catch(() => undefined);

  await enfileirarParaProfissionais([c.profissional_id], {
    tipo: "pagamento_treino",
    pacienteId: patientId,
    titulo: "Comprovante do Treino anexado",
    corpo: `${await nomeDoAluno(patientId)} anexou o comprovante do plano ${c.plano_nome}. Confira e confirme o pagamento.`,
    destino: `/treino/alunos/${patientId}`,
    referenciaId: envio,
  });
}

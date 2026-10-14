import type { Regra, Regras } from "./sql";

// Quem pode ler e alterar o quê.
//
// Estas regras valem para as consultas que vêm do navegador (/api/dados) e
// substituem as políticas RLS que existiam no Supabase. Tabela ou operação
// que não aparece aqui não é acessível pelo navegador: leituras voltam vazias,
// alterações não alcançam nenhuma linha e inserções são recusadas.

export type Contexto = {
  usuarioId: string;
  email: string;
  papel: string | null;
  // Cadastro de paciente vinculado ao usuário, quando existe.
  pacienteId: string | null;
};

type Operacao = "select" | "insert" | "update" | "delete";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function literal(id: string) {
  // Os ids vêm do banco, mas entram no SQL como texto: conferir o formato.
  if (!UUID.test(id)) {
    throw new Error("Identificador inválido.");
  }

  return `'${id}'::uuid`;
}

const TUDO: Regra = {};

export function criarRegras(contexto: Contexto): Regras {
  const nutricionista = contexto.papel === "nutricionista";
  const usuario = literal(contexto.usuarioId);
  const paciente = contexto.pacienteId ? literal(contexto.pacienteId) : null;

  // Linha pertence ao paciente conectado.
  const doPaciente = (alias: string) =>
    paciente ? `${alias}.patient_id = ${paciente}` : "false";

  // O paciente só enxerga as duas entregas de dieta mais recentes.
  const entregasVisiveis = paciente
    ? `(select u.id
          from public.diet_deliveries u
         where u.patient_id = ${paciente}
         order by u.created_at desc, u.id desc
         limit 2)`
    : "(select null::uuid where false)";

  const tabelas: Record<string, Partial<Record<Operacao, Regra | null>>> = {
    patients: {
      select: nutricionista
        ? TUDO
        : { usando: (a) => `${a}.auth_user_id = ${usuario}` },
      insert: nutricionista ? TUDO : null,
      update: nutricionista ? TUDO : null,
    },

    profiles: {
      select: { usando: (a) => `${a}.id = ${usuario}` },
    },

    patient_reports: {
      select: nutricionista ? TUDO : { usando: doPaciente },
      // Só o próprio paciente envia relatório, e apenas de semanas válidas do ciclo.
      insert: paciente
        ? {
            verificando: (v) =>
              `${v}.patient_id = ${paciente}
               and public.validar_data_relatorio_ciclo(${v}.patient_id, ${v}.cycle_id, ${v}.scheduled_week_start)`,
          }
        : null,
      update: nutricionista ? TUDO : null,
      delete: nutricionista ? TUDO : null,
    },

    patient_alerts: {
      select: nutricionista ? TUDO : null,
      insert: nutricionista ? TUDO : null,
      update: nutricionista ? TUDO : null,
    },

    patient_progress: {
      select: nutricionista ? TUDO : { usando: doPaciente },
      insert: nutricionista ? TUDO : null,
    },

    diet_cycles: {
      select: nutricionista ? TUDO : { usando: doPaciente },
      insert: nutricionista ? TUDO : null,
      update: nutricionista ? TUDO : null,
    },

    diet_deliveries: {
      select: nutricionista
        ? TUDO
        : { usando: (a) => `${a}.id in ${entregasVisiveis}` },
      insert: nutricionista ? TUDO : null,
      update: nutricionista ? TUDO : null,
      delete: nutricionista ? TUDO : null,
    },

    diet_delivery_files: {
      select: nutricionista
        ? TUDO
        : { usando: (a) => `${a}.delivery_id in ${entregasVisiveis}` },
      insert: nutricionista ? TUDO : null,
    },

    renewal_requests: {
      // O paciente vê as próprias solicitações (para não pedir de novo).
      select: nutricionista ? TUDO : { usando: doPaciente },
      insert: paciente
        ? { verificando: (v) => `${v}.patient_id = ${paciente}` }
        : null,
      update: nutricionista ? TUDO : null,
    },

    payments: {
      select: nutricionista
        ? TUDO
        : {
            usando: (a) =>
              paciente
                ? `(${a}.patient_id = ${paciente}
                    or ${a}.cycle_id in (select c.id from public.diet_cycles c where c.patient_id = ${paciente}))`
                : "false",
          },
      insert: nutricionista ? TUDO : null,
      // O paciente só pode anexar o comprovante de um pagamento ainda pendente.
      update: nutricionista
        ? TUDO
        : {
            usando: (a) =>
              `${doPaciente(a)}
               and ${a}.status = 'pendente'
               and ${a}.receipt_file_path is null
               and ${a}.receipt_uploaded_at is null
               and ${a}.confirmed_at is null`,
            validarValores: (valores) =>
              Object.keys(valores).every((campo) =>
                ["status", "receipt_file_path", "receipt_uploaded_at"].includes(
                  campo
                )
              ) &&
              valores.status === "comprovante_enviado" &&
              typeof valores.receipt_file_path === "string" &&
              valores.receipt_file_path.length > 0 &&
              typeof valores.receipt_uploaded_at === "string" &&
              valores.receipt_uploaded_at.length > 0,
          },
    },

    push_subscriptions: {
      select: { usando: doPaciente },
      insert: paciente
        ? { verificando: (v) => `${v}.patient_id = ${paciente}` }
        : null,
      update: { usando: doPaciente },
      delete: { usando: doPaciente },
    },

    patient_update_views: {
      select: { usando: doPaciente },
      // A visualização precisa apontar para uma dieta ou devolutiva do próprio paciente.
      insert: paciente
        ? {
            verificando: (v) =>
              `${v}.patient_id = ${paciente}
               and (
                 (${v}.update_type = 'dieta' and exists (
                    select 1 from public.diet_deliveries d
                     where d.id = ${v}.reference_id
                       and d.patient_id = ${v}.patient_id))
                 or
                 (${v}.update_type = 'devolutiva' and exists (
                    select 1 from public.patient_reports r
                     where r.id = ${v}.reference_id
                       and r.patient_id = ${v}.patient_id
                       and r.status = 'enviado'
                       and nullif(trim(both from r.feedback_text), '') is not null))
               )`,
          }
        : null,
    },
  };

  return {
    obter(tabela, operacao) {
      return tabelas[tabela]?.[operacao] ?? null;
    },
  };
}

// Funções do banco que o navegador pode chamar.
export function podeChamarFuncao(contexto: Contexto, nome: string) {
  return nome === "iniciar_ciclo_dieta" && contexto.papel === "nutricionista";
}

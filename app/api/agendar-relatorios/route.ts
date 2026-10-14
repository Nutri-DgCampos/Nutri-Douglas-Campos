import { banco } from "@/lib/servidor/banco";
import { autorizadoPorCron } from "@/lib/servidor/http";
import { NextResponse } from "next/server";
import crypto from "node:crypto";

export const runtime = "nodejs";

type Frequencia = "semanal" | "quinzenal" | "mensal";

function calcularRelatoriosProgramados(
  dataInicio: string,
  frequenciaInformada: string,
  dataCadastroRetroativo: string | null = null,
  semanasRetroativasConcluidas = 0
) {
  const frequencia = frequenciaInformada.trim().toLowerCase();

  const configuracoes: Record<
    Frequencia,
    { intervaloDias: number; quantidade: number }
  > = {
    semanal: { intervaloDias: 7, quantidade: 4 },
    quinzenal: { intervaloDias: 15, quantidade: 2 },
    mensal: { intervaloDias: 30, quantidade: 1 },
  };

  if (!(frequencia in configuracoes)) {
    return [];
  }

  const configuracao = configuracoes[frequencia as Frequencia];

  const relatorios: {
    numero: number;
    segundaPrevista: string;
  }[] = [];

  const cadastroRetroativo =
    Boolean(dataCadastroRetroativo) &&
    semanasRetroativasConcluidas > 0;

  for (
    let numero = 1;
    numero <= configuracao.quantidade;
    numero++
  ) {
    let dataPrevista: Date;

    if (cadastroRetroativo && dataCadastroRetroativo) {
      const dataCadastro = new Date(
        `${dataCadastroRetroativo}T12:00:00Z`
      );

      const diasDesdeSegundaCadastro =
        (dataCadastro.getUTCDay() + 6) % 7;

      dataCadastro.setUTCDate(
        dataCadastro.getUTCDate() - diasDesdeSegundaCadastro
      );

      const diasJaConcluidos =
  semanasRetroativasConcluidas * 7;

const intervaloRetroativoDias =
  frequencia === "semanal"
    ? 7
    : frequencia === "quinzenal"
    ? 14
    : 28;

const diasParaRelatorio =
  intervaloRetroativoDias * numero - diasJaConcluidos;

dataCadastro.setUTCDate(
  dataCadastro.getUTCDate() + diasParaRelatorio
);

      dataPrevista = dataCadastro;
    } else {
      dataPrevista = new Date(`${dataInicio}T12:00:00Z`);

      dataPrevista.setUTCDate(
        dataPrevista.getUTCDate() +
          configuracao.intervaloDias * numero
      );
    }

    const diaSemana = dataPrevista.getUTCDay();
    const diasDesdeSegunda = (diaSemana + 6) % 7;

    const ajuste =
      diasDesdeSegunda <= 3
        ? -diasDesdeSegunda
        : 7 - diasDesdeSegunda;

    dataPrevista.setUTCDate(
      dataPrevista.getUTCDate() + ajuste
    );

    relatorios.push({
      numero,
      segundaPrevista: dataPrevista.toISOString().slice(0, 10),
    });
  }

  return relatorios;
}

function obterHorariosNotificacao(segundaPrevista: string) {
  const segunda = new Date(`${segundaPrevista}T12:00:00Z`);

  const terca = new Date(segunda);
  terca.setUTCDate(terca.getUTCDate() + 1);

  const dataTerca = terca.toISOString().slice(0, 10);

  return {
    segunda: `${segundaPrevista}T12:00:00Z`,
    terca: `${dataTerca}T21:00:00Z`,
  };
}

function obterDataAtualBrasil() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const ano = Number(
    partes.find((parte) => parte.type === "year")?.value
  );

  const mes = Number(
    partes.find((parte) => parte.type === "month")?.value
  );

  const dia = Number(
    partes.find((parte) => parte.type === "day")?.value
  );

  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function obterSegundaAtualBrasil() {
  const dataAtual = obterDataAtualBrasil();
  const data = new Date(`${dataAtual}T12:00:00Z`);

  const diasDesdeSegunda = (data.getUTCDay() + 6) % 7;

  data.setUTCDate(data.getUTCDate() - diasDesdeSegunda);

  return data.toISOString().slice(0, 10);
}

async function consultarCiclosAtivos(
) {
  const { data, error } = await banco
    .from("diet_cycles")
    .select(
  "id, patient_id, start_date, end_date, followup_frequency, cycle_number, retroactive_registered_at"
)
    .eq("status", "ativo");

  if (error) {
    console.error("Erro ao consultar ciclos ativos:", error);
    throw new Error("Não foi possível consultar os ciclos ativos.");
  }

  return data ?? [];
}

async function consultarRelatoriosDoCiclo(
  cicloId: string
) {
  const { data, error } = await banco
    .from("patient_reports")
    .select("id, cycle_id, scheduled_week_start")
    .eq("cycle_id", cicloId)
    .not("scheduled_week_start", "is", null);

  if (error) {
    console.error(
      "Erro ao consultar relatórios do ciclo:",
      error
    );

    throw new Error(
      "Não foi possível verificar os relatórios enviados."
    );
  }

  return new Set(
    (data ?? []).map(
      (relatorio) => relatorio.scheduled_week_start
    )
  );
}

async function identificarRelatoriosPendentes(
) {
  const ciclos = await consultarCiclosAtivos();
  const segundaAtual = obterSegundaAtualBrasil();

  const pendentes: {
    cicloId: string;
    pacienteId: string;
    numeroRelatorio: number;
    segundaPrevista: string;
  }[] = [];

  for (const ciclo of ciclos) {
    const dataAtualBrasil = obterDataAtualBrasil();

    if (
      ciclo.start_date > dataAtualBrasil ||
      (ciclo.end_date && ciclo.end_date < dataAtualBrasil)
    ) {
      continue;
    }

    const { data: pacienteRetroativo, error: erroPacienteRetroativo } =
  await banco
    .from("patients")
    .select("retroactive_registration, retroactive_completed_weeks")
    .eq("id", ciclo.patient_id)
    .single();

if (erroPacienteRetroativo) {
  console.error(
    "Erro ao consultar dados retroativos do paciente:",
    erroPacienteRetroativo
  );
  throw new Error(
    "Não foi possível consultar os dados retroativos do paciente."
  );
}

    const relatoriosProgramados = calcularRelatoriosProgramados(
  ciclo.start_date,
  ciclo.followup_frequency,
  pacienteRetroativo?.retroactive_registration
    ? ciclo.retroactive_registered_at
    : null,
  pacienteRetroativo?.retroactive_registration
    ? (pacienteRetroativo.retroactive_completed_weeks ?? 0)
    : 0
);

    const relatoriosDestaSemana = relatoriosProgramados.filter(
      (relatorio) => relatorio.segundaPrevista === segundaAtual
    );

    if (relatoriosDestaSemana.length === 0) {
      continue;
    }

        const semanasRespondidas = await consultarRelatoriosDoCiclo(
      ciclo.id
    );

        for (const relatorio of relatoriosDestaSemana) {
      if (ciclo.retroactive_registered_at) {
  const dataCadastro = new Date(
    `${ciclo.retroactive_registered_at}T12:00:00Z`
  );

  const diasDesdeSegundaCadastro =
    (dataCadastro.getUTCDay() + 6) % 7;

  dataCadastro.setUTCDate(
    dataCadastro.getUTCDate() - diasDesdeSegundaCadastro
  );

  const semanaCadastro =
    dataCadastro.toISOString().slice(0, 10);

  if (relatorio.segundaPrevista < semanaCadastro) {
    continue;
  }
}

      if (semanasRespondidas.has(relatorio.segundaPrevista)) {
        continue;
      }

      pendentes.push({
        cicloId: ciclo.id,
        pacienteId: ciclo.patient_id,
        numeroRelatorio: relatorio.numero,
        segundaPrevista: relatorio.segundaPrevista,
      });
    }
  }

  return pendentes;
}

function obterMomentoAtualBrasil() {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const diaSemana = partes.find(
    (parte) => parte.type === "weekday"
  )?.value;

  const hora = Number(
    partes.find((parte) => parte.type === "hour")?.value
  );

  const minuto = Number(
    partes.find((parte) => parte.type === "minute")?.value
  );

  return {
    diaSemana,
    minutosDoDia: hora * 60 + minuto,
  };
}

function identificarLembreteDisponivel() {
  const { diaSemana, minutosDoDia } = obterMomentoAtualBrasil();

  // Segunda-feira: das 09h00 às 09h59
  if (
    diaSemana === "Mon" &&
    minutosDoDia >= 9 * 60 &&
    minutosDoDia < 10 * 60
  ) {
    return "segunda" as const;
  }

  // Terça-feira: das 18h00 às 18h59
  if (
    diaSemana === "Tue" &&
    minutosDoDia >= 18 * 60 &&
    minutosDoDia < 19 * 60
  ) {
    return "terca" as const;
  }

  return null;
}

function criarIdentificadorLembrete(
  cicloId: string,
  segundaPrevista: string,
  tipo: "segunda" | "terca"
) {
  return `relatorio:${cicloId}:${segundaPrevista}:${tipo}`;
}

async function registrarLembrete(
  pendente: {
    cicloId: string;
    pacienteId: string;
    numeroRelatorio: number;
    segundaPrevista: string;
  },
  tipo: "segunda" | "terca"
) {
  const horarios = obterHorariosNotificacao(
    pendente.segundaPrevista
  );

  const identificador = criarIdentificadorLembrete(
    pendente.cicloId,
    pendente.segundaPrevista,
    tipo
  );

  const titulo =
    tipo === "segunda"
      ? "Seu relatório está disponível!"
      : "Lembrete do seu relatório";

  const mensagem =
    tipo === "segunda"
      ? "Está na hora de preencher seu relatório de acompanhamento nutricional."
      : "Você ainda não preencheu seu relatório desta semana. Acesse seu acompanhamento para responder.";

  const { error } = await banco
    .from("notification_queue")
    .upsert(
      {
        patient_id: pendente.pacienteId,
        notification_type: "lembrete_relatorio",
        title: titulo,
        body: mensagem,
        target_url: "/area-paciente/acompanhamento",
        scheduled_at: horarios[tipo],
        reference_id: pendente.cicloId,
        dedup_key: identificador,
        status: "pendente",
      },
      {
        onConflict: "dedup_key",
        ignoreDuplicates: true,
      }
    );

  if (error) {
    console.error("Erro ao registrar lembrete:", error);
    throw new Error("Não foi possível registrar o lembrete.");
  }
}

async function relatorioJaRespondido(
  cicloId: string,
  segundaPrevista: string
) {
  const { data, error } = await banco
    .from("patient_reports")
    .select("id")
    .eq("cycle_id", cicloId)
    .eq("scheduled_week_start", segundaPrevista)
    .limit(1);

  if (error) {
    console.error(
      "Erro ao verificar relatório antes da notificação:",
      error
    );

    throw new Error(
      "Não foi possível verificar se o relatório foi respondido."
    );
  }

  return (data?.length ?? 0) > 0;
}

async function agendarLembretesPendentes() {

  const tipo = identificarLembreteDisponivel();

  if (!tipo) {
    return {
      agendados: 0,
      motivo: "Fora do horário de agendamento.",
    };
  }

  const pendentes = await identificarRelatoriosPendentes(
  );

  let agendados = 0;

  for (const pendente of pendentes) {
    const respondido = await relatorioJaRespondido(
      pendente.cicloId,
      pendente.segundaPrevista
    );

    if (respondido) {
      continue;
    }

    await registrarLembrete(
      pendente,
      tipo
    );

    agendados++;
  }

  return {
    agendados,
    tipo,
  };
}

export async function GET(request: Request) {
  if (!autorizadoPorCron(request)) {
    return NextResponse.json(
      { error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const resultado = await agendarLembretesPendentes();

    return NextResponse.json({
      sucesso: true,
      ...resultado,
    });
  } catch (error) {
    console.error(
      "Erro no agendamento de relatórios:",
      error
    );

    return NextResponse.json(
      { error: "Erro ao agendar relatórios." },
      { status: 500 }
    );
  }
}
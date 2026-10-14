// Agenda dos relatórios de um ciclo de acompanhamento.
//
// Regra única usada pela tela do paciente, pelo formulário semanal, pela
// tela de relatórios do nutricionista e pelo agendador de lembretes.
//
// - Semanal: 4 relatórios, a cada 7 dias.
// - Quinzenal: 2 relatórios, ao completar 2 e 4 semanas.
// - Mensal: 1 relatório, ao completar 4 semanas.
// A data prevista é arredondada para uma segunda-feira (de segunda a quinta
// volta para a segunda da mesma semana; de sexta a domingo vai para a
// seguinte). O relatório fica aberto na segunda e na terça dessa semana.
//
// Datas são sempre "AAAA-MM-DD" no fuso de Brasília.

export type Frequencia = "semanal" | "quinzenal" | "mensal";

export const PLANOS: Record<Frequencia, { intervaloDias: number; quantidade: number }> = {
  semanal: { intervaloDias: 7, quantidade: 4 },
  quinzenal: { intervaloDias: 14, quantidade: 2 },
  mensal: { intervaloDias: 28, quantidade: 1 },
};

export type CicloParaAgenda = {
  start_date: string;
  followup_frequency: string | null;
  retroactive_registered_at?: string | null;
};

export type RelatorioPrevisto = { numero: number; segunda: string };

export function normalizarFrequencia(texto: string | null | undefined): Frequencia | null {
  const valor = texto?.trim().toLowerCase();
  return valor === "semanal" || valor === "quinzenal" || valor === "mensal" ? valor : null;
}

function paraData(dataISO: string) {
  return new Date(`${dataISO}T12:00:00Z`);
}

export function somarDias(dataISO: string, dias: number) {
  const data = paraData(dataISO);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export function diferencaEmDias(de: string, ate: string) {
  return Math.round((paraData(ate).getTime() - paraData(de).getTime()) / 86_400_000);
}

// 0 = domingo, 1 = segunda... 6 = sábado
export function diaDaSemana(dataISO: string) {
  return paraData(dataISO).getUTCDay();
}

export function segundaDaSemana(dataISO: string) {
  return somarDias(dataISO, -((diaDaSemana(dataISO) + 6) % 7));
}

export function hojeNoBrasil(agora: Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

function arredondarParaSegunda(dataISO: string) {
  const desdeSegunda = (diaDaSemana(dataISO) + 6) % 7;
  return somarDias(dataISO, desdeSegunda <= 3 ? -desdeSegunda : 7 - desdeSegunda);
}

// Segundas-feiras em que cada relatório do ciclo fica disponível.
//
// semanasConcluidas: no cadastro de quem já estava em acompanhamento
// ("Já sou paciente"), quantas semanas o paciente já tinha completado
// (escolheu "Semana 3" -> 2 semanas concluídas). Zero nos demais casos.
export function segundasPrevistas(
  ciclo: CicloParaAgenda,
  semanasConcluidas = 0
): RelatorioPrevisto[] {
  const frequencia = normalizarFrequencia(ciclo.followup_frequency);

  if (!frequencia) {
    return [];
  }

  const { intervaloDias, quantidade } = PLANOS[frequencia];
  const retroativo = Boolean(ciclo.retroactive_registered_at) && semanasConcluidas > 0;
  const previstos: RelatorioPrevisto[] = [];

  for (let numero = 1; numero <= quantidade; numero += 1) {
    // No cadastro retroativo a contagem parte da segunda-feira da semana do
    // cadastro, descontando as semanas que o paciente já tinha completado.
    const data = retroativo
      ? somarDias(
          segundaDaSemana(ciclo.retroactive_registered_at as string),
          intervaloDias * numero - semanasConcluidas * 7
        )
      : somarDias(ciclo.start_date, intervaloDias * numero);

    previstos.push({ numero, segunda: arredondarParaSegunda(data) });
  }

  return previstos;
}

// Relatório que pode ser respondido hoje, ou null.
export function relatorioAbertoHoje(
  previstos: RelatorioPrevisto[],
  hoje: string,
  semanasRespondidas: Set<string>,
  registroRetroativo?: string | null
): RelatorioPrevisto | null {
  const dia = diaDaSemana(hoje);

  if (dia !== 1 && dia !== 2) {
    return null;
  }

  const segunda = segundaDaSemana(hoje);
  const previsto = previstos.find((item) => item.segunda === segunda);

  if (!previsto || semanasRespondidas.has(segunda)) {
    return null;
  }

  // Semanas anteriores ao cadastro de quem entrou com o acompanhamento em andamento.
  if (registroRetroativo && segunda < segundaDaSemana(registroRetroativo)) {
    return null;
  }

  return previsto;
}

// Semana do ciclo em que o paciente está (1 na primeira semana).
export function semanaDoCiclo(ciclo: CicloParaAgenda, hoje: string) {
  return Math.max(1, Math.floor(diferencaEmDias(ciclo.start_date, hoje) / 7) + 1);
}

export type SituacaoDosRelatorios = {
  semana: number;
  mensagem: string;
  // Renovação é oferecida a partir da 4ª semana.
  podeRenovar: boolean;
  concluido: boolean;
};

export function situacaoDosRelatorios(
  ciclo: CicloParaAgenda,
  semanasConcluidas: number,
  hoje: string,
  semanasRespondidas: Set<string>
): SituacaoDosRelatorios {
  const frequencia = normalizarFrequencia(ciclo.followup_frequency);
  const previstos = segundasPrevistas(ciclo, semanasConcluidas);
  const semana = semanaDoCiclo(ciclo, hoje);
  const ultimo = previstos.at(-1);

  // O último relatório foi respondido, ou a terça-feira dele já passou.
  const concluido =
    !ultimo ||
    semanasRespondidas.has(ultimo.segunda) ||
    hoje > somarDias(ultimo.segunda, 1);

  let mensagem: string;

  if (concluido) {
    mensagem =
      "Todos os relatórios deste acompanhamento foram concluídos ou tiveram seu prazo encerrado.";
  } else if (semana >= 4) {
    mensagem = "Este é seu último relatório.";
  } else if (frequencia === "semanal") {
    const restantes = 4 - semana;
    mensagem =
      restantes === 1
        ? "Resta 1 relatório a ser preenchido."
        : `Restam ${restantes} relatórios a serem preenchidos.`;
  } else {
    mensagem = "Aguarde, em breve seu relatório ficará disponível.";
  }

  return { semana, mensagem, podeRenovar: semana >= 4, concluido };
}

// Treino do paciente, organizado pela IA a partir do arquivo enviado.
//
// Usado pela tela do paciente, pela tela do nutricionista e pela análise no
// servidor. Volumes e nível são calculados aqui (não pela IA), para mudarem
// quando o paciente ajusta séries, repetições ou carga.

export const DIAS = [
  { chave: "seg", rotulo: "SEG", nome: "Segunda-feira" },
  { chave: "ter", rotulo: "TER", nome: "Terça-feira" },
  { chave: "qua", rotulo: "QUA", nome: "Quarta-feira" },
  { chave: "qui", rotulo: "QUI", nome: "Quinta-feira" },
  { chave: "sex", rotulo: "SEX", nome: "Sexta-feira" },
  { chave: "sab", rotulo: "SAB", nome: "Sábado" },
  { chave: "dom", rotulo: "DOM", nome: "Domingo" },
] as const;

export type ChaveDia = (typeof DIAS)[number]["chave"];

// Grupos musculares da tabela de volume, na ordem de exibição.
export const GRUPOS = [
  "Peito",
  "Costas",
  "Ombro",
  "Bíceps",
  "Tríceps",
  "Antebraço",
  "Abdome",
  "Glúteo",
  "Quadríceps",
  "Isquiotibiais",
  "Adutores",
  "Panturrilha",
] as const;

// Itens que não entram no volume muscular (esteira, bicicleta, alongamento...).
export const OUTROS_GRUPOS = ["Cardio", "Outro"] as const;

export type Grupo = (typeof GRUPOS)[number] | (typeof OUTROS_GRUPOS)[number];

// Alternativa do exercício (botão "Opção", resposta P1): o profissional
// decide se o aluno vê; nunca substitui o exercício principal sozinha.
export type AlternativaDoExercicio = { nome: string; observacao: string | null; visivel: boolean };

// Detalhes do editor (≡, resposta C3): ficam com o profissional, o aluno não vê.
export type DetalhesAvancados = {
  cadencia: string | null;
  rpe: number | null;
  rir: number | null;
  aquecimento: string | null;
  tecnica: string | null;
  secundarios: Grupo[];
  notas: string | null;
};

export type Exercicio = {
  nome: string;
  grupo: Grupo;
  series: number | null;
  // Com faixa ("8–12", resposta Q7): repeticoes = menor, repeticoes_max = maior.
  repeticoes: number | null;
  repeticoes_max?: number | null;
  descanso_segundos: number | null;
  carga_kg: number | null;
  // Instruções do treino original (ajustes de banco, cadência, tempo de esteira...).
  observacao: string | null;
  // Prescrição do editor (T4a): item da biblioteca, vídeo, Opção e detalhes.
  exercicio_id?: string | null;
  video_url?: string | null;
  alternativa?: AlternativaDoExercicio | null;
  avancado?: DetalhesAvancados | null;
};

export type DiaDeTreino = {
  dia: ChaveDia;
  titulo: string;
  kcal_estimadas: number | null;
  exercicios: Exercicio[];
  // Orientação do profissional para a sessão (o aluno vê).
  observacao?: string | null;
};

// Repetições que entram no volume prescrito: o maior valor da faixa (Q7, C2).
export function repeticoesDoVolume(exercicio: Pick<Exercicio, "repeticoes" | "repeticoes_max">) {
  return exercicio.repeticoes_max ?? exercicio.repeticoes;
}

// "8–12" ou "10".
export function textoDasRepeticoes(exercicio: Pick<Exercicio, "repeticoes" | "repeticoes_max">) {
  if (exercicio.repeticoes === null) return exercicio.repeticoes_max === null || exercicio.repeticoes_max === undefined ? "-" : String(exercicio.repeticoes_max);
  if (exercicio.repeticoes_max !== null && exercicio.repeticoes_max !== undefined && exercicio.repeticoes_max !== exercicio.repeticoes)
    return `${exercicio.repeticoes}–${exercicio.repeticoes_max}`;
  return String(exercicio.repeticoes);
}

export type PlanoDeTreino = { dias: DiaDeTreino[] };

export type Nivel = "Iniciante" | "Intermediário" | "Avançado" | "Expert";

export type VolumeDoGrupo = {
  grupo: (typeof GRUPOS)[number];
  series: number;
  repeticoes: number;
  cargaKg: number;
};

export function volumePorGrupo(plano: PlanoDeTreino): VolumeDoGrupo[] {
  const volumes = new Map(
    GRUPOS.map((grupo) => [grupo, { grupo, series: 0, repeticoes: 0, cargaKg: 0 }])
  );

  for (const dia of plano.dias) {
    for (const exercicio of dia.exercicios) {
      const volume = volumes.get(exercicio.grupo as (typeof GRUPOS)[number]);

      if (!volume) continue;

      const series = exercicio.series ?? 0;
      const repeticoes = series * (repeticoesDoVolume(exercicio) ?? 0);

      volume.series += series;
      volume.repeticoes += repeticoes;
      volume.cargaKg += repeticoes * (exercicio.carga_kg ?? 0);
    }
  }

  return [...volumes.values()];
}

// Classificação pelo volume semanal: média de séries dos grupos treinados.
//   Iniciante até 8 · Intermediário 9 a 15 · Avançado 16 a 22 · Expert 23+
export function nivelDoTreino(volumes: VolumeDoGrupo[]): { nivel: Nivel | null; mediaSeries: number } {
  const treinados = volumes.filter((volume) => volume.series > 0);

  if (treinados.length === 0) {
    return { nivel: null, mediaSeries: 0 };
  }

  const mediaSeries =
    treinados.reduce((total, volume) => total + volume.series, 0) / treinados.length;

  const nivel: Nivel =
    mediaSeries <= 8
      ? "Iniciante"
      : mediaSeries <= 15
        ? "Intermediário"
        : mediaSeries <= 22
          ? "Avançado"
          : "Expert";

  return { nivel, mediaSeries };
}

export function kcalSemanais(plano: PlanoDeTreino) {
  const valores = plano.dias
    .map((dia) => dia.kcal_estimadas)
    .filter((valor): valor is number => typeof valor === "number");

  return valores.length === 0 ? null : valores.reduce((total, valor) => total + valor, 0);
}

export function formatarNumero(valor: number) {
  return Math.round(valor).toLocaleString("pt-BR");
}

// Confere o plano que volta da edição do paciente antes de gravar.
export function planoValido(valor: unknown): valor is PlanoDeTreino {
  if (!valor || typeof valor !== "object" || !Array.isArray((valor as PlanoDeTreino).dias)) {
    return false;
  }

  const numeroOuNulo = (numero: unknown) =>
    numero === null || (typeof numero === "number" && Number.isFinite(numero) && numero >= 0 && numero <= 10000);

  const chaves = DIAS.map((dia) => dia.chave as string);
  const grupos = [...GRUPOS, ...OUTROS_GRUPOS] as string[];

  return (valor as PlanoDeTreino).dias.length <= 7 &&
    (valor as PlanoDeTreino).dias.every(
      (dia) =>
        chaves.includes(dia.dia) &&
        typeof dia.titulo === "string" &&
        numeroOuNulo(dia.kcal_estimadas) &&
        Array.isArray(dia.exercicios) &&
        dia.exercicios.length <= 40 &&
        dia.exercicios.every(
          (exercicio) =>
            typeof exercicio.nome === "string" &&
            grupos.includes(exercicio.grupo) &&
            numeroOuNulo(exercicio.series) &&
            numeroOuNulo(exercicio.repeticoes) &&
            numeroOuNulo(exercicio.descanso_segundos) &&
            numeroOuNulo(exercicio.carga_kg) &&
            (exercicio.observacao === null || typeof exercicio.observacao === "string")
        )
    );
}

// ---------------------------------------------------------------------------
// Registro do aluno (Módulo de Treino, etapa T1)
//
// A prescrição (o plano publicado) não muda quando o aluno ajusta números:
// o que ele informa vira um registro da sessão daquela semana. Semana de
// domingo a sábado, no horário de Brasília (mesma regra do relatório
// semanal de treino).

export type SituacaoDaSessao = "concluido" | "parcial" | "nao_concluido" | "reagendado";

export const SITUACOES: { valor: SituacaoDaSessao; rotulo: string }[] = [
  { valor: "concluido", rotulo: "Concluído" },
  { valor: "parcial", rotulo: "Parcialmente concluído" },
  { valor: "nao_concluido", rotulo: "Não concluído" },
  { valor: "reagendado", rotulo: "Reagendado" },
];

// Posição de cada dia a partir do domingo que abre a semana.
const DESDE_O_DOMINGO: Record<ChaveDia, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

function somarDiasISO(dataISO: string, dias: number) {
  const data = new Date(`${dataISO}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

export function domingoDaSemana(dataISO: string) {
  const diaDaSemana = new Date(`${dataISO}T12:00:00Z`).getUTCDay();
  return somarDiasISO(dataISO, -diaDaSemana);
}

// Data planejada de cada dia de treino na semana da data informada.
export function datasDaSemana(dataISO: string): Record<ChaveDia, string> {
  const domingo = domingoDaSemana(dataISO);
  return Object.fromEntries(DIAS.map(({ chave }) => [chave, somarDiasISO(domingo, DESDE_O_DOMINGO[chave])])) as Record<ChaveDia, string>;
}

// Nome normalizado do exercício: liga a mesma atividade entre semanas.
export function chaveDoExercicio(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export type ExercicioRegistrado = {
  indice: number;
  series: number | null;
  repeticoes: number | null;
  carga_kg: number | null;
  descanso_segundos: number | null;
};

export type SessaoRegistrada = {
  id: string;
  dia: ChaveDia;
  data_planejada: string;
  situacao: SituacaoDaSessao | null;
  data_efetiva: string | null;
  motivo: string | null;
  observacao: string | null;
  // Calorias informadas pelo aluno (C1).
  kcal?: number | null;
  atualizado_em: string;
  exercicios: ExercicioRegistrado[];
};

// Plano para os números do painel: a prescrição com os valores mais
// recentes que o aluno registrou em cada exercício (a prescrição não muda).
export function planoComRegistros(plano: PlanoDeTreino, ultimos: Record<string, Record<number, ExercicioRegistrado>>): PlanoDeTreino {
  return {
    dias: plano.dias.map((dia) => ({
      ...dia,
      exercicios: dia.exercicios.map((exercicio, indice) => {
        const registro = ultimos[dia.dia]?.[indice];
        if (!registro) return exercicio;
        // Repetições registradas valem como feitas; sem registro, o volume
        // usa o maior valor da faixa prescrita (C2).
        return {
          ...exercicio,
          series: registro.series ?? exercicio.series,
          repeticoes: registro.repeticoes ?? exercicio.repeticoes,
          repeticoes_max: registro.repeticoes === null ? exercicio.repeticoes_max : null,
          carga_kg: registro.carga_kg ?? exercicio.carga_kg,
          descanso_segundos: registro.descanso_segundos ?? exercicio.descanso_segundos,
        };
      }),
    })),
  };
}

// ---------------------------------------------------------------------------
// Relato de desconforto (T2). Percepção do aluno: desconforto leve, ele
// continua; incômodo mais acentuado, ele para o exercício. O sistema só
// registra e avisa o profissional; não diagnostica nem muda o treino.

export const REGIOES_DO_CORPO = [
  "Pescoço",
  "Ombro",
  "Cotovelo",
  "Punho ou mão",
  "Peito",
  "Costas (parte alta)",
  "Lombar",
  "Abdômen",
  "Quadril",
  "Coxa",
  "Joelho",
  "Panturrilha",
  "Tornozelo ou pé",
] as const;

export type CondutaNoDesconforto = "continuei" | "parei";

export const CONDUTAS: { valor: CondutaNoDesconforto; rotulo: string }[] = [
  { valor: "continuei", rotulo: "Desconforto leve: continuei o exercício" },
  { valor: "parei", rotulo: "Incômodo mais acentuado: parei o exercício" },
];

export const ORIENTACAO_DESCONFORTO = [
  "Desconforto leve: você pode continuar, com atenção ao movimento.",
  "Incômodo mais acentuado: pare o exercício.",
  "Dor forte ou repentina, dor no peito, falta de ar, tontura ou desmaio: interrompa o treino e procure atendimento médico.",
];

export type RelatoDeDesconforto = {
  chaveCliente: string;
  // Momento do relato no aparelho (enviado depois quando estava sem
  // internet, T5). Sem ele, vale o momento da chegada.
  registradoEm?: string | null;
  dia: ChaveDia | null;
  exercicio: string | null;
  regiao: string;
  intensidade: number;
  conduta: CondutaNoDesconforto;
  comentario: string | null;
};

const UUID_RELATO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function textoDoRelato(valor: unknown, limite: number, umaLinha = true) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") return undefined;
  const limpo = umaLinha ? valor.trim().replace(/\s+/g, " ") : valor.trim();
  if (limpo.length > limite) return undefined;
  return limpo || null;
}

// Confere o relato (no aparelho e no servidor). Devolve o relato limpo ou a
// mensagem do primeiro problema.
export function validarDesconforto(corpo: unknown): { relato: RelatoDeDesconforto } | { erro: string } {
  const d = (corpo ?? {}) as Record<string, unknown>;
  if (typeof d.chaveCliente !== "string" || !UUID_RELATO.test(d.chaveCliente)) return { erro: "Relato inválido." };
  const dia = d.dia === null || d.dia === undefined ? null : (d.dia as ChaveDia);
  if (dia !== null && !DIAS.some((x) => x.chave === dia)) return { erro: "Dia inválido." };
  const regiao = textoDoRelato(d.regiao, 80);
  if (!regiao) return { erro: "Informe a região do desconforto." };
  const intensidade = d.intensidade;
  if (typeof intensidade !== "number" || !Number.isInteger(intensidade) || intensidade < 0 || intensidade > 10)
    return { erro: "Informe a intensidade, de 0 a 10." };
  if (d.conduta !== "continuei" && d.conduta !== "parei") return { erro: "Informe se continuou ou parou o exercício." };
  const exercicio = textoDoRelato(d.exercicio, 160);
  if (exercicio === undefined) return { erro: "Exercício inválido." };
  const comentario = textoDoRelato(d.comentario, 1000, false);
  if (comentario === undefined) return { erro: "Comentário com mais de 1000 caracteres." };
  const registradoEm = momentoDoAparelho(d.registradoEm);
  if (registradoEm === undefined) return { erro: "Data do relato inválida." };
  return { relato: { chaveCliente: d.chaveCliente, dia, exercicio, regiao, intensidade, conduta: d.conduta, comentario, registradoEm } };
}

// ---------------------------------------------------------------------------
// Uso sem internet (T5)

// Prazo máximo para um registro feito sem internet chegar ao servidor.
export const PRAZO_DO_REGISTRO_OFFLINE_DIAS = 14;

// Momento informado pelo aparelho: ISO válido, não no futuro (tolerância de
// 10 min no relógio do celular) e dentro do prazo. null = não informado;
// undefined = inválido.
export function momentoDoAparelho(valor: unknown, agora = Date.now()): string | null | undefined {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "string") return undefined;
  const t = Date.parse(valor);
  if (!Number.isFinite(t) || t > agora + 10 * 60_000 || t < agora - PRAZO_DO_REGISTRO_OFFLINE_DIAS * 86_400_000) return undefined;
  return new Date(t).toISOString();
}

// Data (AAAA-MM-DD) de um momento no horário de Brasília.
export function dataNoBrasil(momento: string) {
  return new Date(momento).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

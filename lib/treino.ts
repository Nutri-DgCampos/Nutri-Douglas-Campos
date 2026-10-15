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

export type Exercicio = {
  nome: string;
  grupo: Grupo;
  series: number | null;
  repeticoes: number | null;
  descanso_segundos: number | null;
  carga_kg: number | null;
  // Instruções do treino original (ajustes de banco, cadência, tempo de esteira...).
  observacao: string | null;
};

export type DiaDeTreino = {
  dia: ChaveDia;
  titulo: string;
  kcal_estimadas: number | null;
  exercicios: Exercicio[];
};

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
      const repeticoes = series * (exercicio.repeticoes ?? 0);

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

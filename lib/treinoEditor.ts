import {
  DIAS,
  GRUPOS,
  OUTROS_GRUPOS,
  repeticoesDoVolume,
  type DetalhesAvancados,
  type DiaDeTreino,
  type Exercicio,
  type Grupo,
  type ObservacaoDoTreino,
  type PlanoDeTreino,
} from "./treino.ts";

// Editor de musculação do profissional (T4a, VIS-03). Usado no navegador e
// no servidor: o servidor nunca confia no plano que chega do editor.
//
// - Rascunho aceita plano incompleto; o envio ao aluno exige o mínimo
//   (problemasParaEnvio).
// - O aluno não vê os detalhes avançados nem a Opção marcada como oculta
//   (planoParaAluno).
// - Totais são calculados das linhas, nunca digitados.

export const MAX_SESSOES = 7;
export const MAX_EXERCICIOS = 40;

// Equipamentos das academias (C5) e da biblioteca. Exercício sem
// equipamento = peso corporal, sempre disponível.
export const EQUIPAMENTOS = [
  "Barra e anilhas",
  "Halteres",
  "Banco",
  "Banco inclinável",
  "Banco Scott",
  "Barra fixa",
  "Paralelas",
  "Smith",
  "Polia (cross over)",
  "Puxador alto",
  "Remada baixa (polia)",
  "Remada máquina",
  "Supino máquina",
  "Desenvolvimento máquina",
  "Peck deck",
  "Leg press 45°",
  "Hack",
  "Cadeira extensora",
  "Mesa flexora",
  "Cadeira flexora",
  "Cadeira adutora",
  "Cadeira abdutora",
  "Glúteo máquina",
  "Panturrilha em pé (máquina)",
  "Panturrilha sentado (máquina)",
  "Kettlebell",
  "Elásticos",
  "Bola suíça",
  "Esteira",
  "Bicicleta ergométrica",
  "Elíptico",
  "Escada",
  "Remo ergômetro",
] as const;

export const TECNICAS = ["Drop set", "Bi-set", "Tri-set", "Rest-pause", "Pirâmide", "Super-série", "Cluster", "Isometria"] as const;

// Peso padrão da série para o músculo secundário (SPEC, seção 6: série
// primária = 1; secundária = 0,5 por padrão, configurável). Aproximação.
export const PESO_SECUNDARIO_PADRAO = 0.5;

export type ProgramaNoEditor = {
  titulo: string;
  objetivo: string;
  plano: PlanoDeTreino;
};

const GRUPOS_VALIDOS = [...GRUPOS, ...OUTROS_GRUPOS] as string[];
const CHAVES = DIAS.map((d) => d.chave as string);

class PlanoInvalido extends Error {}

function texto(valor: unknown, limite: number, umaLinha = true): string | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") throw new PlanoInvalido("Texto inválido.");
  const limpo = umaLinha ? valor.trim().replace(/\s+/g, " ") : valor.trim();
  if (limpo.length > limite) throw new PlanoInvalido(`Texto com mais de ${limite} caracteres.`);
  return limpo || null;
}

function numero(valor: unknown, maximo: number, decimais = true): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > maximo) throw new PlanoInvalido("Número inválido.");
  return decimais ? Math.round(valor * 100) / 100 : Math.round(valor);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VIDEO_YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\/\S+$/;

function detalhes(valor: unknown): DetalhesAvancados | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "object") throw new PlanoInvalido("Detalhes inválidos.");
  const d = valor as Record<string, unknown>;
  const secundarios = Array.isArray(d.secundarios) ? d.secundarios : [];
  if (secundarios.length > 6 || !secundarios.every((g) => typeof g === "string" && (GRUPOS as readonly string[]).includes(g)))
    throw new PlanoInvalido("Músculos secundários inválidos.");
  const tecnica = texto(d.tecnica, 60);
  const resultado: DetalhesAvancados = {
    cadencia: texto(d.cadencia, 20),
    rpe: numero(d.rpe, 10),
    rir: numero(d.rir, 10),
    aquecimento: texto(d.aquecimento, 300),
    tecnica,
    secundarios: [...new Set(secundarios as Grupo[])],
    notas: texto(d.notas, 1000, false),
  };
  const vazio = Object.entries(resultado).every(([chave, v]) => (chave === "secundarios" ? (v as Grupo[]).length === 0 : v === null));
  return vazio ? null : resultado;
}

function exercicio(valor: unknown): Exercicio {
  const e = (valor ?? {}) as Record<string, unknown>;
  const grupo = typeof e.grupo === "string" && GRUPOS_VALIDOS.includes(e.grupo) ? (e.grupo as Grupo) : "Outro";
  let repeticoes = numero(e.repeticoes, 1000, false);
  let repeticoesMax = numero(e.repeticoes_max, 1000, false);
  if (repeticoes !== null && repeticoesMax !== null && repeticoesMax < repeticoes) [repeticoes, repeticoesMax] = [repeticoesMax, repeticoes];
  if (repeticoesMax === repeticoes) repeticoesMax = null;
  const video = texto(e.video_url, 300);
  if (video && !VIDEO_YOUTUBE.test(video)) throw new PlanoInvalido("O vídeo precisa ser um link do YouTube.");
  const a = e.alternativa as Record<string, unknown> | null | undefined;
  const nomeAlternativa = a ? texto(a.nome, 120) : null;
  return {
    nome: texto(e.nome, 120) ?? "",
    grupo,
    series: numero(e.series, 100, false),
    repeticoes,
    repeticoes_max: repeticoesMax,
    carga_kg: numero(e.carga_kg, 1000),
    descanso_segundos: numero(e.descanso_segundos, 900, false),
    observacao: texto(e.observacao, 500, false),
    exercicio_id: typeof e.exercicio_id === "string" && UUID.test(e.exercicio_id) ? e.exercicio_id : null,
    video_url: video,
    alternativa: nomeAlternativa ? { nome: nomeAlternativa, observacao: texto(a?.observacao, 300, false), visivel: a?.visivel === true } : null,
    avancado: detalhes(e.avancado),
  };
}

export const MAX_OBSERVACOES = 20;

// Observações gerais: sem título e sem texto são descartadas.
function observacoesDoPlano(valor: unknown): ObservacaoDoTreino[] {
  if (valor === undefined || valor === null) return [];
  if (!Array.isArray(valor) || valor.length > MAX_OBSERVACOES) throw new PlanoInvalido(`No máximo ${MAX_OBSERVACOES} observações no treino.`);
  return valor
    .map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      return {
        id: typeof o.id === "string" && o.id.length <= 64 ? o.id : globalThis.crypto.randomUUID(),
        titulo: texto(o.titulo, 120) ?? "",
        texto: texto(o.texto, 2000, false) ?? "",
        modeloId: typeof o.modeloId === "string" && UUID.test(o.modeloId) ? o.modeloId : null,
      };
    })
    .filter((o) => o.titulo || o.texto);
}

// Limpa o plano vindo do editor. Devolve o plano ou a mensagem do problema.
export function validarPlanoDoEditor(valor: unknown): { plano: PlanoDeTreino } | { erro: string } {
  try {
    const p = (valor ?? {}) as Record<string, unknown>;
    if (!Array.isArray(p.dias) || p.dias.length > MAX_SESSOES) throw new PlanoInvalido("Sessões inválidas.");
    const dias: DiaDeTreino[] = p.dias.map((item) => {
      const d = (item ?? {}) as Record<string, unknown>;
      if (typeof d.dia !== "string" || !CHAVES.includes(d.dia)) throw new PlanoInvalido("Dia da sessão inválido.");
      if (!Array.isArray(d.exercicios) || d.exercicios.length > MAX_EXERCICIOS) throw new PlanoInvalido(`No máximo ${MAX_EXERCICIOS} exercícios por sessão.`);
      return {
        dia: d.dia as DiaDeTreino["dia"],
        titulo: texto(d.titulo, 120) ?? "",
        // O sistema não estima calorias (resposta C1).
        kcal_estimadas: null,
        observacao: texto(d.observacao, 1000, false),
        exercicios: d.exercicios.map(exercicio),
      };
    });
    const observacoes = observacoesDoPlano(p.observacoes);
    return { plano: observacoes.length ? { dias, observacoes } : { dias } };
  } catch (erro) {
    if (erro instanceof PlanoInvalido) return { erro: erro.message };
    throw erro;
  }
}

// O que impede o envio ao aluno (lista vazia = pode enviar).
export function problemasParaEnvio(programa: ProgramaNoEditor): string[] {
  const problemas: string[] = [];
  const { dias } = programa.plano;
  if (!programa.titulo.trim()) problemas.push("Informe o título do treino.");
  if (dias.length === 0) problemas.push("Inclua pelo menos uma sessão.");
  const repetidos = CHAVES.filter((c) => dias.filter((d) => d.dia === c).length > 1);
  for (const c of repetidos) problemas.push(`${DIAS.find((d) => d.chave === c)?.nome} tem mais de uma sessão: escolha outro dia.`);
  dias.forEach((d, i) => {
    const nome = d.titulo || `Sessão ${i + 1}`;
    if (!d.titulo.trim()) problemas.push(`Sessão ${i + 1}: informe o nome da sessão.`);
    if (d.exercicios.length === 0) problemas.push(`${nome}: inclua pelo menos um exercício.`);
    d.exercicios.forEach((e, j) => {
      if (!e.nome.trim()) problemas.push(`${nome}, linha ${j + 1}: informe o exercício.`);
      else if (e.series === null) problemas.push(`${nome}, ${e.nome}: informe as séries.`);
    });
  });
  return problemas;
}

// Total de séries da sessão (sempre calculado das linhas).
export function seriesDaSessao(dia: DiaDeTreino) {
  return dia.exercicios.reduce((total, e) => total + (e.series ?? 0), 0);
}

// Volume semanal por grupo: série no músculo principal = 1; no secundário,
// o peso informado (padrão 0,5). Aproximação, rotulada assim na tela.
export function volumeSemanalPorGrupo(plano: PlanoDeTreino, pesoSecundario = PESO_SECUNDARIO_PADRAO) {
  const volume = new Map<string, number>(GRUPOS.map((g) => [g, 0]));
  for (const dia of plano.dias) {
    for (const e of dia.exercicios) {
      const series = e.series ?? 0;
      if (volume.has(e.grupo)) volume.set(e.grupo, volume.get(e.grupo)! + series);
      for (const g of e.avancado?.secundarios ?? []) {
        if (g !== e.grupo && volume.has(g)) volume.set(g, volume.get(g)! + series * pesoSecundario);
      }
    }
  }
  return GRUPOS.map((grupo) => ({ grupo, series: volume.get(grupo)! }));
}

// Tonelagem prescrita (séries × repetições × carga), só quando todas as
// linhas com séries têm repetições e carga: sem dado suficiente, null.
export function tonelagemDaSessao(dia: DiaDeTreino) {
  const comSeries = dia.exercicios.filter((e) => e.series && e.grupo !== "Cardio" && e.grupo !== "Outro");
  if (!comSeries.length || comSeries.some((e) => repeticoesDoVolume(e) === null || e.carga_kg === null)) return null;
  return comSeries.reduce((total, e) => total + (e.series ?? 0) * (repeticoesDoVolume(e) ?? 0) * (e.carga_kg ?? 0), 0);
}

// O que vai para a tela do aluno: sem detalhes avançados, sem a Opção oculta.
export function planoParaAluno(plano: PlanoDeTreino): PlanoDeTreino {
  return {
    ...(plano.observacoes?.length ? { observacoes: plano.observacoes.map(({ id, titulo, texto }) => ({ id, titulo, texto })) } : {}),
    dias: plano.dias.map((dia) => ({
      ...dia,
      exercicios: dia.exercicios.map((e) => {
        const visivel: Exercicio = { ...e, alternativa: e.alternativa?.visivel ? e.alternativa : null };
        delete visivel.avancado;
        delete visivel.exercicio_id;
        return visivel;
      }),
    })),
  };
}

// Equipamentos do exercício que a academia do aluno não tem.
export function equipamentosQueFaltam(exigidos: string[], academia: string[] | null) {
  if (!academia) return [];
  return exigidos.filter((e) => !academia.includes(e));
}

export function planoVazio(): PlanoDeTreino {
  return { dias: [] };
}

export function novaSessao(dia: DiaDeTreino["dia"], titulo = ""): DiaDeTreino {
  return { dia, titulo, kcal_estimadas: null, observacao: null, exercicios: [] };
}

export function novoExercicio(): Exercicio {
  return {
    nome: "",
    grupo: "Outro",
    series: null,
    repeticoes: null,
    repeticoes_max: null,
    carga_kg: null,
    descanso_segundos: null,
    observacao: null,
    exercicio_id: null,
    video_url: null,
    alternativa: null,
    avancado: null,
  };
}

// Primeiro dia da semana ainda sem sessão (segunda em diante).
export function proximoDiaLivre(plano: PlanoDeTreino): DiaDeTreino["dia"] {
  return (DIAS.find((d) => !plano.dias.some((s) => s.dia === d.chave))?.chave ?? "seg") as DiaDeTreino["dia"];
}

export function ordenarSessoes(plano: PlanoDeTreino): PlanoDeTreino {
  // Mantém o resto do plano (observações do treino).
  return { ...plano, dias: [...plano.dias].sort((a, b) => CHAVES.indexOf(a.dia) - CHAVES.indexOf(b.dia)) };
}

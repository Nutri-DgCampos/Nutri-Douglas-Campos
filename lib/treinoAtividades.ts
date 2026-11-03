import type { SituacaoDaSessao } from "./treino.ts";

// Corrida e ciclismo registrados pelo aluno (T4b). Usado no navegador e no
// servidor. Todos os números são informados pelo aluno (do relógio, do
// ciclocomputador ou de cabeça): o sistema não estima nada. Ritmo e
// velocidade são só a conta distância × tempo do que ele informou.

export type Modalidade = "corrida" | "ciclismo";

export const ALERTA_TENIS_PADRAO_KM = 500; // Resposta R1, editável por aluno e por tênis.

export const CATEGORIAS_DE_BICICLETA = [
  { valor: "estrada", rotulo: "Estrada" },
  { valor: "mtb", rotulo: "MTB" },
  { valor: "indoor", rotulo: "Indoor" },
] as const;

export const CATEGORIAS_DE_CONSUMO = [
  { valor: "agua", rotulo: "Água" },
  { valor: "isotonico", rotulo: "Isotônico" },
  { valor: "gel", rotulo: "Gel" },
  { valor: "alimento", rotulo: "Alimento" },
  { valor: "suplemento", rotulo: "Suplemento" },
  { valor: "outro", rotulo: "Outro" },
] as const;

export const UNIDADES = ["mL", "g", "unidade", "cápsula", "sachê"] as const;

export type CategoriaDeConsumo = (typeof CATEGORIAS_DE_CONSUMO)[number]["valor"];

export type Consumo = {
  id?: string;
  horario: string | null; // HH:MM
  minuto: number | null; // tempo de treino
  categoria: CategoriaDeConsumo;
  descricao: string | null;
  quantidade: number | null;
  unidade: (typeof UNIDADES)[number] | null;
  observacao: string | null;
};

export type Atividade = {
  id?: string;
  chave_cliente: string;
  modalidade: Modalidade;
  // Sessão prescrita (T4c): prescrição e semana × 100 + índice da sessão.
  prescricao_id?: string | null;
  sessao_indice?: number | null;
  data: string; // AAAA-MM-DD
  situacao: SituacaoDaSessao | null;
  data_efetiva: string | null;
  motivo: string | null;
  observacao: string | null;
  equipamento_id: string | null;
  distancia_km: number | null;
  duracao_segundos: number | null;
  fc_media: number | null;
  fc_max: number | null;
  rpe: number | null;
  kcal: number | null;
  elevacao_m: number | null;
  potencia_media: number | null;
  potencia_normalizada: number | null;
  cadencia_media: number | null;
  tss: number | null;
  consumos: Consumo[];
};

export type Equipamento = {
  id: string;
  tipo: "tenis" | "bicicleta";
  apelido: string;
  marca: string | null;
  modelo: string | null;
  categoria: "estrada" | "mtb" | "indoor" | null;
  km_inicial: number;
  inicio_uso: string | null;
  alerta_km: number | null;
  aposentado_em: string | null;
  km_registrados: number;
  km_total: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

class Invalido extends Error {}

function texto(valor: unknown, limite: number) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== "string") throw new Invalido("Texto inválido.");
  const t = valor.trim();
  if (t.length > limite) throw new Invalido(`Texto com mais de ${limite} caracteres.`);
  return t || null;
}

function numero(valor: unknown, minimo: number, maximo: number, rotulo: string, inteiro = false) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < minimo || valor > maximo) throw new Invalido(`${rotulo}: valor fora do intervalo (${minimo} a ${maximo}).`);
  return inteiro ? Math.round(valor) : Math.round(valor * 100) / 100;
}

function consumo(valor: unknown): Consumo {
  const c = (valor ?? {}) as Record<string, unknown>;
  const categoria = CATEGORIAS_DE_CONSUMO.find((x) => x.valor === c.categoria)?.valor;
  if (!categoria) throw new Invalido("Escolha o tipo de cada item consumido.");
  const horario = c.horario === null || c.horario === undefined || c.horario === "" ? null : String(c.horario);
  if (horario !== null && !HORA.test(horario)) throw new Invalido("Horário do consumo inválido (use HH:MM).");
  const unidade = c.unidade === null || c.unidade === undefined || c.unidade === "" ? null : (UNIDADES.find((u) => u === c.unidade) ?? null);
  if (c.unidade && !unidade) throw new Invalido("Unidade do consumo inválida.");
  return {
    id: typeof c.id === "string" && UUID.test(c.id) ? c.id : undefined,
    horario,
    minuto: numero(c.minuto, 0, 2880, "Tempo de treino do consumo", true),
    categoria,
    descricao: texto(c.descricao, 120),
    quantidade: numero(c.quantidade, 0, 100000, "Quantidade"),
    unidade,
    observacao: texto(c.observacao, 300),
  };
}

// Confere a atividade (no aparelho e no servidor). Devolve a atividade limpa
// ou a mensagem do primeiro problema.
export function validarAtividade(corpo: unknown): { atividade: Atividade } | { erro: string } {
  try {
    const d = (corpo ?? {}) as Record<string, unknown>;
    if (typeof d.chave_cliente !== "string" || !UUID.test(d.chave_cliente)) throw new Invalido("Registro inválido.");
    if (d.modalidade !== "corrida" && d.modalidade !== "ciclismo") throw new Invalido("Modalidade inválida.");
    if (typeof d.data !== "string" || !DATA.test(d.data)) throw new Invalido("Informe a data.");
    const situacao = d.situacao === null || d.situacao === undefined || d.situacao === "" ? null : (d.situacao as SituacaoDaSessao);
    if (situacao !== null && !["concluido", "parcial", "nao_concluido", "reagendado"].includes(situacao)) throw new Invalido("Situação inválida.");
    const dataEfetiva = situacao === "reagendado" ? String(d.data_efetiva ?? "") : null;
    if (situacao === "reagendado" && !DATA.test(dataEfetiva ?? "")) throw new Invalido("Informe a nova data do treino reagendado.");
    const ciclismo = d.modalidade === "ciclismo";
    const lista = Array.isArray(d.consumos) ? d.consumos : [];
    if (lista.length > 40) throw new Invalido("No máximo 40 itens consumidos por atividade.");
    const fcMedia = numero(d.fc_media, 20, 250, "FC média", true);
    const fcMax = numero(d.fc_max, 20, 250, "FC máxima", true);
    if (fcMedia !== null && fcMax !== null && fcMax < fcMedia) throw new Invalido("A FC máxima não pode ser menor que a média.");
    return {
      atividade: {
        chave_cliente: d.chave_cliente,
        modalidade: d.modalidade,
        prescricao_id: typeof d.prescricao_id === "string" && UUID.test(d.prescricao_id) ? d.prescricao_id : null,
        sessao_indice: typeof d.prescricao_id === "string" && UUID.test(d.prescricao_id) ? numero(d.sessao_indice, 0, 10000, "Sessão", true) : null,
        data: d.data,
        situacao,
        data_efetiva: dataEfetiva,
        motivo: situacao && situacao !== "concluido" ? texto(d.motivo, 500) : null,
        observacao: texto(d.observacao, 2000),
        equipamento_id: typeof d.equipamento_id === "string" && UUID.test(d.equipamento_id) ? d.equipamento_id : null,
        distancia_km: numero(d.distancia_km, 0, 1000, "Distância"),
        duracao_segundos: numero(d.duracao_segundos, 0, 172800, "Duração", true),
        fc_media: fcMedia,
        fc_max: fcMax,
        rpe: numero(d.rpe, 0, 10, "Esforço percebido (RPE)"),
        kcal: numero(d.kcal, 0, 20000, "Calorias", true),
        elevacao_m: numero(d.elevacao_m, 0, 20000, "Ganho de altitude", true),
        // Potência, cadência e TSS: só no pedal, só se medidos (o aluno informa).
        potencia_media: ciclismo ? numero(d.potencia_media, 0, 3000, "Potência média", true) : null,
        potencia_normalizada: ciclismo ? numero(d.potencia_normalizada, 0, 3000, "Potência normalizada", true) : null,
        cadencia_media: ciclismo ? numero(d.cadencia_media, 0, 250, "Cadência", true) : null,
        tss: ciclismo ? numero(d.tss, 0, 2000, "TSS") : null,
        consumos: lista.map(consumo),
      },
    };
  } catch (erro) {
    if (erro instanceof Invalido) return { erro: erro.message };
    throw erro;
  }
}

// Ritmo (min/km) e velocidade (km/h): só a conta com o que o aluno informou.
export function ritmo(distanciaKm: number | null, duracaoSegundos: number | null) {
  if (!distanciaKm || !duracaoSegundos) return null;
  const segundosPorKm = Math.round(duracaoSegundos / distanciaKm);
  return `${Math.floor(segundosPorKm / 60)}:${String(segundosPorKm % 60).padStart(2, "0")} /km`;
}

export function velocidade(distanciaKm: number | null, duracaoSegundos: number | null) {
  if (!distanciaKm || !duracaoSegundos) return null;
  return `${(distanciaKm / (duracaoSegundos / 3600)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km/h`;
}

export function textoDaDuracao(segundos: number | null) {
  if (segundos === null) return "—";
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;
  return h ? `${h}h${String(m).padStart(2, "0")}` : `${m}min${s ? ` ${String(s).padStart(2, "0")}s` : ""}`;
}

// O tênis chegou ao limite de troca definido? (bicicleta não tem aviso)
export function tenisNoLimite(e: Pick<Equipamento, "tipo" | "alerta_km" | "km_total">) {
  return e.tipo === "tenis" && e.alerta_km !== null && e.km_total >= e.alerta_km;
}

export function rotuloDoConsumo(c: Consumo) {
  const categoria = CATEGORIAS_DE_CONSUMO.find((x) => x.valor === c.categoria)?.rotulo ?? c.categoria;
  const quando = c.horario ? `às ${c.horario}` : c.minuto !== null ? `aos ${c.minuto} min` : null;
  const quanto = c.quantidade !== null ? `${c.quantidade.toLocaleString("pt-BR")}${c.unidade ? ` ${c.unidade}` : ""}` : null;
  return [categoria + (c.descricao ? ` (${c.descricao})` : ""), quanto, quando].filter(Boolean).join(" · ");
}

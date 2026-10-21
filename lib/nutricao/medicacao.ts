// Medicações (Fase 6): registro do que o paciente usa, por consulta, com a
// somatória semanal aprovada (M-07, decisões 5.1 a 5.5):
// - princípio ativo por administração = concentração × quantidade, só quando
//   a quantidade está na mesma unidade da concentração (ex.: mg/mL × mL);
// - total semanal = soma de todas as administrações dos dias marcados;
// - sem conversões (UI × mg, mg × mcg × g) e sem somar substâncias diferentes;
// - frequência que não é semanal: não calcula (informe a semana);
// - até 2 casas decimais, sem zeros à direita.
// Não é prescrição: só organiza o que foi informado.

export const DIAS = [
  ["dom", "Domingo"],
  ["seg", "Segunda"],
  ["ter", "Terça"],
  ["qua", "Quarta"],
  ["qui", "Quinta"],
  ["sex", "Sexta"],
  ["sab", "Sábado"],
] as const;

export type Dia = (typeof DIAS)[number][0];

// Unidade da quantidade usada (o que o paciente toma/aplica).
export const UNIDADES_DE_QUANTIDADE = ["mL", "comprimido", "cápsula", "gota", "sachê", "aplicação", "dose", "mg", "mcg", "g", "UI"] as const;
export type UnidadeDeQuantidade = (typeof UNIDADES_DE_QUANTIDADE)[number];

// Unidade do princípio ativo na concentração (mg/mL, UI/mL, mg/comprimido…).
export const UNIDADES_DE_ATIVO = ["mg", "mcg", "g", "UI"] as const;
export type UnidadeDeAtivo = (typeof UNIDADES_DE_ATIVO)[number];

const QUANTIDADE_JA_E_ATIVO: UnidadeDeQuantidade[] = ["mg", "mcg", "g", "UI"];

export type StatusDaMedicacao = "em_uso" | "suspenso" | "nao_confirmado";

export const STATUS: Record<StatusDaMedicacao, string> = {
  em_uso: "Em uso",
  suspenso: "Suspenso",
  nao_confirmado: "Não confirmado",
};

export type DosesDoDia = { quantidade: number | null; vezes: number | null };

export type DadosDaMedicacao = {
  nome: string;
  principioAtivo: string;
  apresentacao: string;
  // Concentração = concentracao <unidadeAtivo> por 1 <unidadeQuantidade>.
  concentracao: number | null;
  unidadeAtivo: UnidadeDeAtivo | null;
  unidadeQuantidade: UnidadeDeQuantidade | null;
  semana: Record<Dia, DosesDoDia>;
  frequenciaTexto: string;
  prescritor: string;
  inicio: string | null;
  termino: string | null;
  observacoes: string;
  receitas: { id: string; maisRecente: boolean }[];
};

// Dados básicos guardados na biblioteca de medicamentos.
export type DadosDoMedicamento = Pick<DadosDaMedicacao, "principioAtivo" | "apresentacao" | "concentracao" | "unidadeAtivo" | "unidadeQuantidade">;

export function semanaVazia(): Record<Dia, DosesDoDia> {
  return Object.fromEntries(DIAS.map(([d]) => [d, { quantidade: null, vezes: null }])) as Record<Dia, DosesDoDia>;
}

export function medicacaoVazia(nome = ""): DadosDaMedicacao {
  return {
    nome,
    principioAtivo: "",
    apresentacao: "",
    concentracao: null,
    unidadeAtivo: null,
    unidadeQuantidade: null,
    semana: semanaVazia(),
    frequenciaTexto: "",
    prescritor: "",
    inicio: null,
    termino: null,
    observacoes: "",
    receitas: [],
  };
}

export function arredondar(valor: number) {
  return Math.round(valor * 100) / 100;
}

export function formatar(valor: number) {
  return arredondar(valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// "7 cápsulas", "1 cápsula", "2 aplicações", "2 mL".
const PLURAIS: Record<string, string> = { comprimido: "comprimidos", "cápsula": "cápsulas", gota: "gotas", "sachê": "sachês", "aplicação": "aplicações", dose: "doses" };

export function comUnidade(valor: number, unidade: string | null) {
  const u = unidade ?? "";
  return `${formatar(valor)} ${arredondar(valor) === 1 ? u : PLURAIS[u] ?? u}`.trim();
}

export type Calculo = {
  // Quantidade física na semana (ex.: 4 mL/semana).
  fisicoSemanal: number | null;
  // Princípio ativo na semana (ex.: 800 mg/semana).
  ativoSemanal: number | null;
  unidadeFisica: string | null;
  unidadeAtivo: string | null;
  // Por que não calculou (para mostrar "Dados insuficientes para cálculo.").
  faltando: string[];
};

const positivo = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) && v > 0;

export function calcularSemana(d: DadosDaMedicacao): Calculo {
  const faltando: string[] = [];
  if (!d.unidadeQuantidade) faltando.push("unidade da quantidade");
  const dias = DIAS.map(([dia]) => d.semana[dia]).filter((x) => positivo(x?.quantidade));
  if (dias.length === 0) faltando.push("quantidade em ao menos um dia da semana");
  if (faltando.length) return { fisicoSemanal: null, ativoSemanal: null, unidadeFisica: d.unidadeQuantidade, unidadeAtivo: null, faltando };

  // Vezes no dia: vazio vale 1 (uma administração com essa quantidade).
  const fisico = dias.reduce((soma, x) => soma + (x.quantidade as number) * (positivo(x.vezes) ? (x.vezes as number) : 1), 0);
  const unidadeFisica = d.unidadeQuantidade as UnidadeDeQuantidade;

  // A quantidade já é o próprio princípio ativo (ex.: 500 mg, 2000 UI).
  if (QUANTIDADE_JA_E_ATIVO.includes(unidadeFisica)) {
    return { fisicoSemanal: arredondar(fisico), ativoSemanal: arredondar(fisico), unidadeFisica, unidadeAtivo: unidadeFisica, faltando: [] };
  }
  if (!positivo(d.concentracao) || !d.unidadeAtivo) {
    return {
      fisicoSemanal: arredondar(fisico),
      ativoSemanal: null,
      unidadeFisica,
      unidadeAtivo: null,
      faltando: ["concentração (para o total de princípio ativo)"],
    };
  }
  return {
    fisicoSemanal: arredondar(fisico),
    ativoSemanal: arredondar(fisico * (d.concentracao as number)),
    unidadeFisica,
    unidadeAtivo: d.unidadeAtivo,
    faltando: [],
  };
}

export function textoDaConcentracao(d: Pick<DadosDaMedicacao, "concentracao" | "unidadeAtivo" | "unidadeQuantidade">) {
  if (!positivo(d.concentracao) || !d.unidadeAtivo || !d.unidadeQuantidade) return "";
  return `${formatar(d.concentracao as number)} ${d.unidadeAtivo}/${d.unidadeQuantidade}`;
}

// Ex.: "Seg 1 mL · Qua 1 mL (2x)"
export function textoDaSemana(d: DadosDaMedicacao) {
  return DIAS.filter(([dia]) => positivo(d.semana[dia]?.quantidade))
    .map(([dia, nome]) => {
      const x = d.semana[dia];
      const vezes = positivo(x.vezes) && (x.vezes as number) > 1 ? ` (${x.vezes}x)` : "";
      return `${nome.slice(0, 3)} ${comUnidade(x.quantidade as number, d.unidadeQuantidade)}${vezes}`;
    })
    .join(" · ");
}

export const AVISO_DA_FERRAMENTA =
  "ESTA FERRAMENTA NÃO REALIZA PRESCRIÇÕES OU RECOMENDAÇÕES DE MEDICAMENTOS. OS CÁLCULOS APRESENTADOS SÃO EXCLUSIVAMENTE AUXILIARES E BASEADOS NAS INFORMAÇÕES REGISTRADAS. O USO E A DOSAGEM DOS MEDICAMENTOS DEVEM SEGUIR A PRESCRIÇÃO DO PROFISSIONAL HABILITADO.";

// Aviso impresso em todo PDF e resumo de medicações (ND-193). A última frase
// estava cortada no documento recebido: completada e enviada ao cliente para
// confirmação.
export const AVISO_DO_DOCUMENTO =
  "Este documento tem finalidade exclusivamente informativa e de acompanhamento nutricional. Os medicamentos, doses e frequências apresentados correspondem às informações registradas sobre a utilização pelo paciente. Este documento não constitui receita médica, recomendação de uso ou orientação para iniciar, suspender ou modificar medicamentos. Qualquer alteração do tratamento medicamentoso deve ser feita somente com o profissional habilitado que o prescreveu.";

// ---------------------------------------------------------------------------
// Validação

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function numero(v: unknown, maximo = 1_000_000) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= maximo ? v : null;
}

function texto(v: unknown, limite: number) {
  return typeof v === "string" ? v.slice(0, limite) : "";
}

export function validarMedicacao(valor: unknown): { valor: DadosDaMedicacao } | { erro: string } {
  const o = valor as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return { erro: "Dados inválidos." };
  const semanaEntrada = (o.semana ?? {}) as Record<string, { quantidade?: unknown; vezes?: unknown } | undefined>;
  const semana = semanaVazia();
  for (const [dia] of DIAS) {
    const x = semanaEntrada[dia];
    if (x && typeof x === "object") {
      const vezes = numero(x.vezes, 24);
      semana[dia] = { quantidade: numero(x.quantidade), vezes: vezes === null ? null : Math.round(vezes) };
    }
  }
  const receitas = Array.isArray(o.receitas)
    ? (o.receitas as { id?: unknown; maisRecente?: unknown }[])
        .filter((r) => typeof r?.id === "string" && UUID.test(r.id as string))
        .slice(0, 30)
        .map((r) => ({ id: r.id as string, maisRecente: r.maisRecente === true }))
    : [];
  return {
    valor: {
      nome: texto(o.nome, 200),
      principioAtivo: texto(o.principioAtivo, 200),
      apresentacao: texto(o.apresentacao, 200),
      concentracao: numero(o.concentracao),
      unidadeAtivo: UNIDADES_DE_ATIVO.includes(o.unidadeAtivo as UnidadeDeAtivo) ? (o.unidadeAtivo as UnidadeDeAtivo) : null,
      unidadeQuantidade: UNIDADES_DE_QUANTIDADE.includes(o.unidadeQuantidade as UnidadeDeQuantidade) ? (o.unidadeQuantidade as UnidadeDeQuantidade) : null,
      semana,
      frequenciaTexto: texto(o.frequenciaTexto, 200),
      prescritor: texto(o.prescritor, 200),
      inicio: typeof o.inicio === "string" && DATA.test(o.inicio) ? o.inicio : null,
      termino: typeof o.termino === "string" && DATA.test(o.termino) ? o.termino : null,
      observacoes: texto(o.observacoes, 5000),
      receitas,
    },
  };
}

export function validarMedicamento(valor: unknown): { valor: DadosDoMedicamento } | { erro: string } {
  const v = validarMedicacao(valor);
  if ("erro" in v) return v;
  const { principioAtivo, apresentacao, concentracao, unidadeAtivo, unidadeQuantidade } = v.valor;
  return { valor: { principioAtivo, apresentacao, concentracao, unidadeAtivo, unidadeQuantidade } };
}

// Texto do "Copiar resumo semanal" (ND-196).
export function resumoEmTexto(dados: {
  paciente: string;
  data: string;
  profissional: string;
  medicacoes: DadosDaMedicacao[];
  anotacoes: string;
}) {
  const linhas = [`Resumo semanal de medicações — ${dados.paciente}`, `Data: ${dados.data}`, dados.profissional, ""];
  if (dados.medicacoes.length === 0) linhas.push("Nenhuma medicação em uso registrada.");
  for (const m of dados.medicacoes) {
    const c = calcularSemana(m);
    linhas.push(`• ${m.nome}${m.principioAtivo ? ` (${m.principioAtivo})` : ""}${textoDaConcentracao(m) ? ` — ${textoDaConcentracao(m)}` : ""}`);
    if (textoDaSemana(m)) linhas.push(`  Semana: ${textoDaSemana(m)}`);
    if (c.fisicoSemanal !== null) linhas.push(`  Total semanal: ${comUnidade(c.fisicoSemanal, c.unidadeFisica)}${c.ativoSemanal !== null && c.unidadeAtivo !== c.unidadeFisica ? ` · ${formatar(c.ativoSemanal)} ${c.unidadeAtivo} de princípio ativo` : ""}`);
    else linhas.push("  Dados insuficientes para cálculo.");
  }
  if (dados.anotacoes.trim()) linhas.push("", "Anotações:", dados.anotacoes.trim());
  linhas.push("", AVISO_DO_DOCUMENTO);
  return linhas.join("\n");
}

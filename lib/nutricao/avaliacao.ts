// Avaliação física: cálculos aprovados pelo responsável técnico.
//
// Fonte de cada método em docs/modulo-nutricao/04-metodos-cientificos.md e
// 05-proposta-metodos-M03-M08.md (M-01 a M-05, aprovados em 20/10/2026).
// Regras gerais:
// - Peso em kg, altura em cm (salvo indicação), idade em anos completos na
//   data da avaliação.
// - Sem um dado obrigatório, o método não calcula: devolve o que falta.
// - Fora da população do estudo, calcula com aviso (decisão 2.7).
// - Arredondamento só na exibição.

export type Sexo = "masculino" | "feminino";

export type Pessoa = {
  sexo: Sexo | null;
  idade: number | null;
  peso: number | null;
  alturaCm: number | null;
};

// Resultado de um cálculo: valor, ou o que falta; avisos sempre listados.
export type Calculo = { valor: number | null; falta: string[]; avisos: string[] };

const calculado = (valor: number, avisos: string[] = []): Calculo => ({ valor, falta: [], avisos });
const faltando = (...falta: string[]): Calculo => ({ valor: null, falta, avisos: [] });

function exigir(p: Pessoa, campos: ("sexo" | "idade" | "peso" | "alturaCm")[]) {
  const nomes = { sexo: "sexo", idade: "idade (data de nascimento)", peso: "peso", alturaCm: "altura" };
  return campos.filter((c) => p[c] === null || p[c] === undefined).map((c) => nomes[c]);
}

// Texto exibido no "?" de cada método: equação, população e fonte.
export type Descricao = { nome: string; equacao: string; populacao: string; fonte: string };

// ===========================================================================
// M-01 — Taxa metabólica basal / gasto energético de repouso (kcal/dia)

export const PROTOCOLOS_TMB = {
  harris_benedict_1984: {
    nome: "Harris-Benedict revisada (Roza & Shizgal, 1984)",
    equacao:
      "Homens: 88,362 + 13,397 × P + 4,799 × A − 5,677 × I. Mulheres: 447,593 + 9,247 × P + 3,098 × A − 4,330 × I (P kg, A cm, I anos).",
    populacao: "337 adultos saudáveis (168 homens, 169 mulheres). Erro de ±213 (H) e ±201 (M) kcal/dia.",
    fonte: "Roza AM, Shizgal HM. Am J Clin Nutr 1984;40(1):168-182.",
  },
  mifflin_1990: {
    nome: "Mifflin-St Jeor (1990)",
    equacao: "Homens: 10 × P + 6,25 × A − 5 × I + 5. Mulheres: 10 × P + 6,25 × A − 5 × I − 161.",
    populacao: "498 adultos saudáveis de 19 a 78 anos (264 com peso normal, 234 obesos).",
    fonte: "Mifflin MD et al. Am J Clin Nutr 1990;51(2):241-247.",
  },
  fao_1985_peso: {
    nome: "FAO/OMS/UNU (1985) — peso",
    equacao:
      "Por faixa de idade (início incluído). Homens 18–30: 15,3P + 679; 30–60: 11,6P + 879; ≥60: 13,5P + 487. Mulheres 18–30: 14,7P + 496; 30–60: 8,7P + 829; ≥60: 10,5P + 596. Também 0–3, 3–10 e 10–18 anos.",
    populacao: "Compilação de Schofield (1985), cerca de 7.000 medições; tende a superestimar em várias populações.",
    fonte: "FAO/WHO/UNU. Energy and protein requirements. WHO TRS 724, 1985 — Tabela 5.",
  },
  fao_1985_peso_altura: {
    nome: "FAO/OMS/UNU (1985) — peso e altura",
    equacao:
      "Altura em metros. Homens 10–18: 16,6P + 77A + 572; 18–30: 15,4P − 27A + 717; 30–60: 11,3P + 16A + 901; ≥60: 8,8P + 1128A − 1071. Mulheres 10–18: 7,4P + 482A + 217; 18–30: 13,3P + 334A + 35; 30–60: 8,7P − 25A + 865; ≥60: 9,2P + 637A − 302.",
    populacao: "Mesma base de Schofield (1985); a partir de 10 anos.",
    fonte: "FAO/WHO/UNU. WHO TRS 724, 1985 — Anexo 1.",
  },
  cunningham_1980: {
    nome: "Cunningham (1980)",
    equacao: "500 + 22 × MLG (massa livre de gordura em kg, da mesma avaliação).",
    populacao: "Reanálise de 223 indivíduos dos dados de Harris e Benedict.",
    fonte: "Cunningham JJ. Am J Clin Nutr 1980;33(11):2372-2374.",
  },
} as const satisfies Record<string, Descricao>;

export type ProtocoloTmb = keyof typeof PROTOCOLOS_TMB;

// Faixa da FAO: fechada no início, aberta no fim (decisão M-01).
function faixaFao<T>(idade: number, faixas: [number, number, T][]) {
  return faixas.find(([de, ate]) => idade >= de && idade < ate)?.[2] ?? null;
}

export function calcularTmb(protocolo: ProtocoloTmb, p: Pessoa, mlg: number | null): Calculo {
  if (protocolo === "cunningham_1980") {
    if (!(mlg && mlg > 0)) return faltando("massa livre de gordura (dobras ou bioimpedância desta avaliação)");
    return calculado(500 + 22 * mlg);
  }

  if (protocolo === "harris_benedict_1984" || protocolo === "mifflin_1990") {
    const falta = exigir(p, ["sexo", "idade", "peso", "alturaCm"]);
    if (falta.length) return faltando(...falta);
    const { peso, alturaCm: a, idade } = p as Required<{ [k in keyof Pessoa]: NonNullable<Pessoa[k]> }>;
    const avisos: string[] = [];
    if (protocolo === "mifflin_1990" && (idade < 19 || idade > 78)) {
      avisos.push("Idade fora da população do estudo (19 a 78 anos).");
    }
    if (protocolo === "harris_benedict_1984" && idade < 18) avisos.push("Equação desenvolvida com adultos.");
    if (protocolo === "harris_benedict_1984") {
      return calculado(
        p.sexo === "masculino"
          ? 88.362 + 13.397 * peso + 4.799 * a - 5.677 * idade
          : 447.593 + 9.247 * peso + 3.098 * a - 4.33 * idade,
        avisos
      );
    }
    return calculado(10 * peso + 6.25 * a - 5 * idade + (p.sexo === "masculino" ? 5 : -161), avisos);
  }

  if (protocolo === "fao_1985_peso") {
    const falta = exigir(p, ["sexo", "idade", "peso"]);
    if (falta.length) return faltando(...falta);
    const w = p.peso as number;
    const coef =
      p.sexo === "masculino"
        ? faixaFao<[number, number]>(p.idade as number, [
            [0, 3, [60.9, -54]],
            [3, 10, [22.7, 495]],
            [10, 18, [17.5, 651]],
            [18, 30, [15.3, 679]],
            [30, 60, [11.6, 879]],
            [60, 200, [13.5, 487]],
          ])
        : faixaFao<[number, number]>(p.idade as number, [
            [0, 3, [61.0, -51]],
            [3, 10, [22.5, 499]],
            [10, 18, [12.2, 746]],
            [18, 30, [14.7, 496]],
            [30, 60, [8.7, 829]],
            [60, 200, [10.5, 596]],
          ]);
    if (!coef) return faltando("idade válida");
    return calculado(coef[0] * w + coef[1]);
  }

  // FAO 1985 com peso e altura (altura em metros), a partir de 10 anos.
  const falta = exigir(p, ["sexo", "idade", "peso", "alturaCm"]);
  if (falta.length) return faltando(...falta);
  const w = p.peso as number;
  const h = (p.alturaCm as number) / 100;
  const coef =
    p.sexo === "masculino"
      ? faixaFao<[number, number, number]>(p.idade as number, [
          [10, 18, [16.6, 77, 572]],
          [18, 30, [15.4, -27, 717]],
          [30, 60, [11.3, 16, 901]],
          [60, 200, [8.8, 1128, -1071]],
        ])
      : faixaFao<[number, number, number]>(p.idade as number, [
          [10, 18, [7.4, 482, 217]],
          [18, 30, [13.3, 334, 35]],
          [30, 60, [8.7, -25, 865]],
          [60, 200, [9.2, 637, -302]],
        ]);
  if (!coef) return faltando("idade a partir de 10 anos");
  return calculado(coef[0] * w + coef[1] * h + coef[2]);
}

// ===========================================================================
// M-02 — Gasto energético total (kcal/dia)

export const CATEGORIAS_DRI = {
  inativo: { nome: "Inativo", naf: "NAF de 1,00 a menos de 1,53" },
  pouco_ativo: { nome: "Pouco ativo", naf: "NAF de 1,53 a menos de 1,68" },
  ativo: { nome: "Ativo", naf: "NAF de 1,68 a menos de 1,85" },
  muito_ativo: { nome: "Muito ativo", naf: "NAF de 1,85 a menos de 2,50" },
} as const;

export type CategoriaDri = keyof typeof CATEGORIAS_DRI;

// Coeficientes [constante, idade, altura, peso] — Tabela S-1, adultos ≥ 19 anos.
const DRI_2023: Record<Sexo, Record<CategoriaDri, [number, number, number, number]>> = {
  masculino: {
    inativo: [753.07, -10.83, 6.5, 14.1],
    pouco_ativo: [581.47, -10.83, 8.3, 14.94],
    ativo: [1004.82, -10.83, 6.52, 15.91],
    muito_ativo: [-517.88, -10.83, 15.61, 19.11],
  },
  feminino: {
    inativo: [584.9, -7.01, 5.72, 11.71],
    pouco_ativo: [575.77, -7.01, 6.6, 12.14],
    ativo: [710.25, -7.01, 6.54, 12.34],
    muito_ativo: [511.83, -7.01, 9.07, 12.56],
  },
};

export const METODOS_GET = {
  dri_2023: {
    nome: "DRIs 2023 — gasto energético total pela categoria de atividade",
    equacao:
      "Equação própria por sexo e categoria (inativo, pouco ativo, ativo, muito ativo) com idade, altura (cm) e peso (kg). Ex.: homem inativo = 753,07 − 10,83 × I + 6,50 × A + 14,10 × P.",
    populacao: "Adultos a partir de 19 anos, peso estável; banco internacional de água duplamente marcada. Erro médio de 339 (H) e 246 (M) kcal/dia.",
    fonte: "National Academies. Dietary Reference Intakes for Energy, 2023 — Tabela S-1 e Tabela 5-4.",
  },
  tmb_naf: {
    nome: "TMB × NAF (FAO/OMS/UNU 2004)",
    equacao: "GET = TMB da avaliação × NAF. Faixas: sedentário ou leve 1,40–1,69; ativo ou moderado 1,70–1,99; vigoroso 2,00–2,40.",
    populacao: "Adultos. O NAF descreve o estilo de vida habitual.",
    fonte: "FAO/WHO/UNU. Human energy requirements, 2004 — Tabela 5.3.",
  },
} as const satisfies Record<string, Descricao>;

export type MetodoGet = keyof typeof METODOS_GET;

export const FAIXAS_NAF_FAO = [
  { de: 1.4, ate: 1.69, nome: "Sedentário ou atividade leve" },
  { de: 1.7, ate: 1.99, nome: "Ativo ou moderadamente ativo" },
  { de: 2.0, ate: 2.4, nome: "Vigoroso ou vigorosamente ativo" },
] as const;

export function faixaDoNaf(naf: number) {
  return FAIXAS_NAF_FAO.find((f) => naf >= f.de - 1e-9 && naf <= f.ate + 1e-9) ?? null;
}

export function calcularGetDri(categoria: CategoriaDri, p: Pessoa): Calculo {
  const falta = exigir(p, ["sexo", "idade", "peso", "alturaCm"]);
  if (falta.length) return faltando(...falta);
  if ((p.idade as number) < 19) return faltando("idade a partir de 19 anos (equações de adultos)");
  const [k, i, a, w] = DRI_2023[p.sexo as Sexo][categoria];
  return calculado(k + i * (p.idade as number) + a * (p.alturaCm as number) + w * (p.peso as number));
}

export function calcularGetNaf(tmb: number | null, naf: number | null): Calculo {
  if (tmb === null) return faltando("TMB");
  if (naf === null) return faltando("NAF");
  if (!faixaDoNaf(naf)) return faltando("NAF entre 1,40 e 2,40");
  return calculado(tmb * naf);
}

// ===========================================================================
// M-03 — Gasto por METs (Compendium of Physical Activities, 2024)

type ValorMet = { codigo: string; met: number; descricao: string };

export type Atividade = {
  id: string;
  modalidade: string;
  nome: string;
  adulto: ValorMet;
  // Older Adult Compendium (60+), quando há atividade equivalente.
  idoso?: ValorMet;
};

const a = (id: string, modalidade: string, nome: string, adulto: ValorMet, idoso?: ValorMet): Atividade => ({
  id,
  modalidade,
  nome,
  adulto,
  idoso,
});

// Lista do roteiro (1.1) e opções por velocidade (1.2), aprovadas em 20/10/2026.
export const ATIVIDADES: Atividade[] = [
  a("musculacao_leve", "Musculação", "Treinamento leve", { codigo: "02054", met: 3.5, descricao: "Vários exercícios, 8–15 repetições, cargas variadas" }, { codigo: "0205460", met: 4.3, descricao: "Vários exercícios, 8–15 repetições, cargas variadas" }),
  a("musculacao_moderada", "Musculação", "Treinamento moderado", { codigo: "02052", met: 5.0, descricao: "Agachamento, levantamento terra, ritmo lento ou explosivo" }),
  a("musculacao_vigorosa", "Musculação", "Treinamento vigoroso", { codigo: "02050", met: 6.0, descricao: "Pesos livres ou máquinas, power lifting ou fisiculturismo, esforço vigoroso" }),
  a("caminhada_leve", "Caminhada", "Caminhada leve (4,0 km/h)", { codigo: "17170", met: 3.0, descricao: "4,0 km/h, terreno plano" }, { codigo: "1717060", met: 4.5, descricao: "3,5–4,3 km/h, terreno plano" }),
  a("caminhada_moderada", "Caminhada", "Caminhada moderada (4,5–5,5 km/h)", { codigo: "17190", met: 3.8, descricao: "4,5–5,5 km/h, terreno plano" }, { codigo: "1719060", met: 5.3, descricao: "4,5–5,1 km/h, terreno plano" }),
  a("caminhada_rapida", "Caminhada", "Caminhada rápida (5,6–6,3 km/h)", { codigo: "17200", met: 4.8, descricao: "5,6–6,3 km/h, terreno plano, como exercício" }, { codigo: "1720060", met: 6.0, descricao: "5,3–6,0 km/h, terreno plano, como exercício" }),
  a("caminhada_subida", "Caminhada", "Caminhada em subida (1–5%)", { codigo: "17034", met: 5.3, descricao: "Subida de 1–5%, ritmo moderado a rápido" }),
  a("caminhada_subida_6_10", "Caminhada", "Caminhada em subida (6–10%)", { codigo: "17035", met: 7.0, descricao: "Subida de 6–10%, ritmo moderado a rápido" }),
  a("caminhada_3", "Caminhada", "Caminhada muito lenta (abaixo de 3,2 km/h)", { codigo: "17151", met: 2.3, descricao: "Abaixo de 3,2 km/h, passeio muito lento" }),
  a("caminhada_3_9", "Caminhada", "Caminhada lenta (3,2–3,9 km/h)", { codigo: "17152", met: 2.8, descricao: "3,2–3,9 km/h, terreno plano" }),
  a("caminhada_6_4", "Caminhada", "Caminhada muito rápida (6,4–7,1 km/h)", { codigo: "17220", met: 5.5, descricao: "6,4–7,1 km/h, terreno plano" }, { codigo: "1722060", met: 7.3, descricao: "6,4–6,8 km/h, terreno plano" }),
  a("caminhada_7_2", "Caminhada", "Caminhada muito rápida (7,2–7,9 km/h)", { codigo: "17230", met: 7.0, descricao: "7,2–7,9 km/h, terreno plano" }, { codigo: "1723060", met: 9.0, descricao: "7,2 km/h, terreno plano" }),
  a("caminhada_8", "Caminhada", "Caminhada muito rápida (8,0–8,9 km/h)", { codigo: "17231", met: 8.5, descricao: "8,0–8,9 km/h, terreno plano" }),
  a("corrida_leve", "Corrida", "Corrida leve (8,0–8,4 km/h)", { codigo: "12030", met: 8.5, descricao: "8,0–8,4 km/h" }),
  a("corrida_moderada", "Corrida", "Corrida moderada (9,7–10,1 km/h)", { codigo: "12050", met: 9.3, descricao: "9,7–10,1 km/h" }),
  a("corrida_vigorosa", "Corrida", "Corrida vigorosa (12,9 km/h)", { codigo: "12090", met: 12.0, descricao: "12,9 km/h" }),
  a("corrida_6_4", "Corrida", "Corrida 6,4–6,8 km/h", { codigo: "12028", met: 6.5, descricao: "6,4–6,8 km/h" }),
  a("corrida_6_9", "Corrida", "Corrida 6,9–7,7 km/h", { codigo: "12029", met: 7.8, descricao: "6,9–7,7 km/h" }),
  a("corrida_8_9", "Corrida", "Corrida 8,9–9,3 km/h", { codigo: "12045", met: 9.0, descricao: "8,9–9,3 km/h" }),
  a("corrida_10_8", "Corrida", "Corrida 10,8 km/h", { codigo: "12060", met: 10.5, descricao: "10,8 km/h" }),
  a("corrida_11_3", "Corrida", "Corrida 11,3 km/h", { codigo: "12070", met: 11.0, descricao: "11,3 km/h" }, { codigo: "1207060", met: 15.8, descricao: "11,3 km/h" }),
  a("corrida_12_1", "Corrida", "Corrida 12,1 km/h", { codigo: "12080", met: 11.8, descricao: "12,1 km/h" }),
  a("corrida_13_8", "Corrida", "Corrida 13,8 km/h", { codigo: "12100", met: 12.5, descricao: "13,8 km/h" }),
  a("corrida_14_5", "Corrida", "Corrida 14,5 km/h", { codigo: "12110", met: 13.0, descricao: "14,5 km/h" }),
  a("corrida_16_1", "Corrida", "Corrida 16,1 km/h", { codigo: "12120", met: 14.8, descricao: "16,1 km/h" }),
  a("corrida_17_7", "Corrida", "Corrida 17,7 km/h", { codigo: "12130", met: 16.8, descricao: "17,7 km/h" }),
  a("corrida_19_3", "Corrida", "Corrida 19,3 km/h", { codigo: "12132", met: 18.5, descricao: "19,3 km/h" }),
  a("mtb_recreativa", "Mountain bike", "Pedalada recreativa", { codigo: "01013", met: 5.8, descricao: "Estrada de terra, ritmo moderado" }),
  a("mtb_moderado", "Mountain bike", "Treinamento moderado", { codigo: "01009", met: 8.5, descricao: "Mountain bike, geral" }),
  a("mtb_vigoroso", "Mountain bike", "Treinamento vigoroso", { codigo: "01003", met: 14.0, descricao: "Mountain bike, subida, vigoroso" }),
  a("mtb_competicao", "Mountain bike", "Competição", { codigo: "01004", met: 16.0, descricao: "Mountain bike, competição" }),
  a("ciclismo_leve", "Ciclismo de estrada ou pista", "Pedalada leve (16–19 km/h)", { codigo: "01020", met: 6.8, descricao: "16–19 km/h, esforço leve" }),
  a("ciclismo_moderado", "Ciclismo de estrada ou pista", "Pedalada moderada (19–22 km/h)", { codigo: "01030", met: 8.0, descricao: "19–22 km/h, esforço moderado" }),
  a("ciclismo_vigoroso", "Ciclismo de estrada ou pista", "Treinamento vigoroso (22,5–25,6 km/h)", { codigo: "01040", met: 10.0, descricao: "22,5–25,6 km/h, esforço vigoroso" }),
  a("ciclismo_competicao", "Ciclismo de estrada ou pista", "Competição (25,7–30,6 km/h)", { codigo: "01050", met: 12.0, descricao: "25,7–30,6 km/h, competição em geral" }),
];

export const DESCRICAO_METS: Descricao = {
  nome: "Gasto por METs (Compendium of Physical Activities, 2024)",
  equacao:
    "kcal por sessão = MET × 3,5 × peso (kg) ÷ 200 × minutos. 60 anos ou mais: MET60 do Older Adult Compendium × 2,7 × peso ÷ 200 × minutos. Gasto líquido = (MET − 1) no lugar do MET.",
  populacao: "Adultos de 19 a 59 anos (2024 Adult Compendium); 60+ no Older Adult Compendium, quando há atividade equivalente.",
  fonte: "Herrmann SD et al. J Sport Health Sci 2024 (Adult e Older Adult Compendium). pacompendium.com",
};

export type AtividadeRegistrada = { id: string; atividadeId: string; minutos: number | null; vezesPorSemana: number | null };

export type GastoDaAtividade = {
  atividade: Atividade;
  valor: ValorMet;
  repouso: number; // 3,5 (adultos) ou 2,7 (60+)
  porSessao: number;
  porSessaoLiquido: number;
  semanal: number;
  semanalLiquido: number;
  aviso: string | null;
};

export function gastoDaAtividade(registro: AtividadeRegistrada, pesoKg: number | null, idade: number | null): GastoDaAtividade | null {
  const atividade = ATIVIDADES.find((x) => x.id === registro.atividadeId);
  if (!atividade || !pesoKg || !registro.minutos || !registro.vezesPorSemana) return null;

  const idoso = idade !== null && idade >= 60;
  // Decisão 1.3 (opção A): 60+ usa o Older Adult Compendium. Sem atividade
  // equivalente nele, usa o valor de adultos e avisa (a confirmar com o cliente).
  const usaIdoso = idoso && Boolean(atividade.idoso);
  const valor = usaIdoso ? (atividade.idoso as ValorMet) : atividade.adulto;
  const repouso = usaIdoso ? 2.7 : 3.5;
  const porSessao = ((valor.met * repouso * pesoKg) / 200) * registro.minutos;
  const porSessaoLiquido = (((valor.met - 1) * repouso * pesoKg) / 200) * registro.minutos;

  return {
    atividade,
    valor,
    repouso,
    porSessao,
    porSessaoLiquido,
    semanal: porSessao * registro.vezesPorSemana,
    semanalLiquido: porSessaoLiquido * registro.vezesPorSemana,
    aviso: idoso && !usaIdoso ? "Sem valor específico para 60+ no Compendium: usado o valor de adultos." : null,
  };
}

// ===========================================================================
// M-04 — Dobras cutâneas (mm)

export const DOBRAS = {
  subescapular: "Subescapular",
  triceps: "Tricipital",
  bicipital: "Bicipital",
  peitoral: "Peitoral",
  axilar_media: "Axilar média",
  supra_iliaca: "Supra-ilíaca",
  abdominal: "Abdominal",
  coxa: "Coxa",
  panturrilha_medial: "Panturrilha medial",
} as const;

export type Dobra = keyof typeof DOBRAS;

export type ProtocoloDobras = "jp7" | "jp3" | "faulkner" | "slaughter" | "petroski";
export type VersaoSlaughter = "ts" | "tc"; // tríceps+subescapular ou tríceps+panturrilha
export type Maturacao = "pre" | "pubere" | "pos";
export type Etnia = "branca" | "negra";

export type DadosDobras = {
  protocolo: ProtocoloDobras | null;
  versaoSlaughter: VersaoSlaughter;
  maturacao: Maturacao | null;
  etnia: Etnia | null;
  valores: Partial<Record<Dobra, number | null>>;
};

type InfoProtocolo = Descricao & { idade: [number, number] | null };

// Descrição por protocolo e sexo (o protocolo do outro sexo não aparece).
export const PROTOCOLOS_DOBRAS: Record<ProtocoloDobras, { nome: string; porSexo: Record<Sexo, InfoProtocolo> }> = {
  jp7: {
    nome: "Jackson e Pollock — 7 dobras",
    porSexo: {
      masculino: {
        nome: "Jackson e Pollock 7 dobras — homens",
        equacao: "D = 1,112 − 0,00043499 × S + 0,00000055 × S² − 0,00028826 × I. %G por Siri.",
        populacao: "Homens de 18 a 61 anos.",
        fonte: "Jackson AS, Pollock ML. Br J Nutr 1978;40:497-504.",
        idade: [18, 61],
      },
      feminino: {
        nome: "Jackson e Pollock 7 dobras — mulheres",
        equacao: "D = 1,097 − 0,00046971 × S + 0,00000056 × S² − 0,00012828 × I. %G por Siri.",
        populacao: "Mulheres de 18 a 55 anos.",
        fonte: "Jackson AS, Pollock ML, Ward A. Med Sci Sports Exerc 1980;12:175-182.",
        idade: [18, 55],
      },
    },
  },
  jp3: {
    nome: "Jackson e Pollock — 3 dobras",
    porSexo: {
      masculino: {
        nome: "Jackson e Pollock 3 dobras — homens (peitoral, abdominal, coxa)",
        equacao: "D = 1,10938 − 0,0008267 × S + 0,0000016 × S² − 0,0002574 × I. %G por Siri.",
        populacao: "Homens de 18 a 61 anos.",
        fonte: "Jackson AS, Pollock ML. Br J Nutr 1978;40:497-504.",
        idade: [18, 61],
      },
      feminino: {
        nome: "Jackson e Pollock 3 dobras — mulheres (tríceps, supra-ilíaca, coxa)",
        equacao: "D = 1,0994921 − 0,0009929 × S + 0,0000023 × S² − 0,0001392 × I. %G por Siri.",
        populacao: "Mulheres de 18 a 55 anos.",
        fonte: "Jackson AS, Pollock ML, Ward A. Med Sci Sports Exerc 1980;12:175-182.",
        idade: [18, 55],
      },
    },
  },
  faulkner: {
    nome: "Faulkner",
    porSexo: {
      masculino: faulkner(),
      feminino: faulkner(),
    },
  },
  slaughter: {
    nome: "Slaughter (crianças e adolescentes)",
    porSexo: {
      masculino: {
        nome: "Slaughter — meninos",
        equacao:
          "Tríceps + subescapular (S) ≤ 35 mm: 1,21 × S − 0,008 × S² + C (C pela maturação e etnia). S > 35 mm: 0,783 × S + 1,6. Tríceps + panturrilha (T): 0,735 × T + 1,0.",
        populacao: "8 a 18 anos. Subestima o %G em crianças magras e superestima nas com mais gordura (DXA).",
        fonte: "Slaughter MH, Lohman TG et al. Human Biology 1988;60(5):709-723.",
        idade: [8, 18],
      },
      feminino: {
        nome: "Slaughter — meninas",
        equacao: "Tríceps + subescapular (S) ≤ 35 mm: 1,33 × S − 0,013 × S² − 2,5. S > 35 mm: 0,546 × S + 9,7. Tríceps + panturrilha (T): 0,610 × T + 5,1.",
        populacao: "8 a 18 anos. Subestima o %G em crianças magras e superestima nas com mais gordura (DXA).",
        fonte: "Slaughter MH, Lohman TG et al. Human Biology 1988;60(5):709-723.",
        idade: [8, 18],
      },
    },
  },
  petroski: {
    nome: "Petroski (adultos brasileiros)",
    porSexo: {
      masculino: {
        nome: "Petroski — homens",
        equacao: "D = 1,10726863 − 0,00081201 × S + 0,00000212 × S² − 0,00041761 × I (S: subescapular, tríceps, supra-ilíaca, panturrilha). %G por Siri.",
        populacao: "304 homens do sul do Brasil, 18 a 61 anos.",
        fonte: "Petroski EL. Tese, UFSM, 1995.",
        idade: [18, 61],
      },
      feminino: {
        nome: "Petroski — mulheres (versão com peso e estatura)",
        equacao:
          "D = 1,02902361 − 0,00067159 × S + 0,00000242 × S² − 0,00026073 × I − 0,00056009 × P + 0,00054649 × A (S: subescapular, tríceps, supra-ilíaca, panturrilha; P kg; A cm). %G por Siri.",
        populacao: "Amostra feminina da tese: 281 mulheres do sul do Brasil, 18 a 51 anos.",
        fonte: "Petroski EL. Tese, UFSM, 1995. Coeficientes conferidos em Rev Bras Cineantropom Desempenho Hum.",
        idade: [18, 51],
      },
    },
  },
};

function faulkner(): InfoProtocolo {
  return {
    nome: "Faulkner",
    equacao: "%G = (tríceps + subescapular + supra-ilíaca + abdominal) × 0,153 + 5,783.",
    populacao: "População original pouco documentada; precisão não estabelecida (tende a superestimar).",
    fonte: "Faulkner (1968), adaptação da equação de Yuhasz; usada em materiais brasileiros.",
    idade: null,
  };
}

export const DESCRICAO_SIRI: Descricao = {
  nome: "Conversão da densidade em % de gordura — Siri (1961)",
  equacao: "%G = (4,95 ÷ D − 4,50) × 100.",
  populacao: "Conversão usada nos estudos de Jackson-Pollock e Petroski.",
  fonte: "Siri WE, 1961. Techniques for measuring body composition.",
};

// Dobras exigidas por protocolo, sexo e versão.
export function dobrasDoProtocolo(protocolo: ProtocoloDobras, sexo: Sexo, versao: VersaoSlaughter = "ts"): Dobra[] {
  switch (protocolo) {
    case "jp7":
      return ["peitoral", "axilar_media", "triceps", "subescapular", "abdominal", "supra_iliaca", "coxa"];
    case "jp3":
      return sexo === "masculino" ? ["peitoral", "abdominal", "coxa"] : ["triceps", "supra_iliaca", "coxa"];
    case "faulkner":
      return ["triceps", "subescapular", "supra_iliaca", "abdominal"];
    case "slaughter":
      return versao === "ts" ? ["triceps", "subescapular"] : ["triceps", "panturrilha_medial"];
    case "petroski":
      return ["subescapular", "triceps", "supra_iliaca", "panturrilha_medial"];
  }
}

export type ResultadoDobras = {
  soma: number | null;
  densidade: number | null;
  percentual: number | null;
  falta: string[];
  avisos: string[];
};

export function siri(densidade: number) {
  return (4.95 / densidade - 4.5) * 100;
}

const CONSTANTE_MENINOS: Record<Etnia, Record<Maturacao, number>> = {
  branca: { pre: -1.7, pubere: -3.4, pos: -5.5 },
  negra: { pre: -3.2, pubere: -5.2, pos: -6.8 },
};

export function calcularDobras(dados: DadosDobras, p: Pessoa): ResultadoDobras {
  const vazio = (falta: string[]): ResultadoDobras => ({ soma: null, densidade: null, percentual: null, falta, avisos: [] });
  if (!dados.protocolo) return vazio(["protocolo"]);
  if (!p.sexo) return vazio(["sexo"]);

  const sitios = dobrasDoProtocolo(dados.protocolo, p.sexo, dados.versaoSlaughter);
  const faltaDobra = sitios.filter((s) => !(dados.valores[s] && (dados.valores[s] as number) > 0)).map((s) => DOBRAS[s].toLowerCase());
  if (faltaDobra.length) return vazio(faltaDobra);

  const soma = sitios.reduce((total, s) => total + (dados.valores[s] as number), 0);
  const info = PROTOCOLOS_DOBRAS[dados.protocolo].porSexo[p.sexo];
  const avisos: string[] = [];
  if (info.idade && p.idade !== null && (p.idade < info.idade[0] || p.idade > info.idade[1])) {
    avisos.push(`Paciente fora da população em que a equação foi desenvolvida (${info.idade[0]} a ${info.idade[1]} anos).`);
  }
  if (dados.protocolo === "faulkner") avisos.push("Precisão não estabelecida.");

  const resultado = (densidade: number | null, percentual: number): ResultadoDobras => ({
    soma,
    densidade,
    percentual,
    falta: [],
    avisos,
  });

  const s2 = soma * soma;
  const i = p.idade;

  switch (dados.protocolo) {
    case "jp7":
    case "jp3": {
      if (i === null) return { ...vazio(["idade (data de nascimento)"]), soma };
      const d =
        dados.protocolo === "jp7"
          ? p.sexo === "masculino"
            ? 1.112 - 0.00043499 * soma + 0.00000055 * s2 - 0.00028826 * i
            : 1.097 - 0.00046971 * soma + 0.00000056 * s2 - 0.00012828 * i
          : p.sexo === "masculino"
            ? 1.10938 - 0.0008267 * soma + 0.0000016 * s2 - 0.0002574 * i
            : 1.0994921 - 0.0009929 * soma + 0.0000023 * s2 - 0.0001392 * i;
      return resultado(d, siri(d));
    }
    case "faulkner":
      return resultado(null, soma * 0.153 + 5.783);
    case "slaughter": {
      if (dados.versaoSlaughter === "tc") {
        return resultado(null, p.sexo === "masculino" ? 0.735 * soma + 1.0 : 0.61 * soma + 5.1);
      }
      if (soma > 35) return resultado(null, p.sexo === "masculino" ? 0.783 * soma + 1.6 : 0.546 * soma + 9.7);
      if (p.sexo === "feminino") return resultado(null, 1.33 * soma - 0.013 * s2 - 2.5);
      const falta: string[] = [];
      if (!dados.maturacao) falta.push("maturação sexual (Tanner)");
      if (!dados.etnia) falta.push("etnia");
      if (falta.length) return { ...vazio(falta), soma };
      return resultado(null, 1.21 * soma - 0.008 * s2 + CONSTANTE_MENINOS[dados.etnia as Etnia][dados.maturacao as Maturacao]);
    }
    case "petroski": {
      if (i === null) return { ...vazio(["idade (data de nascimento)"]), soma };
      if (p.sexo === "masculino") {
        const d = 1.10726863 - 0.00081201 * soma + 0.00000212 * s2 - 0.00041761 * i;
        return resultado(d, siri(d));
      }
      const falta = exigir(p, ["peso", "alturaCm"]);
      if (falta.length) return { ...vazio(falta), soma };
      const d =
        1.02902361 -
        0.00067159 * soma +
        0.00000242 * s2 -
        0.00026073 * i -
        0.00056009 * (p.peso as number) +
        0.00054649 * (p.alturaCm as number);
      return resultado(d, siri(d));
    }
  }
}

// Massa gorda e livre de gordura a partir do % de gordura e do peso.
export function composicao(percentual: number | null, pesoKg: number | null) {
  if (percentual === null || !pesoKg) return { massaGorda: null, massaLivre: null };
  const massaGorda = (pesoKg * percentual) / 100;
  return { massaGorda, massaLivre: pesoKg - massaGorda };
}

// ===========================================================================
// M-05 — Faixa de referência de % de gordura (Gallagher et al., 2000)

export const DESCRICAO_GALLAGHER: Descricao = {
  nome: "Faixas de gordura corporal — Gallagher et al. (2000)",
  equacao:
    "% de gordura correspondente aos pontos de corte de IMC 18,5, 25 e 30 da OMS, por sexo e idade (Tabela 4: afro-americanos e brancos, modelo de 4 compartimentos).",
  populacao: "Cerca de 1.600 adultos de 20 a 79 anos (DXA e modelo de 4 compartimentos).",
  fonte: "Gallagher D et al. Am J Clin Nutr 2000;72:694-701 — Tabela 4.",
};

// Limites da Tabela 4: [abaixo de 18,5, a partir de 25, a partir de 30].
const GALLAGHER: Record<Sexo, [number, number, [number, number, number]][]> = {
  feminino: [
    [20, 40, [21, 33, 39]],
    [40, 60, [23, 34, 40]],
    [60, 80, [24, 36, 42]],
  ],
  masculino: [
    [20, 40, [8, 20, 25]],
    [40, 60, [11, 22, 28]],
    [60, 80, [13, 25, 30]],
  ],
};

export type ClasseGordura = "baixo" | "adequado" | "sobrepeso" | "obesidade";

export const CLASSES_GORDURA: Record<ClasseGordura, string> = {
  baixo: "Abaixo da faixa",
  adequado: "Faixa adequada",
  sobrepeso: "Acima (equivale a sobrepeso)",
  obesidade: "Muito acima (equivale a obesidade)",
};

export function referenciaDeGordura(sexo: Sexo | null, idade: number | null) {
  if (!sexo || idade === null) return null;
  const linha = GALLAGHER[sexo].find(([de, ate]) => idade >= de && idade < ate);
  if (!linha) return null;
  const [baixo, sobrepeso, obesidade] = linha[2];
  return { faixaEtaria: `${linha[0]}–${linha[1] - 1} anos`, adequadoDe: baixo, adequadoAte: sobrepeso, sobrepesoAte: obesidade, limites: linha[2] };
}

export function classificarGordura(percentual: number | null, sexo: Sexo | null, idade: number | null): ClasseGordura | null {
  const ref = referenciaDeGordura(sexo, idade);
  if (!ref || percentual === null) return null;
  const [baixo, sobrepeso, obesidade] = ref.limites;
  if (percentual < baixo) return "baixo";
  if (percentual < sobrepeso) return "adequado";
  if (percentual < obesidade) return "sobrepeso";
  return "obesidade";
}

// ===========================================================================
// Avatares de % de gordura (ilustrativos)

export const AVATARES: Record<Sexo, number[]> = {
  feminino: [45, 40, 35, 30, 25, 20, 18, 15, 12, 10, 8, 5, 3],
  masculino: [45, 40, 35, 30, 25, 20, 15, 12, 10, 8, 6, 4, 3],
};

export function avatarMaisProximo(percentual: number | null, sexo: Sexo | null) {
  if (percentual === null || !sexo) return null;
  const lista = AVATARES[sexo];
  let indice = 0;
  lista.forEach((valor, i) => {
    if (Math.abs(valor - percentual) < Math.abs(lista[indice] - percentual)) indice = i;
  });
  return { indice, valor: lista[indice], foraDaEscala: percentual > lista[0] || percentual < lista[lista.length - 1] };
}

// ===========================================================================
// Perimetria (cm)

export const PERIMETRIA = {
  deltoide: "Deltoide",
  torax: "Tórax inspirado",
  cintura: "Cintura",
  abdomen: "Abdômen",
  quadril: "Quadril",
  braco_direito: "Braço direito relaxado",
  braco_esquerdo: "Braço esquerdo relaxado",
  coxa_direita: "Coxa direita medial",
  coxa_esquerda: "Coxa esquerda medial",
} as const;

export type Regiao = keyof typeof PERIMETRIA;
export type Evolucao = "diminuiu" | "aumentou" | "igual" | "sem_comparacao";

// Cores da variação (tela e PDF): a cor indica só a variação, não melhora ou piora.
export const CORES_EVOLUCAO: Record<Evolucao, string> = {
  diminuiu: "#16a34a",
  aumentou: "#dc2626",
  igual: "#9ca3af",
  sem_comparacao: "#9ca3af",
};

// Setas na figura de frente (imagem de 1024 × 1536): [y, x inicial, x final, número].
export const SETAS_PERIMETRIA: Record<Regiao, [number, number, number, number]> = {
  deltoide: [355, 100, 462, 1],
  torax: [430, 165, 395, 2],
  cintura: [545, 190, 372, 3],
  abdomen: [615, 182, 380, 4],
  quadril: [700, 160, 402, 5],
  braco_direito: [480, 62, 128, 6],
  braco_esquerdo: [480, 432, 498, 7],
  coxa_direita: [880, 150, 272, 8],
  coxa_esquerda: [880, 290, 412, 9],
};

// Recorte da figura usado na tela e no PDF (x, y, largura, altura).
export const RECORTE_SILHUETA = [20, 150, 520, 1300] as const;

// Compara com a última medida válida anterior da mesma região.
export function evolucaoDaRegiao(atual: number | null | undefined, anteriores: (number | null | undefined)[]): { evolucao: Evolucao; diferenca: number | null } {
  if (!atual) return { evolucao: "sem_comparacao", diferenca: null };
  const anterior = anteriores.find((v) => v !== null && v !== undefined && v > 0);
  if (anterior === undefined || anterior === null) return { evolucao: "sem_comparacao", diferenca: null };
  const diferenca = atual - anterior;
  if (Math.abs(diferenca) < 1e-9) return { evolucao: "igual", diferenca: 0 };
  return { evolucao: diferenca < 0 ? "diminuiu" : "aumentou", diferenca };
}

// ===========================================================================
// Bioimpedância

export const CAMPOS_BIOIMPEDANCIA = {
  percentual_gordura: { nome: "Percentual de gordura", unidade: "%" },
  massa_livre_gordura: { nome: "Massa livre de gordura", unidade: "kg" },
  massa_gordura: { nome: "Massa de gordura", unidade: "kg" },
  massa_muscular: { nome: "Massa muscular", unidade: "kg" },
  percentual_massa_muscular: { nome: "Percentual de massa muscular", unidade: "%" },
  agua_corporal: { nome: "Água corporal", unidade: "" },
  gordura_visceral: { nome: "Gordura visceral", unidade: "" },
  massa_visceral: { nome: "Massa visceral", unidade: "" },
  massa_ossea: { nome: "Massa óssea (peso ósseo)", unidade: "kg" },
  idade_metabolica: { nome: "Idade metabólica", unidade: "anos" },
} as const;

export type CampoBio = keyof typeof CAMPOS_BIOIMPEDANCIA;

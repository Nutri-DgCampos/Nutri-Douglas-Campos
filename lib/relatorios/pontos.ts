// Pontos positivos, pontos de atenção e score corrigido do relatório semanal.
// Regra única: tela "Responder relatório", área do paciente e devolutiva da
// IA usam estas funções (antes cada tela tinha a sua cópia).
//
// - O score (0–100) é calculado no envio, em 8 partes proporcionais, e as
//   partes ficam gravadas no relatório. Ele não muda aqui, exceto quando o
//   nutricionista remove um ponto de atenção ligado a uma parte (D1): naquele
//   relatório, a parte volta ao máximo e o score é recalculado pela mesma
//   regra (pontos obtidos ÷ pontos aplicáveis × 100, no máximo 100).
// - Ponto de atenção sem parte do score: sai da lista e da devolutiva, sem
//   mexer no score.
// - A remoção vale só para o relatório em que foi feita.
// - regras_versao 2 (relatórios a partir de 22/10/2026): pergunta de
//   hormônios no lugar da de medicamentos, e respostas como "não tive" nos
//   campos de dificuldade não geram ponto de atenção (D2).

export type ParteDoScore = { campo: string; maximo: number; nome: string };

export const PARTES = {
  alimentacao: { campo: "diet_score", maximo: 30, nome: "Alimentação" },
  agua: { campo: "water_score", maximo: 15, nome: "Água" },
  treino: { campo: "training_score", maximo: 10, nome: "Treino" },
  aerobico: { campo: "cardio_score", maximo: 5, nome: "Aeróbico" },
  sono: { campo: "sleep_score", maximo: 10, nome: "Sono" },
  foraDoPlano: { campo: "off_plan_score", maximo: 15, nome: "Refeições fora do plano" },
  suplementos: { campo: "supplements_score", maximo: 5, nome: "Suplementos" },
  metaIndividual: { campo: "individual_goal_score", maximo: 10, nome: "Meta individual" },
} satisfies Record<string, ParteDoScore>;

export type PontoDeAtencao = { codigo: string; texto: string; parte: ParteDoScore | null };

export type PontoRemovido = { codigo: string; em: string; por?: string | null };

export const OPCOES_HORMONIOS = [
  { valor: "uso_correto", rotulo: "Sim, fiz uso correto esta semana" },
  { valor: "falhou", rotulo: "Sim, falhei no uso esta semana" },
  { valor: "parou_menos_6_meses", rotulo: "Não, porém parei o uso há menos de 6 meses" },
  { valor: "nao_usa", rotulo: "Não, não uso" },
] as const;

export const PERGUNTA_HORMONIOS = "Usa hormônios, anticoncepcional ou remédios para emagrecer?";

export const REGRAS_ATUAIS = 2;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Relatorio = Record<string, any>;

function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.!,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Campo de dificuldade respondido com uma negativa ("Não tive", "Nenhuma").
const NEGATIVAS_V1 = ["nao", "nao tenho"];
const NEGATIVA_V2 =
  /^(nao|n|nada|nenhum|nenhuma|sem dificuldades?|nao tive|nao tive nenhuma|nao tive dificuldades?|nao tive nenhuma dificuldade|nao tenho|nao tenho dificuldades?|nao houve|nao houve dificuldades?|nenhuma dificuldade|tudo certo|tudo bem|-)$/;

export function semDificuldade(texto: string | null | undefined, versao: number) {
  const t = normalizar(texto ?? "");
  if (!t) return true;
  return versao >= 2 ? NEGATIVA_V2.test(t) : NEGATIVAS_V1.includes(t);
}

export function analisarRelatorio(r: Relatorio): { positivos: string[]; atencao: PontoDeAtencao[] } {
  const versao = Number(r.regras_versao ?? 1);
  const positivos: string[] = [];
  const atencao: PontoDeAtencao[] = [];
  const atencaoDe = (codigo: string, texto: string, parte: ParteDoScore | null = null) => atencao.push({ codigo, texto, parte });

  if (r.diet_days != null) {
    if (r.diet_days === 7) positivos.push(`Excelente adesão alimentar: seguiu o plano por ${r.diet_days} dias.`);
    else if (r.diet_days === 6) positivos.push(`Boa adesão alimentar: seguiu o plano por ${r.diet_days} dias.`);
    else if (r.diet_days === 5) atencaoDe("dieta_dias", `Atenção à adesão alimentar: seguiu o plano por ${r.diet_days} dias.`, PARTES.alimentacao);
    else atencaoDe("dieta_dias", `Adesão alimentar muito abaixo do planejado: seguiu o plano por ${r.diet_days} dias.`, PARTES.alimentacao);
  }

  if (r.diet_changed === true && r.diet_change_equivalent === false) {
    atencaoDe(
      "dieta_alteracao",
      r.diet_change_notes ? `Alteração fora da lista de equivalências: ${r.diet_change_notes}` : "Realizou alteração fora da lista de equivalências."
    );
  }

  if (!semDificuldade(r.diet_difficulty, versao)) {
    atencaoDe("dieta_dificuldade", `Dificuldade com o plano alimentar: ${String(r.diet_difficulty).trim()}`);
  }

  if (r.water_goal_days != null) {
    if (r.water_goal_days === 7) positivos.push("Meta de hidratação cumprida: atingiu a meta planejada.");
    else if (r.water_goal_days === 6) positivos.push(`Boa hidratação: atingiu a meta de água por ${r.water_goal_days} dias.`);
    else if (r.water_goal_days === 5) atencaoDe("agua_dias", `Atenção à hidratação: atingiu a meta de água por ${r.water_goal_days} dias.`, PARTES.agua);
    else atencaoDe("agua_dias", `Hidratação muito abaixo do planejado: atingiu a meta de água por ${r.water_goal_days} dias.`, PARTES.agua);
  }

  if (r.urine_color === "muito_amarela") atencaoDe("urina", "Urina muito amarela: atenção à hidratação.");
  if (r.urine_color === "turva") atencaoDe("urina", "Urina turva: merece muita atenção.");

  if (r.training_applicable === true && r.training_planned != null && r.training_completed != null && r.training_planned > 0) {
    const percentual = r.training_completed / r.training_planned;
    if (percentual >= 1) positivos.push("Meta de treinos cumprida: atingiu a meta planejada.");
    else if (percentual < 0.7) atencaoDe("treino", "Atenção: sua meta de treinos ficou abaixo de 70% do planejado.", PARTES.treino);
  }

  if (r.cardio_applicable === true && r.cardio_planned != null && r.cardio_completed != null && r.cardio_planned > 0) {
    const percentual = r.cardio_completed / r.cardio_planned;
    if (percentual >= 1) positivos.push("Meta de atividade aeróbica cumprida: atingiu a meta planejada.");
    else if (percentual < 0.7) atencaoDe("aerobico", "Atenção: sua meta de atividade aeróbica ficou abaixo de 70% do planejado.", PARTES.aerobico);
  }

  if (r.sleep_hours != null) {
    const horas = Number(r.sleep_hours);
    if (horas < 6) atencaoDe("sono_horas", `Sono muito abaixo do recomendado: média de ${horas} horas por noite.`);
    else if (horas < 7) atencaoDe("sono_horas", `Atenção ao sono: média de ${horas} horas por noite.`);
  }
  if (r.sleep_quality === "ruim") {
    atencaoDe("sono_qualidade", "Atenção à qualidade do sono: paciente percebeu o sono como ruim.", PARTES.sono);
  }
  if (r.sleep_quality === "muito_ruim") {
    atencaoDe("sono_qualidade", "Qualidade do sono muito comprometida: paciente percebeu o sono como muito ruim.", PARTES.sono);
  }

  if (r.off_plan_count != null) {
    const vezes = Number(r.off_plan_count);
    if (vezes === 0) positivos.push("Excelente adesão: não realizou refeições fora do plano.");
    else if (vezes === 2) atencaoDe("fora_do_plano", "Atenção às refeições fora do plano: ocorreram 2 vezes nesta semana.", PARTES.foraDoPlano);
    else if (vezes >= 3) atencaoDe("fora_do_plano", `Frequência elevada de refeições fora do plano: ocorreram ${vezes} vezes nesta semana.`, PARTES.foraDoPlano);
  }

  if (r.supplements_applicable === true && r.supplements_days != null) {
    const dias = Number(r.supplements_days);
    if (dias === 7) positivos.push("Meta de suplementação cumprida: atingiu a meta planejada.");
    else if (dias === 5) atencaoDe("suplementos", "Atenção à suplementação: adesão abaixo do planejado.", PARTES.suplementos);
    else if (dias <= 4) atencaoDe("suplementos", "Baixa adesão à suplementação: adesão muito abaixo do planejado.", PARTES.suplementos);
  }

  if (r.individual_goal_planned != null && r.individual_goal_completed != null && r.individual_goal_planned > 0) {
    const percentual = r.individual_goal_completed / r.individual_goal_planned;
    if (percentual >= 1) positivos.push("Meta individual cumprida: atingiu a meta planejada.");
    else if (percentual < 0.7) atencaoDe("meta_individual", "Atenção à meta individual: ficou abaixo de 70% do planejado.", PARTES.metaIndividual);
  }

  if (!semDificuldade(r.individual_goal_difficulty, versao)) {
    atencaoDe("meta_individual_dificuldade", `Dificuldade na meta individual: ${String(r.individual_goal_difficulty).trim()}`);
  }

  if (r.stool_consistency === "tipo_1" || r.stool_consistency === "tipo_2") {
    atencaoDe("intestino", "Funcionamento intestinal: fezes endurecidas, com tendência à constipação.");
  } else if (r.stool_consistency === "tipo_5") {
    atencaoDe("intestino", "Funcionamento intestinal: fezes mais amolecidas que o ideal.");
  } else if (r.stool_consistency === "tipo_6" || r.stool_consistency === "tipo_7") {
    atencaoDe("intestino", "Funcionamento intestinal: fezes muito amolecidas ou líquidas.");
  }

  if (versao >= 2) {
    // Nova pergunta (D5): sem desconto; duas respostas geram ponto de atenção.
    if (r.hormonios_uso === "falhou") {
      atencaoDe("hormonios", "Uso de hormônios, anticoncepcional ou remédios para emagrecer: falhou no uso esta semana.");
    } else if (r.hormonios_uso === "parou_menos_6_meses") {
      atencaoDe("hormonios", "Parou o uso de hormônios, anticoncepcional ou remédios para emagrecer há menos de 6 meses.");
    }
  } else if (r.medication_changes && r.medication_changes !== "nao") {
    atencaoDe(
      "medicamentos",
      String(r.medication_changes).startsWith("sim - ")
        ? `Mudança no uso de medicamentos: ${String(r.medication_changes).replace("sim - ", "")}`
        : "Houve mudança no uso de medicamentos nesta semana."
    );
  }

  return { positivos, atencao };
}

export function codigosRemovidos(r: Relatorio): string[] {
  const lista = Array.isArray(r.pontos_removidos) ? (r.pontos_removidos as PontoRemovido[]) : [];
  return lista.map((p) => p.codigo).filter((c): c is string => typeof c === "string");
}

// Pontos de atenção que continuam valendo neste relatório.
export function pontosDoRelatorio(r: Relatorio) {
  const { positivos, atencao } = analisarRelatorio(r);
  const removidos = new Set(codigosRemovidos(r));
  return { positivos, atencao: atencao.filter((p) => !removidos.has(p.codigo)), removidos: atencao.filter((p) => removidos.has(p.codigo)) };
}

// Score com as partes dos pontos removidos devolvidas ao máximo. Sem as
// partes gravadas (relatório muito antigo), fica o score original.
export function scoreCorrigido(r: Relatorio, removidos: string[]): number | null {
  const original = r.adherence_score_original ?? r.adherence_score ?? null;
  const aplicaveis = Number(r.applicable_points);
  const obtidos = Number(r.earned_points);
  if (!Number.isFinite(aplicaveis) || aplicaveis <= 0 || !Number.isFinite(obtidos) || r.earned_points == null) return original;

  const { atencao } = analisarRelatorio(r);
  const partes = new Set<ParteDoScore>();
  for (const ponto of atencao) if (ponto.parte && removidos.includes(ponto.codigo)) partes.add(ponto.parte);
  if (partes.size === 0) return original;

  let total = obtidos;
  for (const parte of partes) {
    const atual = Number(r[parte.campo] ?? 0);
    total += Math.max(0, parte.maximo - (Number.isFinite(atual) ? atual : 0));
  }
  return Math.min(100, Math.round((total / aplicaveis) * 100));
}

export function classificacaoDoScore(score: number | null | undefined) {
  const s = score ?? 0;
  return s >= 90 ? "Excelente" : s >= 80 ? "Muito bom" : s >= 70 ? "Bom" : s >= 60 ? "Atenção" : "Baixa adesão";
}

// Fórmulas manipuladas (Fase 6). Cálculo aprovado (M-08, decisões 6.1 a 6.3):
// - total de unidades = unidades por dose × doses por dia × dias;
// - componente "por unidade" (cápsula, sachê): por dose = quantidade ×
//   unidades por dose; total = quantidade × total de unidades;
// - componente "por dose": total = quantidade × doses por dia × dias;
// - sem conversão entre mg, mcg, g e UI. A conta não prova que a fórmula é
//   viável na farmácia. Nada é sugerido pelo sistema: dosagens são do
//   profissional.

export const UNIDADES_DO_COMPONENTE = ["mg", "mcg", "g", "UI", "mL", "%", "bilhões UFC", "gotas"] as const;
export type UnidadeDoComponente = (typeof UNIDADES_DO_COMPONENTE)[number];

export type Componente = {
  id: string;
  ingredienteId: string | null;
  nome: string;
  quantidade: number | null;
  unidade: UnidadeDoComponente | null;
  // A quantidade é de cada unidade (cápsula, sachê) ou da dose completa.
  base: "unidade" | "dose";
};

export type Formula = {
  nome: string;
  componentes: Componente[];
  apresentacao: string; // cápsula, sachê, pó, solução…
  excipiente: string;
  dose: string;
  posologia: string;
  observacao: string;
  orientacoesFarmacia: string;
  orientacoesPaciente: string;
  dispensacao: { unidadesPorDose: number | null; dosesPorDia: number | null; dias: number | null };
};

export type DadosDoIngrediente = { dosagem: number | null; unidade: UnidadeDoComponente | null; forma: string };

export const AVISO_DA_FORMULA =
  "Revisão profissional obrigatória: estar na biblioteca não autoriza o uso nem valida dosagens. A conta de dispensação é só matemática e não prova a viabilidade farmacotécnica.";

export function novoComponente(nome = ""): Componente {
  return { id: globalThis.crypto.randomUUID(), ingredienteId: null, nome, quantidade: null, unidade: null, base: "unidade" };
}

export function formulaVazia(nome = ""): Formula {
  return {
    nome,
    componentes: [novoComponente()],
    apresentacao: "",
    excipiente: "",
    dose: "",
    posologia: "",
    observacao: "",
    orientacoesFarmacia: "",
    orientacoesPaciente: "",
    dispensacao: { unidadesPorDose: null, dosesPorDia: null, dias: null },
  };
}

const arredondar = (v: number) => Math.round(v * 100) / 100;
export const formatar = (v: number) => arredondar(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const positivo = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export type Dispensacao = {
  totalDeUnidades: number | null;
  componentes: { id: string; porDose: number | null; total: number | null; unidade: string | null }[];
  faltando: string[];
};

export function calcularDispensacao(f: Formula): Dispensacao {
  const { unidadesPorDose, dosesPorDia, dias } = f.dispensacao;
  const faltando: string[] = [];
  if (!positivo(dosesPorDia)) faltando.push("doses por dia");
  if (!positivo(dias)) faltando.push("dias de tratamento");
  const precisaUnidades = f.componentes.some((c) => c.base === "unidade");
  if (precisaUnidades && !positivo(unidadesPorDose)) faltando.push("unidades por dose");
  const totalDeUnidades = positivo(unidadesPorDose) && positivo(dosesPorDia) && positivo(dias) ? arredondar(unidadesPorDose * dosesPorDia * dias) : null;
  return {
    totalDeUnidades,
    faltando,
    componentes: f.componentes.map((c) => {
      if (!positivo(c.quantidade) || !c.unidade) return { id: c.id, porDose: null, total: null, unidade: c.unidade };
      if (c.base === "unidade") {
        return {
          id: c.id,
          unidade: c.unidade,
          porDose: positivo(unidadesPorDose) ? arredondar(c.quantidade * unidadesPorDose) : null,
          total: totalDeUnidades !== null ? arredondar(c.quantidade * totalDeUnidades) : null,
        };
      }
      return {
        id: c.id,
        unidade: c.unidade,
        porDose: arredondar(c.quantidade),
        total: positivo(dosesPorDia) && positivo(dias) ? arredondar(c.quantidade * dosesPorDia * dias) : null,
      };
    }),
  };
}

// O que precisa de revisão antes de emitir o PDF.
export function pendenciasDaFormula(f: Formula) {
  const p: string[] = [];
  if (!f.nome.trim()) p.push("Informe o nome da fórmula.");
  const preenchidos = f.componentes.filter((c) => c.nome.trim());
  if (preenchidos.length === 0) p.push("Inclua ao menos um ingrediente.");
  preenchidos.forEach((c) => {
    if (!positivo(c.quantidade) || !c.unidade) p.push(`${c.nome}: informe a dosagem e a unidade.`);
  });
  return p;
}

// Texto da dosagem como no PDF: "250mg", "2.000UI" (por unidade/dose).
export function textoDaDosagem(c: Componente) {
  if (!positivo(c.quantidade) || !c.unidade) return "";
  return `${formatar(c.quantidade)}${c.unidade === "bilhões UFC" || c.unidade === "gotas" ? ` ${c.unidade}` : c.unidade}`;
}

// Cópia para outra consulta/paciente ou para modelo: identificadores novos;
// "semDadosDoPaciente" tira observação e orientações ao paciente.
export function copiarFormula(f: Formula, semDadosDoPaciente: boolean): Formula {
  return {
    ...structuredClone(f),
    componentes: f.componentes.map((c) => ({ ...c, id: globalThis.crypto.randomUUID() })),
    ...(semDadosDoPaciente ? { observacao: "", orientacoesPaciente: "" } : {}),
  };
}

// ---------------------------------------------------------------------------
// Validação

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (v: unknown, limite: number) => (typeof v === "string" ? v.slice(0, limite) : "");
const numero = (v: unknown, maximo = 1_000_000) => (typeof v === "number" && Number.isFinite(v) && v > 0 && v <= maximo ? v : null);
const unidade = (v: unknown) => (UNIDADES_DO_COMPONENTE.includes(v as UnidadeDoComponente) ? (v as UnidadeDoComponente) : null);

export function validarFormula(valor: unknown): { valor: Formula } | { erro: string } {
  const o = valor as Record<string, unknown> | null;
  if (!o || typeof o !== "object" || !Array.isArray(o.componentes)) return { erro: "Fórmula inválida." };
  if (o.componentes.length > 80) return { erro: "No máximo 80 ingredientes." };
  const componentes: Componente[] = [];
  for (const [n, item] of (o.componentes as Record<string, unknown>[]).entries()) {
    if (!item || typeof item.id !== "string" || !UUID.test(item.id)) return { erro: `Ingrediente ${n + 1}: formato inválido.` };
    componentes.push({
      id: item.id,
      ingredienteId: typeof item.ingredienteId === "string" && UUID.test(item.ingredienteId) ? item.ingredienteId : null,
      nome: texto(item.nome, 200),
      quantidade: numero(item.quantidade),
      unidade: unidade(item.unidade),
      base: item.base === "dose" ? "dose" : "unidade",
    });
  }
  const d = (o.dispensacao ?? {}) as Record<string, unknown>;
  return {
    valor: {
      nome: texto(o.nome, 200),
      componentes,
      apresentacao: texto(o.apresentacao, 200),
      excipiente: texto(o.excipiente, 500),
      dose: texto(o.dose, 500),
      posologia: texto(o.posologia, 2000),
      observacao: texto(o.observacao, 5000),
      orientacoesFarmacia: texto(o.orientacoesFarmacia, 5000),
      orientacoesPaciente: texto(o.orientacoesPaciente, 5000),
      dispensacao: { unidadesPorDose: numero(d.unidadesPorDose, 1000), dosesPorDia: numero(d.dosesPorDia, 48), dias: numero(d.dias, 3650) },
    },
  };
}

export function validarIngrediente(valor: unknown): { valor: DadosDoIngrediente } | { erro: string } {
  const o = (valor ?? {}) as Record<string, unknown>;
  return { valor: { dosagem: numero(o.dosagem), unidade: unidade(o.unidade), forma: texto(o.forma, 200) } };
}

// Modelo: sem observação nem orientações ao paciente (dados do paciente).
export function validarModeloDeFormula(valor: unknown): { valor: Formula } | { erro: string } {
  const v = validarFormula(valor);
  return "erro" in v ? v : { valor: { ...v.valor, observacao: "", orientacoesPaciente: "" } };
}

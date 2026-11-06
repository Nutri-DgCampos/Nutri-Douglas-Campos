import { test } from "node:test";
import assert from "node:assert/strict";
import { planoComRegistros, repeticoesDoVolume, textoDasRepeticoes, volumePorGrupo } from "../lib/treino.ts";
import {
  equipamentosQueFaltam,
  planoParaAluno,
  problemasParaEnvio,
  seriesDaSessao,
  tonelagemDaSessao,
  validarPlanoDoEditor,
  volumeSemanalPorGrupo,
} from "../lib/treinoEditor.ts";

const exercicio = (campos) => ({
  nome: "Agachamento livre",
  grupo: "Quadríceps",
  series: 4,
  repeticoes: 8,
  repeticoes_max: 12,
  carga_kg: 70,
  descanso_segundos: 90,
  observacao: null,
  exercicio_id: null,
  video_url: null,
  alternativa: null,
  avancado: null,
  ...campos,
});

test("faixa de repetições: o volume prescrito usa o maior valor (Q7, C2)", () => {
  assert.equal(repeticoesDoVolume({ repeticoes: 8, repeticoes_max: 12 }), 12);
  assert.equal(repeticoesDoVolume({ repeticoes: 10, repeticoes_max: null }), 10);
  assert.equal(repeticoesDoVolume({ repeticoes: 10 }), 10, "plano antigo, sem faixa");
  assert.equal(textoDasRepeticoes({ repeticoes: 8, repeticoes_max: 12 }), "8–12");
  assert.equal(textoDasRepeticoes({ repeticoes: 10, repeticoes_max: null }), "10");
  const [quad] = volumePorGrupo({ dias: [{ dia: "seg", titulo: "A", kcal_estimadas: null, exercicios: [exercicio({})] }] }).filter((v) => v.grupo === "Quadríceps");
  assert.equal(quad.repeticoes, 48, "4 séries × 12");
  assert.equal(quad.cargaKg, 48 * 70);
});

test("faixa de repetições: o realizado usa o que o aluno registrou; sem registro, o maior valor", () => {
  const plano = { dias: [{ dia: "seg", titulo: "A", kcal_estimadas: null, exercicios: [exercicio({}), exercicio({ nome: "Leg press 45°" })] }] };
  const comRegistro = planoComRegistros(plano, { seg: { 0: { indice: 0, series: 4, repeticoes: 9, carga_kg: 72, descanso_segundos: 90 } } });
  assert.equal(repeticoesDoVolume(comRegistro.dias[0].exercicios[0]), 9);
  assert.equal(repeticoesDoVolume(comRegistro.dias[0].exercicios[1]), 12, "sem registro");
  const semReps = planoComRegistros(plano, { seg: { 0: { indice: 0, series: 4, repeticoes: null, carga_kg: 72, descanso_segundos: 90 } } });
  assert.equal(repeticoesDoVolume(semReps.dias[0].exercicios[0]), 12, "registrou só a carga");
  assert.equal(plano.dias[0].exercicios[0].repeticoes_max, 12, "prescrição não muda");
});

test("validação do editor: limpa, ordena a faixa e recusa o que não é seguro", () => {
  const ok = validarPlanoDoEditor({
    dias: [
      {
        dia: "seg",
        titulo: "  Treino   A ",
        kcal_estimadas: 500,
        exercicios: [exercicio({ repeticoes: 12, repeticoes_max: 8, grupo: "Inexistente" }), exercicio({ repeticoes: 10, repeticoes_max: 10 })],
      },
    ],
  });
  assert.ok("plano" in ok);
  const [a, b] = ok.plano.dias[0].exercicios;
  assert.equal(ok.plano.dias[0].titulo, "Treino A");
  assert.equal(ok.plano.dias[0].kcal_estimadas, null, "o sistema não estima calorias (C1)");
  assert.deepEqual([a.repeticoes, a.repeticoes_max], [8, 12], "faixa invertida é corrigida");
  assert.equal(a.grupo, "Outro", "grupo desconhecido vira Outro");
  assert.equal(b.repeticoes_max, null, "faixa com os dois valores iguais vira número único");

  assert.ok("erro" in validarPlanoDoEditor({ dias: [{ dia: "xyz", titulo: "", exercicios: [] }] }));
  assert.ok("erro" in validarPlanoDoEditor({ dias: [{ dia: "seg", titulo: "", exercicios: [exercicio({ video_url: "https://evil.example/x" })] }] }), "vídeo só do YouTube");
  assert.ok("plano" in validarPlanoDoEditor({ dias: [{ dia: "seg", titulo: "", exercicios: [exercicio({ video_url: "https://www.youtube.com/watch?v=abc" })] }] }));
  assert.ok("erro" in validarPlanoDoEditor({ dias: [{ dia: "seg", titulo: "", exercicios: [exercicio({ series: -1 })] }] }));
  assert.ok("erro" in validarPlanoDoEditor({ dias: [{ dia: "seg", titulo: "", exercicios: [exercicio({ avancado: { secundarios: ["Cardio"] } })] }] }), "secundário precisa ser grupo muscular");
});

test("envio ao aluno exige título, sessões com nome, exercícios e séries, um dia por sessão", () => {
  assert.deepEqual(problemasParaEnvio({ titulo: "", objetivo: "", plano: { dias: [] } }), ["Informe o título do treino.", "Inclua pelo menos uma sessão."]);
  const lista = problemasParaEnvio({
    titulo: "ABC",
    objetivo: "",
    plano: {
      dias: [
        { dia: "seg", titulo: "A", kcal_estimadas: null, exercicios: [exercicio({ series: null })] },
        { dia: "seg", titulo: "", kcal_estimadas: null, exercicios: [] },
      ],
    },
  });
  assert.ok(lista.some((p) => p.includes("Segunda-feira tem mais de uma sessão")));
  assert.ok(lista.some((p) => p.includes("informe as séries")));
  assert.ok(lista.some((p) => p.includes("Sessão 2: informe o nome")));
  assert.ok(lista.some((p) => p.includes("inclua pelo menos um exercício")));
  assert.deepEqual(
    problemasParaEnvio({ titulo: "ABC", objetivo: "", plano: { dias: [{ dia: "seg", titulo: "A", kcal_estimadas: null, exercicios: [exercicio({})] }] } }),
    []
  );
});

test("totais calculados das linhas (VIS-03: 4+4+3+3+4 = 18 séries)", () => {
  const sessao = {
    dia: "seg",
    titulo: "Treino A",
    kcal_estimadas: null,
    exercicios: [exercicio({ series: 4 }), exercicio({ series: 4 }), exercicio({ series: 3 }), exercicio({ series: 3 }), exercicio({ series: 4 })],
  };
  assert.equal(seriesDaSessao(sessao), 18);
  assert.equal(tonelagemDaSessao({ ...sessao, exercicios: [exercicio({ series: 3, repeticoes: 10, repeticoes_max: null, carga_kg: 50 })] }), 1500);
  assert.equal(tonelagemDaSessao({ ...sessao, exercicios: [exercicio({ carga_kg: null })] }), null, "sem carga: não calcula");
});

test("volume semanal: secundário conta pelo peso configurado (padrão 0,5)", () => {
  const plano = {
    dias: [
      {
        dia: "seg",
        titulo: "A",
        kcal_estimadas: null,
        exercicios: [exercicio({ grupo: "Peito", series: 4, avancado: { cadencia: null, rpe: null, rir: null, aquecimento: null, tecnica: null, notas: null, secundarios: ["Tríceps", "Ombro"] } })],
      },
    ],
  };
  const v = Object.fromEntries(volumeSemanalPorGrupo(plano).map((x) => [x.grupo, x.series]));
  assert.equal(v.Peito, 4);
  assert.equal(v["Tríceps"], 2);
  assert.equal(v.Ombro, 2);
  const um = Object.fromEntries(volumeSemanalPorGrupo(plano, 1).map((x) => [x.grupo, x.series]));
  assert.equal(um["Tríceps"], 4);
});

test("o aluno não recebe detalhes do editor nem a Opção oculta (C3, P1)", () => {
  const plano = {
    dias: [
      {
        dia: "seg",
        titulo: "A",
        kcal_estimadas: null,
        exercicios: [
          exercicio({
            exercicio_id: "0b3c6b2c-5c0f-4f7a-9e0a-111111111111",
            avancado: { cadencia: "3-0-1-0", rpe: 8, rir: 2, aquecimento: null, tecnica: "Drop set", notas: "nota privada", secundarios: [] },
            alternativa: { nome: "Smith", observacao: null, visivel: false },
          }),
          exercicio({ alternativa: { nome: "Goblet", observacao: "sem barra", visivel: true } }),
        ],
      },
    ],
  };
  const aluno = planoParaAluno(plano);
  assert.equal(aluno.dias[0].exercicios[0].avancado, undefined);
  assert.equal(aluno.dias[0].exercicios[0].exercicio_id, undefined);
  assert.equal(aluno.dias[0].exercicios[0].alternativa, null);
  assert.equal(aluno.dias[0].exercicios[1].alternativa.nome, "Goblet");
  assert.ok(!JSON.stringify(aluno).includes("nota privada"));
  assert.equal(plano.dias[0].exercicios[0].avancado.notas, "nota privada", "o plano original não muda");
});

test("equipamentos que faltam na academia do aluno", () => {
  assert.deepEqual(equipamentosQueFaltam(["Barra e anilhas", "Banco"], ["Banco", "Halteres"]), ["Barra e anilhas"]);
  assert.deepEqual(equipamentosQueFaltam([], ["Banco"]), [], "peso corporal sempre serve");
  assert.deepEqual(equipamentosQueFaltam(["Smith"], null), [], "academia não informada: sem aviso");
});

// Observações do treino (SPEC complementar 06/11, item 2).
test("observações do treino: limpas, só quando há, e preservadas ao ordenar e para o aluno", async () => {
  const { validarPlanoDoEditor, ordenarSessoes, planoParaAluno, volumeSemanalPorGrupo } = await import("../lib/treinoEditor.ts");
  const dia = (d) => ({ dia: d, titulo: "A", exercicios: [{ nome: "Supino", grupo: "Peito", series: 3, repeticoes: 10 }] });
  const semObs = validarPlanoDoEditor({ dias: [dia("seg")] });
  assert.equal("observacoes" in semObs.plano, false, "treino sem observação não ganha a chave (não vira \"alterado\")");
  const vazias = validarPlanoDoEditor({ dias: [dia("seg")], observacoes: [{ titulo: "  ", texto: "" }] });
  assert.equal("observacoes" in vazias.plano, false, "observação vazia é descartada");
  const comObs = validarPlanoDoEditor({ dias: [dia("qua"), dia("seg")], observacoes: [{ id: "x", titulo: "Hidratar", texto: "Beba água", modeloId: "nao-uuid" }] });
  assert.deepEqual(comObs.plano.observacoes, [{ id: "x", titulo: "Hidratar", texto: "Beba água", modeloId: null }]);
  const ordenado = ordenarSessoes(comObs.plano);
  assert.deepEqual(ordenado.dias.map((d) => d.dia), ["seg", "qua"]);
  assert.equal(ordenado.observacoes.length, 1, "enviar ao aluno não perde as observações");
  assert.deepEqual(planoParaAluno(comObs.plano).observacoes, [{ id: "x", titulo: "Hidratar", texto: "Beba água" }]);
  assert.deepEqual(volumeSemanalPorGrupo(comObs.plano), volumeSemanalPorGrupo({ dias: comObs.plano.dias }), "volume não muda");
  assert.match(validarPlanoDoEditor({ dias: [], observacoes: Array.from({ length: 21 }, () => ({ titulo: "a" })) }).erro, /No máximo 20/);
});

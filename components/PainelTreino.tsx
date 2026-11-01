"use client";

import { useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Tag } from "primereact/tag";
import {
  DIAS,
  SITUACOES,
  type ChaveDia,
  type DiaDeTreino,
  type Exercicio,
  type ExercicioRegistrado,
  type Nivel,
  type PlanoDeTreino,
  type SessaoRegistrada,
  type SituacaoDaSessao,
  formatarNumero,
  kcalSemanais,
  nivelDoTreino,
  volumePorGrupo,
} from "@/lib/treino";

const COR_DO_NIVEL: Record<Nivel, "info" | "success" | "warning" | "danger"> = {
  Iniciante: "info",
  Intermediário: "success",
  Avançado: "warning",
  Expert: "danger",
};

type CampoEditavel = "series" | "repeticoes" | "descanso_segundos" | "carga_kg";

export type RegistroDoDia = {
  dia: ChaveDia;
  exercicios: ExercicioRegistrado[];
  situacao: SituacaoDaSessao | null;
  dataEfetiva: string | null;
  motivo: string | null;
  observacao: string | null;
};

type Avaliacao = { situacao: SituacaoDaSessao | null; dataEfetiva: string; motivo: string; observacao: string };

const ROTULO_DA_SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.valor, s.rotulo])) as Record<SituacaoDaSessao, string>;

function dataCurta(iso: string) {
  return iso.slice(0, 10).split("-").reverse().slice(0, 2).join("/");
}

// Treino organizado por dia da semana, com volume por grupo muscular, nível e
// gasto calórico estimado. Com onRegistrar, o aluno informa o que fez na
// sessão da semana: os números, a situação e uma observação. A prescrição
// (prescricao) não muda; o painel mostra os valores mais recentes (plano).
export default function PainelTreino({
  plano,
  prescricao,
  sessoes,
  anteriores,
  datas,
  onRegistrar,
}: {
  plano: PlanoDeTreino;
  prescricao?: PlanoDeTreino;
  sessoes?: Partial<Record<ChaveDia, SessaoRegistrada>>;
  anteriores?: Partial<Record<ChaveDia, Record<number, { carga_kg: number; data: string }>>>;
  datas?: Record<ChaveDia, string>;
  onRegistrar?: (registro: RegistroDoDia) => Promise<boolean>;
}) {
  const [diaAberto, setDiaAberto] = useState<ChaveDia | null>(null);
  const [rascunho, setRascunho] = useState<DiaDeTreino | null>(null);
  const [avaliacao, setAvaliacao] = useState<Avaliacao>({ situacao: null, dataEfetiva: "", motivo: "", observacao: "" });
  const [salvando, setSalvando] = useState(false);
  const onSalvar = onRegistrar;

  const volumes = useMemo(() => volumePorGrupo(plano), [plano]);
  const { nivel } = useMemo(() => nivelDoTreino(volumes), [volumes]);
  const kcal = useMemo(() => kcalSemanais(plano), [plano]);
  const temCarga = volumes.some((volume) => volume.cargaKg > 0);

  function abrir(chave: ChaveDia) {
    // Os campos partem da prescrição; o que já foi registrado nesta semana
    // aparece por cima.
    const dia = (prescricao ?? plano).dias.find((item) => item.dia === chave);
    if (!dia) return;

    const sessao = sessoes?.[chave];
    const copia = structuredClone(dia);
    for (const registro of sessao?.exercicios ?? []) {
      const exercicio = copia.exercicios[registro.indice];
      if (!exercicio) continue;
      Object.assign(exercicio, {
        series: registro.series,
        repeticoes: registro.repeticoes,
        carga_kg: registro.carga_kg,
        descanso_segundos: registro.descanso_segundos,
      });
    }
    setDiaAberto(chave);
    setRascunho(copia);
    setAvaliacao({
      situacao: sessao?.situacao ?? null,
      dataEfetiva: sessao?.data_efetiva ?? "",
      motivo: sessao?.motivo ?? "",
      observacao: sessao?.observacao ?? "",
    });
  }

  function alterar(indice: number, campo: CampoEditavel, valor: number | null) {
    setRascunho((atual) => {
      if (!atual) return atual;

      const exercicios = atual.exercicios.map((exercicio, posicao) =>
        posicao === indice ? { ...exercicio, [campo]: valor } : exercicio
      );

      return { ...atual, exercicios };
    });
  }

  async function salvar() {
    if (!onSalvar || !rascunho) return;

    setSalvando(true);
    const ok = await onSalvar({
      dia: rascunho.dia,
      exercicios: rascunho.exercicios.map((exercicio, indice) => ({
        indice,
        series: exercicio.series,
        repeticoes: exercicio.repeticoes,
        carga_kg: exercicio.carga_kg,
        descanso_segundos: exercicio.descanso_segundos,
      })),
      situacao: avaliacao.situacao,
      dataEfetiva: avaliacao.situacao === "reagendado" ? avaliacao.dataEfetiva || null : null,
      motivo: avaliacao.situacao && avaliacao.situacao !== "concluido" ? avaliacao.motivo.trim() || null : null,
      observacao: avaliacao.observacao.trim() || null,
    });
    setSalvando(false);

    if (ok) setDiaAberto(null);
  }

  const diaSelecionado = DIAS.find((dia) => dia.chave === diaAberto);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      {/* Dias da semana */}
      <section className="cartao overflow-hidden">
        <h2 className="border-b border-gray-200 px-4 py-3 font-bold text-gray-900">Dias de treino</h2>

        <ul className="divide-y divide-gray-200">
          {DIAS.map(({ chave, rotulo }) => {
            const dia = plano.dias.find((item) => item.dia === chave);

            return (
              <li key={chave}>
                <button
                  type="button"
                  disabled={!dia}
                  onClick={() => abrir(chave)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors enabled:hover:bg-primary-50 disabled:cursor-default"
                >
                  <span
                    className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                      dia ? "bg-primary-700 text-white" : "bg-gray-100 text-gray-400"
                    }`}
                  >
                    {rotulo}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className={`block truncate font-semibold ${dia ? "text-gray-900" : "text-gray-400"}`}>
                      {dia ? dia.titulo : "Descanso"}
                    </span>
                    {dia && (
                      <span className="block text-sm text-gray-500">
                        {dia.exercicios.length} {dia.exercicios.length === 1 ? "exercício" : "exercícios"}
                        {dia.kcal_estimadas ? ` · ~${formatarNumero(dia.kcal_estimadas)} kcal` : ""}
                      </span>
                    )}
                    {dia && sessoes?.[chave]?.situacao ? (
                      <span className="mt-0.5 block text-xs font-semibold text-primary-700">
                        {ROTULO_DA_SITUACAO[sessoes[chave]!.situacao!]}
                        {sessoes[chave]!.situacao === "reagendado" && sessoes[chave]!.data_efetiva
                          ? ` para ${dataCurta(sessoes[chave]!.data_efetiva!)}`
                          : ""}
                      </span>
                    ) : null}
                  </span>

                  {dia && <i className="pi pi-chevron-right text-gray-400" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Resumo */}
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="cartao p-4">
            <p className="text-sm text-gray-500">Nível do treinamento</p>
            <div className="mt-2">
              {nivel ? (
                <Tag value={nivel} severity={COR_DO_NIVEL[nivel]} className="selo-status" />
              ) : (
                <span className="font-semibold text-gray-400">—</span>
              )}
            </div>
          </div>

          <div className="cartao p-4">
            <p className="text-sm text-gray-500">Gasto estimado na semana</p>
            <p className="mt-1 text-xl font-bold text-gray-900">
              {kcal ? `${formatarNumero(kcal)} kcal` : "—"}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TabelaDeVolume
            titulo="Volume de treino"
            colunas={["Séries", "Reps"]}
            linhas={volumes.map((volume) => ({
              grupo: volume.grupo,
              valores: [volume.series, volume.repeticoes],
            }))}
          />

          <TabelaDeVolume
            titulo="Volume de carga"
            colunas={["kg"]}
            linhas={volumes.map((volume) => ({ grupo: volume.grupo, valores: [volume.cargaKg] }))}
            aviso={temCarga ? undefined : "Preencha as cargas dos exercícios para calcular."}
          />
        </div>

        <p className="text-xs text-gray-500">
          Volume de treino = séries × repetições · Volume de carga = séries × repetições × carga.
          Nível pela média de séries semanais por grupo muscular: Iniciante até 8, Intermediário 9 a 15,
          Avançado 16 a 22, Expert 23 ou mais.
        </p>
      </div>

      <Dialog
        header={
          rascunho
            ? `${diaSelecionado?.nome}${datas?.[rascunho.dia] ? ` (${dataCurta(datas[rascunho.dia])})` : ""} · ${rascunho.titulo}`
            : ""
        }
        visible={Boolean(diaAberto && rascunho)}
        onHide={() => !salvando && setDiaAberto(null)}
        className="w-[48rem] max-w-[calc(100vw-2rem)]"
        footer={
          onSalvar ? (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                label="Cancelar"
                severity="secondary"
                outlined
                disabled={salvando}
                onClick={() => setDiaAberto(null)}
              />
              <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvar} />
            </div>
          ) : undefined
        }
      >
        {rascunho && (
          <ul className="space-y-3">
            {rascunho.exercicios.map((exercicio, indice) => (
              <CartaoExercicio
                key={indice}
                exercicio={exercicio}
                editavel={Boolean(onSalvar)}
                anterior={anteriores?.[rascunho.dia]?.[indice]?.carga_kg ?? null}
                onAlterar={(campo, valor) => alterar(indice, campo, valor)}
              />
            ))}
          </ul>
        )}

        {rascunho && onSalvar ? (
          <section className="mt-4 rounded-xl border border-gray-200 p-3" aria-label="Como foi este treino">
            <p className="font-semibold text-gray-900">Como foi este treino?</p>
            <p className="text-xs text-gray-500">
              Salvar os números não marca o treino como feito: escolha a situação quando terminar (opcional).
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Situação do treino">
              {SITUACOES.map((opcao) => (
                <button
                  key={opcao.valor}
                  type="button"
                  role="radio"
                  aria-checked={avaliacao.situacao === opcao.valor}
                  onClick={() =>
                    setAvaliacao((atual) => ({ ...atual, situacao: atual.situacao === opcao.valor ? null : opcao.valor }))
                  }
                  className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                    avaliacao.situacao === opcao.valor
                      ? "border-primary-700 bg-primary-700 text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:border-primary-400"
                  }`}
                >
                  {opcao.rotulo}
                </button>
              ))}
            </div>

            {avaliacao.situacao === "reagendado" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">Nova data</span>
                <InputText
                  type="date"
                  aria-label="Nova data do treino"
                  value={avaliacao.dataEfetiva}
                  onChange={(e) => setAvaliacao((atual) => ({ ...atual, dataEfetiva: e.target.value }))}
                  className="w-48"
                />
              </label>
            ) : null}

            {avaliacao.situacao && avaliacao.situacao !== "concluido" ? (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-semibold text-gray-600">Motivo (opcional)</span>
                <InputText
                  aria-label="Motivo"
                  value={avaliacao.motivo}
                  maxLength={500}
                  onChange={(e) => setAvaliacao((atual) => ({ ...atual, motivo: e.target.value }))}
                  className="w-full"
                />
              </label>
            ) : null}

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Observações (opcional)</span>
              <InputTextarea
                aria-label="Observações do treino"
                value={avaliacao.observacao}
                maxLength={2000}
                autoResize
                rows={2}
                placeholder="Troca de academia, substituição de exercício, dificuldade, sintomas ou comentários"
                onChange={(e) => setAvaliacao((atual) => ({ ...atual, observacao: e.target.value }))}
                className="w-full"
              />
            </label>
          </section>
        ) : null}
      </Dialog>
    </div>
  );
}

function CartaoExercicio({
  exercicio,
  editavel,
  anterior,
  onAlterar,
}: {
  exercicio: Exercicio;
  editavel: boolean;
  // Última carga registrada antes desta sessão (só referência, não preenche).
  anterior?: number | null;
  onAlterar: (campo: CampoEditavel, valor: number | null) => void;
}) {
  const campos: { campo: CampoEditavel; rotulo: string; sufixo?: string; decimais?: boolean }[] = [
    { campo: "series", rotulo: "Séries" },
    { campo: "repeticoes", rotulo: "Reps" },
    { campo: "carga_kg", rotulo: "Carga", sufixo: " kg", decimais: true },
    { campo: "descanso_segundos", rotulo: "Descanso", sufixo: " s" },
  ];

  return (
    <li className="rounded-xl border border-gray-200 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold text-gray-900">{exercicio.nome}</p>
        <span className="text-xs font-semibold uppercase tracking-wide text-primary-700">{exercicio.grupo}</span>
      </div>

      {exercicio.observacao && <p className="mt-1 text-sm text-gray-500">{exercicio.observacao}</p>}

      <div className="mt-3 grid grid-cols-4 gap-2">
        {campos.map(({ campo, rotulo, sufixo, decimais }) => (
          <label key={campo} className="min-w-0">
            <span className="mb-1 block text-xs font-semibold text-gray-600">{rotulo}</span>
            {editavel ? (
              <InputNumber
                value={exercicio[campo]}
                onValueChange={(evento) => onAlterar(campo, evento.value ?? null)}
                min={0}
                max={campo === "descanso_segundos" ? 900 : 999}
                minFractionDigits={0}
                maxFractionDigits={decimais ? 1 : 0}
                locale="pt-BR"
                suffix={sufixo}
                placeholder="-"
                className="w-full"
                inputClassName="w-full px-2 text-center"
              />
            ) : (
              <span className="block rounded-lg bg-gray-50 px-2 py-2 text-center font-semibold text-gray-900">
                {exercicio[campo] === null ? "-" : `${exercicio[campo]!.toLocaleString("pt-BR")}${sufixo ?? ""}`}
              </span>
            )}
            {campo === "carga_kg" && anterior ? (
              <span className="mt-0.5 block text-center text-xs text-gray-500">Anterior: {anterior.toLocaleString("pt-BR")} kg</span>
            ) : null}
          </label>
        ))}
      </div>
    </li>
  );
}

function TabelaDeVolume({
  titulo,
  colunas,
  linhas,
  aviso,
}: {
  titulo: string;
  colunas: string[];
  linhas: { grupo: string; valores: number[] }[];
  aviso?: string;
}) {
  return (
    <section className="cartao overflow-hidden">
      <h3 className="bg-primary-700 px-4 py-2 text-sm font-bold uppercase tracking-wide text-white">
        {titulo} por grupo muscular
      </h3>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
            <th className="px-4 py-2 font-semibold">Músculo</th>
            {colunas.map((coluna) => (
              <th key={coluna} className="px-4 py-2 text-right font-semibold">
                {coluna}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => (
            <tr key={linha.grupo} className="border-b border-gray-100 last:border-0">
              <td className="px-4 py-1.5 text-gray-800">{linha.grupo}</td>
              {linha.valores.map((valor, indice) => (
                <td
                  key={indice}
                  className={`px-4 py-1.5 text-right font-semibold tabular-nums ${
                    valor > 0 ? "text-gray-900" : "text-gray-400"
                  }`}
                >
                  {formatarNumero(valor)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {aviso && <p className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500">{aviso}</p>}
    </section>
  );
}

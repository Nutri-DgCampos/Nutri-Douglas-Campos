"use client";

import { useMemo, useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { DIAS, type DiaDeTreino, type Exercicio, type Grupo } from "@/lib/treino";
import { equipamentosQueFaltam, seriesDaSessao, tonelagemDaSessao } from "@/lib/treinoEditor";

// Uma sessão do editor de musculação (VIS-03): cabeçalho com dia, nome e
// ações; linhas com exercício, séries, repetições (número ou faixa), carga,
// descanso, ↔ trocar, ▶ ver execução e ≡ detalhes. Totais calculados.

export type ItemDaBiblioteca = {
  id: string;
  nome: string;
  grupo: string;
  grupos_secundarios: string[];
  equipamentos: string[];
  video_url: string | null;
};

type Props = {
  sessao: DiaDeTreino;
  indice: number;
  total: number;
  diasOcupados: string[];
  biblioteca: ItemDaBiblioteca[];
  // Equipamentos da academia do aluno (null = academia não informada).
  equipamentosDaAcademia: string[] | null;
  mostrarOpcoes: boolean;
  podeColar: boolean;
  onAlterar: (mudanca: (sessao: DiaDeTreino) => void) => void;
  onRemover: () => void;
  onMover: (direcao: -1 | 1) => void;
  onAlternarOpcoes: () => void;
  onCopiar: () => void;
  onColar: () => void;
  onSalvarComoModelo: () => void;
  onDetalhes: (indiceDoExercicio: number) => void;
  onTrocar: (indiceDoExercicio: number) => void;
};

function Icone({ icone, rotulo, onClick, perigo, ativo, disabled }: { icone: string; rotulo: string; onClick: () => void; perigo?: boolean; ativo?: boolean; disabled?: boolean }) {
  return (
    <Button
      type="button"
      icon={`pi ${icone}`}
      text
      rounded
      size="small"
      severity={perigo ? "danger" : ativo ? undefined : "secondary"}
      aria-label={rotulo}
      tooltip={rotulo}
      tooltipOptions={{ position: "top" }}
      aria-pressed={ativo}
      disabled={disabled}
      onClick={onClick}
    />
  );
}

export default function SessaoDoEditor(props: Props) {
  const { sessao, biblioteca, equipamentosDaAcademia, onAlterar } = props;
  const series = seriesDaSessao(sessao);
  const tonelagem = tonelagemDaSessao(sessao);
  const porId = useMemo(() => new Map(biblioteca.map((b) => [b.id, b])), [biblioteca]);

  const opcoesDeDia = DIAS.map((d) => ({
    label: d.nome,
    value: d.chave,
    disabled: d.chave !== sessao.dia && props.diasOcupados.includes(d.chave),
  }));

  function alterarExercicio(indice: number, mudanca: (e: Exercicio) => void) {
    onAlterar((s) => mudanca(s.exercicios[indice]));
  }

  function escolherDaBiblioteca(indice: number, item: ItemDaBiblioteca) {
    alterarExercicio(indice, (e) => {
      e.nome = item.nome;
      e.grupo = item.grupo as Grupo;
      e.exercicio_id = item.id;
      e.video_url = item.video_url ?? null;
      if (item.grupos_secundarios.length) {
        e.avancado = {
          ...(e.avancado ?? { cadencia: null, rpe: null, rir: null, aquecimento: null, tecnica: null, notas: null, secundarios: [] }),
          secundarios: item.grupos_secundarios as Grupo[],
        };
      }
    });
  }

  return (
    <section className="cartao p-3 sm:p-4" aria-label={`Sessão ${props.indice + 1}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Icone icone="pi-minus-circle" rotulo="Excluir sessão" perigo onClick={props.onRemover} />
        <Dropdown
          value={sessao.dia}
          options={opcoesDeDia}
          onChange={(e) => onAlterar((s) => void (s.dia = e.value))}
          aria-label="Dia da sessão"
          className="w-48"
        />
        <InputText
          value={sessao.titulo}
          placeholder="Ex.: Treino A – Membros inferiores"
          aria-label="Nome da sessão"
          maxLength={120}
          onChange={(e) => onAlterar((s) => void (s.titulo = e.target.value))}
          className={`min-w-0 flex-1 sm:min-w-[16rem] ${sessao.titulo.trim() ? "" : "p-invalid"}`}
        />
        <div className="flex flex-wrap items-center">
          <Icone icone="pi-chevron-down" rotulo="Mover sessão para baixo" disabled={props.indice === props.total - 1} onClick={() => props.onMover(1)} />
          <Icone icone="pi-chevron-up" rotulo="Mover sessão para cima" disabled={props.indice === 0} onClick={() => props.onMover(-1)} />
          <Icone icone="pi-clone" rotulo={props.mostrarOpcoes ? "Ocultar as opções dos exercícios" : "Mostrar as opções dos exercícios (Opção)"} ativo={props.mostrarOpcoes} onClick={props.onAlternarOpcoes} />
          <Icone
            icone="pi-comment"
            rotulo={sessao.observacao === null || sessao.observacao === undefined ? "Orientação da sessão para o aluno" : "Remover a orientação da sessão"}
            ativo={sessao.observacao !== null && sessao.observacao !== undefined}
            onClick={() => onAlterar((s) => void (s.observacao = s.observacao === null || s.observacao === undefined ? "" : null))}
          />
          <Icone icone="pi-copy" rotulo="Copiar sessão" onClick={props.onCopiar} />
          <Icone icone="pi-clipboard" rotulo="Colar sessão copiada (substitui esta)" disabled={!props.podeColar} onClick={props.onColar} />
          <Icone icone="pi-bookmark" rotulo="Salvar sessão como modelo" onClick={props.onSalvarComoModelo} />
        </div>
        <div className="ml-auto flex gap-4 text-right text-xs text-gray-500">
          <span>
            Volume
            <span className="block text-sm font-bold text-gray-900">{series} séries</span>
          </span>
          {tonelagem !== null ? (
            <span title="Séries × repetições (maior valor da faixa) × carga">
              Tonelagem
              <span className="block text-sm font-bold text-gray-900">{Math.round(tonelagem).toLocaleString("pt-BR")} kg</span>
            </span>
          ) : null}
        </div>
      </div>

      {sessao.observacao !== null && sessao.observacao !== undefined ? (
        <InputTextarea
          value={sessao.observacao}
          autoResize
          rows={2}
          maxLength={1000}
          placeholder="Orientação para o aluno nesta sessão (ex.: aquecer 5 minutos na esteira)"
          aria-label="Orientação da sessão"
          onChange={(e) => onAlterar((s) => void (s.observacao = e.target.value))}
          className="mt-2 w-full"
        />
      ) : null}

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-gray-600">
              <th className="w-8" />
              <th className="px-1 pb-1">Exercício</th>
              <th className="w-20 px-1 pb-1 text-center">Séries</th>
              <th className="w-36 px-1 pb-1 text-center">Repetições</th>
              <th className="w-24 px-1 pb-1 text-center">Carga</th>
              <th className="w-24 px-1 pb-1 text-center">Descanso</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {sessao.exercicios.map((exercicio, indice) => {
              const item = exercicio.exercicio_id ? porId.get(exercicio.exercicio_id) : undefined;
              const faltam = item ? equipamentosQueFaltam(item.equipamentos, equipamentosDaAcademia) : [];
              return (
                <LinhaDoExercicio
                  key={indice}
                  exercicio={exercicio}
                  numero={indice + 1}
                  biblioteca={biblioteca}
                  faltam={faltam}
                  mostrarOpcao={props.mostrarOpcoes}
                  onAlterar={(m) => alterarExercicio(indice, m)}
                  onEscolher={(i) => escolherDaBiblioteca(indice, i)}
                  onRemover={() => onAlterar((s) => void s.exercicios.splice(indice, 1))}
                  onDetalhes={() => props.onDetalhes(indice)}
                  onTrocar={() => props.onTrocar(indice)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <Button
        type="button"
        icon="pi pi-plus"
        label="Exercício"
        text
        size="small"
        className="mt-1"
        onClick={() =>
          onAlterar((s) =>
            void s.exercicios.push({
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
            })
          )
        }
      />
    </section>
  );
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function LinhaDoExercicio({
  exercicio,
  numero,
  biblioteca,
  faltam,
  mostrarOpcao,
  onAlterar,
  onEscolher,
  onRemover,
  onDetalhes,
  onTrocar,
}: {
  exercicio: Exercicio;
  numero: number;
  biblioteca: ItemDaBiblioteca[];
  faltam: string[];
  mostrarOpcao: boolean;
  onAlterar: (mudanca: (e: Exercicio) => void) => void;
  onEscolher: (item: ItemDaBiblioteca) => void;
  onRemover: () => void;
  onDetalhes: () => void;
  onTrocar: () => void;
}) {
  const sugestoes = (consulta: string) => {
    const palavras = normalizar(consulta).split(/\s+/).filter(Boolean);
    return biblioteca.filter((b) => palavras.every((p) => normalizar(`${b.nome} ${b.grupo}`).includes(p))).slice(0, 30);
  };
  const [sugeridos, setSugeridos] = useState<ItemDaBiblioteca[]>([]);
  const temDetalhes = Boolean(exercicio.avancado || exercicio.alternativa);

  return (
    <>
      <tr className="align-top">
        <td className="pt-1.5">
          <Button
            type="button"
            icon="pi pi-minus"
            text
            rounded
            size="small"
            severity="danger"
            aria-label={`Excluir exercício ${numero}`}
            tooltip="Excluir exercício"
            onClick={onRemover}
          />
        </td>
        <td className="px-1 py-1">
          {/* Biblioteca carregada uma vez e filtrada aqui; texto livre também vale. */}
          <AutoComplete
            value={exercicio.nome}
            suggestions={sugeridos}
            completeMethod={(e) => setSugeridos(sugestoes(e.query))}
            field="nome"
            delay={150}
            itemTemplate={(item: ItemDaBiblioteca) => (
              <span className="flex justify-between gap-3">
                <span>{item.nome}</span>
                <span className="text-xs text-gray-500">{item.grupo}</span>
              </span>
            )}
            onChange={(e) => {
              if (typeof e.value !== "string") return;
              const nome = e.value;
              onAlterar((x) => {
                x.nome = nome;
                // Texto livre: deixa de apontar para o item da biblioteca.
                x.exercicio_id = null;
              });
            }}
            onSelect={(e) => onEscolher(e.value as ItemDaBiblioteca)}
            className="w-full"
            inputClassName={`w-full ${exercicio.nome.trim() ? "" : "p-invalid"}`}
            aria-label={`Exercício ${numero}`}
            placeholder="Buscar na biblioteca ou digitar"
          />
          <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500">
            <span>{exercicio.grupo}</span>
            {faltam.length ? (
              <span className="font-semibold text-atencao-700" title="O profissional pode prescrever mesmo assim">
                <i className="pi pi-exclamation-triangle mr-1 text-[10px]" aria-hidden />
                A academia do aluno não tem: {faltam.join(", ")}
              </span>
            ) : null}
            {exercicio.alternativa ? (
              <span className="text-primary-700">Opção: {exercicio.alternativa.nome}{exercicio.alternativa.visivel ? "" : " (oculta ao aluno)"}</span>
            ) : null}
          </span>
        </td>
        <td className="px-1 py-1">
          <InputNumber
            value={exercicio.series}
            onValueChange={(e) => onAlterar((x) => void (x.series = e.value ?? null))}
            min={0}
            max={100}
            aria-label={`Séries do exercício ${numero}`}
            className="w-full"
            inputClassName={`w-full text-center ${exercicio.series === null && exercicio.nome.trim() ? "p-invalid" : ""}`}
          />
        </td>
        <td className="px-1 py-1">
          <div className="flex items-center gap-1">
            <InputNumber
              value={exercicio.repeticoes}
              onValueChange={(e) => onAlterar((x) => void (x.repeticoes = e.value ?? null))}
              min={0}
              max={1000}
              aria-label={`Repetições (mínimo) do exercício ${numero}`}
              className="w-full"
              inputClassName="w-full text-center"
            />
            <span className="text-gray-400" aria-hidden>
              –
            </span>
            <InputNumber
              value={exercicio.repeticoes_max ?? null}
              onValueChange={(e) => onAlterar((x) => void (x.repeticoes_max = e.value ?? null))}
              min={0}
              max={1000}
              placeholder="máx."
              aria-label={`Repetições (máximo da faixa) do exercício ${numero}`}
              className="w-full"
              inputClassName="w-full text-center"
            />
          </div>
        </td>
        <td className="px-1 py-1">
          <InputNumber
            value={exercicio.carga_kg}
            onValueChange={(e) => onAlterar((x) => void (x.carga_kg = e.value ?? null))}
            min={0}
            max={1000}
            maxFractionDigits={1}
            locale="pt-BR"
            suffix=" kg"
            aria-label={`Carga do exercício ${numero}`}
            className="w-full"
            inputClassName="w-full text-center"
          />
        </td>
        <td className="px-1 py-1">
          <InputNumber
            value={exercicio.descanso_segundos}
            onValueChange={(e) => onAlterar((x) => void (x.descanso_segundos = e.value ?? null))}
            min={0}
            max={900}
            suffix=" s"
            aria-label={`Descanso do exercício ${numero}`}
            className="w-full"
            inputClassName="w-full text-center"
          />
        </td>
        <td className="whitespace-nowrap py-1">
          <Button type="button" icon="pi pi-arrow-right-arrow-left" text rounded size="small" aria-label={`Trocar exercício ${numero} por uma alternativa da biblioteca`} tooltip="Trocar por alternativa da biblioteca" onClick={onTrocar} />
          {exercicio.video_url ? (
            <a
              href={exercicio.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-button p-button-text p-button-rounded p-button-sm p-button-icon-only inline-flex"
              aria-label={`Ver execução do exercício ${numero}`}
              title="Ver execução"
            >
              <i className="pi pi-play-circle" aria-hidden />
            </a>
          ) : (
            <Button type="button" icon="pi pi-play-circle" text rounded size="small" disabled aria-label="Sem vídeo de execução" tooltip="Sem vídeo: cadastre o link em ≡ detalhes" tooltipOptions={{ showOnDisabled: true }} />
          )}
          <Button
            type="button"
            icon="pi pi-bars"
            text
            rounded
            size="small"
            severity={temDetalhes ? undefined : "secondary"}
            aria-label={`Detalhes avançados do exercício ${numero}`}
            tooltip="Detalhes avançados (aquecimento, RPE, cadência, técnicas, Opção, vídeo)"
            onClick={onDetalhes}
          />
        </td>
      </tr>
      {mostrarOpcao ? (
        <tr>
          <td />
          <td colSpan={6} className="px-1 pb-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-2 py-1.5">
              <span className="text-xs font-semibold text-gray-600">Opção</span>
              <InputText
                value={exercicio.alternativa?.nome ?? ""}
                placeholder="Alternativa (ex.: sem o aparelho, faça…)"
                aria-label={`Opção do exercício ${numero}`}
                maxLength={120}
                onChange={(e) =>
                  onAlterar((x) => {
                    const nome = e.target.value;
                    x.alternativa = nome ? { nome, observacao: x.alternativa?.observacao ?? null, visivel: x.alternativa?.visivel ?? true } : null;
                  })
                }
                className="min-w-0 flex-1 p-inputtext-sm"
              />
              <label className="flex items-center gap-1 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={exercicio.alternativa?.visivel ?? true}
                  disabled={!exercicio.alternativa}
                  onChange={(e) => onAlterar((x) => void (x.alternativa && (x.alternativa.visivel = e.target.checked)))}
                />
                O aluno vê
              </label>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

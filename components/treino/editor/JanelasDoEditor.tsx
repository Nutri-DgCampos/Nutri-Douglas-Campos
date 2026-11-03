"use client";

import { useMemo, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { MultiSelect } from "primereact/multiselect";
import { Message } from "primereact/message";
import { DIAS, GRUPOS, OUTROS_GRUPOS, textoDasRepeticoes, type DetalhesAvancados, type Exercicio, type Grupo, type PlanoDeTreino } from "@/lib/treino";
import { TECNICAS, VIDEO_YOUTUBE, equipamentosQueFaltam } from "@/lib/treinoEditor";
import type { ItemDaBiblioteca } from "./SessaoDoEditor";

const DETALHES_VAZIOS: DetalhesAvancados = { cadencia: null, rpe: null, rir: null, aquecimento: null, tecnica: null, secundarios: [], notas: null };

function Campo({ rotulo, children, dica }: { rotulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">{rotulo}</span>
      {children}
      {dica ? <span className="mt-1 block text-xs text-gray-500">{dica}</span> : null}
    </label>
  );
}

// ≡ Detalhes avançados (P2): ficam no editor, o aluno não vê (C3), exceto
// a Opção marcada como visível e o vídeo.
export function JanelaDetalhes({ exercicio, onFechar, onSalvar }: { exercicio: Exercicio | null; onFechar: () => void; onSalvar: (e: Exercicio) => void }) {
  // Montada a cada exercício aberto (key no componente pai).
  const [rascunho, setRascunho] = useState<Exercicio | null>(() => (exercicio ? structuredClone(exercicio) : null));
  if (!rascunho) return null;
  const d = rascunho.avancado ?? DETALHES_VAZIOS;
  const alterar = (m: Partial<DetalhesAvancados>) => setRascunho({ ...rascunho, avancado: { ...d, ...m } });
  const videoInvalido = Boolean(rascunho.video_url && !VIDEO_YOUTUBE.test(rascunho.video_url));

  return (
    <Dialog header={`Detalhes: ${rascunho.nome || "exercício"}`} visible onHide={onFechar} className="w-full max-w-2xl" modal>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Grupo muscular principal">
          <Dropdown
            value={rascunho.grupo}
            options={[...GRUPOS, ...OUTROS_GRUPOS]}
            onChange={(e) => setRascunho({ ...rascunho, grupo: e.value as Grupo })}
            className="w-full"
            aria-label="Grupo muscular principal"
          />
        </Campo>
        <Campo rotulo="Músculos secundários" dica="Contam meia série no volume semanal (aproximação).">
          <MultiSelect
            value={d.secundarios}
            options={GRUPOS.filter((g) => g !== rascunho.grupo)}
            onChange={(e) => alterar({ secundarios: e.value })}
            className="w-full"
            display="chip"
            aria-label="Músculos secundários"
          />
        </Campo>
        <Campo rotulo="Técnica">
          <Dropdown
            value={d.tecnica}
            options={[...TECNICAS]}
            editable
            showClear
            onChange={(e) => alterar({ tecnica: (e.value as string | null)?.slice(0, 60) || null })}
            className="w-full"
            aria-label="Técnica"
            placeholder="Nenhuma"
          />
        </Campo>
        <Campo rotulo="Cadência" dica="Ex.: 3-0-1-0">
          <InputText value={d.cadencia ?? ""} maxLength={20} onChange={(e) => alterar({ cadencia: e.target.value || null })} className="w-full" aria-label="Cadência" />
        </Campo>
        <Campo rotulo="RPE (0 a 10)">
          <InputNumber value={d.rpe} onValueChange={(e) => alterar({ rpe: e.value ?? null })} min={0} max={10} maxFractionDigits={1} locale="pt-BR" className="w-full" inputClassName="w-full" aria-label="RPE" />
        </Campo>
        <Campo rotulo="RIR (repetições em reserva)">
          <InputNumber value={d.rir} onValueChange={(e) => alterar({ rir: e.value ?? null })} min={0} max={10} className="w-full" inputClassName="w-full" aria-label="RIR" />
        </Campo>
        <div className="sm:col-span-2">
          <Campo rotulo="Aquecimento">
            <InputText value={d.aquecimento ?? ""} maxLength={300} onChange={(e) => alterar({ aquecimento: e.target.value || null })} className="w-full" aria-label="Aquecimento" placeholder="Ex.: 2 séries de 15 com carga leve" />
          </Campo>
        </div>
        <div className="sm:col-span-2">
          <Campo rotulo="Observação para o aluno">
            <InputTextarea value={rascunho.observacao ?? ""} maxLength={500} autoResize rows={2} onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value || null })} className="w-full" aria-label="Observação para o aluno" />
          </Campo>
        </div>
        <div className="sm:col-span-2">
          <Campo rotulo="Notas privadas" dica="Só o profissional vê. Não saem no PDF.">
            <InputTextarea value={d.notas ?? ""} maxLength={1000} autoResize rows={2} onChange={(e) => alterar({ notas: e.target.value || null })} className="w-full" aria-label="Notas privadas" />
          </Campo>
        </div>
        <div className="sm:col-span-2 rounded-xl border border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-700">Opção (alternativa ao exercício)</p>
          <p className="text-xs text-gray-500">Não substitui o exercício principal. Você decide se o aluno vê.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
            <InputText
              value={rascunho.alternativa?.nome ?? ""}
              maxLength={120}
              placeholder="Ex.: Agachamento no Smith"
              aria-label="Nome da opção"
              onChange={(e) =>
                setRascunho({
                  ...rascunho,
                  alternativa: e.target.value ? { nome: e.target.value, observacao: rascunho.alternativa?.observacao ?? null, visivel: rascunho.alternativa?.visivel ?? true } : null,
                })
              }
            />
            <InputText
              value={rascunho.alternativa?.observacao ?? ""}
              maxLength={300}
              placeholder="Quando usar (opcional)"
              aria-label="Quando usar a opção"
              disabled={!rascunho.alternativa}
              onChange={(e) => rascunho.alternativa && setRascunho({ ...rascunho, alternativa: { ...rascunho.alternativa, observacao: e.target.value || null } })}
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={rascunho.alternativa?.visivel ?? true}
                disabled={!rascunho.alternativa}
                onChange={(e) => rascunho.alternativa && setRascunho({ ...rascunho, alternativa: { ...rascunho.alternativa, visivel: e.target.checked } })}
              />
              O aluno vê
            </label>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Campo rotulo="Vídeo de execução (YouTube)" dica="Link de vídeo gravado por vocês (resposta C2). O aluno vê o botão “Ver execução”.">
            <InputText
              value={rascunho.video_url ?? ""}
              maxLength={300}
              placeholder="https://www.youtube.com/watch?v=…"
              onChange={(e) => setRascunho({ ...rascunho, video_url: e.target.value.trim() || null })}
              className={`w-full ${videoInvalido ? "p-invalid" : ""}`}
              aria-label="Vídeo de execução"
            />
          </Campo>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" label="Cancelar" text onClick={onFechar} />
        <Button type="button" label="Aplicar" icon="pi pi-check" disabled={videoInvalido} onClick={() => onSalvar(rascunho)} />
      </div>
    </Dialog>
  );
}

// ↔ Trocar por alternativa da biblioteca (P2): mesmo grupo muscular,
// primeiro as que a academia do aluno comporta.
export function JanelaTroca({
  exercicio,
  biblioteca,
  equipamentosDaAcademia,
  onFechar,
  onEscolher,
}: {
  exercicio: Exercicio | null;
  biblioteca: ItemDaBiblioteca[];
  equipamentosDaAcademia: string[] | null;
  onFechar: () => void;
  onEscolher: (item: ItemDaBiblioteca) => void;
}) {
  const alternativas = useMemo(() => {
    if (!exercicio) return [];
    return biblioteca
      .filter((b) => b.grupo === exercicio.grupo && b.id !== exercicio.exercicio_id && b.nome !== exercicio.nome)
      .map((b) => ({ ...b, faltam: equipamentosQueFaltam(b.equipamentos, equipamentosDaAcademia) }))
      .sort((a, b) => a.faltam.length - b.faltam.length || a.nome.localeCompare(b.nome));
  }, [exercicio, biblioteca, equipamentosDaAcademia]);
  if (!exercicio) return null;
  return (
    <Dialog header={`Trocar: ${exercicio.nome || "exercício"}`} visible onHide={onFechar} className="w-full max-w-lg" modal>
      <p className="text-sm text-gray-600">
        Alternativas do grupo <strong>{exercicio.grupo}</strong>. Séries, repetições, carga e descanso continuam os mesmos.
      </p>
      {alternativas.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nenhuma alternativa do mesmo grupo na biblioteca.</p>
      ) : (
        <ul className="mt-3 max-h-96 divide-y divide-gray-100 overflow-y-auto">
          {alternativas.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onEscolher(a)} className="flex w-full items-center justify-between gap-3 px-2 py-2 text-left hover:bg-primary-50">
                <span>
                  <span className="block font-semibold text-gray-900">{a.nome}</span>
                  <span className="block text-xs text-gray-500">{a.equipamentos.join(", ") || "Peso corporal"}</span>
                </span>
                {a.faltam.length ? <span className="text-xs font-semibold text-atencao-700">Academia sem: {a.faltam.join(", ")}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function ResumoDoPlano({ plano }: { plano: PlanoDeTreino }) {
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3 text-sm">
      {plano.dias.map((d, i) => (
        <li key={i}>
          <p className="font-semibold text-gray-900">
            {DIAS.find((x) => x.chave === d.dia)?.nome} · {d.titulo || "Sem nome"}
          </p>
          <p className="text-gray-600">
            {d.exercicios.map((e) => `${e.nome} ${e.series ?? "—"}×${textoDasRepeticoes(e)}`).join(" · ") || "Sem exercícios"}
          </p>
        </li>
      ))}
    </ul>
  );
}

// Importar: arquivo ou texto, lido pela IA, revisado antes de aplicar.
export function JanelaImportar({
  aberta,
  programaId,
  onFechar,
  onAplicar,
}: {
  aberta: boolean;
  programaId: string;
  onFechar: () => void;
  onAplicar: (plano: PlanoDeTreino, modo: "substituir" | "acrescentar") => void;
}) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [lido, setLido] = useState<{ plano: PlanoDeTreino; comentario: string | null } | null>(null);

  function fechar() {
    setTexto("");
    setArquivo(null);
    setErro(null);
    setLido(null);
    onFechar();
  }

  async function ler() {
    setLendo(true);
    setErro(null);
    const dados = new FormData();
    if (arquivo) dados.append("arquivo", arquivo);
    else dados.append("texto", texto);
    const r = await fetch(`/api/treino/programas/${programaId}/importar`, { method: "POST", body: dados }).catch(() => null);
    const corpo = await r?.json().catch(() => null);
    setLendo(false);
    if (!r?.ok) {
      setErro(corpo?.erro ?? "Sem conexão. Tente de novo.");
      return;
    }
    setLido(corpo);
  }

  return (
    <Dialog header="Importar treino" visible={aberta} onHide={fechar} className="w-full max-w-2xl" modal>
      {!lido ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Envie o arquivo (PDF, foto, Word, Excel) ou cole o texto. A IA organiza em sessões para você revisar; nada vai ao aluno. O original fica guardado.
          </p>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,.txt"
            aria-label="Arquivo do treino"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          {!arquivo ? (
            <InputTextarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} className="w-full" placeholder="Ou cole aqui o texto do treino" aria-label="Texto do treino" />
          ) : null}
          {erro ? <Message severity="error" text={erro} className="w-full justify-start" /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={fechar} />
            <Button type="button" label="Ler treino" icon="pi pi-sparkles" loading={lendo} disabled={!arquivo && texto.trim().length < 10} onClick={ler} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {lido.comentario ? <p className="text-sm text-gray-600">{lido.comentario}</p> : null}
          <ResumoDoPlano plano={lido.plano} />
          <p className="text-xs text-gray-500">Confira tudo antes de enviar ao aluno. Calorias não são estimadas.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={fechar} />
            <Button type="button" label="Acrescentar às sessões" outlined onClick={() => { onAplicar(lido.plano, "acrescentar"); fechar(); }} />
            <Button type="button" label="Substituir as sessões" icon="pi pi-check" onClick={() => { onAplicar(lido.plano, "substituir"); fechar(); }} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

export type Rotina = { id: string; origem: string; titulo: string | null; versao: number; publicada_em: string; autor: string | null; dias: number };

// Importar rotina: um treino que o aluno já tem vira base de um novo programa.
export function JanelaRotina({ aberta, rotinas, onFechar, onEscolher }: { aberta: boolean; rotinas: Rotina[]; onFechar: () => void; onEscolher: (r: Rotina) => void }) {
  return (
    <Dialog header="Importar rotina do aluno" visible={aberta} onHide={onFechar} className="w-full max-w-lg" modal>
      <p className="text-sm text-gray-600">O treino escolhido é copiado para um novo rascunho. O original não muda.</p>
      {rotinas.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">O aluno ainda não tem treino publicado.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {rotinas.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onEscolher(r)} className="w-full px-2 py-2 text-left hover:bg-primary-50">
                <span className="block font-semibold text-gray-900">{r.titulo || (r.origem === "externa" ? "Treino enviado pelo aluno" : "Treino sem título")}</span>
                <span className="block text-xs text-gray-500">
                  {r.origem === "externa" ? "Enviado pelo aluno" : `Prescrito por ${r.autor ?? "profissional"} · versão ${r.versao}`} · {new Date(r.publicada_em).toLocaleDateString("pt-BR")} · {r.dias} {r.dias === 1 ? "sessão" : "sessões"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export type ModeloNaLista = { id: string; nome: string; compartilhado: boolean; meu: boolean; sessoes: number };

export function JanelaModelos({
  aberta,
  modelos,
  onFechar,
  onEscolher,
  onArquivar,
}: {
  aberta: boolean;
  modelos: ModeloNaLista[];
  onFechar: () => void;
  onEscolher: (m: ModeloNaLista) => void;
  onArquivar: (m: ModeloNaLista) => void;
}) {
  return (
    <Dialog header="Modelos de treino" visible={aberta} onHide={onFechar} className="w-full max-w-lg" modal>
      <p className="text-sm text-gray-600">O modelo escolhido vira um novo rascunho para este aluno.</p>
      {modelos.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nenhum modelo salvo. Use “Salvar como modelo” em um treino.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {modelos.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <button type="button" onClick={() => onEscolher(m)} className="min-w-0 flex-1 px-2 py-2 text-left hover:bg-primary-50">
                <span className="block font-semibold text-gray-900">{m.nome}</span>
                <span className="block text-xs text-gray-500">
                  {m.sessoes} {m.sessoes === 1 ? "sessão" : "sessões"} · {m.meu ? (m.compartilhado ? "meu, compartilhado" : "meu, privado") : "compartilhado"}
                </span>
              </button>
              {m.meu ? <Button type="button" icon="pi pi-inbox" text severity="danger" size="small" aria-label={`Arquivar o modelo ${m.nome}`} tooltip="Arquivar" onClick={() => onArquivar(m)} /> : null}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export function JanelaSalvarModelo({
  aberta,
  nomeInicial,
  descricao,
  onFechar,
  onSalvar,
}: {
  aberta: boolean;
  nomeInicial: string;
  descricao: string;
  onFechar: () => void;
  onSalvar: (nome: string, compartilhado: boolean) => Promise<boolean>;
}) {
  // Montada a cada abertura (key no componente pai).
  const [nome, setNome] = useState(nomeInicial);
  const [compartilhado, setCompartilhado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  return (
    <Dialog header="Salvar como modelo" visible={aberta} onHide={onFechar} className="w-full max-w-md" modal>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">{descricao}</p>
        <Campo rotulo="Nome do modelo">
          <InputText value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} className="w-full" aria-label="Nome do modelo" />
        </Campo>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={compartilhado} onChange={(e) => setCompartilhado(e.target.checked)} />
          Compartilhar com os outros profissionais
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={onFechar} />
          <Button
            type="button"
            label="Salvar modelo"
            icon="pi pi-bookmark"
            loading={salvando}
            disabled={nome.trim().length < 2}
            onClick={async () => {
              setSalvando(true);
              const ok = await onSalvar(nome.trim(), compartilhado);
              setSalvando(false);
              if (ok) onFechar();
            }}
          />
        </div>
      </div>
    </Dialog>
  );
}

export type Sugestao = { titulo: string; plano: PlanoDeTreino; avisos: string[] };

// Auxílio da IA: o pedido volta como sugestão; só entra no rascunho se o
// profissional aceitar. Nunca envia ao aluno.
export function JanelaIa({
  aberta,
  programaId,
  antesDePedir,
  onFechar,
  onAplicar,
}: {
  aberta: boolean;
  programaId: string;
  antesDePedir: () => Promise<boolean>;
  onFechar: () => void;
  onAplicar: (s: Sugestao, modo: "substituir" | "acrescentar") => void;
}) {
  const [pedido, setPedido] = useState("");
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);

  function fechar() {
    setErro(null);
    setSugestao(null);
    onFechar();
  }

  async function pedir() {
    setPedindo(true);
    setErro(null);
    // A IA lê o rascunho gravado: grava antes o que estiver pendente.
    if (!(await antesDePedir())) {
      setPedindo(false);
      setErro("Não foi possível gravar o rascunho antes do pedido.");
      return;
    }
    const r = await fetch(`/api/treino/programas/${programaId}/ia`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pedido }),
    }).catch(() => null);
    const corpo = await r?.json().catch(() => null);
    setPedindo(false);
    if (!r?.ok) {
      setErro(corpo?.erro ?? "Sem conexão. Tente de novo.");
      return;
    }
    setSugestao(corpo.sugestao);
  }

  return (
    <Dialog header="Auxílio da IA" visible={aberta} onHide={fechar} className="w-full max-w-2xl" modal>
      {!sugestao ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Peça um treino completo do zero ou um ajuste no rascunho. A IA usa o objetivo, a idade, o sexo, a academia e a biblioteca. A sugestão só entra no rascunho se você aceitar, e nada vai ao aluno sem o seu envio.
          </p>
          <InputTextarea
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full"
            aria-label="Pedido para a IA"
            placeholder="Ex.: Monte um treino ABC de hipertrofia para 3 dias por semana, com 5 exercícios por sessão."
          />
          {erro ? <Message severity="error" text={erro} className="w-full justify-start" /> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={fechar} />
            <Button type="button" label="Pedir sugestão" icon="pi pi-sparkles" loading={pedindo} disabled={pedido.trim().length < 3} onClick={pedir} />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-semibold text-gray-900">{sugestao.titulo}</p>
          {sugestao.avisos.length ? (
            <div className="rounded-xl border border-atencao-100 bg-atencao-50 p-3 text-sm text-atencao-700">
              <p className="font-semibold">Confira antes de enviar</p>
              <ul className="mt-1 list-disc pl-5">
                {sugestao.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <ResumoDoPlano plano={sugestao.plano} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" label="Descartar" text onClick={() => setSugestao(null)} />
            <Button type="button" label="Acrescentar às sessões" outlined onClick={() => { onAplicar(sugestao, "acrescentar"); fechar(); }} />
            <Button type="button" label="Substituir o rascunho" icon="pi pi-check" onClick={() => { onAplicar(sugestao, "substituir"); fechar(); }} />
          </div>
        </div>
      )}
    </Dialog>
  );
}

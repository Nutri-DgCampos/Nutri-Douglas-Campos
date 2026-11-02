"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { DIAS } from "@/lib/treino";
import { diaMes, diferencaDeCarga, formatarAdesao, rotuloDaSemana, type DadosDoRelatorio, type SessaoDoRelatorio } from "@/lib/treinoRelatorio";

type Relatorio = {
  id: string;
  patient_id: string;
  paciente: string;
  profissional: string;
  semana_inicio: string;
  semana_fim: string;
  dados: DadosDoRelatorio;
  sem_registros: boolean;
  adesao: number | null;
  adesao_minima: number;
  em_pausa: boolean;
  rascunho: string;
  rascunho_revisao: number;
  devolutiva: string | null;
  devolutiva_enviada_em: string | null;
  lida_em: string | null;
  metas_marcadas: Record<string, boolean>;
  adesao_anterior: number | null;
  pode_responder: boolean;
};

const SITUACAO: Record<SessaoDoRelatorio["situacao"], { rotulo: string; cor: string }> = {
  concluido: { rotulo: "Concluído", cor: "bg-primary-50 text-primary-800" },
  parcial: { rotulo: "Parcialmente concluído", cor: "bg-amber-100 text-amber-900" },
  nao_concluido: { rotulo: "Não concluído", cor: "bg-red-100 text-red-800" },
  reagendado: { rotulo: "Reagendado (sem confirmação)", cor: "bg-sky-100 text-sky-900" },
  sem_situacao: { rotulo: "Valores salvos, sem situação", cor: "bg-gray-100 text-gray-700" },
  sem_registro: { rotulo: "Sem registro", cor: "bg-gray-100 text-gray-600" },
};

const num = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR"));
const series = (v: { series: number | null; repeticoes: number | null; carga_kg: number | null }) =>
  `${num(v.series)} × ${num(v.repeticoes)}${v.carga_kg !== null ? ` · ${num(v.carga_kg)} kg` : ""}`;

// Relatório semanal do Treino (T3): o que o aluno registrou na semana, com a
// devolutiva do profissional. O aluno só recebe o texto enviado.
export default function RelatorioDoTreinoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [relatorio, setRelatorio] = useState<Relatorio | null | undefined>(undefined);
  const [ia, setIa] = useState(false);
  const [texto, setTexto] = useState("");
  const [gravado, setGravado] = useState<"salvo" | "salvando" | "erro" | null>(null);
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const revisao = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aplicar = useCallback((r: Relatorio | null) => {
    setRelatorio(r);
    if (r) {
      setTexto(r.devolutiva ?? r.rascunho);
      revisao.current = r.rascunho_revisao;
    }
  }, []);

  useEffect(() => {
    fetch(`/api/treino/relatorios/${params.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setIa(Boolean(d?.ia));
        aplicar(d?.relatorio ?? null);
      })
      .catch(() => aplicar(null));
  }, [params.id, aplicar]);

  async function gravar(valor: string) {
    setGravado("salvando");
    const r = await fetch(`/api/treino/relatorios/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: valor, revisao: revisao.current }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok) {
      revisao.current = d.revisao;
      setGravado("salvo");
    } else if (r?.status === 409) {
      revisao.current = d.revisao;
      setTexto(d.rascunho);
      setGravado("salvo");
      avisar("O rascunho foi substituído por uma versão mais nova.", "warn");
    } else {
      setGravado("erro");
    }
  }

  function digitar(valor: string) {
    setTexto(valor);
    setGravado(null);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => gravar(valor), 800);
  }

  async function acao(corpo: Record<string, unknown>) {
    const r = await fetch(`/api/treino/relatorios/${params.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) avisar(d?.erro ?? "Não foi possível concluir.", "error");
    return r?.ok ? d : null;
  }

  async function gerar() {
    if (texto.trim() && !(await pedirConfirmacao("Substituir o texto atual por um novo rascunho da IA?"))) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    setGerando(true);
    const d = await acao({ acao: "gerar" });
    setGerando(false);
    if (d) {
      revisao.current = d.revisao;
      setTexto(d.rascunho);
      setGravado("salvo");
      if (!d.descartada) avisar("Rascunho gerado. Revise antes de enviar.", "success");
    }
  }

  async function enviar() {
    if (!(await pedirConfirmacao("Enviar a devolutiva ao aluno? Depois de enviada, ela não pode ser alterada."))) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    setEnviando(true);
    const d = await acao({ acao: "enviar", texto });
    setEnviando(false);
    if (d) {
      aplicar(d.relatorio);
      avisar("Devolutiva enviada ao aluno.", "success");
    }
  }

  async function marcar(metaId: string, atingida: boolean | null) {
    const d = await acao({ acao: "meta", metaId, atingida });
    if (d) setRelatorio(d.relatorio);
  }

  if (relatorio === undefined) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <Skeleton height="20rem" borderRadius="16px" className="mx-auto max-w-5xl" />
      </main>
    );
  }
  if (relatorio === null) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <Message severity="warn" text="Relatório não encontrado." />
        </div>
      </main>
    );
  }

  const d = relatorio.dados;
  const enviada = relatorio.devolutiva !== null;

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <BotaoVoltar rotulo="Voltar para o aluno" onClick={() => router.push(`/treino/alunos/${relatorio.patient_id}`)} />
          <p className="text-sm font-semibold text-primary-700">
            <span className="rounded-full bg-primary-50 px-2 py-0.5">Treino</span> Relatório semanal
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{relatorio.paciente}</h1>
          <p className="text-sm text-gray-600">
            Semana de {rotuloDaSemana(relatorio.semana_inicio, relatorio.semana_fim)}
            {relatorio.pode_responder || enviada ? "" : ` · responsável: ${relatorio.profissional}`}
          </p>
        </div>

        <section className="cartao grid gap-3 p-5 sm:grid-cols-4" aria-label="Resumo da semana">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Adesão</p>
            <p className="text-2xl font-bold text-gray-900">{relatorio.sem_registros ? "—" : formatarAdesao(relatorio.adesao)}</p>
            <p className="text-xs text-gray-500">mínimo {relatorio.adesao_minima}%</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Semana anterior</p>
            <p className="text-2xl font-bold text-gray-900">{formatarAdesao(relatorio.adesao_anterior)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase text-gray-500">Sessões</p>
            <p className="text-sm text-gray-800">
              {d.contagem.planejadas} planejadas · {d.contagem.concluidas} concluídas · {d.contagem.parciais} parciais · {d.contagem.nao_concluidas} não concluídas ·{" "}
              {d.contagem.sem_registro} sem registro{d.contagem.reagendadas ? ` · ${d.contagem.reagendadas} reagendadas` : ""}
            </p>
          </div>
          {relatorio.sem_registros ? (
            <p className="rounded-lg bg-gray-100 p-2 text-sm text-gray-700 sm:col-span-4">
              <i className="pi pi-info-circle mr-1" aria-hidden />
              Sem registros nesta semana. Isso não significa que o aluno não treinou: ele não registrou.
            </p>
          ) : null}
          {relatorio.em_pausa && d.pausa ? (
            <p className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900 sm:col-span-4">
              Pausa autorizada de {rotuloDaSemana(d.pausa.inicio, d.pausa.fim)}
              {d.pausa.motivo ? ` (${d.pausa.motivo})` : ""}: esta semana não entra na lista de atenção.
            </p>
          ) : null}
        </section>

        <section className="cartao p-5" aria-label="Sessões da semana">
          <h2 className="font-bold text-gray-900">Sessões</h2>
          {d.sessoes.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Nenhuma sessão planejada nesta semana.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {d.sessoes.map((s) => (
                <li key={`${s.dia}-${s.data_planejada}`} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {DIAS.find((x) => x.chave === s.dia)?.nome} · {diaMes(s.data_planejada)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SITUACAO[s.situacao].cor}`}>
                      {SITUACAO[s.situacao].rotulo}
                      {s.data_efetiva ? ` para ${diaMes(s.data_efetiva)}` : ""}
                    </span>
                  </div>
                  {s.motivo ? <p className="mt-1 text-sm text-gray-700">Motivo: {s.motivo}</p> : null}
                  {s.observacao ? <p className="mt-1 text-sm text-gray-700">Observação do aluno: {s.observacao}</p> : null}
                  {s.exercicios.some((e) => e.registrado) ? (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[34rem] text-left text-sm">
                        <thead className="text-xs uppercase text-gray-500">
                          <tr>
                            <th className="py-1 pr-2">Exercício</th>
                            <th className="py-1 pr-2">Prescrito</th>
                            <th className="py-1 pr-2">Registrado</th>
                            <th className="py-1 pr-2">Diferença</th>
                            <th className="py-1">Anterior</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {s.exercicios.map((e, i) => {
                            const dif = diferencaDeCarga(e);
                            return (
                              <tr key={i}>
                                <td className="py-1 pr-2 text-gray-900">{e.nome}</td>
                                <td className="py-1 pr-2 text-gray-600">{series(e.prescrito)}</td>
                                <td className="py-1 pr-2 text-gray-900">{e.registrado ? series(e.registrado) : "—"}</td>
                                <td className={`py-1 pr-2 ${dif && dif.kg !== 0 ? "font-semibold text-primary-800" : "text-gray-500"}`}>
                                  {dif ? `${dif.kg > 0 ? "+" : ""}${num(dif.kg)} kg${dif.pct !== null ? ` (${dif.pct > 0 ? "+" : ""}${num(dif.pct)}%)` : ""}` : "—"}
                                </td>
                                <td className="py-1 text-gray-600">{e.anterior_kg !== null ? `${num(e.anterior_kg)} kg` : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.desconfortos.length ? (
          <section className="cartao p-5" aria-label="Desconfortos da semana">
            <h2 className="font-bold text-gray-900">Desconfortos relatados</h2>
            <ul className="mt-2 space-y-1 text-sm text-gray-800">
              {d.desconfortos.map((x, i) => (
                <li key={i}>
                  {diaMes(x.data)}: <strong>{x.regiao}</strong>, intensidade {x.intensidade}/10, {x.conduta === "parei" ? "parou o exercício" : "continuou"}
                  {x.exercicio ? ` (${x.exercicio})` : ""}
                  {x.comentario ? `. ${x.comentario}` : ""}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {d.metas.length ? (
          <section className="cartao p-5" aria-label="Metas da semana">
            <h2 className="font-bold text-gray-900">Metas</h2>
            <ul className="mt-2 space-y-2">
              {d.metas.map((m) => {
                const marcada = relatorio.metas_marcadas[m.id];
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 break-words text-gray-800">{m.texto}</span>
                    <Button
                      type="button"
                      size="small"
                      outlined={marcada !== true}
                      label="Atingida"
                      disabled={!relatorio.pode_responder}
                      onClick={() => marcar(m.id, marcada === true ? null : true)}
                    />
                    <Button
                      type="button"
                      size="small"
                      severity="danger"
                      outlined={marcada !== false}
                      label="Não atingida"
                      disabled={!relatorio.pode_responder}
                      onClick={() => marcar(m.id, marcada === false ? null : false)}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="cartao p-5" aria-label="Devolutiva">
          <h2 className="font-bold text-gray-900">Devolutiva ao aluno</h2>
          {enviada ? (
            <>
              <p className="mt-1 text-sm text-gray-500">
                Enviada em {new Date(relatorio.devolutiva_enviada_em!).toLocaleString("pt-BR")}
                {relatorio.lida_em ? " · lida pelo aluno" : " · ainda não lida"}
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-900">{relatorio.devolutiva}</p>
            </>
          ) : relatorio.pode_responder ? (
            <>
              <p className="mt-1 text-sm text-gray-600">O aluno recebe no cartão Relatórios: “Chegou a devolutiva do seu Personal Trainer”.</p>
              <InputTextarea
                value={texto}
                onChange={(e) => digitar(e.target.value)}
                rows={10}
                autoResize
                aria-label="Texto da devolutiva"
                className="mt-2 w-full"
                placeholder="Escreva a devolutiva ou gere um rascunho com a IA."
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ia ? <Button type="button" outlined icon="pi pi-sparkles" label="Gerar rascunho com IA" loading={gerando} onClick={gerar} /> : null}
                <Button type="button" icon="pi pi-send" label="Enviar devolutiva ao aluno" loading={enviando} disabled={!texto.trim() || gerando} onClick={enviar} />
                <span className="text-xs text-gray-500">
                  {gravado === "salvando" ? "Salvando..." : gravado === "salvo" ? "Rascunho salvo" : gravado === "erro" ? "Não foi possível salvar o rascunho" : ""}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-gray-500">Aguardando a devolutiva de {relatorio.profissional}.</p>
          )}
        </section>
      </div>
    </main>
  );
}

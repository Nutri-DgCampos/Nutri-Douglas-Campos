"use client";

import { Button } from "primereact/button";
import { DIAS } from "@/lib/treino";
import { ritmo, textoDaDuracao, velocidade } from "@/lib/treinoAtividades";
import { textoDosMinutos } from "@/lib/treinoEndurance";
import {
  PESOS_DA_NOTA,
  ROTULO_DA_MODALIDADE,
  diaMes,
  diferencaDeCarga,
  foraDaSemana,
  formatarAdesao,
  type DadosDoRelatorio,
  type NotaDaSemana,
  type SessaoDoRelatorio,
} from "@/lib/treinoRelatorio";

// Relatório semanal do Treino (T3b), usado pelo profissional (REL-04) e pelo
// aluno (REL-01/02/03, respostas Q6 e C3): nota, adesão e mínimo, pontos
// positivos e de atenção, sessões com o planejado e o registrado,
// desconfortos, metas e equipamentos. Só fatos; sem registro ≠ não treinou.

export type RelatorioNaTela = {
  id: string;
  modalidade?: "musculacao" | "corrida" | "ciclismo";
  semana_inicio: string;
  semana_fim: string;
  dados: DadosDoRelatorio;
  sem_registros: boolean;
  adesao: number | null;
  adesao_minima: number;
  em_pausa: boolean;
  metas_marcadas: Record<string, boolean>;
  adesao_anterior: number | null;
  nota: NotaDaSemana;
  pontos: { positivos: string[]; atencao: string[] };
};

const SITUACAO: Record<SessaoDoRelatorio["situacao"], { rotulo: string; cor: string }> = {
  concluido: { rotulo: "Concluído", cor: "bg-primary-50 text-primary-800" },
  parcial: { rotulo: "Parcialmente concluído", cor: "bg-amber-100 text-amber-900" },
  nao_concluido: { rotulo: "Não concluído", cor: "bg-red-100 text-red-800" },
  reagendado: { rotulo: "Reagendado (sem confirmação)", cor: "bg-sky-100 text-sky-900" },
  sem_situacao: { rotulo: "Valores salvos, sem situação", cor: "bg-gray-100 text-gray-700" },
  sem_registro: { rotulo: "Sem registro", cor: "bg-gray-100 text-gray-600" },
};

const num = (v: number | null | undefined, sufixo = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")}${sufixo}`);
const series = (v: { series: number | null; repeticoes: number | null; carga_kg: number | null }) =>
  `${num(v.series)} × ${num(v.repeticoes)}${v.carga_kg !== null ? ` · ${num(v.carga_kg)} kg` : ""}`;

function Situacao({ situacao, dataEfetiva, semana }: { situacao: SessaoDoRelatorio["situacao"]; dataEfetiva: string | null; semana: { inicio: string; fim: string } }) {
  if (foraDaSemana({ situacao, data_efetiva: dataEfetiva }, semana)) {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
        {situacao === "reagendado" ? `Reagendado para outra semana (${diaMes(dataEfetiva!)})` : `Feito em outra semana (${diaMes(dataEfetiva!)})`} · fora da conta
      </span>
    );
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${SITUACAO[situacao].cor}`}>
      {SITUACAO[situacao].rotulo}
      {dataEfetiva ? ` ${situacao === "reagendado" ? "para" : "em"} ${diaMes(dataEfetiva)}` : ""}
    </span>
  );
}

export default function RelatorioDaSemana({
  relatorio,
  podeMarcarMetas = false,
  onMarcarMeta,
  visaoDoAluno = false,
}: {
  relatorio: RelatorioNaTela;
  podeMarcarMetas?: boolean;
  onMarcarMeta?: (metaId: string, atingida: boolean | null) => void;
  visaoDoAluno?: boolean;
}) {
  const d = relatorio.dados;
  const modalidade = relatorio.modalidade ?? d.modalidade ?? "musculacao";
  const semana = { inicio: relatorio.semana_inicio, fim: relatorio.semana_fim };
  const e = d.endurance;
  const corrida = modalidade === "corrida";

  return (
    <div className="space-y-4">
      <section className="cartao grid gap-3 p-5 sm:grid-cols-4" aria-label="Resumo da semana">
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Nota da semana</p>
          <p className="text-2xl font-bold text-gray-900">{relatorio.nota.nota === null ? "N/A" : relatorio.nota.nota}</p>
          <p className="text-xs text-gray-500">
            {relatorio.nota.nota === null ? "Faltam dados de alguma parte" : "de 0 a 100"} · adesão {num(relatorio.nota.partes.adesao)} ({PESOS_DA_NOTA.adesao}%), metas{" "}
            {num(relatorio.nota.partes.metas)} ({PESOS_DA_NOTA.metas}%), evolução {num(relatorio.nota.partes.evolucao)} ({PESOS_DA_NOTA.evolucao}%)
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-gray-500">Adesão</p>
          <p className="text-2xl font-bold text-gray-900">{relatorio.sem_registros ? "—" : formatarAdesao(relatorio.adesao)}</p>
          <p className="text-xs text-gray-500">mínimo combinado: {relatorio.adesao_minima}% · semana anterior: {formatarAdesao(relatorio.adesao_anterior)}</p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase text-gray-500">Sessões</p>
          <p className="text-sm text-gray-800">
            {d.contagem.planejadas} planejadas · {d.contagem.concluidas} concluídas · {d.contagem.parciais} parciais · {d.contagem.nao_concluidas} não concluídas · {d.contagem.sem_registro} sem
            registro{d.contagem.reagendadas ? ` · ${d.contagem.reagendadas} reagendadas` : ""}
            {d.contagem.outra_semana ? ` · ${d.contagem.outra_semana} em outra semana (fora da conta)` : ""}
          </p>
          <p className="mt-1 text-xs text-gray-500">Calorias informadas: {d.kcal === null || d.kcal === undefined ? "não informado" : `${num(d.kcal)} kcal`}</p>
        </div>
        {relatorio.sem_registros ? (
          <p className="rounded-lg bg-gray-100 p-2 text-sm text-gray-700 sm:col-span-4">
            <i className="pi pi-info-circle mr-1" aria-hidden />
            Sem registros nesta semana. Isso não significa que {visaoDoAluno ? "você não treinou" : "o aluno não treinou"}: {visaoDoAluno ? "você não registrou" : "ele não registrou"}.
          </p>
        ) : null}
        {relatorio.em_pausa && d.pausa ? (
          <p className="rounded-lg bg-sky-50 p-2 text-sm text-sky-900 sm:col-span-4">
            Pausa autorizada de {diaMes(d.pausa.inicio)} a {diaMes(d.pausa.fim)}
            {d.pausa.motivo ? ` (${d.pausa.motivo})` : ""}: esta semana não entra na lista de atenção.
          </p>
        ) : null}
      </section>

      {e ? (
        <section className="cartao grid gap-3 p-5 sm:grid-cols-4" aria-label="Indicadores da semana">
          <Indicador rotulo="Distância" valor={`${num(e.totais.registrado_km, " km")} de ${num(e.totais.planejado_km, " km")} planejados`} />
          <Indicador rotulo="Tempo" valor={`${e.totais.registrado_segundos === null ? "—" : textoDaDuracao(e.totais.registrado_segundos)} de ${e.totais.planejado_min === null ? "—" : textoDosMinutos(e.totais.planejado_min)}`} />
          <Indicador rotulo={corrida ? "Ritmo médio" : "Velocidade média"} valor={(corrida ? ritmo : velocidade)(e.totais.registrado_km, e.totais.registrado_segundos) ?? "—"} />
          <Indicador rotulo="FC média / RPE médio" valor={`${num(e.totais.fc_media, " bpm")} · ${num(e.totais.rpe_medio)}`} />
          <Indicador rotulo="Ganho de altitude" valor={num(e.totais.elevacao_m, " m")} />
          {!corrida ? <Indicador rotulo="TSS (informado)" valor={e.totais.tss === null ? "Não informado" : num(e.totais.tss)} /> : null}
          {e.equipamentos.length ? (
            <div className="sm:col-span-2">
              <p className="text-xs font-semibold uppercase text-gray-500">{corrida ? "Tênis" : "Bicicletas"} (km acumulados)</p>
              <p className="text-sm text-gray-800">
                {e.equipamentos.map((q) => `${q.apelido}: ${num(q.km_total)} km${q.alerta_km ? ` (aviso em ${num(q.alerta_km)})` : ""}`).join(" · ")}
              </p>
            </div>
          ) : null}
          <p className="text-xs text-gray-500 sm:col-span-4">Números informados pelo aluno. Ritmo e velocidade são a conta da distância e do tempo registrados.</p>
        </section>
      ) : null}

      {relatorio.pontos.positivos.length || relatorio.pontos.atencao.length ? (
        <section className="grid gap-3 sm:grid-cols-2" aria-label="Pontos da semana">
          <div className="cartao p-5">
            <h2 className="font-bold text-primary-800">Pontos positivos</h2>
            {relatorio.pontos.positivos.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800">
                {relatorio.pontos.positivos.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">—</p>
            )}
          </div>
          <div className="cartao p-5">
            <h2 className="font-bold text-atencao-700">Pontos de atenção</h2>
            {relatorio.pontos.atencao.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-800">
                {relatorio.pontos.atencao.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-gray-500">—</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="cartao p-5" aria-label="Sessões da semana">
        <h2 className="font-bold text-gray-900">Treinos da semana · {ROTULO_DA_MODALIDADE[modalidade]}</h2>
        {e ? (
          e.sessoes.length === 0 ? (
            <p className="mt-1 text-sm text-gray-500">Nenhuma sessão planejada nem registrada.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {e.sessoes.map((s, i) => (
                <li key={i} className="rounded-xl border border-gray-200 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {s.extra
                        ? `Atividade extra · ${diaMes(s.registrado!.data)}`
                        : `${DIAS.find((x) => x.chave === s.dia)?.nome} · ${diaMes(s.data_planejada!)} · ${s.tipo}`}
                    </span>
                    {s.extra ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">Sem sessão planejada · fora da adesão</span>
                    ) : (
                      <Situacao situacao={s.situacao} dataEfetiva={s.data_efetiva} semana={semana} />
                    )}
                  </div>
                  {s.descricao ? <p className="text-gray-700">{s.descricao}</p> : null}
                  {s.planejado ? (
                    <p className="text-gray-600">
                      Planejado: {[s.planejado.distancia_km !== null ? `${num(s.planejado.distancia_km)} km` : null, s.planejado.duracao_min !== null ? textoDosMinutos(s.planejado.duracao_min) : null, s.planejado.zona]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  ) : null}
                  {s.registrado ? (
                    <p className="text-gray-900">
                      Registrado:{" "}
                      {[
                        s.registrado.distancia_km !== null ? `${num(s.registrado.distancia_km)} km` : null,
                        s.registrado.duracao_segundos !== null ? textoDaDuracao(s.registrado.duracao_segundos) : null,
                        (corrida ? ritmo : velocidade)(s.registrado.distancia_km, s.registrado.duracao_segundos),
                        s.registrado.fc_media !== null ? `FC ${s.registrado.fc_media} bpm` : null,
                        s.registrado.rpe !== null ? `RPE ${num(s.registrado.rpe)}` : null,
                        s.registrado.elevacao_m !== null ? `${num(s.registrado.elevacao_m)} m` : null,
                        s.registrado.potencia_media !== null ? `${s.registrado.potencia_media} W` : null,
                        s.registrado.tss !== null ? `TSS ${num(s.registrado.tss)}` : null,
                        s.registrado.kcal !== null ? `${num(s.registrado.kcal)} kcal` : null,
                        s.registrado.equipamento,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "sem números"}
                    </p>
                  ) : null}
                  {s.registrado?.consumos.length ? <p className="text-gray-600">Consumo: {s.registrado.consumos.join(" · ")}</p> : null}
                  {s.motivo ? <p className="text-gray-600">Motivo: {s.motivo}</p> : null}
                  {s.observacao ? <p className="text-gray-700">Observação: {s.observacao}</p> : null}
                </li>
              ))}
            </ul>
          )
        ) : d.sessoes.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">Nenhuma sessão planejada nesta semana.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {d.sessoes.map((s) => (
              <li key={`${s.dia}-${s.data_planejada}`} className="rounded-xl border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    {DIAS.find((x) => x.chave === s.dia)?.nome} · {diaMes(s.data_planejada)}
                  </span>
                  <Situacao situacao={s.situacao} dataEfetiva={s.data_efetiva} semana={semana} />
                </div>
                {s.motivo ? <p className="mt-1 text-sm text-gray-700">Motivo: {s.motivo}</p> : null}
                {s.observacao ? <p className="mt-1 text-sm text-gray-700">Observação: {s.observacao}</p> : null}
                {s.exercicios.some((x) => x.registrado) ? (
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
                        {s.exercicios.map((x, i) => {
                          const dif = diferencaDeCarga(x);
                          return (
                            <tr key={i}>
                              <td className="py-1 pr-2 text-gray-900">{x.nome}</td>
                              <td className="py-1 pr-2 text-gray-600">{series(x.prescrito)}</td>
                              <td className="py-1 pr-2 text-gray-900">{x.registrado ? series(x.registrado) : "—"}</td>
                              <td className={`py-1 pr-2 ${dif && dif.kg !== 0 ? "font-semibold text-primary-800" : "text-gray-500"}`}>
                                {dif ? `${dif.kg > 0 ? "+" : ""}${num(dif.kg)} kg${dif.pct !== null ? ` (${dif.pct > 0 ? "+" : ""}${num(dif.pct)}%)` : ""}` : "—"}
                              </td>
                              <td className="py-1 text-gray-600">{x.anterior_kg !== null ? `${num(x.anterior_kg)} kg` : "—"}</td>
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
                  {podeMarcarMetas && onMarcarMeta ? (
                    <>
                      <Button type="button" size="small" outlined={marcada !== true} label="Atingida" onClick={() => onMarcarMeta(m.id, marcada === true ? null : true)} />
                      <Button type="button" size="small" severity="danger" outlined={marcada !== false} label="Não atingida" onClick={() => onMarcarMeta(m.id, marcada === false ? null : false)} />
                    </>
                  ) : (
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${marcada === true ? "bg-primary-50 text-primary-800" : marcada === false ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}`}
                    >
                      {marcada === true ? "Atingida" : marcada === false ? "Não atingida" : "Ainda não avaliada"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-gray-500">{rotulo}</p>
      <p className="text-sm font-semibold text-gray-900">{valor}</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import InfoMetodo from "@/components/nutricao/InfoMetodo";
import {
  AVATARES,
  CAMPOS_BIOIMPEDANCIA,
  CLASSES_GORDURA,
  CORES_EVOLUCAO,
  DESCRICAO_GALLAGHER,
  DOBRAS,
  PERIMETRIA,
  PROTOCOLOS_DOBRAS,
  RECORTE_SILHUETA,
  SETAS_PERIMETRIA,
  dobrasDoProtocolo,
  evolucaoDaRegiao,
  type CampoBio,
  type Evolucao,
  type Regiao,
  type Sexo,
} from "@/lib/nutricao/avaliacao";
import type { AvaliacaoDoc, ResultadoAvaliacao } from "@/lib/nutricao/avaliacaoDocumento";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirDocumento } from "@/lib/visualizador";

type Ponto = {
  id: string;
  data: string;
  status: string;
  peso: number | null;
  percentualGordura: number | null;
  massaGorda: number | null;
  massaLivre: number | null;
  metodo: "dobras" | "bioimpedancia" | null;
  perimetria: AvaliacaoDoc["perimetria"];
};

type Dados = {
  avaliacao: { id: string; data: string; status: string; documento: AvaliacaoDoc };
  paciente: { nome: string; sexo: Sexo | null; idade: number | null };
  consulta: { data: string } | null;
  resultados: ResultadoAvaliacao;
  historico: Ponto[];
};

const n = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

const CORES = CORES_EVOLUCAO;
const SETAS = SETAS_PERIMETRIA;
const TEXTO_EVOLUCAO: Record<Evolucao, string> = { diminuiu: "diminuiu", aumentou: "aumentou", igual: "igual", sem_comparacao: "sem comparação" };

function AvatarPerimetria({ sexo, evolucoes }: { sexo: Sexo; evolucoes: Record<Regiao, Evolucao> }) {
  const imagem = sexo === "feminino" ? "/nutricao/avatares/silhueta-feminina.png" : "/nutricao/avatares/silhueta-masculina.png";
  return (
    <svg viewBox={RECORTE_SILHUETA.join(" ")} className="h-auto w-full max-w-[18rem]" role="img" aria-label="Avatar com a evolução da perimetria">
      <defs>
        {Object.entries(CORES).map(([chave, cor]) => (
          <marker key={chave} id={`seta-${chave}`} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={cor} />
          </marker>
        ))}
      </defs>
      <image href={imagem} x="0" y="0" width="1024" height="1536" />
      {(Object.keys(SETAS) as Regiao[]).map((regiao) => {
        const [y, x1, x2, numero] = SETAS[regiao];
        const ev = evolucoes[regiao];
        const cor = CORES[ev];
        return (
          <g key={regiao}>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={cor} strokeWidth="9" markerStart={`url(#seta-${ev})`} markerEnd={`url(#seta-${ev})`} />
            <circle cx={(x1 + x2) / 2} cy={y} r="20" fill={cor} />
            <text x={(x1 + x2) / 2} y={y + 9} textAnchor="middle" fontSize="26" fontWeight="700" fill="white">
              {numero}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function AvataresDeGordura({ sexo, indice, foraDaEscala, percentual }: { sexo: Sexo; indice: number; foraDaEscala: boolean; percentual: number }) {
  const imagem = sexo === "feminino" ? "/nutricao/avatares/percentual-gordura-feminino.png" : "/nutricao/avatares/percentual-gordura-masculino.png";
  // 13 avatares igualmente espaçados numa imagem de 2171 px.
  const centro = ((104 + indice * 163.8) / 2171) * 100;
  const largura = (150 / 2171) * 100;
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="relative min-w-[40rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagem} alt={`Avatares de percentual de gordura (${AVATARES[sexo].join(", ")}%)`} className="block w-full" />
          <div
            className="pointer-events-none absolute rounded-[2rem] border-4 border-red-600"
            style={{ left: `${centro - largura / 2}%`, width: `${largura}%`, top: "14%", height: "82%" }}
            aria-hidden
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Representação ilustrativa: destaque no avatar de {AVATARES[sexo][indice]}%, o mais próximo de {n(percentual)}%
        {foraDaEscala ? " (resultado fora da escala ilustrativa)" : ""}. Pessoas com o mesmo percentual podem ter aparências diferentes.
      </p>
    </div>
  );
}

function GraficoColunas({ titulo, unidade, pontos, cor }: { titulo: string; unidade: string; pontos: { data: string; valor: number | null; metodo?: string | null }[]; cor: string }) {
  const validos = pontos.filter((p) => p.valor !== null) as { data: string; valor: number; metodo?: string | null }[];
  const maximo = Math.max(...validos.map((p) => p.valor), 1);
  const metodos = new Set(pontos.map((p) => p.metodo).filter(Boolean));
  return (
    <figure className="cartao p-3">
      <figcaption className="mb-2 font-semibold text-gray-900">
        {titulo} ({unidade})
      </figcaption>
      {validos.length === 0 ? (
        <p className="text-sm text-gray-500">Sem resultados.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="flex h-44 min-w-max items-end gap-2">
            {pontos.map((p) => (
              <div key={p.data} className="flex w-14 flex-col items-center justify-end" title={`${formatarData(p.data)}: ${p.valor === null ? "sem resultado" : `${n(p.valor)} ${unidade}`}`}>
                <span className="mb-0.5 text-xs font-semibold tabular-nums text-gray-800">{p.valor === null ? "—" : n(p.valor)}</span>
                {p.valor === null ? (
                  <div className="h-1 w-10 rounded bg-gray-200" />
                ) : (
                  <div className="w-10 rounded-t" style={{ height: `${Math.max((p.valor / maximo) * 120, 4)}px`, backgroundColor: cor }} />
                )}
                <span className="mt-1 text-[10px] text-gray-500">{formatarData(p.data).slice(0, 5) + formatarData(p.data).slice(5).replace(/^\/20/, "/")}</span>
                {p.metodo ? <span className="text-[9px] uppercase text-gray-400">{p.metodo === "dobras" ? "dobras" : "bioimp."}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}
      {metodos.size > 1 ? <p className="mt-1 text-xs text-amber-700">Métodos diferentes entre avaliações: não são diretamente equivalentes.</p> : null}
    </figure>
  );
}

export default function ResultadosDaAvaliacao({ avaliacaoId, voltar }: { avaliacaoId: string; voltar: () => void }) {
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/nutricao/avaliacoes/${avaliacaoId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setDados)
      .catch(() => setDados(null));
  }, [avaliacaoId]);

  if (dados === undefined) return <Skeleton height="20rem" />;
  if (dados === null) return <p>Avaliação não encontrada.</p>;

  const { avaliacao, paciente, resultados: r } = dados;
  const doc = avaliacao.documento;
  const historico = dados.historico.slice(-12);
  const anteriores = dados.historico.filter((p) => p.id !== avaliacao.id).reverse();
  const evolucoes = Object.fromEntries(
    (Object.keys(PERIMETRIA) as Regiao[]).map((k) => [k, evolucaoDaRegiao(doc.perimetria[k], anteriores.map((p) => p.perimetria?.[k])).evolucao])
  ) as Record<Regiao, Evolucao>;
  const protocolo = doc.dobras.protocolo && paciente.sexo ? PROTOCOLOS_DOBRAS[doc.dobras.protocolo].porSexo[paciente.sexo] : null;
  const sitios = doc.dobras.protocolo && paciente.sexo ? dobrasDoProtocolo(doc.dobras.protocolo, paciente.sexo, doc.dobras.versaoSlaughter) : [];
  const camposBio = (Object.keys(CAMPOS_BIOIMPEDANCIA) as CampoBio[]).filter((k) => doc.bioimpedancia.valores[k] !== null && doc.bioimpedancia.valores[k] !== undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-arrow-left" label="Voltar à avaliação" text onClick={voltar} />
        <Button type="button" icon="pi pi-file-pdf" label="PDF" outlined onClick={() => abrirDocumento(`/api/nutricao/avaliacoes/${avaliacaoId}/pdf`)} />
      </div>

      <div className="cartao grid gap-2 p-4 text-sm sm:grid-cols-5">
        <div className="sm:col-span-2">
          <p className="text-xs text-gray-500">Nome</p>
          <p className="font-bold text-gray-900">{paciente.nome}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Data da avaliação</p>
          <p className="font-semibold">{formatarData(avaliacao.data)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Peso</p>
          <p className="font-semibold">{n(doc.peso, 2)} kg</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Altura</p>
          <p className="font-semibold">{n(doc.alturaCm, 1)} cm</p>
        </div>
        {dados.consulta ? <p className="text-xs text-gray-500 sm:col-span-5">Consulta de {formatarData(dados.consulta.data)}</p> : null}
        {avaliacao.status !== "finalizada" ? (
          <p className="rounded bg-amber-50 p-2 text-sm font-semibold text-amber-800 sm:col-span-5">Resultados preliminares: avaliação ainda não finalizada.</p>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="cartao p-4">
          <h2 className="mb-3 text-lg font-bold text-gray-900">Composição corporal</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Percentual de gordura</p>
              <p className="text-2xl font-bold">{r.percentualGordura === null ? "—" : `${n(r.percentualGordura)}%`}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Massa de gordura</p>
              <p className="text-2xl font-bold">{r.massaGorda === null ? "—" : `${n(r.massaGorda)} kg`}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Massa livre de gordura</p>
              <p className="text-2xl font-bold">{r.massaLivre === null ? "—" : `${n(r.massaLivre)} kg`}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">IMC</p>
              <p className="text-2xl font-bold">{n(r.imc)}</p>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Origem: {r.metodoComposicao === "dobras" ? `dobras cutâneas — ${protocolo?.nome ?? ""}` : r.metodoComposicao === "bioimpedancia" ? "exame de bioimpedância" : "sem resultado de composição"}
          </p>
          <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-gray-900">
              Faixa de Referência de Gordura Corporal <InfoMetodo descricao={DESCRICAO_GALLAGHER} />
            </p>
            {r.referencia ? (
              <p className="mt-1">
                {r.referencia.faixaEtaria}: adequada de {r.referencia.adequadoDe}% a menos de {r.referencia.adequadoAte}%.
                {r.classe ? <strong className="ml-1">{CLASSES_GORDURA[r.classe]}.</strong> : null}
                <span className="block text-xs text-gray-500">Indicação informativa: não substitui a interpretação do nutricionista.</span>
              </p>
            ) : (
              <p className="mt-1">Referência não disponível para esta idade.</p>
            )}
          </div>

          {sitios.length ? (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-900">Dobras cutâneas (mm) — {protocolo?.nome}</h3>
              <table className="mt-1 w-full text-sm tabular-nums">
                <tbody>
                  {sitios.map((s) => (
                    <tr key={s} className="border-t border-gray-100">
                      <td className="py-1 text-gray-600">{DOBRAS[s]}</td>
                      <td className="py-1 text-right">{n(doc.dobras.valores[s])}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200 font-semibold">
                    <td className="py-1">Soma das dobras</td>
                    <td className="py-1 text-right">{n(r.dobras.soma)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : null}

          {camposBio.length ? (
            <div className="mt-4">
              <h3 className="font-semibold text-gray-900">Bioimpedância</h3>
              <table className="mt-1 w-full text-sm tabular-nums">
                <tbody>
                  {camposBio.map((k) => (
                    <tr key={k} className="border-t border-gray-100">
                      <td className="py-1 text-gray-600">{CAMPOS_BIOIMPEDANCIA[k].nome}</td>
                      <td className="py-1 text-right">
                        {n(doc.bioimpedancia.valores[k], 2)}{" "}
                        {k === "agua_corporal" ? doc.bioimpedancia.aguaUnidade : k === "gordura_visceral" ? doc.bioimpedancia.gorduraVisceralEscala : k === "massa_visceral" ? doc.bioimpedancia.massaVisceralUnidade : CAMPOS_BIOIMPEDANCIA[k].unidade}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="cartao p-4">
          <h2 className="mb-3 text-lg font-bold text-gray-900">Perimetria</h2>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
            {paciente.sexo ? <AvatarPerimetria sexo={paciente.sexo} evolucoes={evolucoes} /> : <p className="text-sm text-gray-500">Cadastre o sexo para ver o avatar.</p>}
            <table className="w-full self-start text-sm tabular-nums">
              <tbody>
                {(Object.keys(PERIMETRIA) as Regiao[]).map((k) => {
                  const ev = evolucaoDaRegiao(doc.perimetria[k], anteriores.map((p) => p.perimetria?.[k]));
                  return (
                    <tr key={k} className="border-t border-gray-100">
                      <td className="py-1 pr-2 text-gray-600">
                        <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: CORES[ev.evolucao] }}>
                          {SETAS[k][3]}
                        </span>
                        {PERIMETRIA[k]}
                      </td>
                      <td className="whitespace-nowrap py-1 text-right font-semibold">{doc.perimetria[k] ? `${n(doc.perimetria[k])} cm` : "—"}</td>
                      <td className="whitespace-nowrap py-1 pl-2 text-right text-xs" style={{ color: CORES[ev.evolucao] }}>
                        {ev.diferenca === null ? TEXTO_EVOLUCAO[ev.evolucao] : `${ev.diferenca > 0 ? "+" : ""}${n(ev.diferenca)} cm`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Setas: verde diminuiu, vermelho aumentou, cinza igual ou sem medida anterior. A cor indica só a variação, não melhora ou piora.
          </p>
        </section>
      </div>

      <section className="cartao p-4">
        <h2 className="mb-3 text-lg font-bold text-gray-900">Percentual de gordura — referência visual</h2>
        {r.avatar && paciente.sexo && r.percentualGordura !== null ? (
          <AvataresDeGordura sexo={paciente.sexo} indice={r.avatar.indice} foraDaEscala={r.avatar.foraDaEscala} percentual={r.percentualGordura} />
        ) : (
          <p className="text-sm text-gray-500">Resultado de percentual de gordura indisponível.</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <GraficoColunas titulo="Comparativo de peso total" unidade="kg" cor="#2563eb" pontos={historico.map((p) => ({ data: p.data, valor: p.peso }))} />
        <GraficoColunas titulo="Comparativo de massa livre de gordura" unidade="kg" cor="#92400e" pontos={historico.map((p) => ({ data: p.data, valor: p.massaLivre, metodo: p.metodo }))} />
        <GraficoColunas titulo="Comparativo de massa de gordura" unidade="kg" cor="#15803d" pontos={historico.map((p) => ({ data: p.data, valor: p.massaGorda, metodo: p.metodo }))} />
        <GraficoColunas titulo="Comparativo de percentual de gordura" unidade="%" cor="#dc2626" pontos={historico.map((p) => ({ data: p.data, valor: p.percentualGordura, metodo: p.metodo }))} />
      </div>

      <section className="cartao p-4">
        <h2 className="mb-3 text-lg font-bold text-gray-900">Histórico de perimetria (cm)</h2>
        <div className="overflow-x-auto">
          <table className="min-w-max text-sm tabular-nums">
            <thead>
              <tr className="bg-primary-700 text-white">
                <th className="sticky left-0 bg-primary-700 px-3 py-2 text-left">Região</th>
                {historico.map((p) => (
                  <th key={p.id} className="px-3 py-2 text-right">
                    {formatarData(p.data)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(PERIMETRIA) as Regiao[]).map((k, i) => (
                <tr key={k} className={i % 2 ? "bg-gray-50" : "bg-white"}>
                  <td className={`sticky left-0 px-3 py-1.5 text-gray-700 ${i % 2 ? "bg-gray-50" : "bg-white"}`}>{PERIMETRIA[k]}</td>
                  {historico.map((p) => (
                    <td key={p.id} className="px-3 py-1.5 text-right">
                      {p.perimetria?.[k] ? n(p.perimetria[k]) : "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-xs text-gray-500">Até as 12 avaliações mais recentes até esta data; o histórico completo fica guardado.</p>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { InputNumber } from "primereact/inputnumber";
import { Skeleton } from "primereact/skeleton";
import { avisar } from "@/lib/avisos";
import { DIAS, SITUACOES, type ExercicioRegistrado, type SessaoRegistrada, type SituacaoDaSessao } from "@/lib/treino";
import { ritmo, rotuloDoConsumo, tenisNoLimite, textoDaDuracao, velocidade, type Atividade, type Equipamento } from "@/lib/treinoAtividades";

// Profissional: o que o aluno registrou (sessões da semana, situação,
// observações) e o histórico completo de cargas por exercício. O aluno vê
// só a carga anterior; o histórico fica aqui.

type Sessao = SessaoRegistrada & { nomes: Record<number, string> };
type Cargas = Record<string, { nome: string; pontos: { data: string; carga_kg: number; series: number | null; repeticoes: number | null }[] }>;

const ROTULOS = Object.fromEntries(SITUACOES.map((s) => [s.valor, s.rotulo])) as Record<SituacaoDaSessao, string>;
const NOME_DO_DIA = Object.fromEntries(DIAS.map((d) => [d.chave, d.nome]));

function data(iso: string) {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

function numeros(e: ExercicioRegistrado) {
  const partes = [
    e.series !== null && e.repeticoes !== null ? `${e.series}×${e.repeticoes}` : e.series !== null ? `${e.series} séries` : null,
    e.carga_kg !== null ? `${e.carga_kg.toLocaleString("pt-BR")} kg` : null,
    e.descanso_segundos !== null ? `${e.descanso_segundos} s` : null,
  ].filter(Boolean);
  return partes.join(" · ") || "—";
}

type AtividadeNaTela = Atividade & { id: string; equipamento: string | null; registrada_em: string };

type Dados = {
  sessoes: Sessao[];
  cargas: Cargas;
  prescricao: { origem: string; versao: number; publicada_em: string } | null;
  atividades: AtividadeNaTela[];
  equipamentos: Equipamento[];
};

const VAZIO: Dados = { sessoes: [], cargas: {}, prescricao: null, atividades: [], equipamentos: [] };

export default function RegistrosDoTreino({ pacienteId }: { pacienteId: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [limites, setLimites] = useState<Record<string, number | null>>({});

  useEffect(() => {
    fetch(`/api/treino/registros/${pacienteId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDados(d ?? VAZIO))
      .catch(() => setDados(VAZIO));
  }, [pacienteId]);

  // Limite de troca do tênis (R1): o profissional ajusta por aluno e por tênis.
  async function salvarLimite(e: Equipamento) {
    const r = await fetch(`/api/treino/alunos/${pacienteId}/equipamentos/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alerta_km: limites[e.id] }),
    }).catch(() => null);
    if (!r?.ok) {
      avisar((await r?.json().catch(() => null))?.erro ?? "Não foi possível salvar o limite.", "error");
      return;
    }
    const { equipamentos } = await r.json();
    setDados((d) => (d ? { ...d, equipamentos } : d));
    setLimites((l) => {
      const novo = { ...l };
      delete novo[e.id];
      return novo;
    });
    avisar("Limite do tênis salvo.", "success");
  }

  if (dados === null) return <Skeleton height="10rem" borderRadius="16px" />;

  const cargas = Object.values(dados.cargas).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="space-y-4">
      {dados.prescricao ? (
        <p className="text-sm text-gray-600">
          Treino vigente:{" "}
          <span className="font-semibold">
            {dados.prescricao.origem === "externa" ? "enviado pelo aluno (origem externa)" : "prescrito no app"}
          </span>
          , versão {dados.prescricao.versao}, desde {data(dados.prescricao.publicada_em)}. Os números que o aluno registra não alteram o treino.
        </p>
      ) : null}

      <section className="cartao p-5" aria-label="Registros do aluno">
        <h2 className="font-bold text-gray-900">Registros do aluno</h2>
        {dados.sessoes.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">O aluno ainda não registrou nenhum treino.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {dados.sessoes.slice(0, 30).map((sessao) => (
              <li key={sessao.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-gray-900">
                    {NOME_DO_DIA[sessao.dia]}, {data(sessao.data_planejada)}
                  </span>
                  <span className={sessao.situacao ? "font-semibold text-primary-700" : "text-gray-500"}>
                    {sessao.situacao ? ROTULOS[sessao.situacao] : "Números salvos, sem situação informada"}
                    {sessao.situacao === "reagendado" && sessao.data_efetiva ? ` para ${data(sessao.data_efetiva)}` : ""}
                  </span>
                </div>
                {sessao.motivo ? <p className="text-gray-600">Motivo: {sessao.motivo}</p> : null}
                {sessao.observacao ? <p className="whitespace-pre-line text-gray-700">Observação: {sessao.observacao}</p> : null}
                {sessao.kcal !== null && sessao.kcal !== undefined ? <p className="text-gray-600">Calorias informadas: {sessao.kcal.toLocaleString("pt-BR")} kcal</p> : null}
                {sessao.exercicios.length ? (
                  <ul className="mt-1 text-gray-600">
                    {sessao.exercicios.map((e) => (
                      <li key={e.indice}>
                        {sessao.nomes[e.indice]}: {numeros(e)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao p-5" aria-label="Corrida e ciclismo do aluno">
        <h2 className="font-bold text-gray-900">Corrida e ciclismo</h2>
        <p className="text-xs text-gray-500">Números informados pelo aluno (relógio, app ou de cabeça). Ritmo e velocidade são a conta da distância e do tempo informados.</p>
        {dados.atividades.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma corrida ou pedal registrado nas últimas 12 semanas.</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {dados.atividades.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold text-gray-900">
                    {a.modalidade === "corrida" ? "Corrida" : "Pedal"}, {data(a.data)}
                  </span>
                  <span className={a.situacao ? "font-semibold text-primary-700" : "text-gray-500"}>
                    {a.situacao ? ROTULOS[a.situacao] : "Sem situação informada"}
                    {a.situacao === "reagendado" && a.data_efetiva ? ` para ${data(a.data_efetiva)}` : ""}
                  </span>
                  {a.equipamento ? <span className="text-gray-500">{a.equipamento}</span> : null}
                </div>
                <p className="text-gray-700">
                  {[
                    a.distancia_km !== null ? `${a.distancia_km.toLocaleString("pt-BR")} km` : null,
                    a.duracao_segundos !== null ? textoDaDuracao(a.duracao_segundos) : null,
                    a.modalidade === "corrida" ? ritmo(a.distancia_km, a.duracao_segundos) : velocidade(a.distancia_km, a.duracao_segundos),
                    a.fc_media !== null ? `FC média ${a.fc_media} bpm` : null,
                    a.fc_max !== null ? `FC máx. ${a.fc_max} bpm` : null,
                    a.rpe !== null ? `RPE ${a.rpe.toLocaleString("pt-BR")}` : null,
                    a.elevacao_m !== null ? `${a.elevacao_m.toLocaleString("pt-BR")} m de subida` : null,
                    a.potencia_media !== null ? `${a.potencia_media} W méd.` : null,
                    a.potencia_normalizada !== null ? `${a.potencia_normalizada} W norm.` : null,
                    a.cadencia_media !== null ? `${a.cadencia_media} rpm` : null,
                    a.tss !== null ? `TSS ${a.tss.toLocaleString("pt-BR")}` : null,
                    a.kcal !== null ? `${a.kcal.toLocaleString("pt-BR")} kcal` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Sem números informados"}
                </p>
                {a.motivo ? <p className="text-gray-600">Motivo: {a.motivo}</p> : null}
                {a.consumos.length ? <p className="text-gray-600">Consumo: {a.consumos.map(rotuloDoConsumo).join(" · ")}</p> : null}
                {a.observacao ? <p className="whitespace-pre-line text-gray-700">Observação: {a.observacao}</p> : null}
              </li>
            ))}
          </ul>
        )}

        {dados.equipamentos.length ? (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h3 className="text-sm font-bold text-gray-900">Tênis e bicicletas</h3>
            <p className="text-xs text-gray-500">Quilometragem = km que o aluno já tinha + distâncias registradas com cada um. Bicicleta não tem aviso de desgaste.</p>
            <ul className="mt-2 space-y-2 text-sm">
              {dados.equipamentos.map((e) => (
                <li key={e.id} className={`flex flex-wrap items-center gap-2 ${e.aposentado_em ? "opacity-60" : ""}`}>
                  <span className="font-semibold text-gray-900">{e.apelido}</span>
                  <span className="text-gray-500">
                    {e.tipo === "tenis" ? "Tênis" : "Bicicleta"}
                    {[e.marca, e.modelo].filter(Boolean).length ? ` · ${[e.marca, e.modelo].filter(Boolean).join(" ")}` : ""}
                    {e.aposentado_em ? " · aposentado" : ""}
                  </span>
                  <span className={`tabular-nums ${tenisNoLimite(e) ? "font-semibold text-atencao-700" : "text-gray-700"}`}>{e.km_total.toLocaleString("pt-BR")} km</span>
                  {e.tipo === "tenis" ? (
                    <span className="ml-auto flex items-center gap-1 text-xs text-gray-600">
                      Avisar em
                      <InputNumber
                        value={limites[e.id] !== undefined ? limites[e.id] : e.alerta_km}
                        onValueChange={(v) => setLimites((l) => ({ ...l, [e.id]: v.value ?? null }))}
                        min={1}
                        max={10000}
                        suffix=" km"
                        locale="pt-BR"
                        inputClassName="w-24 p-inputtext-sm text-right"
                        aria-label={`Limite de troca do tênis ${e.apelido}`}
                      />
                      {limites[e.id] !== undefined ? <Button type="button" size="small" label="Salvar" onClick={() => salvarLimite(e)} /> : null}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="cartao p-5" aria-label="Histórico de cargas">
        <h2 className="font-bold text-gray-900">Histórico de cargas</h2>
        {cargas.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">Nenhuma carga registrada.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                  <th className="py-2 pr-3 font-semibold">Exercício</th>
                  <th className="py-2 font-semibold">Cargas registradas (mais recente primeiro)</th>
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) => (
                  <tr key={c.nome} className="border-b border-gray-100 align-top last:border-0">
                    <td className="py-2 pr-3 font-semibold text-gray-900">{c.nome}</td>
                    <td className="py-2 text-gray-700">
                      {c.pontos
                        .slice(0, 12)
                        .map((p) => `${data(p.data).slice(0, 5)}: ${p.carga_kg.toLocaleString("pt-BR")} kg`)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

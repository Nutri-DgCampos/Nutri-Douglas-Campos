"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { diaMes, formatarAdesao, rotuloDaSemana } from "@/lib/treinoRelatorio";

type Dados = {
  acompanhamento: { adesao_minima: number; inicio: string } | null;
  adesao_padrao: number;
  metas: { id: string; texto: string; ativa: boolean }[];
  pausas: { id: string; inicio: string; fim: string; motivo: string | null }[];
  relatorios: {
    id: string;
    semana_inicio: string;
    semana_fim: string;
    profissional: string;
    sem_registros: boolean;
    adesao: number | null;
    em_pausa: boolean;
    respondido: boolean;
    meu: boolean;
  }[];
};

// Acompanhamento semanal do aluno pelo profissional conectado (T3):
// relatório só para quem está "com acompanhamento" (B3), adesão mínima (B4),
// metas em texto livre (B5), pausas (B6) e os relatórios das semanas.
export default function AcompanhamentoSemanal({ alunoId, admin }: { alunoId: string; admin: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [minimo, setMinimo] = useState("");
  const [meta, setMeta] = useState("");
  const [pausa, setPausa] = useState({ inicio: "", fim: "", motivo: "" });
  const [salvando, setSalvando] = useState<string | null>(null);

  const endereco = `/api/treino/alunos/${alunoId}/acompanhamento`;
  const aplicar = useCallback((d: Dados | null) => {
    setDados(d);
    if (d) setMinimo(String(d.acompanhamento?.adesao_minima ?? d.adesao_padrao));
  }, []);

  useEffect(() => {
    fetch(endereco, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(aplicar)
      .catch(() => aplicar(null));
  }, [endereco, aplicar]);

  async function enviar(acao: string, corpo: Record<string, unknown> = {}, mensagem?: string) {
    setSalvando(acao);
    const r = await fetch(endereco, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, ...corpo }) }).catch(() => null);
    setSalvando(null);
    const resposta = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(resposta?.erro ?? "Não foi possível salvar.", "error");
      return false;
    }
    aplicar(resposta);
    if (mensagem) avisar(mensagem, "success");
    return true;
  }

  if (!dados) return null;
  const ativo = dados.acompanhamento;
  const metasAtivas = dados.metas.filter((m) => m.ativa);

  return (
    <section className="cartao space-y-4 p-5" aria-label="Acompanhamento semanal">
      <div>
        <h2 className="font-bold text-gray-900">Acompanhamento semanal</h2>
        <p className="mt-1 text-sm text-gray-600">
          {ativo
            ? `Ativo desde a semana de ${diaMes(ativo.inicio)}. A semana fecha no sábado e o relatório chega no domingo.`
            : "Sem acompanhamento: este aluno não gera relatório semanal para você."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm font-semibold text-gray-700">
          Adesão mínima (%)
          <InputText
            value={minimo}
            onChange={(e) => setMinimo(e.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            aria-label="Adesão mínima (%)"
            className="mt-1 block w-24"
          />
        </label>
        {ativo ? (
          <>
            <Button
              type="button"
              outlined
              label="Salvar mínimo"
              loading={salvando === "minimo"}
              disabled={Number(minimo) === ativo.adesao_minima}
              onClick={() => enviar("minimo", { adesaoMinima: Number(minimo) }, "Adesão mínima salva.")}
            />
            <Button
              type="button"
              text
              severity="danger"
              label="Desativar"
              loading={salvando === "desativar"}
              onClick={async () => {
                if (await pedirConfirmacao("Desativar o acompanhamento semanal? Os relatórios já gerados continuam guardados.")) {
                  await enviar("desativar", {}, "Acompanhamento desativado.");
                }
              }}
            />
          </>
        ) : (
          <Button
            type="button"
            icon="pi pi-check"
            label="Ativar acompanhamento semanal"
            loading={salvando === "ativar"}
            onClick={() => enviar("ativar", { adesaoMinima: Number(minimo) }, "Acompanhamento semanal ativado.")}
          />
        )}
      </div>
      <p className="text-xs text-gray-500">
        Baixa adesão = abaixo deste mínimo. Parcialmente concluído vale meia sessão; reagendado só conta quando o aluno confirma que fez.
      </p>

      <div>
        <h3 className="text-sm font-bold text-gray-900">Metas</h3>
        {metasAtivas.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">Nenhuma meta. Você marca em cada relatório se a meta foi atingida.</p>
        ) : (
          <ul className="mt-1 divide-y divide-gray-100">
            {metasAtivas.map((m) => (
              <li key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 break-words text-gray-800">{m.texto}</span>
                <Button type="button" text size="small" label="Encerrar" onClick={() => enviar("encerrar_meta", { id: m.id }, "Meta encerrada.")} />
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex gap-2">
          <InputText value={meta} onChange={(e) => setMeta(e.target.value)} maxLength={500} placeholder="Ex.: treinar 4 vezes na semana" aria-label="Nova meta" className="min-w-0 flex-1" />
          <Button
            type="button"
            outlined
            icon="pi pi-plus"
            aria-label="Adicionar meta"
            loading={salvando === "nova_meta"}
            disabled={!meta.trim()}
            onClick={async () => {
              if (await enviar("nova_meta", { texto: meta }, "Meta adicionada.")) setMeta("");
            }}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900">Pausas (férias, lesão, viagem)</h3>
        <p className="text-xs text-gray-500">A semana com pausa não entra na lista de atenção.</p>
        {dados.pausas.length ? (
          <ul className="mt-1 divide-y divide-gray-100">
            {dados.pausas.map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 text-gray-800">
                  {rotuloDaSemana(p.inicio, p.fim)}
                  {p.motivo ? ` · ${p.motivo}` : ""}
                </span>
                <Button
                  type="button"
                  text
                  size="small"
                  severity="danger"
                  icon="pi pi-trash"
                  aria-label={`Excluir pausa de ${rotuloDaSemana(p.inicio, p.fim)}`}
                  onClick={async () => {
                    if (await pedirConfirmacao("Excluir esta pausa?")) await enviar("excluir_pausa", { id: p.id }, "Pausa excluída.");
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[auto_auto_1fr_auto]">
          <input type="date" aria-label="Início da pausa" value={pausa.inicio} onChange={(e) => setPausa({ ...pausa, inicio: e.target.value })} className="p-inputtext" />
          <input type="date" aria-label="Fim da pausa" value={pausa.fim} onChange={(e) => setPausa({ ...pausa, fim: e.target.value })} className="p-inputtext" />
          <InputText value={pausa.motivo} onChange={(e) => setPausa({ ...pausa, motivo: e.target.value })} maxLength={200} placeholder="Motivo (opcional)" aria-label="Motivo da pausa" className="min-w-0" />
          <Button
            type="button"
            outlined
            label="Registrar pausa"
            loading={salvando === "nova_pausa"}
            disabled={!pausa.inicio || !pausa.fim}
            onClick={async () => {
              if (await enviar("nova_pausa", pausa, "Pausa registrada.")) setPausa({ inicio: "", fim: "", motivo: "" });
            }}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900">Relatórios semanais</h3>
        {dados.relatorios.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">Nenhum relatório fechado ainda.</p>
        ) : (
          <ul className="mt-1 divide-y divide-gray-100">
            {dados.relatorios.map((r) => (
              <li key={r.id}>
                <Link href={`/treino/relatorios/${r.id}`} className="flex items-center gap-2 py-2 text-sm hover:bg-primary-50">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900">Semana {rotuloDaSemana(r.semana_inicio, r.semana_fim)}</span>
                    <span className="block text-xs text-gray-500">
                      {r.em_pausa ? "Em pausa · " : ""}
                      {r.sem_registros ? "Sem registros" : `Adesão ${formatarAdesao(r.adesao)}`}
                      {admin && !r.meu ? ` · ${r.profissional}` : ""}
                    </span>
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.respondido ? "bg-primary-50 text-primary-800" : "bg-amber-100 text-amber-900"}`}>
                    {r.respondido ? "Respondido" : "Pendente"}
                  </span>
                  <i className="pi pi-chevron-right text-gray-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

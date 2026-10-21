"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { avisar } from "@/lib/avisos";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirExame, alterarExame, type ExameDoPaciente } from "./SecaoExames";

type Dados = {
  exames: (ExameDoPaciente & { consulta_data: string | null })[];
  solicitacoes: { id: string; titulo: string; consulta_id: string; consulta_data: string; emitida_em: string | null }[];
  consultas: { id: string; data: string }[];
};

const NOVENTA_DIAS = 90 * 24 * 60 * 60 * 1000;

// Exames do paciente na ficha do módulo: histórico completo (recentes e
// antigos), vínculo com consulta e solicitação, nome e data do exame.
export default function ExamesDaFicha({ pacienteId }: { pacienteId: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [data, setData] = useState("");

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/pacientes/${pacienteId}/exames`, { cache: "no-store" });
    setDados(resposta.ok ? await resposta.json() : { exames: [], solicitacoes: [], consultas: [] });
  }, [pacienteId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function salvarIdentificacao(id: string) {
    if (await alterarExame(id, { nome, data: data || null })) {
      setEditando(null);
      avisar("Exame atualizado.", "success");
      carregar();
    }
  }

  const agora = Date.now();

  return (
    <section className="cartao mt-4 overflow-hidden">
      <h2 className="border-b border-gray-200 px-5 py-3 font-bold text-gray-900">Exames</h2>
      {dados === null ? (
        <p className="p-5 text-sm text-gray-500">Carregando…</p>
      ) : dados.exames.length + dados.solicitacoes.length === 0 ? (
        <p className="p-5 text-sm text-gray-500">Nenhum exame enviado nem solicitado.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {dados.exames.map((e) => {
            const recente = agora - new Date(e.uploaded_at).getTime() < NOVENTA_DIAS;
            return (
              <li key={e.id} className="space-y-2 px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <i className={`pi pi-paperclip ${recente ? "text-primary-700" : "text-gray-400"}`} aria-hidden />
                  <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold text-gray-900 hover:underline" onClick={() => abrirExame(e.storage_path, e.file_name)}>
                    {e.exam_name || e.file_name}
                  </button>
                  {!recente ? <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">mais de 90 dias</span> : null}
                  <Button
                    type="button"
                    icon="pi pi-pencil"
                    text
                    rounded
                    size="small"
                    aria-label={`Identificar ${e.file_name}`}
                    onClick={() => {
                      setEditando(e.id);
                      setNome(e.exam_name ?? "");
                      setData(e.exam_date ?? "");
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Enviado em {new Date(e.uploaded_at).toLocaleDateString("pt-BR")}
                  {e.exam_date ? ` · exame de ${formatarData(e.exam_date)}` : ""}
                  {e.exam_name ? ` · arquivo ${e.file_name}` : ""}
                </p>
                {editando === e.id ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <InputText aria-label="Nome do exame" value={nome} placeholder="Nome ou tipo do exame" onChange={(ev) => setNome(ev.target.value)} className="min-w-0 flex-1" />
                    <input type="date" aria-label="Data do exame" value={data} onChange={(ev) => setData(ev.target.value)} className="p-inputtext" />
                    <Button type="button" label="Salvar" size="small" onClick={() => salvarIdentificacao(e.id)} />
                    <Button type="button" label="Cancelar" size="small" text onClick={() => setEditando(null)} />
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Dropdown
                    aria-label={`Consulta do exame ${e.file_name}`}
                    value={e.consulta_id}
                    options={[{ label: "Sem consulta", value: null }, ...dados.consultas.map((c) => ({ label: `Consulta de ${formatarData(c.data)}`, value: c.id }))]}
                    onChange={async (ev) => (await alterarExame(e.id, { consultaId: ev.value })) && carregar()}
                    className="w-56"
                  />
                  <Dropdown
                    aria-label={`Solicitação do exame ${e.file_name}`}
                    value={e.solicitacao_id}
                    options={[
                      { label: "Sem solicitação", value: null },
                      ...dados.solicitacoes.map((s) => ({ label: `${s.titulo} (${formatarData(s.consulta_data)})`, value: s.id })),
                    ]}
                    onChange={async (ev) => (await alterarExame(e.id, { solicitacaoId: ev.value })) && carregar()}
                    className="w-64"
                    placeholder="Solicitação"
                  />
                </div>
              </li>
            );
          })}
          {dados.solicitacoes.map((s) => (
            <li key={s.id} className="px-5 py-3">
              <Link href={`/nutricao/${pacienteId}/consultas/${s.consulta_id}/solicitacao-exames/${s.id}`} className="flex items-center gap-2 hover:underline">
                <i className="pi pi-file text-primary-700" aria-hidden />
                <span className="font-semibold text-gray-900">{s.titulo}</span>
                <span className="text-sm text-gray-500">· consulta de {formatarData(s.consulta_data)} · {s.emitida_em ? "emitida" : "rascunho"}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

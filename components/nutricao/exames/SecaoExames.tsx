"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { Tag } from "primereact/tag";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirDocumento } from "@/lib/visualizador";

export type ExameDoPaciente = {
  id: string;
  file_name: string;
  storage_path: string;
  uploaded_at: string;
  exam_name: string | null;
  exam_date: string | null;
  consulta_id: string | null;
  solicitacao_id: string | null;
};

type Dados = {
  exames: ExameDoPaciente[];
  solicitacoes: { id: string; titulo: string; quantidade: number; emitida_em: string | null }[];
  modelos: { id: string; nome: string }[];
};

export async function abrirExame(caminho: string, nome: string) {
  const { data, error } = await api.storage.from("exames").createSignedUrl(caminho, 120);
  if (error || !data?.signedUrl) return avisar("Não foi possível abrir o exame.", "error");
  abrirDocumento(data.signedUrl, nome);
}

export async function alterarExame(id: string, dados: Record<string, unknown>) {
  const resposta = await fetch(`/api/nutricao/exames/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  if (!resposta.ok) {
    const resultado = await resposta.json().catch(() => null);
    avisar(resultado?.erro ?? "Não foi possível alterar o exame.", "error");
    return false;
  }
  return true;
}

// Seção "Exames" da consulta: exames enviados pelo paciente (vinculados à
// consulta ou ainda sem consulta) e solicitações de exames.
export default function SecaoExames({ pacienteId, consultaId }: { pacienteId: string; consultaId: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [nova, setNova] = useState(false);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const base = `/nutricao/${pacienteId}/consultas/${consultaId}`;

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/exames`, { cache: "no-store" });
    setDados(resposta.ok ? await resposta.json() : { exames: [], solicitacoes: [], modelos: [] });
  }, [consultaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function criar() {
    setCriando(true);
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/exames`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modeloId }),
    });
    const resultado = await resposta.json().catch(() => null);
    setCriando(false);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível criar a solicitação.", "error");
    router.push(`${base}/solicitacao-exames/${resultado.id}`);
  }

  if (!dados) return <p className="mt-3 text-sm text-gray-500">Carregando…</p>;

  const vinculados = dados.exames.filter((e) => e.consulta_id === consultaId);
  const semConsulta = dados.exames.filter((e) => !e.consulta_id);

  return (
    <>
      {vinculados.length + dados.solicitacoes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nenhum exame nesta consulta.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {vinculados.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <button type="button" className="min-w-0 truncate text-left text-primary-700 hover:underline" onClick={() => abrirExame(e.storage_path, e.file_name)}>
                <i className="pi pi-paperclip mr-1 text-xs" aria-hidden />
                {e.exam_name || e.file_name}
              </button>
              <span className="flex shrink-0 items-center gap-1 text-xs text-gray-500">
                {e.exam_date ? formatarData(e.exam_date) : new Date(e.uploaded_at).toLocaleDateString("pt-BR")}
                <Button
                  type="button"
                  icon="pi pi-times"
                  text
                  rounded
                  size="small"
                  aria-label={`Desvincular ${e.exam_name || e.file_name}`}
                  tooltip="Tirar desta consulta (continua no histórico)"
                  onClick={async () => (await alterarExame(e.id, { consultaId: null })) && carregar()}
                />
              </span>
            </li>
          ))}
          {dados.solicitacoes.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <button type="button" className="min-w-0 truncate text-left text-primary-700 hover:underline" onClick={() => router.push(`${base}/solicitacao-exames/${s.id}`)}>
                <i className="pi pi-file mr-1 text-xs" aria-hidden />
                {s.titulo}
              </button>
              <Tag value={s.emitida_em ? "Emitida" : "Rascunho"} severity={s.emitida_em ? "success" : "secondary"} className="shrink-0 text-[10px]" />
            </li>
          ))}
        </ul>
      )}

      {semConsulta.length ? (
        <div className="mt-3">
          <Dropdown
            aria-label="Vincular exame do paciente"
            value={null}
            options={semConsulta.map((e) => ({
              label: `${e.exam_name || e.file_name} (enviado em ${new Date(e.uploaded_at).toLocaleDateString("pt-BR")})`,
              value: e.id,
            }))}
            onChange={async (ev) => (await alterarExame(ev.value, { consultaId })) && (avisar("Exame vinculado à consulta.", "success"), carregar())}
            placeholder={`Vincular exame enviado (${semConsulta.length})`}
            className="w-full"
            panelClassName="max-w-[calc(100vw-2rem)]"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-plus" label="Solicitar exames" size="small" onClick={() => setNova(true)} />
      </div>

      <Dialog header="Solicitação de exames" visible={nova} onHide={() => setNova(false)} className="w-[min(30rem,calc(100vw-1rem))]">
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-900">Modelo</span>
          <Dropdown
            aria-label="Modelo de exames"
            value={modeloId}
            options={[{ label: "Em branco", value: null }, ...dados.modelos.map((m) => ({ label: m.nome, value: m.id }))]}
            onChange={(e) => setModeloId(e.value)}
            placeholder="Escolha o modelo"
            className="w-full"
          />
        </label>
        <p className="mt-2 text-xs text-gray-500">A lista vem do modelo e pode ser ajustada só para este paciente; o modelo não muda.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={() => setNova(false)} />
          <Button type="button" icon="pi pi-check" label="Criar" loading={criando} onClick={criar} />
        </div>
      </Dialog>
    </>
  );
}

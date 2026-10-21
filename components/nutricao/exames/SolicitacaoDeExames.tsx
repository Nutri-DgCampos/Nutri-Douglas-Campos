"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { type ExameDaLista } from "@/lib/nutricao/exames";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirDocumento } from "@/lib/visualizador";
import ListaDeExames from "./ListaDeExames";

type Solicitacao = {
  id: string;
  patient_id: string;
  paciente: string;
  consulta_data: string;
  titulo: string;
  exames: ExameDaLista[];
  observacoes: string;
  emitida_em: string | null;
  revisao: number;
  resultados: { id: string; file_name: string; exam_name: string | null }[] | null;
  envios: { id: string; enviado_em: string; storage_path: string }[] | null;
};

type Estado = "salvo" | "pendente" | "salvando" | "erro";

// Solicitação de exames da consulta: lista ajustável, observações, prévia em
// PDF e emissão (com ou sem envio à área do paciente).
export default function SolicitacaoDeExames({ id, voltar }: { id: string; voltar: () => void }) {
  const api = `/api/nutricao/solicitacoes-exames/${id}`;
  const [s, setS] = useState<Solicitacao | null | undefined>(undefined);
  const [estado, setEstado] = useState<Estado>("salvo");
  const [emitindo, setEmitindo] = useState(false);
  const atual = useRef<{ titulo: string; exames: ExameDaLista[]; observacoes: string }>({ titulo: "", exames: [], observacoes: "" });
  const revisao = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    const resposta = await fetch(api, { cache: "no-store" });
    if (!resposta.ok) return setS(null);
    const { solicitacao } = await resposta.json();
    atual.current = { titulo: solicitacao.titulo, exames: solicitacao.exames, observacoes: solicitacao.observacoes };
    revisao.current = solicitacao.revisao;
    setEstado("salvo");
    setS(solicitacao);
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const gravar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    setEstado("salvando");
    const resposta = await fetch(api, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...atual.current, revisao: revisao.current }),
    }).catch(() => null);
    if (!resposta?.ok) {
      const resultado = await resposta?.json().catch(() => null);
      setEstado("erro");
      avisar(resultado?.erro ?? "Não foi possível salvar.", "error");
      return false;
    }
    revisao.current = (await resposta.json()).revisao;
    setEstado("salvo");
    return true;
  }, [api]);

  useEffect(() => {
    if (estado === "salvo") return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [estado]);

  function alterar(mudanca: (a: typeof atual.current) => void) {
    const copia = structuredClone(atual.current);
    mudanca(copia);
    atual.current = copia;
    setS((x) => (x ? { ...x, ...copia } : x));
    setEstado("pendente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void gravar(), 1200);
  }

  async function emitir(paciente: boolean) {
    if (estado !== "salvo" && !(await gravar())) return;
    const confirmado = await pedirConfirmacao(
      paciente
        ? "Emitir e enviar à área do paciente? A solicitação fica congelada e o paciente recebe um aviso no celular."
        : "Emitir a solicitação? Ela fica congelada (para mudar, crie outra). Não vai para a área do paciente.",
      { aceitar: paciente ? "Emitir e enviar" : "Emitir", rejeitar: "Cancelar", titulo: "Emitir solicitação" }
    );
    if (!confirmado) return;
    setEmitindo(true);
    const resposta = await fetch(`${api}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paciente }) });
    const resultado = await resposta.json().catch(() => null);
    setEmitindo(false);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível emitir.", "error");
    avisar(paciente ? "Solicitação enviada ao paciente." : "Solicitação emitida.", "success");
    carregar();
  }

  async function excluir() {
    const ok = await pedirConfirmacao("Excluir esta solicitação ainda não emitida?", { aceitar: "Excluir", rejeitar: "Cancelar" });
    if (!ok) return;
    const resposta = await fetch(api, { method: "DELETE" });
    if (!resposta.ok) return avisar("Não foi possível excluir.", "error");
    avisar("Solicitação excluída.", "success");
    voltar();
  }

  if (s === undefined) return <Skeleton height="16rem" />;
  if (s === null) return <p>Solicitação não encontrada.</p>;

  const emitida = Boolean(s.emitida_em);
  const enviada = Boolean(s.envios?.length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary-700">{s.paciente}</p>
          <h1 className="text-2xl font-bold text-gray-900">Solicitação de exames</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span>Consulta de {formatarData(s.consulta_data)}</span>
            <Tag value={enviada ? "Enviada ao paciente" : emitida ? "Emitida" : "Rascunho"} severity={emitida ? "success" : "secondary"} />
          </div>
        </div>
        {!emitida ? <span className={`text-sm ${estado === "erro" ? "text-red-700" : "text-gray-500"}`}>{{ salvo: "Salvo", pendente: "Alterações não salvas", salvando: "Salvando…", erro: "Erro ao salvar" }[estado]}</span> : null}
      </div>

      <section className="cartao space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-900">Título</span>
          <InputText aria-label="Título da solicitação" value={s.titulo} disabled={emitida} onChange={(e) => alterar((a) => void (a.titulo = e.target.value))} className="w-full" maxLength={200} />
        </label>
        <div>
          <p className="mb-2 font-semibold text-gray-900">Exames</p>
          <ListaDeExames exames={s.exames} somenteLeitura={emitida} onAlterar={(m) => alterar((a) => m(a.exames))} />
        </div>
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-900">Observações ou orientações (opcional)</span>
          <InputTextarea
            aria-label="Observações da solicitação"
            value={s.observacoes}
            disabled={emitida}
            rows={3}
            autoResize
            onChange={(e) => alterar((a) => void (a.observacoes = e.target.value))}
            className="w-full"
            maxLength={5000}
          />
        </label>
      </section>

      {s.resultados?.length ? (
        <section className="cartao p-4">
          <h2 className="mb-2 font-semibold text-gray-900">Resultados associados</h2>
          <ul className="list-inside list-disc text-sm text-gray-700">
            {s.resultados.map((r) => (
              <li key={r.id}>{r.exam_name || r.file_name}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-arrow-left" label="Voltar à consulta" text onClick={async () => (estado === "salvo" || (await gravar())) && voltar()} />
        <Button type="button" icon="pi pi-file-pdf" label={emitida ? "PDF" : "Prévia do PDF"} outlined onClick={async () => (estado === "salvo" || (await gravar())) && abrirDocumento(`${api}/pdf`)} />
        {!emitida ? <Button type="button" icon="pi pi-check" label="Emitir" outlined loading={emitindo} onClick={() => emitir(false)} /> : null}
        {!enviada ? <Button type="button" icon="pi pi-send" label={emitida ? "Enviar ao paciente" : "Emitir e enviar ao paciente"} loading={emitindo} onClick={() => emitir(true)} /> : null}
        <span className="flex-1" />
        {!emitida ? <Button type="button" icon="pi pi-trash" label="Excluir" text severity="danger" onClick={excluir} /> : null}
      </div>
      <p className="text-xs text-gray-500">
        A solicitação deve respeitar as normas do CFN para solicitação de exames laboratoriais por nutricionistas. Depois de emitida,
        fica guardada como foi emitida, mesmo que o modelo mude.
      </p>
    </div>
  );
}

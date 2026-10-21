"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import type { ConteudoOrientacao } from "@/lib/nutricao/orientacao";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirDocumento } from "@/lib/visualizador";
import EditorDeBlocos from "./EditorDeBlocos";

type Orientacao = {
  id: string;
  patient_id: string;
  paciente: string;
  consulta_data: string;
  titulo: string;
  conteudo: ConteudoOrientacao;
  revisao: number;
  arquivada_em: string | null;
  atualizada_em: string;
  envios: { id: string; enviado_em: string }[] | null;
};

type Estado = "salvo" | "pendente" | "salvando" | "erro";

// Orientação da consulta: cópia editável, PDF e envio ao paciente.
export default function OrientacaoDaConsulta({ id, voltar }: { id: string; voltar: () => void }) {
  const api = `/api/nutricao/orientacoes/${id}`;
  const [o, setO] = useState<Orientacao | null | undefined>(undefined);
  const [estado, setEstado] = useState<Estado>("salvo");
  const [enviando, setEnviando] = useState(false);
  const atual = useRef<{ titulo: string; conteudo: ConteudoOrientacao }>({ titulo: "", conteudo: { blocos: [], assinatura: false } });
  const revisao = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    const resposta = await fetch(api, { cache: "no-store" });
    if (!resposta.ok) return setO(null);
    const { orientacao } = await resposta.json();
    atual.current = { titulo: orientacao.titulo, conteudo: orientacao.conteudo };
    revisao.current = orientacao.revisao;
    setEstado("salvo");
    setO(orientacao);
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
    setO((x) => (x ? { ...x, ...copia } : x));
    setEstado("pendente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void gravar(), 1200);
  }

  async function enviar() {
    if (estado !== "salvo" && !(await gravar())) return;
    const ok = await pedirConfirmacao("Enviar esta orientação à área do paciente? Ele recebe um aviso no celular. O PDF desta versão fica guardado.", {
      aceitar: "Enviar",
      rejeitar: "Cancelar",
      titulo: "Enviar orientação",
    });
    if (!ok) return;
    setEnviando(true);
    const resposta = await fetch(`${api}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revisao: revisao.current }) });
    const resultado = await resposta.json().catch(() => null);
    setEnviando(false);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível enviar.", "error");
    avisar("Orientação enviada ao paciente.", "success");
    carregar();
  }

  async function excluirOuArquivar() {
    const enviada = Boolean(o?.envios?.length);
    const ok = await pedirConfirmacao(enviada ? "Arquivar esta orientação? O PDF enviado continua com o paciente." : "Excluir esta orientação da consulta? O modelo não muda.", {
      aceitar: enviada ? "Arquivar" : "Excluir",
      rejeitar: "Cancelar",
    });
    if (!ok) return;
    const resposta = enviada
      ? await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "arquivar" }) })
      : await fetch(api, { method: "DELETE" });
    if (!resposta.ok) return avisar("Não foi possível concluir.", "error");
    voltar();
  }

  if (o === undefined) return <Skeleton height="16rem" />;
  if (o === null) return <p>Orientação não encontrada.</p>;

  const ultimoEnvio = o.envios?.at(-1);
  const alteradaDepois = ultimoEnvio && new Date(o.atualizada_em) > new Date(ultimoEnvio.enviado_em);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary-700">{o.paciente}</p>
          <h1 className="text-2xl font-bold text-gray-900">Orientação</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            <span>Consulta de {formatarData(o.consulta_data)}</span>
            {ultimoEnvio ? (
              <Tag value={`Enviada em ${new Date(ultimoEnvio.enviado_em).toLocaleDateString("pt-BR")}`} severity="success" />
            ) : (
              <Tag value="Não enviada" severity="secondary" />
            )}
            {o.arquivada_em ? <Tag value="Arquivada" severity="secondary" /> : null}
          </div>
          {alteradaDepois ? <p className="mt-1 text-xs text-amber-700">Alterada depois do último envio: o paciente ainda tem a versão anterior.</p> : null}
        </div>
        <span className={`text-sm ${estado === "erro" ? "text-red-700" : "text-gray-500"}`}>
          {{ salvo: "Salvo", pendente: "Alterações não salvas", salvando: "Salvando…", erro: "Erro ao salvar" }[estado]}
        </span>
      </div>

      <section className="cartao space-y-3 p-4">
        <label className="block">
          <span className="mb-1 block font-semibold text-gray-900">Título</span>
          <InputText aria-label="Título da orientação" value={o.titulo} onChange={(e) => alterar((a) => void (a.titulo = e.target.value))} className="w-full" maxLength={200} />
        </label>
        <EditorDeBlocos conteudo={o.conteudo} onAlterar={(m) => alterar((a) => m(a.conteudo))} pasta={o.patient_id} />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-arrow-left" label="Voltar à consulta" text onClick={async () => (estado === "salvo" || (await gravar())) && voltar()} />
        <Button type="button" icon="pi pi-file-pdf" label="PDF" outlined onClick={async () => (estado === "salvo" || (await gravar())) && abrirDocumento(`${api}/pdf`)} />
        {!o.arquivada_em ? (
          <Button type="button" icon="pi pi-send" label={ultimoEnvio ? "Enviar versão atual" : "Enviar ao paciente"} loading={enviando} disabled={Boolean(ultimoEnvio && !alteradaDepois)} onClick={enviar} />
        ) : null}
        <span className="flex-1" />
        {!o.arquivada_em ? (
          <Button type="button" icon={o.envios?.length ? "pi pi-inbox" : "pi pi-trash"} label={o.envios?.length ? "Arquivar" : "Excluir"} text severity="danger" onClick={excluirOuArquivar} />
        ) : null}
      </div>
    </div>
  );
}

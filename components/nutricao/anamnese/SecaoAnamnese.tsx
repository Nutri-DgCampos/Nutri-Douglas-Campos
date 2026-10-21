"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { SITUACOES_DO_FORMULARIO, type SituacaoDoFormulario } from "@/lib/nutricao/anamnese";
import JanelaLinkDoPaciente from "./JanelaLinkDoPaciente";

type Resumo = { id: string; titulo: string | null; situacao: SituacaoDoFormulario; arquivado_em: string | null };
type Modelo = { id: string; nome: string };
type Dados = { anamneses: Resumo[]; recordatorios: Resumo[]; modelos: Modelo[] };

// Seção "Anamnese" da consulta: fichas (a partir dos modelos), recordatório
// alimentar e o link individual do paciente.
export default function SecaoAnamnese({ pacienteId, consultaId }: { pacienteId: string; consultaId: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [escolhendo, setEscolhendo] = useState<"anamnese" | "recordatorio" | null>(null);
  const [modeloId, setModeloId] = useState<string | null>(null);
  const [comRecordatorio, setComRecordatorio] = useState(true);
  const [criando, setCriando] = useState(false);
  const [link, setLink] = useState(false);
  const base = `/nutricao/${pacienteId}/consultas/${consultaId}`;

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/formularios`, { cache: "no-store" });
    setDados(resposta.ok ? await resposta.json() : { anamneses: [], recordatorios: [], modelos: [] });
  }, [consultaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function criar(tipo: "anamnese" | "recordatorio", enviar: boolean, duplicar = false): Promise<string | null> {
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/formularios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, modeloId, enviar, duplicar }),
    });
    const resultado = await resposta.json().catch(() => null);
    if (resposta.status === 409 && resultado?.existente) {
      const outra = await pedirConfirmacao(
        `${resultado.erro} Abrir a existente ou criar outra ${tipo === "anamnese" ? "ficha" : "folha de recordatório"}?`,
        { aceitar: "Criar outra", rejeitar: "Abrir a existente", titulo: "Já existe" }
      );
      if (outra) return criar(tipo, enviar, true);
      router.push(`${base}/${tipo}/${resultado.existente}`);
      return null;
    }
    if (!resposta.ok) {
      avisar(resultado?.erro ?? "Não foi possível criar.", "error");
      return null;
    }
    return resultado.id;
  }

  async function concluir(enviar: boolean) {
    if (!escolhendo) return;
    if (escolhendo === "anamnese" && !modeloId) return avisar("Escolha o modelo de anamnese.", "warn");
    setCriando(true);
    const id = await criar(escolhendo, enviar);
    let recordatorioOk = true;
    if (id && enviar && escolhendo === "anamnese" && comRecordatorio && !dados?.recordatorios.some((r) => !r.arquivado_em)) {
      recordatorioOk = Boolean(await criar("recordatorio", true));
    }
    setCriando(false);
    const tipo = escolhendo;
    setEscolhendo(null);
    setModeloId(null);
    if (!id) return;
    if (enviar) {
      avisar(
        recordatorioOk ? "Disponível para o paciente preencher. Envie o link pelo WhatsApp." : "Anamnese enviada; o recordatório não pôde ser criado.",
        recordatorioOk ? "success" : "warn"
      );
      await carregar();
      setLink(true);
    } else {
      router.push(`${base}/${tipo}/${id}`);
    }
  }

  const ativos = (lista: Resumo[]) => lista.filter((f) => !f.arquivado_em);

  return (
    <>
      {dados === null ? (
        <p className="mt-3 text-sm text-gray-500">Carregando…</p>
      ) : dados.anamneses.length + dados.recordatorios.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nenhuma anamnese registrada.</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {[...ativos(dados.anamneses).map((f) => ({ ...f, tipo: "anamnese" as const })), ...ativos(dados.recordatorios).map((f) => ({ ...f, tipo: "recordatorio" as const }))].map(
            (f) => (
              <li key={f.id} className="flex items-start justify-between gap-2">
                <button type="button" className="min-w-0 truncate text-left text-primary-700 hover:underline" onClick={() => router.push(`${base}/${f.tipo}/${f.id}`)}>
                  {f.tipo === "anamnese" ? f.titulo : "Recordatório alimentar"}
                </button>
                <Tag value={SITUACOES_DO_FORMULARIO[f.situacao].rotulo.split(" — ")[0]} severity={SITUACOES_DO_FORMULARIO[f.situacao].cor} className="shrink-0 text-[10px]" />
              </li>
            )
          )}
          {dados.anamneses.length + dados.recordatorios.length > ativos(dados.anamneses).length + ativos(dados.recordatorios).length ? (
            <li className="text-xs text-gray-400">Há formulários arquivados (aparecem no histórico do paciente).</li>
          ) : null}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-plus" label="Nova anamnese" size="small" onClick={() => setEscolhendo("anamnese")} />
        <Button type="button" icon="pi pi-list" label="Recordatório" size="small" outlined onClick={() => setEscolhendo("recordatorio")} />
        <Button type="button" icon="pi pi-link" label="Link" size="small" text onClick={() => setLink(true)} />
      </div>

      <Dialog
        header={escolhendo === "anamnese" ? "Nova anamnese" : "Recordatório alimentar"}
        visible={escolhendo !== null}
        onHide={() => {
          setEscolhendo(null);
          setModeloId(null);
        }}
        className="w-[min(34rem,calc(100vw-1rem))]"
      >
        {escolhendo === "anamnese" ? (
          <div className="space-y-3">
            {dados?.modelos.length === 0 ? (
              <p className="text-sm text-gray-600">
                Nenhum modelo de anamnese cadastrado. Crie em Configurações → Anamnese.
                <Button type="button" label="Abrir configurações" text size="small" onClick={() => router.push("/nutricao/configuracoes/anamnese")} />
              </p>
            ) : (
              <label className="block">
                <span className="mb-1 block font-semibold text-gray-900">Anamnese</span>
                <Dropdown
                  aria-label="Modelo de anamnese"
                  value={modeloId}
                  options={(dados?.modelos ?? []).map((m) => ({ label: m.nome, value: m.id }))}
                  onChange={(e) => setModeloId(e.value)}
                  placeholder="Selecione a anamnese"
                  className="w-full"
                />
              </label>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            Formulário simples para o paciente contar o que come em um dia comum: refeições, horários, alimentos e quantidades,
            sem cálculos. Depois pode ser importado para o editor de dietas.
          </p>
        )}

        {escolhendo && (escolhendo === "recordatorio" || modeloId) ? (
          <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
            <p className="font-semibold text-gray-900">Deseja enviar {escolhendo === "anamnese" ? "esta anamnese" : "o recordatório"} para preenchimento pelo paciente?</p>
            {escolhendo === "anamnese" && !dados?.recordatorios.some((r) => !r.arquivado_em) ? (
              <div className="flex items-center gap-2">
                <Checkbox inputId="com-recordatorio" checked={comRecordatorio} onChange={(e) => setComRecordatorio(Boolean(e.checked))} />
                <label htmlFor="com-recordatorio" className="text-sm text-gray-700">
                  Enviar junto o recordatório alimentar
                </label>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" icon="pi pi-send" label="Sim, enviar ao paciente" loading={criando} onClick={() => concluir(true)} />
              <Button type="button" icon="pi pi-pencil" label="Não, preencher no consultório" outlined disabled={criando} onClick={() => concluir(false)} />
            </div>
            <p className="text-xs text-gray-500">Enviar não inicia o ciclo de 33 dias da dieta. Dá para enviar depois, de dentro da ficha.</p>
          </div>
        ) : null}
      </Dialog>

      {link ? <JanelaLinkDoPaciente pacienteId={pacienteId} onFechar={() => setLink(false)} /> : null}
    </>
  );
}

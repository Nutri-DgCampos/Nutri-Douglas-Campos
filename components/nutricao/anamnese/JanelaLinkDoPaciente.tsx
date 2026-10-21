"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Link = { url: string; nome: string; telefone: string | null };

// Número para o wa.me: só dígitos, com o 55 do Brasil quando faltar.
function numeroWhatsApp(telefone: string | null) {
  const digitos = (telefone ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos.length >= 12 ? digitos : "";
}

// Link individual do paciente para anamnese e recordatório (sem login):
// copiar, abrir o WhatsApp com a mensagem pronta ou gerar um novo link.
export default function JanelaLinkDoPaciente({ pacienteId, onFechar }: { pacienteId: string; onFechar: () => void }) {
  const [link, setLink] = useState<Link | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch(`/api/nutricao/pacientes/${pacienteId}/link-formularios`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setLink)
      .catch(() => setErro(true));
  }, [pacienteId]);

  const primeiroNome = link?.nome.trim().split(/\s+/)[0] ?? "";
  const mensagem = link
    ? `Olá, ${primeiroNome}! Aqui é o nutricionista Douglas Campos. Preparei um formulário para conhecer melhor sua rotina antes da consulta. ` +
      `Responda pelo link abaixo (não precisa de senha; as respostas ficam salvas enquanto você preenche):\n${link.url}`
    : "";

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      avisar("Link copiado.", "success");
    } catch {
      avisar("Não foi possível copiar. Selecione o link e copie manualmente.", "warn");
    }
  }

  function abrirWhatsApp() {
    if (!link) return;
    const numero = numeroWhatsApp(link.telefone);
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, "_blank", "noopener,noreferrer");
  }

  async function novoLink() {
    const confirmado = await pedirConfirmacao(
      "Gerar um novo link? O link atual deixa de funcionar (use se ele foi enviado à pessoa errada). As respostas já dadas não mudam.",
      { aceitar: "Gerar novo link", rejeitar: "Cancelar", titulo: "Novo link" }
    );
    if (!confirmado) return;
    const resposta = await fetch(`/api/nutricao/pacientes/${pacienteId}/link-formularios`, { method: "POST" });
    if (!resposta.ok) return avisar("Não foi possível gerar o novo link.", "error");
    setLink(await resposta.json());
    avisar("Novo link gerado. O anterior não funciona mais.", "success");
  }

  return (
    <Dialog header="Link do paciente" visible onHide={onFechar} className="w-[min(36rem,calc(100vw-1rem))]">
      {erro ? (
        <p className="text-red-700">Não foi possível obter o link.</p>
      ) : !link ? (
        <p className="text-gray-500">Carregando…</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Link individual de {link.nome}: abre a anamnese e o recordatório enviados, sem login. O paciente também encontra os
            formulários na área do paciente, em “Formulários”.
          </p>
          <InputText aria-label="Link do paciente" value={link.url} readOnly className="w-full font-mono text-xs" onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" icon="pi pi-copy" label="Copiar link" onClick={copiar} />
            <Button type="button" icon="pi pi-whatsapp" label="Abrir WhatsApp" severity="success" onClick={abrirWhatsApp} />
            <Button type="button" icon="pi pi-refresh" label="Gerar novo link" text onClick={novoLink} />
          </div>
          {!numeroWhatsApp(link.telefone) ? (
            <p className="text-xs text-amber-700">Paciente sem celular no cadastro: o WhatsApp abre para você escolher o contato.</p>
          ) : null}
          <details className="text-sm text-gray-600">
            <summary className="cursor-pointer">Mensagem que vai no WhatsApp</summary>
            <p className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2">{mensagem}</p>
          </details>
        </div>
      )}
    </Dialog>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { avisar } from "@/lib/avisos";

// "Enviar ao paciente" de um PDF já gravado (Fórmulas emitidas, Avaliação
// Física enviada), com confirmação (paciente e tipo do documento) e
// histórico de envios. Reenviar cria um novo envio do mesmo arquivo.
// Não publica dieta nem mexe no ciclo de 33 dias.

type Envio = { id: string; enviado_em: string; excluido_paciente_em: string | null; lido: boolean };

const ROTULOS = { formulas: "Fórmulas", avaliacao: "Avaliação física" } as const;

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export function situacaoDoEnvio(envio: Envio) {
  if (envio.excluido_paciente_em) return `Excluído pelo paciente em ${quando(envio.excluido_paciente_em)}`;
  return envio.lido ? "Aberto pelo paciente" : "Ainda não aberto";
}

export default function EnvioAoPaciente({
  tipo,
  origemId,
  paciente,
  documento,
  tamanho = "small",
  onEnviado,
}: {
  tipo: "formulas" | "avaliacao";
  origemId: string;
  paciente: string;
  // Nome do documento mostrado na confirmação (ex.: nome do arquivo).
  documento?: string;
  tamanho?: "small" | "large";
  onEnviado?: () => void;
}) {
  const [envios, setEnvios] = useState<Envio[] | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [historico, setHistorico] = useState(false);

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/publicacoes?origens=${origemId}`, { cache: "no-store" }).catch(() => null);
    const dados = resposta?.ok ? await resposta.json() : null;
    setEnvios(dados?.envios?.[origemId] ?? []);
  }, [origemId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [carregar]);

  async function enviar() {
    setEnviando(true);
    try {
      const resposta = await fetch("/api/nutricao/publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, origemId }),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        avisar(dados?.erro ?? "Não foi possível enviar.", "error");
        return;
      }
      setConfirmando(false);
      avisar(`${ROTULOS[tipo]} enviado(a) à área do paciente.`, "success");
      await carregar();
      onEnviado?.();
    } finally {
      setEnviando(false);
    }
  }

  const ativos = envios?.filter((e) => !e.excluido_paciente_em) ?? [];
  const jaEnviado = (envios?.length ?? 0) > 0;

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button
        type="button"
        icon="pi pi-send"
        size={tamanho === "small" ? "small" : undefined}
        text={tamanho === "small"}
        severity="success"
        label={jaEnviado ? "Reenviar ao paciente" : "Enviar ao paciente"}
        disabled={envios === null}
        onClick={() => setConfirmando(true)}
      />
      {jaEnviado ? (
        <Button
          type="button"
          size="small"
          text
          label={`Envios (${envios?.length})${ativos.length === 0 ? " · excluído pelo paciente" : ""}`}
          onClick={() => setHistorico(true)}
        />
      ) : null}

      <Dialog
        header="Enviar ao paciente?"
        visible={confirmando}
        onHide={() => setConfirmando(false)}
        className="w-[min(30rem,calc(100vw-1rem))]"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setConfirmando(false)} />
            <Button type="button" label="Confirmar envio" icon="pi pi-send" loading={enviando} onClick={enviar} />
          </div>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="font-semibold text-gray-700">Paciente</dt>
          <dd>{paciente}</dd>
          <dt className="font-semibold text-gray-700">Documento</dt>
          <dd>
            {ROTULOS[tipo]}
            {documento ? <span className="block text-xs text-gray-500">{documento}</span> : null}
          </dd>
        </dl>
        {jaEnviado ? <p className="mt-3 text-sm text-gray-600">O mesmo PDF será enviado de novo, com nova data e novo aviso ao paciente.</p> : null}
        <p className="mt-2 text-sm text-gray-500">O documento aparece na aba Dietas do paciente. Enviar não publica dieta nem mexe no ciclo de 33 dias.</p>
      </Dialog>

      <Dialog header={`Envios ao paciente — ${ROTULOS[tipo]}`} visible={historico} onHide={() => setHistorico(false)} className="w-[min(30rem,calc(100vw-1rem))]">
        <ul className="divide-y divide-gray-100 text-sm">
          {(envios ?? []).map((envio) => (
            <li key={envio.id} className="py-2">
              <p className="font-semibold text-gray-900">Enviado em {quando(envio.enviado_em)}</p>
              <p className={envio.excluido_paciente_em ? "text-red-700" : "text-gray-600"}>{situacaoDoEnvio(envio)}</p>
            </li>
          ))}
        </ul>
      </Dialog>
    </span>
  );
}

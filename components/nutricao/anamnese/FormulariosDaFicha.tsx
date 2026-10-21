"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import { SITUACOES_DO_FORMULARIO, type SituacaoDoFormulario } from "@/lib/nutricao/anamnese";
import { formatarData } from "@/lib/nutricao/paciente";
import JanelaLinkDoPaciente from "./JanelaLinkDoPaciente";

type Item = {
  id: string;
  consulta_id: string;
  consulta_data: string;
  titulo: string | null;
  situacao: SituacaoDoFormulario;
  arquivado_em: string | null;
  tipo: "anamnese" | "recordatorio";
};

// Histórico de anamneses e recordatórios no painel do paciente.
export default function FormulariosDaFicha({ pacienteId }: { pacienteId: string }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [link, setLink] = useState(false);

  useEffect(() => {
    fetch(`/api/nutricao/pacientes/${pacienteId}/formularios`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { anamneses: [], recordatorios: [] }))
      .then((d) =>
        setItens(
          [
            ...(d.anamneses ?? []).map((f: Item) => ({ ...f, tipo: "anamnese" as const })),
            ...(d.recordatorios ?? []).map((f: Item) => ({ ...f, tipo: "recordatorio" as const })),
          ].sort((a, b) => b.consulta_data.localeCompare(a.consulta_data))
        )
      )
      .catch(() => setItens([]));
  }, [pacienteId]);

  return (
    <section className="cartao mt-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-5 py-2">
        <h2 className="font-bold text-gray-900">Anamneses e recordatórios</h2>
        <Button type="button" icon="pi pi-link" label="Link do paciente" text size="small" onClick={() => setLink(true)} />
      </div>
      {itens === null ? (
        <p className="p-5 text-sm text-gray-500">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="p-5 text-sm text-gray-500">Nenhuma anamnese ou recordatório. Crie pela consulta, na seção Anamnese.</p>
      ) : (
        <ul className="divide-y divide-gray-200">
          {itens.map((f) => (
            <li key={f.id}>
              <Link href={`/nutricao/${pacienteId}/consultas/${f.consulta_id}/${f.tipo}/${f.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-primary-50">
                <i className={`pi ${f.tipo === "anamnese" ? "pi-file-edit" : "pi-list"} text-lg text-primary-700`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{f.tipo === "anamnese" ? f.titulo : "Recordatório alimentar"}</span>
                  <span className="block text-sm text-gray-500">Consulta de {formatarData(f.consulta_data)}</span>
                </span>
                {f.arquivado_em ? <Tag value="Arquivado" severity="secondary" /> : null}
                <Tag value={SITUACOES_DO_FORMULARIO[f.situacao].rotulo.split(" — ")[0]} severity={SITUACOES_DO_FORMULARIO[f.situacao].cor} />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {link ? <JanelaLinkDoPaciente pacienteId={pacienteId} onFechar={() => setLink(false)} /> : null}
    </section>
  );
}

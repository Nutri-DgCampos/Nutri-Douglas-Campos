"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { avisar } from "@/lib/avisos";
import { LIMITE_DA_RESPOSTA, PERGUNTAS_DA_ANAMNESE, type RespostasDaAnamnese } from "@/lib/treinoAnamnese";

// Anamnese do treino na ficha do aluno (T6, R6): perguntas abertas, só do
// profissional conectado (os outros não veem, F2). Sem nota nem
// classificação automática.
export default function AnamneseDoTreino({ alunoId }: { alunoId: string }) {
  const [respostas, setRespostas] = useState<RespostasDaAnamnese | null>(null);
  const [atualizadaEm, setAtualizadaEm] = useState<string | null>(null);
  const [aberta, setAberta] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [alterada, setAlterada] = useState(false);
  const revisao = useRef(0);

  useEffect(() => {
    fetch(`/api/treino/alunos/${alunoId}/anamnese`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setRespostas(d.anamnese.respostas);
        setAtualizadaEm(d.anamnese.atualizada_em);
        revisao.current = d.anamnese.revisao;
      })
      .catch(() => undefined);
  }, [alunoId]);

  async function salvar() {
    setSalvando(true);
    const r = await fetch(`/api/treino/alunos/${alunoId}/anamnese`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ respostas, revisao: revisao.current }),
    }).catch(() => null);
    setSalvando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(d?.erro ?? "Sem conexão. Tente de novo.", "error");
      return;
    }
    revisao.current = d.revisao;
    setAtualizadaEm(d.atualizada_em);
    setAlterada(false);
    avisar("Anamnese salva.", "success");
  }

  if (!respostas) return null;
  const preenchidas = PERGUNTAS_DA_ANAMNESE.filter((p) => respostas[p.chave]).length;

  return (
    <section className="cartao p-5" aria-label="Anamnese do treino">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">Anamnese do treino</h2>
          <p className="text-sm text-gray-500">
            Só você vê esta anamnese. {preenchidas} de {PERGUNTAS_DA_ANAMNESE.length} respostas
            {atualizadaEm ? ` · atualizada em ${new Date(atualizadaEm).toLocaleDateString("pt-BR")}` : ""}
          </p>
        </div>
        <Button type="button" text icon={aberta ? "pi pi-chevron-up" : "pi pi-chevron-down"} label={aberta ? "Recolher" : "Abrir"} onClick={() => setAberta(!aberta)} />
      </div>
      {aberta ? (
        <div className="mt-3 space-y-3">
          {PERGUNTAS_DA_ANAMNESE.map((p) => (
            <label key={p.chave} className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">{p.pergunta}</span>
              <InputTextarea
                value={respostas[p.chave] ?? ""}
                maxLength={LIMITE_DA_RESPOSTA}
                autoResize
                rows={2}
                onChange={(e) => {
                  setRespostas({ ...respostas, [p.chave]: e.target.value });
                  setAlterada(true);
                }}
                className="w-full"
                aria-label={p.pergunta}
              />
            </label>
          ))}
          <div className="flex justify-end">
            <Button type="button" icon="pi pi-check" label="Salvar anamnese" loading={salvando} disabled={!alterada} onClick={salvar} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

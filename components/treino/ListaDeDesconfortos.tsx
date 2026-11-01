"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { avisar } from "@/lib/avisos";
import { DIAS } from "@/lib/treino";

export type DesconfortoNaTela = {
  id: string;
  patient_id: string;
  paciente: string;
  dia: string | null;
  data: string;
  exercicio: string | null;
  regiao: string;
  intensidade: number;
  conduta: "continuei" | "parei";
  comentario: string | null;
  criado_em: string;
  visto_em: string | null;
  visto_por_nome: string | null;
};

const NOME_DO_DIA = Object.fromEntries(DIAS.map((d) => [d.chave, d.nome]));

function quando(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Relatos de desconforto do aluno, com "Marcar como visto". O sistema não
// interpreta o relato: mostra o que o aluno informou.
export default function ListaDeDesconfortos({
  desconfortos,
  mostrarAluno = false,
  onVisto,
}: {
  desconfortos: DesconfortoNaTela[];
  mostrarAluno?: boolean;
  onVisto: (id: string) => void;
}) {
  const [marcando, setMarcando] = useState<string | null>(null);

  async function marcar(id: string) {
    setMarcando(id);
    const r = await fetch("/api/treino/desconfortos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMarcando(null);
    if (!r.ok) {
      avisar("Não foi possível marcar o relato como visto.", "error");
      return;
    }
    onVisto(id);
  }

  return (
    <ul className="divide-y divide-gray-100">
      {desconfortos.map((d) => (
        <li key={d.id} className="flex flex-wrap items-start gap-3 py-3 text-sm">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold ${
              d.conduta === "parei" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
            }`}
            aria-label={`Intensidade ${d.intensidade} de 10`}
          >
            {d.intensidade}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900">
              {mostrarAluno ? (
                <Link href={`/treino/alunos/${d.patient_id}`} className="text-primary-800 hover:underline">
                  {d.paciente}
                </Link>
              ) : null}
              {mostrarAluno ? " · " : ""}
              {d.regiao}
              {d.exercicio ? ` · ${d.exercicio}` : ""}
            </p>
            <p className={d.conduta === "parei" ? "font-semibold text-red-700" : "text-gray-700"}>
              {d.conduta === "parei" ? "Incômodo mais acentuado: parou o exercício" : "Desconforto leve: continuou o exercício"}
            </p>
            {d.comentario ? <p className="whitespace-pre-line text-gray-700">“{d.comentario}”</p> : null}
            <p className="text-xs text-gray-500">
              {quando(d.criado_em)}
              {d.dia ? ` · treino de ${NOME_DO_DIA[d.dia] ?? d.dia}` : ""}
              {d.visto_em ? ` · visto${d.visto_por_nome ? ` por ${d.visto_por_nome}` : ""} em ${quando(d.visto_em)}` : ""}
            </p>
          </div>
          {d.visto_em ? null : (
            <Button
              type="button"
              size="small"
              outlined
              icon="pi pi-check"
              label="Marcar como visto"
              loading={marcando === d.id}
              onClick={() => marcar(d.id)}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

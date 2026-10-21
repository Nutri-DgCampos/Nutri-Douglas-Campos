"use client";

import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { novoExame, type ExameDaLista } from "@/lib/nutricao/exames";

function mover(lista: ExameDaLista[], indice: number, direcao: -1 | 1) {
  const destino = indice + direcao;
  if (destino < 0 || destino >= lista.length) return;
  const [item] = lista.splice(indice, 1);
  lista.splice(destino, 0, item);
}

// Lista editável de exames (modelo ou solicitação do paciente).
export default function ListaDeExames({
  exames,
  onAlterar,
  somenteLeitura = false,
}: {
  exames: ExameDaLista[];
  onAlterar: (mudanca: (lista: ExameDaLista[]) => void) => void;
  somenteLeitura?: boolean;
}) {
  if (somenteLeitura) {
    return (
      <ol className="list-inside list-decimal space-y-1 text-gray-800">
        {exames.filter((e) => e.nome.trim()).map((e) => (
          <li key={e.id}>{e.nome}</li>
        ))}
      </ol>
    );
  }
  return (
    <div className="space-y-2">
      {exames.map((e, i) => (
        <div key={e.id} className="flex items-center gap-1">
          <span className="w-6 text-right text-sm text-gray-400">{i + 1}.</span>
          <InputText
            aria-label={`Exame ${i + 1}`}
            value={e.nome}
            placeholder="Nome do exame"
            onChange={(evento) => onAlterar((l) => void (l[i].nome = evento.target.value))}
            onKeyDown={(evento) => {
              if (evento.key === "Enter") {
                evento.preventDefault();
                onAlterar((l) => void l.splice(i + 1, 0, novoExame()));
                setTimeout(() => (document.querySelector(`input[aria-label="Exame ${i + 2}"]`) as HTMLInputElement | null)?.focus(), 50);
              }
            }}
            className="min-w-0 flex-1"
            maxLength={200}
          />
          <Button type="button" icon="pi pi-angle-down" text aria-label={`Descer exame ${i + 1}`} disabled={i === exames.length - 1} onClick={() => onAlterar((l) => mover(l, i, 1))} />
          <Button type="button" icon="pi pi-angle-up" text aria-label={`Subir exame ${i + 1}`} disabled={i === 0} onClick={() => onAlterar((l) => mover(l, i, -1))} />
          <Button type="button" icon="pi pi-minus-circle" text severity="danger" aria-label={`Remover exame ${i + 1}`} onClick={() => onAlterar((l) => void l.splice(i, 1))} />
        </div>
      ))}
      <Button type="button" icon="pi pi-plus" label="Exame" text size="small" onClick={() => onAlterar((l) => void l.push(novoExame()))} />
      <p className="text-xs text-gray-500">Dica: Enter cria a próxima linha.</p>
    </div>
  );
}

"use client";

import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import {
  EXEMPLO_RECORDATORIO,
  novaRefeicaoRecordatorio,
  novoItemRecordatorio,
  type ItemRecordatorio,
  type Recordatorio,
  type RefeicaoRecordatorio,
} from "@/lib/nutricao/anamnese";

// Recordatório alimentar: refeições, horários, alimentos e quantidades em
// texto livre, sem cálculo. O exemplo identificado como MODELO não é salvo.
export default function FormularioRecordatorio({
  conteudo,
  onChange,
  somenteLeitura = false,
  mostrarExemplo = false,
}: {
  conteudo: Recordatorio;
  onChange: (alterar: (r: Recordatorio) => void) => void;
  somenteLeitura?: boolean;
  mostrarExemplo?: boolean;
}) {
  function refeicao(id: string, alterar: (r: RefeicaoRecordatorio) => void) {
    onChange((doc) => {
      const alvo = doc.refeicoes.find((r) => r.id === id);
      if (alvo) alterar(alvo);
    });
  }

  function item(refeicaoId: string, itemId: string, alteracao: Partial<ItemRecordatorio>) {
    refeicao(refeicaoId, (r) => {
      const alvo = r.itens.find((i) => i.id === itemId);
      if (alvo) Object.assign(alvo, alteracao);
    });
  }

  function mover(indice: number, direcao: -1 | 1) {
    onChange((doc) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= doc.refeicoes.length) return;
      const [r] = doc.refeicoes.splice(indice, 1);
      doc.refeicoes.splice(destino, 0, r);
    });
  }

  return (
    <div className="space-y-4">
      {mostrarExemplo ? (
        <section className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-3 text-gray-500" aria-label="Exemplo de preenchimento">
          <p className="mb-2 inline-block rounded bg-gray-300 px-2 py-0.5 text-xs font-bold tracking-wider text-gray-700">MODELO — só um exemplo</p>
          <p className="font-semibold">
            {EXEMPLO_RECORDATORIO.nome} · {EXEMPLO_RECORDATORIO.horario}
          </p>
          <ul className="mt-1 text-sm">
            {EXEMPLO_RECORDATORIO.itens.map(([alimento, quantidade]) => (
              <li key={alimento}>
                {alimento} — {quantidade}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm italic">Observação: {EXEMPLO_RECORDATORIO.observacao}</p>
        </section>
      ) : null}

      {conteudo.refeicoes.map((r, indice) => (
        <section key={r.id} className="rounded-xl border border-gray-200 bg-white p-3" aria-label={r.nome || `Refeição ${indice + 1}`}>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 basis-full sm:basis-auto sm:flex-1">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Refeição</span>
              <InputText
                aria-label={`Nome da refeição ${indice + 1}`}
                value={r.nome}
                disabled={somenteLeitura}
                placeholder="Ex.: Café da manhã"
                onChange={(e) => refeicao(r.id, (x) => void (x.nome = e.target.value))}
                className="w-full"
                maxLength={300}
              />
            </label>
            <label className="w-28">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Horário</span>
              <input
                type="time"
                aria-label={`Horário da refeição ${indice + 1}`}
                value={r.horario ?? ""}
                disabled={somenteLeitura}
                onChange={(e) => refeicao(r.id, (x) => void (x.horario = e.target.value || null))}
                className="p-inputtext w-full"
              />
            </label>
            {!somenteLeitura ? (
              <div className="flex">
                <Button type="button" icon="pi pi-angle-up" text aria-label="Subir refeição" disabled={indice === 0} onClick={() => mover(indice, -1)} />
                <Button
                  type="button"
                  icon="pi pi-angle-down"
                  text
                  aria-label="Descer refeição"
                  disabled={indice === conteudo.refeicoes.length - 1}
                  onClick={() => mover(indice, 1)}
                />
                <Button
                  type="button"
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  aria-label={`Remover a refeição ${r.nome || indice + 1}`}
                  onClick={() => onChange((doc) => void (doc.refeicoes = doc.refeicoes.filter((x) => x.id !== r.id)))}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,14rem)_2.5rem] gap-2 text-xs font-semibold text-gray-600 sm:grid">
              <span>Alimento ou bebida</span>
              <span>Quantidade / medida caseira</span>
            </div>
            {r.itens.map((i, n) => (
              <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_2.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_2.5rem]">
                <InputText
                  aria-label={`Alimento ${n + 1} da refeição ${indice + 1}`}
                  value={i.alimento}
                  disabled={somenteLeitura}
                  placeholder="Ex.: Pão francês"
                  onChange={(e) => item(r.id, i.id, { alimento: e.target.value })}
                  className="w-full"
                  maxLength={300}
                />
                <InputText
                  aria-label={`Quantidade do alimento ${n + 1} da refeição ${indice + 1}`}
                  value={i.quantidade}
                  disabled={somenteLeitura}
                  placeholder="Ex.: 1 unidade"
                  onChange={(e) => item(r.id, i.id, { quantidade: e.target.value })}
                  className="order-3 col-span-2 w-full sm:order-none sm:col-span-1"
                  maxLength={300}
                />
                {!somenteLeitura ? (
                  <Button
                    type="button"
                    icon="pi pi-minus"
                    rounded
                    text
                    severity="danger"
                    aria-label={`Remover o alimento ${n + 1}`}
                    onClick={() => refeicao(r.id, (x) => void (x.itens = x.itens.filter((y) => y.id !== i.id)))}
                  />
                ) : (
                  <span />
                )}
              </div>
            ))}
            {!somenteLeitura ? (
              <Button
                type="button"
                icon="pi pi-plus"
                label="Alimento"
                text
                size="small"
                onClick={() => refeicao(r.id, (x) => void x.itens.push(novoItemRecordatorio()))}
              />
            ) : null}
          </div>

          <label className="mt-2 block">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Observação (opcional)</span>
            <InputTextarea
              aria-label={`Observação da refeição ${indice + 1}`}
              value={r.observacao}
              disabled={somenteLeitura}
              rows={1}
              autoResize
              onChange={(e) => refeicao(r.id, (x) => void (x.observacao = e.target.value))}
              className="w-full"
              maxLength={5000}
            />
          </label>
        </section>
      ))}

      {!somenteLeitura ? (
        <Button
          type="button"
          icon="pi pi-plus"
          label="Adicionar refeição"
          outlined
          onClick={() => onChange((doc) => void doc.refeicoes.push(novaRefeicaoRecordatorio()))}
        />
      ) : null}

      <label className="block">
        <span className="mb-1 block font-semibold text-gray-900">Preferências e hábitos alimentares (opcional)</span>
        <InputTextarea
          aria-label="Preferências e hábitos alimentares"
          value={conteudo.observacoes}
          disabled={somenteLeitura}
          rows={3}
          autoResize
          onChange={(e) => onChange((doc) => void (doc.observacoes = e.target.value))}
          className="w-full"
          maxLength={20000}
        />
      </label>
    </div>
  );
}

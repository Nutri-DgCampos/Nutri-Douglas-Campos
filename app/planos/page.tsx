"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { linkWhatsApp } from "@/lib/contato";

type Plano = {
  nome: string;
  preco: string;
  destaque?: string;
  indicacao: string;
  itens: string[];
};

const PLANOS: Plano[] = [
  {
    nome: "Plano 1",
    preco: "200",
    destaque: "Mais procurado",
    indicacao: "Para quem quer acompanhamento próximo, semana a semana.",
    itens: [
      "100% on-line",
      "Relatório de acompanhamento toda semana",
      "Alerta do relatório no aplicativo",
      "Duração de 4 semanas",
    ],
  },
  {
    nome: "Plano 2",
    preco: "150",
    indicacao: "Para quem já tem rotina de alimentação, com horários fixos.",
    itens: [
      "100% on-line",
      "Relatório de acompanhamento a cada 15 dias",
      "Duração de 4 semanas",
    ],
  },
  {
    nome: "Plano 3",
    preco: "100",
    indicacao: "Para quem já está habituado a seguir dietas.",
    itens: [
      "100% on-line",
      "Relatório de acompanhamento a cada 30 dias",
      "Duração de 4 semanas",
    ],
  },
  {
    nome: "Plano 4",
    preco: "260",
    destaque: "Presencial",
    indicacao:
      "Para quem tem muitas dúvidas ou incertezas, ou deseja fazer a avaliação física.",
    itens: [
      "Avaliação física presencial: percentual de gordura, perimetria e peso",
      "Mais 3 semanas de acompanhamento on-line",
      "Relatório de acompanhamento toda semana",
      "Alerta do relatório no aplicativo",
      "Duração de 4 semanas",
    ],
  },
];

// Página pública com os planos e o contato por WhatsApp.
export default function PlanosPage() {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [conversaAberta, setConversaAberta] = useState(false);
  const [indicacao, setIndicacao] = useState("");

  const mensagem = [
    `Olá, Douglas! Tenho interesse no acompanhamento nutricional${escolhido ? ` (${escolhido})` : ""}.`,
    indicacao.trim() && `Fui indicado(a) por: ${indicacao.trim()}.`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="min-h-dvh bg-gray-100">
      <header className="bg-primary-900 px-5 pb-10 pt-[calc(2rem+env(safe-area-inset-top))] text-white">
        <div className="mx-auto max-w-5xl">
          <p className="font-[family-name:var(--fonte-titulo)] text-xl font-bold">Douglas Campos</p>
          <p className="text-sm text-white/65">Acompanhamento nutricional</p>

          <h1 className="mt-8 max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
            Escolha o acompanhamento que combina com a sua rotina
          </h1>
          <p className="mt-3 max-w-xl text-white/80">
            Todos os planos têm duração de 4 semanas, com plano alimentar e
            acompanhamento pelo aplicativo.
          </p>
        </div>
      </header>

      <main className="mx-auto -mt-6 max-w-5xl px-4 pb-32 sm:px-5">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLANOS.map((plano) => {
            const selecionado = escolhido === plano.nome;

            return (
              <li key={plano.nome}>
                <button
                  type="button"
                  onClick={() => setEscolhido(selecionado ? null : plano.nome)}
                  aria-pressed={selecionado}
                  className={`flex h-full w-full flex-col rounded-2xl border-2 bg-white p-5 text-left transition ${
                    selecionado
                      ? "border-primary-600 shadow-[0_12px_30px_-18px_rgb(6_55_43/0.6)]"
                      : "border-transparent hover:border-primary-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-[family-name:var(--fonte-titulo)] text-lg font-bold text-gray-900">
                      {plano.nome}
                    </span>
                    {plano.destaque && (
                      <span className="rounded-full bg-atencao-100 px-2.5 py-1 text-xs font-bold text-atencao-700">
                        {plano.destaque}
                      </span>
                    )}
                  </div>

                  <p className="mt-3 text-gray-900">
                    <span className="text-sm font-semibold">R$ </span>
                    <span className="font-[family-name:var(--fonte-titulo)] text-4xl font-bold tabular-nums">
                      {plano.preco}
                    </span>
                    <span className="text-sm text-gray-500">,00/mês</span>
                  </p>

                  <p className="mt-3 text-sm font-medium text-gray-700">{plano.indicacao}</p>

                  <ul className="mt-4 space-y-2 text-sm text-gray-600">
                    {plano.itens.map((item) => (
                      <li key={item} className="flex gap-2">
                        <i className="pi pi-check mt-0.5 text-primary-600" aria-hidden />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <span
                    className={`mt-5 inline-flex items-center gap-2 text-sm font-semibold ${
                      selecionado ? "text-primary-700" : "text-gray-400"
                    }`}
                  >
                    <i className={`pi ${selecionado ? "pi-check-circle" : "pi-circle"}`} aria-hidden />
                    {selecionado ? "Plano escolhido" : "Escolher este plano"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white/95 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="hidden text-sm text-gray-600 sm:block">
            {escolhido ? `${escolhido} escolhido.` : "Escolha um plano ou fale direto com o nutricionista."}
          </p>
          <Button
            type="button"
            label="Tenho interesse"
            icon="pi pi-whatsapp"
            className="w-full sm:w-auto"
            onClick={() => setConversaAberta(true)}
          />
        </div>
      </div>

      <Dialog
        header="Falar com o nutricionista"
        visible={conversaAberta}
        onHide={() => setConversaAberta(false)}
        className="w-[30rem]"
      >
        <label htmlFor="indicacao" className="mb-2 block text-sm font-semibold text-gray-700">
          Foi indicação de alguém? (opcional)
        </label>
        <InputText
          id="indicacao"
          value={indicacao}
          onChange={(e) => setIndicacao(e.target.value)}
          placeholder="Nome de quem indicou"
          maxLength={100}
          className="w-full"
        />

        <p className="mb-2 mt-5 text-sm font-semibold text-gray-700">Mensagem que será enviada</p>
        <p className="whitespace-pre-line rounded-xl bg-primary-50 p-4 text-sm text-gray-800">
          {mensagem}
        </p>

        <Button
          type="button"
          label="Enviar mensagem ao nutricionista"
          icon="pi pi-whatsapp"
          className="mt-5 w-full"
          onClick={() => window.open(linkWhatsApp(mensagem), "_blank", "noopener,noreferrer")}
        />
      </Dialog>
    </div>
  );
}

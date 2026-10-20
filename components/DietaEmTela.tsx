"use client";

import { useEffect, useState } from "react";

// Dieta enviada pelo editor, para o paciente ler em tela (além do PDF):
// refeições, opções, quantidades, trocas, observações e hidratação.

type Item = { id: string; nome: string; quantidade: string; substituicoes: { id: string; nome: string; quantidade: string }[] };

type Dieta = {
  id: string;
  enviadaEm: string;
  titulo: string;
  objetivo: string;
  refeicoes: {
    id: string;
    nome: string;
    horario: string | null;
    observacao: string | null;
    opcoes: { id: string; itens: Item[] }[];
  }[];
  observacoes: { id: string; titulo: string; texto: string }[];
  hidratacao: { mlPorDia: number | null; observacoes: string | null };
};

function ListaDeItens({ itens }: { itens: Item[] }) {
  return (
    <ul className="divide-y divide-gray-100">
      {itens.map((item) => (
        <li key={item.id} className="py-2">
          <div className="flex justify-between gap-3">
            <span className="text-gray-900">{item.nome}</span>
            <span className="shrink-0 text-right text-sm text-gray-600">{item.quantidade}</span>
          </div>
          {item.substituicoes.length > 0 ? (
            <details className="mt-1 text-sm">
              <summary className="cursor-pointer text-primary-700">Trocas ({item.substituicoes.length})</summary>
              <ul className="mt-1 space-y-0.5 pl-3 text-gray-700">
                {item.substituicoes.map((s) => (
                  <li key={s.id}>
                    {s.nome} — {s.quantidade}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export default function DietaEmTela() {
  const [dietas, setDietas] = useState<Dieta[]>([]);
  const [ativa, setAtiva] = useState(0);

  useEffect(() => {
    fetch("/api/area-paciente/dietas", { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : { dietas: [] }))
      .then((dados) => setDietas(dados.dietas ?? []))
      .catch(() => setDietas([]));
  }, []);

  if (dietas.length === 0) return null;

  const dieta = dietas[Math.min(ativa, dietas.length - 1)];
  const formatar = (ml: number) =>
    `${ml.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mL por dia (${(ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L)`;

  return (
    <section className="mt-6" aria-label="Sua dieta">
      {dietas.length > 1 ? (
        <div role="tablist" className="mb-3 flex gap-2 overflow-x-auto">
          {dietas.map((d, indice) => (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={indice === ativa}
              onClick={() => setAtiva(indice)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${
                indice === ativa ? "bg-primary-700 text-white" : "bg-gray-100 text-gray-700"
              }`}
            >
              {d.titulo || `Dieta ${indice + 1}`}
            </button>
          ))}
        </div>
      ) : null}

      <div className="cartao p-5">
        <h2 className="text-lg font-bold text-gray-900">{dieta.titulo || "Sua dieta"}</h2>
        {dieta.objetivo ? <p className="text-sm font-semibold text-primary-700">{dieta.objetivo}</p> : null}
        <p className="mt-1 text-xs text-gray-500">
          Enviada em {new Date(dieta.enviadaEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>

        <div className="mt-4 space-y-5">
          {dieta.refeicoes.map((refeicao) => (
            <div key={refeicao.id}>
              <h3 className="font-bold uppercase text-gray-900">
                {refeicao.nome}
                {refeicao.horario ? <span className="font-semibold text-gray-500"> ({refeicao.horario})</span> : null}
              </h3>
              {refeicao.opcoes.length > 1 ? (
                <>
                  <p className="text-xs text-gray-500">Escolha uma das opções.</p>
                  {refeicao.opcoes.map((opcao, numero) => (
                    <div key={opcao.id} className="mt-2 rounded-lg bg-gray-50 px-3 py-1">
                      <p className="pt-1 text-sm font-semibold text-gray-700">Opção {numero + 1}</p>
                      <ListaDeItens itens={opcao.itens} />
                    </div>
                  ))}
                </>
              ) : (
                <ListaDeItens itens={refeicao.opcoes[0]?.itens ?? []} />
              )}
              {refeicao.observacao ? <p className="mt-1 whitespace-pre-wrap text-sm italic text-gray-600">{refeicao.observacao}</p> : null}
            </div>
          ))}
        </div>

        {dieta.observacoes.length > 0 ? (
          <div className="mt-6">
            <h3 className="font-bold text-gray-900">Observações gerais</h3>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-gray-800">
              {dieta.observacoes.map((o) => (
                <li key={o.id} className="whitespace-pre-wrap">
                  {o.titulo ? <strong>{o.titulo}: </strong> : null}
                  {o.texto}
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {dieta.hidratacao.mlPorDia !== null || dieta.hidratacao.observacoes ? (
          <div className="mt-6">
            <h3 className="font-bold text-gray-900">Hidratação</h3>
            {dieta.hidratacao.mlPorDia !== null ? <p className="text-sm text-gray-800">{formatar(dieta.hidratacao.mlPorDia)}</p> : null}
            {dieta.hidratacao.observacoes ? (
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{dieta.hidratacao.observacoes}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

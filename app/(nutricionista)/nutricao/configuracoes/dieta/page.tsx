"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";

// Configurações da dieta: as três bibliotecas de modelos.
const ITENS = [
  {
    titulo: "Observações da dieta",
    descricao: "Orientações reutilizáveis, inseridas ao final das dietas.",
    icone: "pi-comment",
    destino: "/nutricao/configuracoes/dieta/observacoes",
  },
  {
    titulo: "Modelos de refeição",
    descricao: "Refeições completas, com opções e substituições, para importar numa refeição.",
    icone: "pi-th-large",
    destino: "/nutricao/configuracoes/dieta/refeicoes",
  },
  {
    titulo: "Modelos de dieta",
    descricao: "Planos alimentares completos, para importar como base de uma dieta.",
    icone: "pi-book",
    destino: "/nutricao/configuracoes/dieta/modelos",
  },
];

export default function ConfiguracoesDaDietaPage() {
  const router = useRouter();

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar às configurações" onClick={() => router.push("/nutricao/configuracoes")} />
        <CabecalhoPagina titulo="Dieta" descricao="Modelos usados na elaboração das dietas. Usar um modelo copia o conteúdo: editar o modelo depois não muda as dietas já feitas." />
        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {ITENS.map((item) => (
            <li key={item.titulo}>
              <Link href={item.destino} className="cartao flex h-full items-start gap-4 p-4 hover:border-primary-700">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <i className={`pi ${item.icone} text-lg`} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-900">{item.titulo}</span>
                  <span className="block text-sm text-gray-500">{item.descricao}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

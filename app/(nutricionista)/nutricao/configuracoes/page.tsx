"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";

// Bibliotecas do Módulo de Nutrição. Cada item fica disponível na fase em
// que for implementado.
const ITENS = [
  {
    titulo: "Identidade visual",
    descricao: "Logotipo, assinatura, marca-d'água, frase e rodapé dos PDFs.",
    icone: "pi-image",
    destino: "/nutricao/configuracoes/identidade",
  },
  { titulo: "Alimentos", descricao: "Base TACO, alimentos próprios, medidas caseiras e substituições.", icone: "pi-database" },
  { titulo: "Dieta", descricao: "Modelos de observação, de refeição e de dieta completa.", icone: "pi-book" },
  { titulo: "Anamnese", descricao: "Modelos de anamnese para as consultas.", icone: "pi-file-edit" },
  { titulo: "Exames", descricao: "Modelos de solicitação de exames.", icone: "pi-heart" },
  { titulo: "Medicações", descricao: "Cadastro de medicações.", icone: "pi-plus-circle" },
  { titulo: "Fórmulas", descricao: "Modelos de fórmulas e ingredientes.", icone: "pi-box" },
  { titulo: "Orientações", descricao: "Modelos de orientações nutricionais.", icone: "pi-comment" },
];

export default function ConfiguracoesPage() {
  const router = useRouter();

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar ao módulo" onClick={() => router.push("/nutricao")} />
        <CabecalhoPagina titulo="Configurações" descricao="Bibliotecas e padrões do Módulo de Nutrição." />

        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {ITENS.map((item) => {
            const conteudo = (
              <>
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    item.destino ? "bg-primary-50 text-primary-700" : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <i className={`pi ${item.icone} text-lg`} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block font-semibold ${item.destino ? "text-gray-900" : "text-gray-500"}`}>
                    {item.titulo}
                  </span>
                  <span className="block text-sm text-gray-500">{item.descricao}</span>
                  {!item.destino && <span className="mt-1 block text-xs font-semibold text-gray-400">Em breve</span>}
                </span>
              </>
            );

            return (
              <li key={item.titulo}>
                {item.destino ? (
                  <Link href={item.destino} className="cartao flex items-start gap-4 p-4 hover:border-primary-700">
                    {conteudo}
                  </Link>
                ) : (
                  <div className="cartao flex items-start gap-4 p-4 opacity-80" aria-disabled>
                    {conteudo}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}

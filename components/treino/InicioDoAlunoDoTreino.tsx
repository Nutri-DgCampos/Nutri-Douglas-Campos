"use client";

import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import AvisoDeInstalacao from "@/components/AvisoDeInstalacao";
import EnvioTreino from "@/components/EnvioTreino";

type Props = {
  primeiroNome: string | undefined;
  pacienteId: string | null;
  devolutivaNova: boolean;
  notificacoesAtivas: boolean;
  ativandoNotificacoes: boolean;
  onAtivarNotificacoes: () => void;
  onSair: () => void;
};

// Início da Área do Paciente para o aluno próprio de um educador físico
// (T7b): só o Treino. Nada da Nutrição (relatório nutricional, dieta,
// pagamentos, renovação, parceiros) aparece aqui.
export default function InicioDoAlunoDoTreino({
  primeiroNome,
  pacienteId,
  devolutivaNova,
  notificacoesAtivas,
  ativandoNotificacoes,
  onAtivarNotificacoes,
  onSair,
}: Props) {
  const router = useRouter();

  const atalhos = [
    {
      rotulo: "Meu treino",
      descricao: "Exercícios da semana e registro do que você fez",
      icone: "pi-bolt",
      destino: "/area-paciente/treino",
      novidade: false,
    },
    {
      rotulo: "Relatórios",
      descricao: devolutivaNova ? "Chegou a devolutiva do seu Personal Trainer" : "Devolutivas do seu Personal Trainer",
      icone: "pi-chart-bar",
      destino: "/area-paciente/relatorios",
      novidade: devolutivaNova,
    },
  ];

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Área do aluno</p>
            <h1 className="mt-0.5 truncate text-3xl font-bold text-gray-900">Olá{primeiroNome ? `, ${primeiroNome}` : ""}</h1>
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <Button type="button" icon="pi pi-sign-out" label="Sair" text severity="secondary" size="small" onClick={onSair} />
            <Button
              type="button"
              icon="pi pi-key"
              label="Alterar senha"
              text
              severity="secondary"
              size="small"
              onClick={() => router.push("/trocar-senha")}
            />
          </div>
        </header>

        <AvisoDeInstalacao />

        <nav className="cartao mt-6 divide-y divide-gray-200" aria-label="Atalhos">
          {atalhos.map((atalho) => (
            <button
              key={atalho.destino}
              type="button"
              onClick={() => router.push(atalho.destino)}
              className="flex w-full items-center gap-4 px-4 py-4 text-left first:rounded-t-2xl last:rounded-b-2xl hover:bg-gray-50"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                <i className={`pi ${atalho.icone} text-lg`} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-gray-900">{atalho.rotulo}</span>
                <span className={`block truncate text-sm ${atalho.novidade ? "font-medium text-atencao-700" : "text-gray-500"}`}>
                  {atalho.descricao}
                </span>
              </span>
              {atalho.novidade && <span className="ponto-novidade" aria-hidden />}
              <i className="pi pi-chevron-right text-sm text-gray-400" aria-hidden />
            </button>
          ))}
        </nav>

        {pacienteId && <EnvioTreino pacienteId={pacienteId} />}

        <section className="cartao mt-4 flex items-center gap-4 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-atencao-50 text-atencao-700">
            <i className="pi pi-bell text-lg" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900">Notificações do treino</h2>
            <p className="text-sm text-gray-500">
              {notificacoesAtivas
                ? "Este aparelho já recebe os avisos."
                : "Receba um aviso no celular quando chegar a devolutiva do seu Personal Trainer."}
            </p>
            {!notificacoesAtivas && (
              <Button
                type="button"
                label="Ativar notificações"
                size="small"
                outlined
                loading={ativandoNotificacoes}
                className="mt-3"
                onClick={onAtivarNotificacoes}
              />
            )}
          </div>
        </section>
      </div>

      <p className="mt-6 text-center text-sm">
        <a href="/privacidade" className="text-gray-500 underline">
          Política de privacidade
        </a>
      </p>
    </main>
  );
}

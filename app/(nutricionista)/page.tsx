"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { supabase } from "@/lib/supabase";

type Paciente = {
  id: string;
  name: string;
  phone: string | null;
  objective: string | null;
  plan: string;
  payment_status: string;
  important_note: string | null;
  created_at: string;
};

export default function Home() {
  async function enviarNotificacaoTeste() {
  const { data: sessao, error: erroSessao } =
    await supabase.auth.getSession();

  if (erroSessao || !sessao.session) {
    alert("Você precisa estar conectado como nutricionista.");
    return;
  }

  const patientId = prompt("Cole o ID do paciente de teste:");

if (!patientId?.trim()) {
  alert("Teste cancelado: nenhum paciente informado.");
  return;
}

try {
  const resposta = await fetch("/api/teste-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessao.session.access_token}`,
    },
    body: JSON.stringify({
      patientId: patientId.trim(),
    }),
  });

  const resultado = await resposta.json();

  if (!resposta.ok) {
    alert(
      "Erro ao enviar notificação: " +
        (resultado.error || "Erro desconhecido.")
    );
    return;
  }

  alert(
    resultado.message ||
      "Notificação enviada ao serviço de push!"
  );
} catch (erro) {
  console.error("Erro no teste de notificação:", erro);
  alert("Não foi possível conectar ao serviço de notificações.");
}

}


const [mensagemPersonalizada, setMensagemPersonalizada] = useState(
  "Olá! Seu relatório nutricional está disponível para preenchimento. Acesse o Acompanhamento Nutricional e envie suas respostas dentro do prazo."
);

const [enviandoNotificacaoPersonalizada, setEnviandoNotificacaoPersonalizada] =
  useState(false);

async function enviarNotificacaoPersonalizada() {
  const mensagem = mensagemPersonalizada.trim();

  if (!mensagem || mensagem.length > 300) {
    alert("Informe uma mensagem de até 300 caracteres.");
    return;
  }

  if (enviandoNotificacaoPersonalizada) return;

  const confirmar = window.confirm(
    "Esta mensagem será enviada para TODOS os pacientes com notificações ativadas.\n\n" +
      mensagem +
      "\n\nDeseja confirmar o envio?"
  );

  if (!confirmar) return;

  setEnviandoNotificacaoPersonalizada(true);

  try {
    const {
      data: { session },
      error: erroSessao,
    } = await supabase.auth.getSession();

    if (erroSessao || !session?.access_token) {
      alert("Faça login como nutricionista.");
      return;
    }

    const resposta = await fetch(
      "/api/enviar-notificacao-personalizada",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mensagem }),
      }
    );

    const resultado = await resposta.json();

    if (!resposta.ok || !resultado.success) {
      alert(resultado.error || "Erro ao enviar notificações.");
      return;
    }

    alert(resultado.message || "Envio concluído.");
  } catch (erro) {
    console.error("Erro ao enviar notificações:", erro);
    alert("Não foi possível enviar as notificações.");
  } finally {
    setEnviandoNotificacaoPersonalizada(false);
  }
}


  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [naoResponderam, setNaoResponderam] = useState(0);
const [carregandoAtrasados, setCarregandoAtrasados] = useState(true);

useEffect(() => {
  async function carregarNaoResponderam() {
    setCarregandoAtrasados(true);

    try {
      const partes = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());

      const obterParte = (tipo: string) =>
        partes.find((parte) => parte.type === tipo)?.value ?? "";

      const hojeBrasil = [
        obterParte("year"),
        obterParte("month"),
        obterParte("day"),
      ].join("-");

      const hoje = new Date(`${hojeBrasil}T12:00:00Z`);
      const diasDesdeSegunda = (hoje.getUTCDay() + 6) % 7;

      // Segunda e terça ainda não são consideradas atraso.
      if (diasDesdeSegunda < 2) {
        setNaoResponderam(0);
        return;
      }

      const segunda = new Date(hoje);
      segunda.setUTCDate(segunda.getUTCDate() - diasDesdeSegunda);

      const segundaAtual = segunda.toISOString().slice(0, 10);

      const { data: ciclos, error: erroCiclos } = await supabase
        .from("diet_cycles")
        .select("id, patient_id, start_date, end_date, followup_frequency")
        .eq("status", "ativo");

      if (erroCiclos) throw erroCiclos;

      const { data: relatorios, error: erroRelatorios } =
        await supabase
          .from("patient_reports")
          .select("cycle_id, scheduled_week_start")
          .eq("scheduled_week_start", segundaAtual);

      if (erroRelatorios) throw erroRelatorios;

      const ciclosRespondidos = new Set(
        (relatorios ?? []).map((relatorio) => relatorio.cycle_id)
      );

      const pacientesAtrasados = new Set<string>();

      for (const ciclo of ciclos ?? []) {
        if (
          ciclo.start_date > hojeBrasil ||
          (ciclo.end_date && ciclo.end_date < hojeBrasil)
        ) {
          continue;
        }

        const frequencia = String(
          ciclo.followup_frequency ?? ""
        ).trim().toLowerCase();

        const configuracoes: Record<
          string,
          { intervalo: number; quantidade: number }
        > = {
          semanal: { intervalo: 7, quantidade: 4 },
          quinzenal: { intervalo: 15, quantidade: 2 },
          mensal: { intervalo: 30, quantidade: 1 },
        };

        const configuracao = configuracoes[frequencia];

        if (!configuracao) continue;

        for (
          let numero = 1;
          numero <= configuracao.quantidade;
          numero++
        ) {
          const prevista = new Date(`${ciclo.start_date}T12:00:00Z`);

          prevista.setUTCDate(
            prevista.getUTCDate() + configuracao.intervalo * numero
          );

          const diaSemana = prevista.getUTCDay();
          const distanciaSegunda = (diaSemana + 6) % 7;

          const ajuste =
            distanciaSegunda <= 3
              ? -distanciaSegunda
              : 7 - distanciaSegunda;

          prevista.setUTCDate(prevista.getUTCDate() + ajuste);

          if (
            prevista.toISOString().slice(0, 10) === segundaAtual &&
            !ciclosRespondidos.has(ciclo.id)
          ) {
            pacientesAtrasados.add(ciclo.patient_id);
            break;
          }
        }
      }

      setNaoResponderam(pacientesAtrasados.size);
    } catch (error) {
      console.error("Erro ao contar pacientes atrasados:", error);
    } finally {
      setCarregandoAtrasados(false);
    }
  }

    carregarNaoResponderam();

  function atualizarAoVoltar() {
    if (document.visibilityState === "visible") {
      carregarNaoResponderam();
    }
  }

  document.addEventListener(
    "visibilitychange",
    atualizarAoVoltar
  );

  return () => {
    document.removeEventListener(
      "visibilitychange",
      atualizarAoVoltar
    );
  };
}, []);

  useEffect(() => {
    async function carregarPacientes() {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setErro("Não foi possível carregar os pacientes.");
        setCarregando(false);
        return;
      }

      setPacientes(data ?? []);
      setCarregando(false);
    }

    carregarPacientes();
  }, []);

  
const [pagamentosPendentes, setPagamentosPendentes] = useState(0);

useEffect(() => {
  async function carregarPagamentosPendentes() {
    const { count, error } = await supabase
      .from("payments")
      .select("*", { count: "exact", head: true })
      .eq("status", "comprovante_enviado");

    if (error) {
      console.error("Erro ao contar pagamentos:", error);
      return;
    }

    setPagamentosPendentes(count ?? 0);
  }

  carregarPagamentosPendentes();
}, []);


  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8">
            <p className="text-sm font-medium text-blue-600">
              Painel do nutricionista
            </p>

            <h1 className="text-3xl font-bold text-gray-900">
              Olá, Douglas 👋
            </h1>

            <p className="mt-2 text-gray-600">
              Aqui está o resumo dos seus pacientes.
            </p>
          </header>

          

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card
              titulo="Pacientes"
              valor={carregando ? "..." : String(pacientes.length)}
            />

            <Card titulo="Relatórios recebidos" valor="0" />

            <Card
  titulo="Não responderam"
  valor={carregandoAtrasados ? "..." : String(naoResponderam)}
/>

            <Card
              titulo="Pagamentos recebidos"
              valor={carregando ? "..." : String(pagamentosPendentes)}
            />
          </section>

          <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Pacientes
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  Acompanhe seus pacientes em um só lugar.
                </p>
              </div>

              <Link
                href="/pacientes/novo"
                className="rounded-xl bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
              >
                + Novo paciente
              </Link>
            </div>

            <div className="mt-6 divide-y divide-gray-200">
              {carregando && (
                <p className="py-6 text-gray-500">
                  Carregando pacientes...
                </p>
              )}

              {!carregando && erro && (
                <p className="py-6 text-red-600">{erro}</p>
              )}

              {!carregando && !erro && pacientes.length === 0 && (
                <p className="py-6 text-gray-500">
                  Nenhum paciente cadastrado.
                </p>
              )}

{/*
              {!carregando &&
                !erro &&
                pacientes.map((paciente) => (
                  <div
                    key={paciente.id}
                    className="flex items-center justify-between py-4"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">
                        {paciente.name}
                      </p>

                      <p className="text-sm text-gray-500">
                        {paciente.objective || "Objetivo não informado"}
                      </p>

                      <p className="mt-1 text-xs text-gray-400">
                        {paciente.plan} • Pagamento:{" "}
                        {paciente.payment_status}
                      </p>
                    </div>

                    <Link
  href={`/pacientes/${paciente.id}`}
  className="font-medium text-blue-600 hover:text-blue-800"
>
  Ver paciente →
</Link>
                  </div>
                ))}
                  */}
                  
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Card({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{titulo}</p>

      <p className="mt-2 text-3xl font-bold text-gray-900">
        {valor}
      </p>
    </div>
  );
}
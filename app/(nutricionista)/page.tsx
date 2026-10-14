"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import CabecalhoPagina from "@/components/CabecalhoPagina";

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
    await api.auth.getSession();

  if (erroSessao || !sessao.session) {
    avisar("Você precisa estar conectado como nutricionista.");
    return;
  }

  const patientId = prompt("Cole o ID do paciente de teste:");

if (!patientId?.trim()) {
  avisar("Teste cancelado: nenhum paciente informado.");
  return;
}

try {
  const resposta = await fetch("/api/teste-push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      patientId: patientId.trim(),
    }),
  });

  const resultado = await resposta.json();

  if (!resposta.ok) {
    avisar(
      "Erro ao enviar notificação: " +
        (resultado.error || "Erro desconhecido.")
    );
    return;
  }

  avisar(
    resultado.message ||
      "Notificação enviada ao serviço de push!"
  );
} catch (erro) {
  console.error("Erro no teste de notificação:", erro);
  avisar("Não foi possível conectar ao serviço de notificações.");
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
    avisar("Informe uma mensagem de até 300 caracteres.");
    return;
  }

  if (enviandoNotificacaoPersonalizada) return;

  const confirmar = await pedirConfirmacao(
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
    } = await api.auth.getSession();

    if (erroSessao || !session) {
      avisar("Faça login como nutricionista.");
      return;
    }

    const resposta = await fetch(
      "/api/enviar-notificacao-personalizada",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mensagem }),
      }
    );

    const resultado = await resposta.json();

    if (!resposta.ok || !resultado.success) {
      avisar(resultado.error || "Erro ao enviar notificações.");
      return;
    }

    avisar(resultado.message || "Envio concluído.");
  } catch (erro) {
    console.error("Erro ao enviar notificações:", erro);
    avisar("Não foi possível enviar as notificações.");
  } finally {
    setEnviandoNotificacaoPersonalizada(false);
  }
}


  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [relatoriosRecebidos, setRelatoriosRecebidos] = useState(0);
  const [carregandoRelatorios, setCarregandoRelatorios] = useState(true);
  const [erroRelatorios, setErroRelatorios] = useState("");

  useEffect(() => {
    let ativo = true;
    let consultaEmAndamento = false;

    async function carregarRelatoriosRecebidos() {
      if (consultaEmAndamento) return;
      consultaEmAndamento = true;

      try {
        const { count, error } = await api
          .from("patient_reports")
          .select("id", { count: "exact", head: true })
          .eq("status", "pendente");

        if (error) throw error;

        if (ativo) {
          setRelatoriosRecebidos(count ?? 0);
          setErroRelatorios("");
        }
      } catch (error) {
        console.error("Erro ao contar relatórios recebidos:", error);
        if (ativo) {
          setErroRelatorios("Não foi possível atualizar os relatórios recebidos.");
        }
      } finally {
        consultaEmAndamento = false;
        if (ativo) setCarregandoRelatorios(false);
      }
    }

    function atualizarAoVoltar() {
      if (document.visibilityState === "visible") {
        carregarRelatoriosRecebidos();
      }
    }

    carregarRelatoriosRecebidos();
    const intervalo = setInterval(atualizarAoVoltar, 60000);
    document.addEventListener("visibilitychange", atualizarAoVoltar);
    window.addEventListener("focus", atualizarAoVoltar);

    return () => {
      ativo = false;
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", atualizarAoVoltar);
      window.removeEventListener("focus", atualizarAoVoltar);
    };
  }, []);

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

      const { data: ciclos, error: erroCiclos } = await api
        .from("diet_cycles")
        .select("id, patient_id, start_date, end_date, followup_frequency")
        .eq("status", "ativo");

      if (erroCiclos) throw erroCiclos;

      const { data: relatorios, error: erroRelatorios } =
        await api
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
  window.addEventListener("focus", atualizarAoVoltar);
  const intervalo = setInterval(atualizarAoVoltar, 60000);

  return () => {
    clearInterval(intervalo);
    window.removeEventListener("focus", atualizarAoVoltar);
    document.removeEventListener(
      "visibilitychange",
      atualizarAoVoltar
    );
  };
}, []);

  useEffect(() => {
    async function carregarPacientes() {
      const { data, error } = await api
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
    const { count, error } = await api
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
    <main className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <CabecalhoPagina
          titulo="Olá, Douglas"
          descricao="Aqui está o resumo dos seus pacientes."
          acao={
            <Link
              href="/pacientes/novo"
              className="p-button p-component no-underline"
            >
              <span className="p-button-icon p-button-icon-left pi pi-plus" />
              <span className="p-button-label">Novo paciente</span>
            </Link>
          }
        />

        <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
          <Card
            titulo="Pacientes"
            valor={carregando ? "..." : String(pacientes.length)}
            icone="pi-users"
            destino="/pacientes"
          />

          <Card
            titulo="Relatórios recebidos"
            valor={
              carregandoRelatorios
                ? "..."
                : erroRelatorios
                  ? "—"
                  : String(relatoriosRecebidos)
            }
            icone="pi-chart-bar"
            destino="/relatorios"
          />

          <Card
            titulo="Não responderam"
            valor={carregandoAtrasados ? "..." : String(naoResponderam)}
            icone="pi-clock"
            destino="/alertas"
            atencao={!carregandoAtrasados && naoResponderam > 0}
          />

          <Card
            titulo="Pagamentos recebidos"
            valor={carregando ? "..." : String(pagamentosPendentes)}
            icone="pi-wallet"
            destino="/pagamentos"
          />
        </section>

        {erro && (
          <Message severity="error" text={erro} className="mt-4 w-full justify-start" />
        )}

        {erroRelatorios && (
          <Message
            severity="error"
            text={erroRelatorios}
            className="mt-4 w-full justify-start"
          />
        )}

        <section className="cartao mt-6 p-5 lg:p-6">
          <h2 className="text-xl font-bold text-gray-900">
            Enviar notificação personalizada
          </h2>

          <p className="mt-1 text-sm text-gray-600">
            Escreva uma mensagem para enviar aos pacientes que possuem
            notificações ativadas.
          </p>

          <InputTextarea
            value={mensagemPersonalizada}
            onChange={(e) => setMensagemPersonalizada(e.target.value)}
            maxLength={300}
            rows={4}
            autoResize
            className="mt-4 w-full"
            placeholder="Digite sua mensagem..."
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs tabular-nums text-gray-500">
              {mensagemPersonalizada.length}/300 caracteres
            </p>

            <Button
              type="button"
              onClick={enviarNotificacaoPersonalizada}
              loading={enviandoNotificacaoPersonalizada}
              icon="pi pi-send"
              label={
                enviandoNotificacaoPersonalizada
                  ? "Enviando notificações..."
                  : "Enviar para todos os pacientes"
              }
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function Card({
  titulo,
  valor,
  icone,
  destino,
  atencao = false,
}: {
  titulo: string;
  valor: string;
  icone: string;
  destino: string;
  atencao?: boolean;
}) {
  return (
    <Link
      href={destino}
      className="cartao block p-4 no-underline transition hover:border-primary-300 lg:p-5"
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-xl ${
          atencao
            ? "bg-atencao-50 text-atencao-700"
            : "bg-primary-50 text-primary-700"
        }`}
      >
        <i className={`pi ${icone}`} aria-hidden />
      </span>

      <p className="mt-3 font-[family-name:var(--fonte-titulo)] text-3xl font-bold tabular-nums text-gray-900">
        {valor}
      </p>

      <p className="mt-0.5 text-sm text-gray-500">{titulo}</p>
    </Link>
  );
}

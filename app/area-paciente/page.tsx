"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import AnelDeAdesao from "@/components/AnelDeAdesao";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
function converterChaveVapid(chave: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (chave.length % 4)) % 4);

  const base64 = (chave + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const dados = atob(base64);
  const resultado = new Uint8Array(new ArrayBuffer(dados.length));

  for (let i = 0; i < dados.length; i++) {
    resultado[i] = dados.charCodeAt(i);
  }

  return resultado;
}

export default function AreaPacientePage() {
    const router = useRouter();

    const [paciente, setPaciente] = useState<any>(null);
    const [cicloAtivo, setCicloAtivo] = useState<any>(null);
    const [dietaNaoVisualizada, setDietaNaoVisualizada] = useState(false);
const [devolutivaNaoVisualizada, setDevolutivaNaoVisualizada] = useState(false);
const [pagamentoAtrasado, setPagamentoAtrasado] = useState(false);
    const [numeroRelatorio, setNumeroRelatorio] = useState<number | null>(null);
    const [relatorioDisponivel, setRelatorioDisponivel] = useState(false);
    const [ultimoRelatorioDoCiclo, setUltimoRelatorioDoCiclo] = useState(false);
    const [mostrarPlanosRenovacao, setMostrarPlanosRenovacao] = useState(false);
    const [ultimoScore, setUltimoScore] = useState<number | null>(null);
    const [ativandoNotificacoes, setAtivandoNotificacoes] = useState(false);
    const [notificacoesAtivas, setNotificacoesAtivas] = useState(false);

    // Se este aparelho já está inscrito, não oferece a ativação de novo.
    useEffect(() => {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        Notification.permission !== "granted"
      ) {
        return;
      }

      navigator.serviceWorker.ready
        .then((registro) => registro.pushManager.getSubscription())
        .then((inscricao) => setNotificacoesAtivas(inscricao !== null))
        .catch(() => {});
    }, []);
    async function sair() {
  await api.auth.signOut();
  window.location.href = "/login";
}

async function solicitarRenovacao(planoEscolhido: string) {
  if (!paciente) return;

  const { data: ultimoRelatorio, error } = await api
  .from("patient_reports")
  .select("weight")
  .eq("patient_id", paciente.id)
  .not("weight", "is", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (error) {
  console.error("Erro ao buscar último peso:", error);
  avisar("Não foi possível solicitar a renovação.");
  return;
}

console.log("ÚLTIMO PESO:", ultimoRelatorio?.weight);
const { error: erroRenovacao } = await api
  .from("renewal_requests")
  .insert({
    patient_id: paciente.id,
    cycle_id: cicloAtivo?.id ?? null,
    last_weight: ultimoRelatorio?.weight ?? paciente.initial_weight ?? null,
    requested_plan: planoEscolhido,
    status: "pendente",
  });

if (erroRenovacao) {
  console.error("Erro ao solicitar renovação:", erroRenovacao);
  avisar("Não foi possível solicitar a renovação.");
  return;
}

avisar("Solicitação de renovação enviada com sucesso!");
}

    useEffect(() => {
  async function carregarPaciente() {
    const {
      data: { user },
    } = await api.auth.getUser();

    console.log("USUÁRIO LOGADO:", user);
    if (!user) return;

const { data, error } = await api
  .from("patients")
  .select("*")
  .eq("auth_user_id", user.id)
  .single();

if (error) {
  console.error("Erro ao carregar paciente:", error);
  return;
}

setPaciente(data);

// Score do relatório mais recente, mostrado no anel da tela inicial.
const { data: relatorioRecente } = await api
  .from("patient_reports")
  .select("adherence_score")
  .eq("patient_id", data.id)
  .not("adherence_score", "is", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

setUltimoScore(relatorioRecente?.adherence_score ?? null);
// Verificar pagamentos atrasados do paciente
const { data: pagamentos, error: erroPagamentos } = await api
  .from("payments")
  .select(`
    id,
    status,
    receipt_uploaded_at,
    diet_cycles (
      start_date
    )
  `)
  .eq("patient_id", data.id)
  .eq("status", "pendente")
  .is("receipt_uploaded_at", null)
  .not("cycle_id", "is", null);

if (erroPagamentos) {
  console.error("Erro ao verificar pagamentos atrasados:", erroPagamentos);
} else {
  const hoje = new Date();

  const existePagamentoAtrasado = (pagamentos ?? []).some((pagamento) => {
    const ciclo = pagamento.diet_cycles as unknown as {
      start_date: string;
    } | null;

    if (!ciclo?.start_date) return false;

    const vencimento = new Date(`${ciclo.start_date}T12:00:00Z`);
vencimento.setUTCDate(vencimento.getUTCDate() + 30);

const dataHojeBrasil = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(hoje);

const dataVencimento = vencimento.toISOString().slice(0, 10);

return dataHojeBrasil >= dataVencimento;
  });

  setPagamentoAtrasado(existePagamentoAtrasado);
}
const { data: entregasDietas, error: erroDietas } = await api
  .from("diet_deliveries")
  .select("id")
  .eq("patient_id", data.id);

const { data: relatoriosPublicados, error: erroRelatorios } = await api
  .from("patient_reports")
  .select("id, feedback_text, created_at")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .order("created_at", { ascending: false })
  .limit(4);

const { data: visualizacoes, error: erroVisualizacoes } = await api
  .from("patient_update_views")
  .select("update_type, reference_id")
  .eq("patient_id", data.id);

if (erroDietas || erroRelatorios || erroVisualizacoes) {
  console.error("Erro ao verificar atualizações:", {
    erroDietas,
    erroRelatorios,
    erroVisualizacoes,
  });
} else {
  const dietasVisualizadas = new Set(
    (visualizacoes ?? [])
      .filter((v) => v.update_type === "dieta")
      .map((v) => v.reference_id)
  );

  const devolutivasVisualizadas = new Set(
    (visualizacoes ?? [])
      .filter((v) => v.update_type === "devolutiva")
      .map((v) => v.reference_id)
  );

  setDietaNaoVisualizada(
    (entregasDietas ?? []).some(
      (dieta) => !dietasVisualizadas.has(dieta.id)
    )
  );

  setDevolutivaNaoVisualizada(
    (relatoriosPublicados ?? []).some(
      (relatorio) =>
        relatorio.feedback_text?.trim() &&
        !devolutivasVisualizadas.has(relatorio.id)
    )
  );
}

const { data: ciclo } = await api
  .from("diet_cycles")
  .select("*")
  .eq("patient_id", data.id)
  .eq("status", "ativo")
  .maybeSingle();

setCicloAtivo(ciclo);
console.log("CICLO ATIVO:", ciclo);

if (ciclo) {
  const partesDataBrasil = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());

const anoBrasil = Number(
  partesDataBrasil.find((parte) => parte.type === "year")?.value
);

const mesBrasil = Number(
  partesDataBrasil.find((parte) => parte.type === "month")?.value
);

const diaBrasil = Number(
  partesDataBrasil.find((parte) => parte.type === "day")?.value
);

const dataHojeBrasil = new Date(
  Date.UTC(anoBrasil, mesBrasil - 1, diaBrasil, 12)
);

const diaSemanaBrasil = dataHojeBrasil.getUTCDay();

const segundaAtualBrasil = new Date(dataHojeBrasil);

segundaAtualBrasil.setUTCDate(
  segundaAtualBrasil.getUTCDate() - ((diaSemanaBrasil + 6) % 7)
);

const semanaAtualBrasil = segundaAtualBrasil
  .toISOString()
  .slice(0, 10);
  const dentroDoPrazoRelatorio =
  diaSemanaBrasil === 1 || diaSemanaBrasil === 2;
  const { data: ultimoRelatorio } = await api
    .from("patient_reports")
    .select("cycle_report_number")
    .eq("cycle_id", ciclo.id)
    .not("cycle_report_number", "is", null)
    .order("cycle_report_number", { ascending: false })
    .limit(1)
    .maybeSingle();

 
const numeroAtual = Number(ultimoRelatorio?.cycle_report_number ?? 0);
const frequencia = ciclo.followup_frequency?.trim().toLowerCase();
const intervaloDias =
  frequencia === "semanal"
    ? 7
    : frequencia === "quinzenal"
    ? 15
    : frequencia === "mensal"
    ? 30
    : null;

const quantidadePrevista =
  frequencia === "semanal"
    ? 4
    : frequencia === "quinzenal"
    ? 2
    : frequencia === "mensal"
    ? 1
    : 0;
    const calcularSegundaPrevista = (numero: number) => {
  if (intervaloDias === null) return null;

  const cadastroRetroativo =
    Boolean(ciclo.retroactive_registered_at) &&
    data.retroactive_registration === true &&
    (data.retroactive_completed_weeks ?? 0) > 0;

  let dataPrevista: Date;

  if (cadastroRetroativo) {
    const dataCadastro = new Date(
      `${ciclo.retroactive_registered_at}T12:00:00Z`
    );

    const diasDesdeSegundaCadastro =
      (dataCadastro.getUTCDay() + 6) % 7;

    dataCadastro.setUTCDate(
      dataCadastro.getUTCDate() - diasDesdeSegundaCadastro
    );

    const diasJaConcluidos =
      data.retroactive_completed_weeks * 7;

    const intervaloRetroativoDias =
      frequencia === "semanal"
        ? 7
        : frequencia === "quinzenal"
        ? 14
        : 28;

    const diasParaRelatorio =
      intervaloRetroativoDias * numero - diasJaConcluidos;

    dataCadastro.setUTCDate(
      dataCadastro.getUTCDate() + diasParaRelatorio
    );

    dataPrevista = dataCadastro;
  } else {
    dataPrevista = new Date(
      `${ciclo.start_date}T12:00:00Z`
    );

    dataPrevista.setUTCDate(
      dataPrevista.getUTCDate() + intervaloDias * numero
    );
  }

  const diaSemana = dataPrevista.getUTCDay();
  const diasDesdeSegunda = (diaSemana + 6) % 7;

  const ajuste =
    diasDesdeSegunda <= 3
      ? -diasDesdeSegunda
      : 7 - diasDesdeSegunda;

  dataPrevista.setUTCDate(
    dataPrevista.getUTCDate() + ajuste
  );

  return dataPrevista.toISOString().slice(0, 10);
};
let numeroPrevistoNestaSemana: number | null = null;

for (let numero = 1; numero <= quantidadePrevista; numero++) {
  if (calcularSegundaPrevista(numero) === semanaAtualBrasil) {
    numeroPrevistoNestaSemana = numero;
    break;
  }
}

const { data: relatoriosRespondidos } = await api
  .from("patient_reports")
  .select("scheduled_week_start")
  .eq("cycle_id", ciclo.id)
  .eq("scheduled_week_start", semanaAtualBrasil);

const relatorioJaRespondido =
  (relatoriosRespondidos?.length ?? 0) > 0;

setRelatorioDisponivel(
  dentroDoPrazoRelatorio &&
  numeroPrevistoNestaSemana !== null &&
  !relatorioJaRespondido
);
setNumeroRelatorio(
  Math.max(
    numeroPrevistoNestaSemana ?? 0,
    Number(ultimoRelatorio?.cycle_report_number ?? 0),
    1
  )
);

if (frequencia === "semanal") {
  setUltimoRelatorioDoCiclo(numeroAtual >= 4);
} else if (frequencia === "quinzenal") {
  setUltimoRelatorioDoCiclo(numeroAtual >= 2);
} else if (frequencia === "mensal") {
  setUltimoRelatorioDoCiclo(numeroAtual >= 1);
}

console.log("ÚLTIMO RELATÓRIO:", ultimoRelatorio);
}

console.log("PACIENTE ENCONTRADO:", data);
}

carregarPaciente();
}, []);

  async function ativarNotificacoes() {
    setAtivandoNotificacoes(true);

    try {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        avisar("Este navegador não oferece suporte a notificações push.");
        return;
      }

      const permissao = await Notification.requestPermission();

      if (permissao !== "granted") {
        avisar("As notificações não foram autorizadas.");
        return;
      }

      const registro = await navigator.serviceWorker.ready;

      const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      if (!chavePublica) {
        avisar("A chave pública das notificações não foi configurada.");
        return;
      }

      if (!paciente?.id) {
        avisar("Não foi possível identificar o paciente.");
        return;
      }

      const inscricaoExistente = await registro.pushManager.getSubscription();

      const inscricao =
        inscricaoExistente ??
        (await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: converterChaveVapid(chavePublica),
        }));

      const dadosInscricao = inscricao.toJSON();

      if (
        !dadosInscricao.endpoint ||
        !dadosInscricao.keys?.p256dh ||
        !dadosInscricao.keys?.auth
      ) {
        avisar("Não foi possível obter os dados da inscrição push.");
        return;
      }

      const { error: erroCadastro } = await api
        .from("push_subscriptions")
        .upsert(
          {
            patient_id: paciente.id,
            endpoint: dadosInscricao.endpoint,
            p256dh: dadosInscricao.keys.p256dh,
            auth_key: dadosInscricao.keys.auth,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "endpoint",
          }
        );

      if (erroCadastro) {
        console.error("Erro ao cadastrar dispositivo:", erroCadastro);
        avisar("Não foi possível cadastrar este dispositivo.");
        return;
      }

      setNotificacoesAtivas(true);
      avisar("Notificações ativadas e dispositivo cadastrado com sucesso!");
    } catch (erro) {
      console.error("Erro ao preparar notificações:", erro);
      avisar("Não foi possível preparar as notificações.");
    } finally {
      setAtivandoNotificacoes(false);
    }
  }

  // Quantos relatórios ainda faltam neste ciclo, em texto.
  function descreverRelatoriosRestantes(): string | null {
    if (!cicloAtivo || numeroRelatorio === null) {
      return null;
    }

    const frequencia = cicloAtivo.followup_frequency?.trim().toLowerCase();

    const totalRelatorios =
      frequencia === "semanal"
        ? 4
        : frequencia === "quinzenal"
        ? 2
        : frequencia === "mensal"
        ? 1
        : 0;

    const semanasConcluidas =
      cicloAtivo.retroactive_registered_at && paciente?.retroactive_registration
        ? Number(paciente.retroactive_completed_weeks ?? 0)
        : 0;

    const intervaloRetroativo =
      frequencia === "semanal" ? 1 : frequencia === "quinzenal" ? 2 : 4;

    const relatoriosJaPassados = cicloAtivo.retroactive_registered_at
      ? Math.min(
          totalRelatorios,
          Math.floor(semanasConcluidas / intervaloRetroativo)
        )
      : 0;

    const numeroAtual = numeroRelatorio ?? 1;

    const dataHojeBrasil = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const dataInicioCiclo = new Date(`${cicloAtivo.start_date}T12:00:00Z`);
    const dataHoje = new Date(`${dataHojeBrasil}T12:00:00Z`);

    const diasDesdeInicio = Math.floor(
      (dataHoje.getTime() - dataInicioCiclo.getTime()) / (1000 * 60 * 60 * 24)
    );

    const primeiroRelatorioAindaNaoChegou =
      !cicloAtivo.retroactive_registered_at &&
      diasDesdeInicio <
        (frequencia === "semanal" ? 7 : frequencia === "quinzenal" ? 15 : 30);

    const ultimoRelatorioPassado = primeiroRelatorioAindaNaoChegou
      ? 0
      : Math.max(relatoriosJaPassados, numeroAtual);

    const restantes = Math.max(0, totalRelatorios - ultimoRelatorioPassado);

    if (restantes === 0) {
      return relatorioDisponivel
        ? "Você tem um relatório nutricional disponível para preencher."
        : "Todos os relatórios deste acompanhamento foram concluídos ou tiveram seu prazo encerrado";
    }

    return restantes === 1
      ? "Resta 1 relatório a ser preenchido"
      : `Restam ${restantes} relatórios a serem preenchidos`;
  }

  // A renovação é oferecida sem ciclo ativo ou na última semana do ciclo.
  function podeRenovar(): boolean {
    const hojeBrasil = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const inicioUltimaSemana = cicloAtivo?.end_date
      ? new Date(`${cicloAtivo.end_date}T12:00:00Z`)
      : null;

    inicioUltimaSemana?.setUTCDate(inicioUltimaSemana.getUTCDate() - 7);

    return (
      !cicloAtivo ||
      (inicioUltimaSemana !== null &&
        hojeBrasil >= inicioUltimaSemana.toISOString().slice(0, 10))
    );
  }

  const primeiroNome = paciente?.name?.trim().split(/\s+/)[0];
  const relatoriosRestantes = descreverRelatoriosRestantes();

  const atalhos = [
    {
      rotulo: "Dieta",
      descricao: dietaNaoVisualizada ? "Você tem uma dieta nova" : "Meu plano alimentar",
      icone: "pi-book",
      destino: "/area-paciente/dietas",
      novidade: dietaNaoVisualizada,
    },
    {
      rotulo: "Relatórios",
      descricao: devolutivaNaoVisualizada
        ? "Chegou uma devolutiva do nutricionista"
        : "Minhas devolutivas e evolução",
      icone: "pi-chart-bar",
      destino: "/area-paciente/relatorios",
      novidade: devolutivaNaoVisualizada,
    },
    {
      rotulo: "Pagamentos",
      descricao: pagamentoAtrasado ? "Há um pagamento em atraso" : "Comprovantes",
      icone: "pi-credit-card",
      destino: "/area-paciente/pagamentos",
      novidade: pagamentoAtrasado,
    },
  ];

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Área do paciente</p>
            <h1 className="mt-0.5 truncate text-3xl font-bold text-gray-900">
              Olá, {primeiroNome ?? "Paciente"}
            </h1>
          </div>

          <Button
            type="button"
            icon="pi pi-sign-out"
            label="Sair"
            text
            severity="secondary"
            size="small"
            onClick={sair}
          />
        </header>

        {/* Relatório da semana: a ação principal do paciente. */}
        <section
          className={`mt-6 rounded-2xl p-5 ${
            relatorioDisponivel
              ? "bg-primary-800 text-white"
              : "cartao text-gray-900"
          }`}
        >
          <div className="flex items-center gap-4">
            <AnelDeAdesao
              valor={ultimoScore}
              tamanho={88}
              claro={relatorioDisponivel}
              rotulo={ultimoScore === null ? "sem score" : "último score"}
            />

            <div className="min-w-0">
              <h2 className="text-lg font-bold leading-snug">
                {relatorioDisponivel
                  ? "Relatório nutricional disponível para preenchimento"
                  : "Nenhum relatório disponível no momento"}
              </h2>

              {relatoriosRestantes && (
                <p
                  className={`mt-1 text-sm ${
                    relatorioDisponivel ? "text-white/75" : "text-gray-600"
                  }`}
                >
                  {relatoriosRestantes}
                </p>
              )}
            </div>
          </div>

          {relatorioDisponivel && (
            <Button
              type="button"
              onClick={() => router.push("/area-paciente/acompanhamento")}
              label="Preencher relatório nutricional"
              icon="pi pi-file-edit"
              className="mt-5 w-full"
              pt={{
                root: {
                  className:
                    "border-white bg-white text-primary-800 hover:bg-primary-50",
                },
              }}
            />
          )}

          {ultimoRelatorioDoCiclo && (
            <p
              className={`mt-4 text-sm ${
                relatorioDisponivel ? "text-white/85" : "text-primary-700"
              }`}
            >
              Você chegou à etapa final dos relatórios deste acompanhamento.
              Seu acompanhamento permanece ativo até a data de encerramento.
            </p>
          )}
        </section>

        <nav className="cartao mt-4 divide-y divide-gray-200" aria-label="Atalhos">
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
                <span className="block font-semibold text-gray-900">
                  {atalho.rotulo}
                </span>
                <span
                  className={`block truncate text-sm ${
                    atalho.novidade
                      ? "font-medium text-atencao-700"
                      : "text-gray-500"
                  }`}
                >
                  {atalho.descricao}
                </span>
              </span>

              {atalho.novidade && <span className="ponto-novidade" aria-hidden />}
              <i className="pi pi-chevron-right text-sm text-gray-400" aria-hidden />
            </button>
          ))}
        </nav>

        {podeRenovar() && (
          <section className="cartao mt-4 p-5">
            <h2 className="text-lg font-bold text-gray-900">
              Renove seu acompanhamento nutricional
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Deseja renovar seu acompanhamento nutricional?
            </p>

            {!mostrarPlanosRenovacao ? (
              <Button
                type="button"
                label="Renovar acompanhamento"
                icon="pi pi-refresh"
                className="mt-4 w-full"
                onClick={() => setMostrarPlanosRenovacao(true)}
              />
            ) : (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <p className="font-semibold text-gray-900">
                  Qual plano deseja renovar?
                </p>

                <div className="mt-3 flex flex-col gap-2">
                  {["Semanal", "Quinzenal", "Mensal"].map((plano) => (
                    <Button
                      key={plano}
                      type="button"
                      label={plano}
                      outlined
                      className="w-full justify-start"
                      onClick={() => solicitarRenovacao(plano)}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="cartao mt-4 flex items-center gap-4 p-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-atencao-50 text-atencao-700">
            <i className="pi pi-bell text-lg" aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-gray-900">
              Notificações do acompanhamento
            </h2>
            <p className="text-sm text-gray-500">
              {notificacoesAtivas
                ? "Este aparelho já recebe os avisos."
                : "Receba um aviso no celular quando chegar o momento de responder ao seu relatório nutricional."}
            </p>

            {!notificacoesAtivas && (
              <Button
                type="button"
                label="Ativar notificações"
                size="small"
                outlined
                loading={ativandoNotificacoes}
                className="mt-3"
                onClick={ativarNotificacoes}
              />
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() =>
            avisar(
              "Em breve, você terá acesso a benefícios e condições especiais oferecidos pelos nossos parceiros!",
              "info"
            )
          }
          className="cartao mt-4 flex w-full items-center gap-4 p-4 text-left hover:bg-gray-50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-600">
            <i className="pi pi-users text-lg" aria-hidden />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-gray-900">Parceiros</span>
            <span className="block text-sm text-gray-500">
              Benefícios e contatos
            </span>
          </span>

          <i className="pi pi-chevron-right text-sm text-gray-400" aria-hidden />
        </button>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import AvisoDeInstalacao from "@/components/AvisoDeInstalacao";
import AnelDeAdesao from "@/components/AnelDeAdesao";
import EnvioExame from "@/components/EnvioExame";
import FaixaDeParceiros from "@/components/FaixaDeParceiros";
import EnvioTreino from "@/components/EnvioTreino";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import {
  hojeNoBrasil,
  relatorioAbertoHoje,
  segundasPrevistas,
  situacaoDosRelatorios,
  type SituacaoDosRelatorios,
} from "@/lib/cronograma";
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
    // Fórmulas e avaliações físicas novas (ficam na aba Dietas).
    const [documentoNaDieta, setDocumentoNaDieta] = useState(false);
    const [formularios, setFormularios] = useState<{ total: number; pendentes: number }>({ total: 0, pendentes: 0 });
    const [documentos, setDocumentos] = useState<{ total: number; novos: number }>({ total: 0, novos: 0 });
    const [numeroRelatorio, setNumeroRelatorio] = useState<number | null>(null);
    const [relatorioDisponivel, setRelatorioDisponivel] = useState(false);
    const [ultimoRelatorioDoCiclo, setUltimoRelatorioDoCiclo] = useState(false);
    const [mostrarPlanosRenovacao, setMostrarPlanosRenovacao] = useState(false);
    const [ultimoScore, setUltimoScore] = useState<number | null>(null);
    const [situacao, setSituacao] = useState<SituacaoDosRelatorios | null>(null);
    const [renovacaoSolicitada, setRenovacaoSolicitada] = useState(false);
    const [enviandoRenovacao, setEnviandoRenovacao] = useState(false);
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

    // Fórmulas e avaliações físicas não abertas acendem o aviso da Dieta.
    useEffect(() => {
      fetch("/api/area-paciente/publicacoes", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { documentos: [] }))
        .then((d: { documentos?: { novo: boolean }[] }) => setDocumentoNaDieta((d.documentos ?? []).some((doc) => doc.novo)))
        .catch(() => {});
      // Documentos (solicitação de exames, orientações): só para quem recebeu algum.
      fetch("/api/area-paciente/documentos", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { documentos?: { novo: boolean }[] } | null) =>
          setDocumentos({ total: d?.documentos?.length ?? 0, novos: (d?.documentos ?? []).filter((x) => x.novo).length })
        )
        .catch(() => {});
      // Formulários (anamnese e recordatório): só para quem recebeu algum.
      fetch("/api/area-paciente/formularios", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { anamneses?: { editavel: boolean; respondido_em: string | null }[]; recordatorios?: { editavel: boolean; respondido_em: string | null }[] } | null) => {
          const todos = [...(d?.anamneses ?? []), ...(d?.recordatorios ?? [])];
          setFormularios({ total: todos.length, pendentes: todos.filter((f) => f.editavel && !f.respondido_em).length });
        })
        .catch(() => {});
    }, []);
    async function sair() {
  await api.auth.signOut();
  window.location.href = "/login";
}

async function solicitarRenovacao(planoEscolhido: string): Promise<boolean> {
  if (!paciente) return false;

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
  return false;
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
  return false;
}

avisar("Solicitação de renovação enviada com sucesso!");
return true;
}

// Uma solicitação por vez: os botões somem assim que ela é registrada.
async function pedirRenovacao(planoEscolhido: string) {
  if (enviandoRenovacao || renovacaoSolicitada) return;

  setEnviandoRenovacao(true);
  const registrada = await solicitarRenovacao(planoEscolhido);
  setEnviandoRenovacao(false);

  if (registrada) {
    setRenovacaoSolicitada(true);
    setMostrarPlanosRenovacao(false);
  }
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

const { data: renovacoesPendentes } = await api
  .from("renewal_requests")
  .select("id")
  .eq("patient_id", data.id)
  .eq("status", "pendente")
  .limit(1);

setRenovacaoSolicitada((renovacoesPendentes ?? []).length > 0);
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
  // Agenda dos relatórios (regra única em lib/cronograma.ts).
  const semanasConcluidas = data.retroactive_registration
    ? Number(data.retroactive_completed_weeks ?? 0)
    : 0;

  const hoje = hojeNoBrasil();
  const previstos = segundasPrevistas(ciclo, semanasConcluidas);

  const { data: respondidos } = await api
    .from("patient_reports")
    .select("scheduled_week_start, cycle_report_number")
    .eq("cycle_id", ciclo.id);

  const semanasRespondidas = new Set<string>(
    (respondidos ?? [])
      .map((relatorio) => relatorio.scheduled_week_start)
      .filter(Boolean)
  );

  setRelatorioDisponivel(
    relatorioAbertoHoje(
      previstos,
      hoje,
      semanasRespondidas,
      ciclo.retroactive_registered_at
    ) !== null
  );

  setSituacao(
    situacaoDosRelatorios(ciclo, semanasConcluidas, hoje, semanasRespondidas)
  );

  const ultimoNumeroRespondido = Math.max(
    0,
    ...(respondidos ?? []).map((relatorio) => Number(relatorio.cycle_report_number ?? 0))
  );

  setUltimoRelatorioDoCiclo(
    previstos.length > 0 && ultimoNumeroRespondido >= previstos.length
  );
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

  const primeiroNome = paciente?.name?.trim().split(/\s+/)[0];
  const relatoriosRestantes = situacao?.mensagem ?? null;

  const atalhos = [
    {
      rotulo: "Dieta",
      descricao: dietaNaoVisualizada
        ? "Você tem uma dieta nova"
        : documentoNaDieta
          ? "Novo documento disponível"
          : "Dietas, fórmulas e avaliações",
      icone: "pi-book",
      destino: "/area-paciente/dietas",
      novidade: dietaNaoVisualizada || documentoNaDieta,
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
    ...(documentos.total
      ? [
          {
            rotulo: "Documentos",
            descricao: documentos.novos ? "Você recebeu um documento novo" : "Exames solicitados e orientações",
            icone: "pi-folder-open",
            destino: "/area-paciente/documentos",
            novidade: documentos.novos > 0,
          },
        ]
      : []),
    ...(formularios.total
      ? [
          {
            rotulo: "Formulários",
            descricao: formularios.pendentes ? "Você tem formulário para preencher" : "Anamnese e recordatório",
            icone: "pi-file-edit",
            destino: "/area-paciente/formularios",
            novidade: formularios.pendentes > 0,
          },
        ]
      : []),
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
              {/* Sem nome provisório: aparece só quando o cadastro carrega. */}
              Olá{primeiroNome ? `, ${primeiroNome}` : ""}
            </h1>
          </div>

          <div className="flex shrink-0 flex-col items-end">
            <Button
              type="button"
              icon="pi pi-sign-out"
              label="Sair"
              text
              severity="secondary"
              size="small"
              onClick={sair}
            />
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

        {/* Faixa com os parceiros cadastrados (uma vez por sessão). */}
        <FaixaDeParceiros />

        <AvisoDeInstalacao />

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

        {paciente && <EnvioExame pacienteId={paciente.id} />}

        {paciente && <EnvioTreino pacienteId={paciente.id} />}

        {paciente && (!cicloAtivo || situacao?.podeRenovar) && (
          <section className="cartao mt-4 p-5">
            <h2 className="text-lg font-bold text-gray-900">
              Renove seu acompanhamento nutricional
            </h2>

            <p className="mt-1 text-sm text-gray-600">
              Deseja renovar seu acompanhamento nutricional?
            </p>

            {renovacaoSolicitada ? (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-sm font-medium text-primary-800">
                <i className="pi pi-check-circle mt-0.5" aria-hidden />
                <span>
                  Solicitação de renovação enviada. Aguarde o contato do
                  nutricionista.
                </span>
              </p>
            ) : !mostrarPlanosRenovacao ? (
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
                      disabled={enviandoRenovacao}
                      onClick={() => pedirRenovacao(plano)}
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
          onClick={() => router.push("/area-paciente/parceiros")}
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

      <p className="mt-6 text-center text-sm">
        <a href="/privacidade" className="text-gray-500 underline">
          Política de privacidade
        </a>
      </p>
    </main>
  );
}

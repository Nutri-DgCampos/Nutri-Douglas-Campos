"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
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
    async function sair() {
  await supabase.auth.signOut();
  window.location.href = "/login";
}

async function solicitarRenovacao(planoEscolhido: string) {
  if (!paciente) return;

  const { data: ultimoRelatorio, error } = await supabase
  .from("patient_reports")
  .select("weight")
  .eq("patient_id", paciente.id)
  .not("weight", "is", null)
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (error) {
  console.error("Erro ao buscar último peso:", error);
  alert("Não foi possível solicitar a renovação.");
  return;
}

console.log("ÚLTIMO PESO:", ultimoRelatorio?.weight);
const { error: erroRenovacao } = await supabase
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
  alert("Não foi possível solicitar a renovação.");
  return;
}

alert("Solicitação de renovação enviada com sucesso!");
}

    useEffect(() => {
  async function carregarPaciente() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    console.log("USUÁRIO LOGADO:", user);
    if (!user) return;

const { data, error } = await supabase
  .from("patients")
  .select("*")
  .eq("auth_user_id", user.id)
  .single();

if (error) {
  console.error("Erro ao carregar paciente:", error);
  return;
}

setPaciente(data);
// Verificar pagamentos atrasados do paciente
const { data: pagamentos, error: erroPagamentos } = await supabase
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
const { data: entregasDietas, error: erroDietas } = await supabase
  .from("diet_deliveries")
  .select("id")
  .eq("patient_id", data.id);

const { data: relatoriosPublicados, error: erroRelatorios } = await supabase
  .from("patient_reports")
  .select("id, feedback_text, created_at")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .order("created_at", { ascending: false })
  .limit(4);

const { data: visualizacoes, error: erroVisualizacoes } = await supabase
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

const { data: ciclo } = await supabase
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
  const { data: ultimoRelatorio } = await supabase
    .from("patient_reports")
    .select("cycle_report_number")
    .eq("cycle_id", ciclo.id)
    .not("cycle_report_number", "is", null)
    .order("cycle_report_number", { ascending: false })
    .limit(1)
    .maybeSingle();

 
const numeroAtual = ultimoRelatorio?.cycle_report_number ?? 1;
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

  const dataPrevista = new Date(
    `${ciclo.start_date}T12:00:00Z`
  );

  dataPrevista.setUTCDate(
    dataPrevista.getUTCDate() + intervaloDias * numero
  );

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

const { data: relatoriosRespondidos } = await supabase
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
  numeroPrevistoNestaSemana ??
    ultimoRelatorio?.cycle_report_number ??
    1
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

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-medium text-blue-600">
          Área do paciente
        </p>

        <h1 className="mt-1 text-3xl font-bold text-gray-900">
  Olá, {paciente?.name ?? "Paciente"} 👋
</h1>

        <p className="mt-2 text-gray-600">
          Acompanhe sua evolução e seu plano nutricional.
        </p>

        <button
  onClick={sair}
  className="mt-4 text-sm font-semibold text-red-600 hover:text-red-700"
>
  Sair
</button>

<div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5">
  <h2 className="text-lg font-bold text-gray-900">
    🔔 Notificações do acompanhamento
  </h2>

  <p className="mt-2 text-sm text-gray-600">
    Receba um aviso no celular quando chegar o momento de
    responder ao seu relatório nutricional.
  </p>

  <button
  type="button"
  onClick={async () => {
    try {
      if (
        !("Notification" in window) ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        alert("Este navegador não oferece suporte a notificações push.");
        return;
      }

      const permissao = await Notification.requestPermission();

      if (permissao !== "granted") {
        alert("As notificações não foram autorizadas.");
        return;
      }

      const registro = await navigator.serviceWorker.ready;

      const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

if (!chavePublica) {
  alert("A chave pública das notificações não foi configurada.");
  return;
}

if (!paciente?.id) {
  alert("Não foi possível identificar o paciente.");
  return;
}

const inscricaoExistente =
  await registro.pushManager.getSubscription();

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
  alert("Não foi possível obter os dados da inscrição push.");
  return;
}

const { error: erroCadastro } = await supabase
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
  alert("Não foi possível cadastrar este dispositivo.");
  return;
}

alert("Notificações ativadas e dispositivo cadastrado com sucesso!");

    } catch (erro) {
      console.error("Erro ao preparar notificações:", erro);
      alert("Não foi possível preparar as notificações.");
    }
  }}
  className="mt-4 rounded-lg bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700"
>
  🔔 Ativar notificações
</button>
</div>

{cicloAtivo && (
  <button
    type="button"
    onClick={() => {
      if (relatorioDisponivel) {
        router.push("/area-paciente/acompanhamento");
      } else {
        alert("Não há relatório disponível para preenchimento neste momento.");
      }
    }}
    className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-sm hover:bg-blue-700"
  >
    {relatorioDisponivel && (
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-300 opacity-75"></span>
        <span className="relative inline-flex h-3 w-3 rounded-full bg-green-400"></span>
      </span>
    )}

    📝 Preencher relatório nutricional
  </button>
)}

{cicloAtivo && (
  <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
    
    <p className="mt-1 text-lg font-bold text-gray-900">
  {relatorioDisponivel
    ? `Relatório ${numeroRelatorio ?? 1} disponível`
    : "Nenhum relatório disponível no momento"}
</p>

    <p className="mt-2 text-sm text-gray-600">
  {numeroRelatorio !== null && (() => {
  const frequencia = cicloAtivo.followup_frequency
  ?.trim()
  .toLowerCase();

  const dataInicio = new Date(`${cicloAtivo.start_date}T12:00:00Z`);

const agora = new Date();

const dataAtualBrasil = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(agora);

const dataAtual = new Date(`${dataAtualBrasil}T12:00:00Z`);

const diasDecorridos = Math.max(
  0,
  Math.floor(
    (dataAtual.getTime() - dataInicio.getTime()) /
      (1000 * 60 * 60 * 24)
  )
);

const dataEncerramento = new Date(
  `${cicloAtivo.end_date}T12:00:00Z`
);

const diasRestantes = Math.max(
  0,
  Math.ceil(
    (dataEncerramento.getTime() - dataAtual.getTime()) /
      (1000 * 60 * 60 * 24)
  )
);

if (diasRestantes === 0) {
  return "Período de acompanhamento concluído";
}

if (diasRestantes === 1) {
  return "Resta 1 dia de acompanhamento";
}

return `Restam ${diasRestantes} dias de acompanhamento`;
})()}
</p>

{ultimoRelatorioDoCiclo && (
  <p className="mt-3 font-semibold text-blue-700">
    Você já enviou o último relatório programado deste acompanhamento.
    Seu acompanhamento permanece ativo até a data de encerramento.
  </p>
)}

  </div>
)}

{!cicloAtivo && (
  <div className="mt-8 rounded-2xl bg-white p-5 shadow-sm">
    <p className="text-sm font-semibold text-blue-600">
      🔄 Continuidade do acompanhamento
    </p>

    <h2 className="mt-2 text-lg font-semibold text-gray-900">
      Seu acompanhamento foi concluído
    </h2>

    <p className="mt-1 text-sm text-gray-600">
      Deseja renovar seu acompanhamento nutricional?
    </p>

    <button
      type="button"
      onClick={() => setMostrarPlanosRenovacao(true)}
      className="mt-4 font-bold text-red-600 underline hover:text-red-700"
    >
      CLIQUE AQUI para renovar →
    </button>

    {mostrarPlanosRenovacao && (
  <div className="mt-5 border-t border-gray-200 pt-4">
    <p className="font-semibold text-gray-900">
      Qual plano deseja renovar?
    </p>

    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => solicitarRenovacao("Semanal")}
        className="rounded-xl border border-blue-200 px-4 py-3 text-left font-semibold text-blue-700 hover:bg-blue-50"
      >
        Semanal
      </button>

      <button
        type="button"
        onClick={() => solicitarRenovacao("Quinzenal")}
        className="rounded-xl border border-blue-200 px-4 py-3 text-left font-semibold text-blue-700 hover:bg-blue-50"
      >
        Quinzenal
      </button>

      <button
        type="button"
        onClick={() => solicitarRenovacao("Mensal")}
        className="rounded-xl border border-blue-200 px-4 py-3 text-left font-semibold text-blue-700 hover:bg-blue-50"
      >
        Mensal
      </button>
    </div>
  </div>
)}
  </div>
)}

<div className="mt-8 grid grid-cols-2 gap-4">
  <button
  onClick={() => window.location.href = "/area-paciente/dietas"}
  className="relative rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
>
  {dietaNaoVisualizada && (
    <span className="absolute right-4 top-4 h-3 w-3 animate-pulse rounded-full bg-red-600" />
  )}

  <span className="text-2xl">🍽️</span>
  <p className="mt-3 font-semibold text-gray-900">Dieta</p>
  <p className="mt-1 text-sm text-gray-500">Meu plano</p>
</button>

<button
  onClick={() => window.location.href = "/area-paciente/relatorios"}
  className="relative rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
>
  {devolutivaNaoVisualizada && (
    <span className="absolute right-4 top-4 h-3 w-3 animate-pulse rounded-full bg-red-600" />
  )}

  <span className="text-2xl">📋</span>
  <p className="mt-3 font-semibold text-gray-900">Relatórios</p>
  <p className="mt-1 text-sm text-gray-500">Acompanhamento</p>
</button>

<button
  onClick={() => window.location.assign("/area-paciente/pagamentos")}
  className="relative rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
>
  {pagamentoAtrasado && (
    <span className="absolute right-4 top-4 h-3 w-3 animate-pulse rounded-full bg-red-600" />
  )}

  <span className="text-2xl">💳</span>
  <p className="mt-3 font-semibold text-gray-900">Pagamentos</p>
  <p className="mt-1 text-sm text-gray-500">Comprovantes</p>
</button>


<button
  type="button"
  onClick={() =>
    alert(
      "🤝 Em breve, você terá acesso a benefícios e condições especiais oferecidos pelos nossos parceiros!"
    )
  }
  className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
>
  <span className="text-2xl">🤝</span>
  <p className="mt-3 font-semibold text-gray-900">Parceiros</p>
  <p className="mt-1 text-sm text-gray-500">
    Benefícios e contatos
  </p>
</button>
</div>

          </div>
    </main>
  );
}
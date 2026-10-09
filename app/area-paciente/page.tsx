"use client";

import { useEffect, useState } from "react";
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
    const [paciente, setPaciente] = useState<any>(null);
    const [cicloAtivo, setCicloAtivo] = useState<any>(null);
    const [numeroRelatorio, setNumeroRelatorio] = useState<number | null>(null);
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

const { data: ciclo } = await supabase
  .from("diet_cycles")
  .select("*")
  .eq("patient_id", data.id)
  .eq("status", "ativo")
  .maybeSingle();

setCicloAtivo(ciclo);
console.log("CICLO ATIVO:", ciclo);

if (ciclo) {
  const { data: ultimoRelatorio } = await supabase
    .from("patient_reports")
    .select("cycle_report_number")
    .eq("cycle_id", ciclo.id)
    .not("cycle_report_number", "is", null)
    .order("cycle_report_number", { ascending: false })
    .limit(1)
    .maybeSingle();

 setNumeroRelatorio(ultimoRelatorio?.cycle_report_number ?? 1);

const numeroAtual = ultimoRelatorio?.cycle_report_number ?? 1;
const frequencia = data.plan?.trim().toLowerCase();

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
  <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
    
    <p className="mt-1 text-lg font-bold text-gray-900">
      Relatório {numeroRelatorio ?? 1}
    </p>

    <p className="mt-2 text-sm text-gray-600">
  {numeroRelatorio !== null && (() => {
  const frequencia = paciente.plan
    ?.trim()
    .toLowerCase();

  if (frequencia === "semanal") {
    const restantes = 4 - numeroRelatorio;

    return restantes > 0
      ? `Restam ${restantes} ${
          restantes === 1 ? "semana" : "semanas"
        } de acompanhamento`
      : "Última semana de acompanhamento";
  }

  if (frequencia === "quinzenal") {
    return numeroRelatorio < 2
      ? "Resta 1 semana de acompanhamento"
      : "Última semana de acompanhamento";
  }

  return "Último relatório deste acompanhamento";
})()}
</p>

{ultimoRelatorioDoCiclo && (
  <p className="mt-3 font-semibold text-blue-700">
    Você chegou ao último relatório deste acompanhamento.
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
  className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
>
    <span className="text-2xl">🍽️</span>
    <p className="mt-3 font-semibold text-gray-900">Dieta</p>
    <p className="mt-1 text-sm text-gray-500">Meu plano</p>
  </button>

  <button
  onClick={() => window.location.href = "/area-paciente/relatorios"}
  className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
>
    <span className="text-2xl">📋</span>
    <p className="mt-3 font-semibold text-gray-900">Relatórios</p>
    <p className="mt-1 text-sm text-gray-500">Acompanhamento</p>
  </button>

  
<button
  onClick={() => window.location.assign("/area-paciente/pagamentos")}
  className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md"
>

    <span className="text-2xl">💳</span>
    <p className="mt-3 font-semibold text-gray-900">Pagamentos</p>
    <p className="mt-1 text-sm text-gray-500">Comprovantes</p>
  </button>

  <button className="rounded-2xl bg-white p-5 text-left shadow-sm transition hover:shadow-md">
    <span className="text-2xl">🤝</span>
    <p className="mt-3 font-semibold text-gray-900">Parceiros</p>
    <p className="mt-1 text-sm text-gray-500">Benefícios e contatos</p>
  </button>
</div>

          </div>
    </main>
  );
}
"use client";

import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function testarNotificacaoPush() {
  const {
    data: { session },
    error: erroSessao,
  } = await supabase.auth.getSession();

  if (erroSessao || !session?.access_token) {
    alert("Faça login como nutricionista para testar as notificações.");
    return;
  }

  try {
    const resposta = await fetch("/api/teste-push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      alert(resultado.error || "Erro ao enviar notificação.");
      return;
    }

    alert("Notificação de teste enviada!");
  } catch (erro) {
    console.error("Erro ao testar notificação:", erro);
    alert("Não foi possível realizar o teste.");
  }
}

async function testarFilaNotificacoes() {
  const {
    data: { session },
    error: erroSessao,
  } = await supabase.auth.getSession();

  if (erroSessao || !session?.access_token) {
    alert("Faça login como nutricionista para testar a fila.");
    return;
  }

  const confirmar = window.confirm(
    "Deseja processar uma notificação pendente da fila? Isso poderá enviar uma notificação real ao dispositivo cadastrado."
  );

  if (!confirmar) {
    return;
  }

  try {
    const resposta = await fetch("/api/processar-notificacoes", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const resultado = await resposta.json();

    if (!resposta.ok || !resultado.success) {
      alert(
        resultado.error ||
          resultado.message ||
          "Não foi possível processar a notificação."
      );
      return;
    }

    alert(resultado.message || "Processamento concluído.");
  } catch (erro) {
    console.error("Erro ao testar fila:", erro);
    alert("Não foi possível testar a fila de notificações.");
  }
}

export default function DietasPage() {
    const [pacientes, setPacientes] = useState<any[]>([]);
const [busca, setBusca] = useState("");
const [pacienteSelecionado, setPacienteSelecionado] = useState<any>(null);
const [arquivosDieta, setArquivosDieta] = useState<File[]>([]);
const [dataDieta, setDataDieta] = useState(
  new Date().toISOString().split("T")[0]
);
const [mostrarConfirmacao, setMostrarConfirmacao] = useState(false);
const [ehRevisao, setEhRevisao] = useState(false);
const [historicoDietas, setHistoricoDietas] = useState<any[]>([]);
const [carregandoHistorico, setCarregandoHistorico] = useState(false);
const [mostrarHistorico, setMostrarHistorico] = useState(false);

useEffect(() => {
  async function carregarPacientes() {
    const { data, error } = await supabase
      .from("patients")
      .select("id, name, plan")
      .order("name", { ascending: true });

    if (error) {
      console.error("Erro ao carregar pacientes:", error);
      return;
    }

    setPacientes(data ?? []);
  }

  carregarPacientes();
}, []);

const pacientesFiltrados = pacientes.filter((paciente) =>
  paciente.name.toLowerCase().includes(busca.toLowerCase())
);
useEffect(() => {
  async function carregarHistorico() {
    if (!pacienteSelecionado) {
      setHistoricoDietas([]);
      setMostrarHistorico(false);
      return;
    }

    setCarregandoHistorico(true);
    setMostrarHistorico(false);

    const { data, error } = await supabase
      .from("diet_deliveries")
      .select(`
        id,
        diet_date,
        created_at,
        diet_delivery_files (
          id,
          file_name,
          storage_path
        )
      `)
      .eq("patient_id", pacienteSelecionado.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar histórico:", error);
      setHistoricoDietas([]);
    } else {
      setHistoricoDietas(data ?? []);
    }

    setCarregandoHistorico(false);
  }

  carregarHistorico();
}, [pacienteSelecionado]);
async function abrirPDF(caminhoArquivo: string) {
  const { data, error } = await supabase.storage
    .from("dietas")
    .createSignedUrl(caminhoArquivo, 60);

  if (error || !data?.signedUrl) {
    console.error("Erro ao abrir PDF:", error);
    alert("Não foi possível abrir o PDF.");
    return;
  }

  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}
async function enviarDieta() {
  if (!pacienteSelecionado) {
    alert("Selecione um paciente.");
    return;
  }

  if (arquivosDieta.length === 0) {
    alert("Selecione pelo menos um arquivo PDF.");
    return;
  }

  if (arquivosDieta.length > 6) {
    alert("Você pode enviar no máximo 6 arquivos.");
    return;
  }

  if (!dataDieta) {
    alert("Informe a data da dieta.");
    return;
  }

  const { data: cicloAtivo, error: erroCiclo } = await supabase
  .from("diet_cycles")
  .select("id, cycle_number, followup_frequency")
  .eq("patient_id", pacienteSelecionado.id)
  .eq("status", "ativo")
  .maybeSingle();

if (erroCiclo) {
  console.error("Erro ao consultar ciclo ativo:", erroCiclo);
  alert("Não foi possível verificar o ciclo do paciente.");
  return;
}

console.log("CICLO ATIVO:", cicloAtivo);
console.log("É REVISÃO:", ehRevisao);
if (ehRevisao && !cicloAtivo) {
  alert(
    "Este paciente não possui um ciclo ativo. Para enviar a dieta, desmarque a opção de revisão."
  );
  return;
}

const inicioNovoCiclo = new Date(`${dataDieta}T12:00:00`);

const fimNovoCiclo = new Date(inicioNovoCiclo);
fimNovoCiclo.setDate(fimNovoCiclo.getDate() + 33);

const dataFimNovoCiclo = [
  fimNovoCiclo.getFullYear(),
  String(fimNovoCiclo.getMonth() + 1).padStart(2, "0"),
  String(fimNovoCiclo.getDate()).padStart(2, "0"),
].join("-");

console.log("INÍCIO DO NOVO CICLO:", dataDieta);
console.log("FIM DO NOVO CICLO:", dataFimNovoCiclo);

  // 1. Registrar a entrega da dieta
  const { data: entrega, error: erroEntrega } = await supabase
    .from("diet_deliveries")
    .insert({
      patient_id: pacienteSelecionado.id,
      diet_date: dataDieta,
    })
    .select("id")
    .single();

  if (erroEntrega || !entrega) {
    console.error("Erro ao registrar entrega da dieta:", erroEntrega);
    alert("Não foi possível registrar a entrega da dieta.");
    return;
  }

  // 2. Enviar os PDFs e registrar cada arquivo
  for (const arquivo of arquivosDieta) {
    const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const caminhoArquivo =
      `${pacienteSelecionado.id}/${entrega.id}/${Date.now()}-${nomeSeguro}`;

    const { error: erroUpload } = await supabase.storage
      .from("dietas")
      .upload(caminhoArquivo, arquivo);

    if (erroUpload) {
      console.error("Erro ao enviar arquivo:", erroUpload);
      alert(`Erro ao enviar o arquivo ${arquivo.name}.`);
      return;
    }

    const { error: erroArquivo } = await supabase
      .from("diet_delivery_files")
      .insert({
        delivery_id: entrega.id,
        file_name: arquivo.name,
        storage_path: caminhoArquivo,
      });

    if (erroArquivo) {
      console.error("Erro ao registrar arquivo:", erroArquivo);
      alert(`O arquivo ${arquivo.name} foi enviado, mas não pôde ser registrado.`);
      return;
    }
  }
if (!ehRevisao) {
  const { data: numeroNovoCiclo, error: erroNovoCiclo } =
    await supabase.rpc("iniciar_ciclo_dieta", {
      p_patient_id: pacienteSelecionado.id,
      p_start_date: dataDieta,
      p_end_date: dataFimNovoCiclo,
      p_followup_frequency: pacienteSelecionado.plan,
    });

  if (erroNovoCiclo) {
    console.error("Erro ao iniciar novo ciclo:", erroNovoCiclo);
    alert(
      "Os PDFs foram enviados, mas não foi possível iniciar o novo ciclo. Não envie novamente antes de verificarmos o erro."
    );
    return;
  }

  console.log("NOVO CICLO INICIADO:", numeroNovoCiclo);
}
  
  alert("Dieta enviada ao paciente com sucesso!");

  setArquivosDieta([]);
}

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />

      <main className="flex-1 p-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Dietas
        </h1>

        <p className="mt-2 text-gray-600">
          Gerencie e envie as dietas dos pacientes.
        </p>

        <button
  type="button"
  onClick={testarNotificacaoPush}
  className="mt-4 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700"
>
  🔔 Testar notificação push
</button>

<button
  type="button"
  onClick={testarFilaNotificacoes}
  className="ml-3 mt-4 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
>
  🔔 Testar fila de notificações
</button>

        <div className="mt-8 max-w-xl">
  <label className="mb-2 block text-sm font-semibold text-gray-700">
    Buscar paciente
  </label>

  <input
    type="text"
    value={busca}
    onChange={(e) => setBusca(e.target.value)}
    placeholder="Digite o nome do paciente..."
    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
  />
</div>

{busca.trim() !== "" && (
  <div className="mt-3 max-w-xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
    {pacientesFiltrados.length === 0 ? (
      <p className="p-4 text-sm text-gray-500">
        Nenhum paciente encontrado.
      </p>
    ) : (
      pacientesFiltrados.map((paciente) => (
        <button
          key={paciente.id}
          type="button"
          onClick={() => {
  setPacienteSelecionado(paciente);
  setBusca("");
  setArquivosDieta([]);
}}
          className="block w-full border-b border-gray-100 px-4 py-3 text-left text-gray-900 last:border-b-0 hover:bg-gray-50"
        >
          {paciente.name}
        </button>
      ))
    )}
  </div>
)}

{pacienteSelecionado && (
    <>
  <div className="mt-8 max-w-xl rounded-2xl bg-white p-6 shadow-sm">
    <h2 className="text-lg font-bold text-gray-900">
      Dieta de {pacienteSelecionado.name}
    </h2>

    <p className="mt-1 text-sm text-gray-500">
      Anexe até 6 arquivos em PDF.
    </p>
    <input
  type="file"
  accept="application/pdf"
  multiple
  onChange={(e) => {
    const arquivos = Array.from(e.target.files ?? []);

    if (arquivos.length > 6) {
      alert("Você pode anexar no máximo 6 arquivos.");
      e.target.value = "";
      return;
    }

    setArquivosDieta(arquivos);
  }}
  className="mt-4 block w-full text-sm text-gray-700"
/>
{arquivosDieta.length > 0 && (
  <div className="mt-4">
    <p className="text-sm font-semibold text-gray-700">
      Arquivos selecionados ({arquivosDieta.length}/6)
    </p>

    <div className="mt-2 space-y-2">
      {arquivosDieta.map((arquivo, index) => (
        <div
          key={`${arquivo.name}-${index}`}
          className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700"
        >
          📎 {arquivo.name}
        </div>
      ))}
    </div>
  </div>
)}

<div className="mt-6">
  <label className="mb-2 block text-sm font-semibold text-gray-700">
    Data da dieta
  </label>

  <input
    type="date"
    value={dataDieta}
    onChange={(e) => setDataDieta(e.target.value)}
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
  />

  <p className="mt-2 text-xs text-gray-500">
    A data atual é preenchida automaticamente, mas pode ser alterada.
  </p>
</div>

<button
  type="button"
  onClick={() => {
  setEhRevisao(false);
  setMostrarConfirmacao(true);
}}
  className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700"
>
  Enviar dieta ao paciente
</button>
  </div>

  <div className="mt-6 max-w-xl rounded-2xl bg-white p-6 shadow-sm">
    <h2 className="text-lg font-bold text-gray-900">
      Última dieta enviada
    </h2>

    {carregandoHistorico ? (
      <p className="mt-3 text-sm text-gray-500">
        Carregando histórico...
      </p>
    ) : historicoDietas.length === 0 ? (
      <p className="mt-3 text-sm text-gray-500">
        Nenhuma dieta enviada para este paciente.
      </p>
    ) : (
      <div className="mt-4">
        <p className="text-sm text-gray-600">
          Data da dieta:{" "}
          {historicoDietas[0].diet_date.split("-").reverse().join("/")}
        </p>

        <div className="mt-3 space-y-2">
          {historicoDietas[0].diet_delivery_files?.map((arquivo: any) => (
            <div
  key={arquivo.id}
  className="rounded-lg border border-gray-200 p-3"
>
  <p className="text-sm text-gray-800">
    📄 {arquivo.file_name}
  </p>

  <button
    type="button"
    onClick={() => abrirPDF(arquivo.storage_path)}
    className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
  >
    Abrir PDF
  </button>
</div>
          ))}
        </div>
      </div>
    )}
  </div>
{historicoDietas.length > 1 && (
  <div className="mt-4 max-w-xl rounded-2xl bg-white p-6 shadow-sm">
    <button
      type="button"
      onClick={() => setMostrarHistorico(!mostrarHistorico)}
      className="flex w-full items-center justify-between font-semibold text-gray-900"
    >
      <span>Histórico de dietas</span>
      <span className="text-2xl">
        {mostrarHistorico ? "−" : "+"}
      </span>
    </button>

    {mostrarHistorico && (
      <div className="mt-4 space-y-4 border-t border-gray-200 pt-4">
        {historicoDietas.slice(1).map((entrega: any) => (
          <div
            key={entrega.id}
            className="rounded-xl border border-gray-200 p-4"
          >
            <p className="font-semibold text-gray-800">
              Data da dieta:{" "}
              {entrega.diet_date.split("-").reverse().join("/")}
            </p>

            <div className="mt-3 space-y-2">
              {entrega.diet_delivery_files?.map((arquivo: any) => (
                <div
  key={arquivo.id}
  className="rounded-lg border border-gray-200 p-3"
>
  <p className="text-sm text-gray-700">
    📄 {arquivo.file_name}
  </p>

  <button
    type="button"
    onClick={() => abrirPDF(arquivo.storage_path)}
    className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
  >
    Abrir PDF
  </button>
</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
  )}
</>
)}

      </main>
      {mostrarConfirmacao && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <h2 className="text-xl font-bold text-gray-900">
        Confirmar envio da dieta
      </h2>

      <label className="mt-6 flex cursor-pointer items-center gap-3 text-gray-800">
        <input
          type="checkbox"
          checked={ehRevisao}
          onChange={(e) => setEhRevisao(e.target.checked)}
          className="h-5 w-5"
        />
        Esta dieta é uma revisão
      </label>

      <div className="mt-8 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => setMostrarConfirmacao(false)}
          className="rounded-xl border border-gray-300 px-4 py-2 text-gray-700"
        >
          Cancelar
        </button>

        <button
          type="button"
          onClick={() => {
            setMostrarConfirmacao(false);
            enviarDieta();
          }}
          className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Confirmar envio
        </button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
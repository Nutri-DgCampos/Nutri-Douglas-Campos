"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";

async function testarNotificacaoPush() {
  const {
    data: { session },
    error: erroSessao,
  } = await api.auth.getSession();

  if (erroSessao || !session) {
    avisar("Faça login como nutricionista para testar as notificações.");
    return;
  }

  try {
    const resposta = await fetch("/api/teste-push", {
      method: "POST",
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      avisar(resultado.error || "Erro ao enviar notificação.");
      return;
    }

    avisar("Notificação de teste enviada!");
  } catch (erro) {
    console.error("Erro ao testar notificação:", erro);
    avisar("Não foi possível realizar o teste.");
  }
}

async function testarFilaNotificacoes() {
  const {
    data: { session },
    error: erroSessao,
  } = await api.auth.getSession();

  if (erroSessao || !session) {
    avisar("Faça login como nutricionista para testar a fila.");
    return;
  }

  const confirmar = await pedirConfirmacao(
    "Deseja processar uma notificação pendente da fila? Isso poderá enviar uma notificação real ao dispositivo cadastrado."
  );

  if (!confirmar) {
    return;
  }

  try {
    const resposta = await fetch("/api/processar-notificacoes", {
      method: "POST",
    });

    const resultado = await resposta.json();

    if (!resposta.ok || !resultado.success) {
      avisar(
        resultado.error ||
          resultado.message ||
          "Não foi possível processar a notificação."
      );
      return;
    }

    avisar(resultado.message || "Processamento concluído.");
  } catch (erro) {
    console.error("Erro ao testar fila:", erro);
    avisar("Não foi possível testar a fila de notificações.");
  }
}

export default function DietasPage() {
  const router = useRouter();

  const [mensagemPersonalizada, setMensagemPersonalizada] = useState(
  "Olá! Seu relatório nutricional está disponível para preenchimento. Acesse o Acompanhamento Nutricional e envie suas respostas dentro do prazo."
);

const [enviandoNotificacaoPersonalizada, setEnviandoNotificacaoPersonalizada] =
  useState(false);
  
async function enviarNotificacaoPersonalizada() {
  const mensagem = mensagemPersonalizada.trim();

  if (!mensagem) {
    avisar("Digite uma mensagem antes de enviar.");
    return;
  }

  if (mensagem.length > 300) {
    avisar("A mensagem deve ter no máximo 300 caracteres.");
    return;
  }

  if (enviandoNotificacaoPersonalizada) {
    return;
  }

  const confirmar = await pedirConfirmacao(
    "ATENÇÃO: esta mensagem será enviada para TODOS os pacientes " +
      "com dispositivos cadastrados para notificações.\n\n" +
      `Mensagem:\n${mensagem}\n\n` +
      "Deseja confirmar o envio?"
  );

  if (!confirmar) {
    return;
  }

  setEnviandoNotificacaoPersonalizada(true);

  try {
    const {
      data: { session },
      error: erroSessao,
    } = await api.auth.getSession();

    if (erroSessao || !session) {
      avisar("Faça login como nutricionista para enviar notificações.");
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
      avisar(resultado.error || "Não foi possível enviar a notificação.");
      return;
    }

    avisar(
      resultado.message ||
        "Solicitações de notificações enviadas com sucesso."
    );
  } catch (erro) {
    console.error("Erro ao enviar notificação personalizada:", erro);
    avisar("Não foi possível realizar o envio.");
  } finally {
    setEnviandoNotificacaoPersonalizada(false);
  }
}

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

// Impede que dois envios sejam iniciados simultaneamente
const envioEmAndamento = useRef(false);
const [enviandoDieta, setEnviandoDieta] = useState(false);

// Dados utilizados na lista de dietas pendentes
const [entregasRegistradas, setEntregasRegistradas] = useState<any[]>([]);
const [renovacoesPendentes, setRenovacoesPendentes] = useState<any[]>([]);
const [solicitacoesCadastro, setSolicitacoesCadastro] = useState<any[]>([]);
const [carregandoPendencias, setCarregandoPendencias] = useState(true);

useEffect(() => {
  async function carregarPacientes() {
    const { data, error } = await api
      .from("patients")
.select("id, name, plan, created_at, retroactive_registration")
.order("name", { ascending: true });

    if (error) {
      console.error("Erro ao carregar pacientes:", error);
      return;
    }

        const listaPacientes = data ?? [];

    setPacientes(listaPacientes);

    // Selecionar automaticamente o paciente vindo da aba Alertas
    const parametros = new URLSearchParams(window.location.search);
    const pacienteId = parametros.get("paciente");

    if (pacienteId) {
      const pacienteEncontrado = listaPacientes.find(
        (paciente) => paciente.id === pacienteId
      );

      if (pacienteEncontrado) {
        setPacienteSelecionado(pacienteEncontrado);
        setBusca(pacienteEncontrado.name);
        setEhRevisao(false);
      }
    }
  }

  carregarPacientes();
}, []);

useEffect(() => {
  async function carregarPendencias() {
    setCarregandoPendencias(true);

    const [resultadoEntregas, resultadoRenovacoes] =
  await Promise.all([
    api
  .from("diet_deliveries")
  .select(`
    id,
    patient_id,
    created_at,
    diet_delivery_files!inner(id)
  `)
  .eq("status", "concluida"),

    api
      .from("renewal_requests")
      .select("id, patient_id, status, requested_plan, last_weight, created_at")
      .eq("status", "pendente"),
  ]);

    if (resultadoEntregas.error) {
      console.error(
        "Erro ao carregar entregas:",
        resultadoEntregas.error
      );
    } else {
      setEntregasRegistradas(resultadoEntregas.data ?? []);
    }

    if (resultadoRenovacoes.error) {
      console.error(
        "Erro ao carregar renovações:",
        resultadoRenovacoes.error
      );
    } else {
      setRenovacoesPendentes(resultadoRenovacoes.data ?? []);
    }

        // Consultar solicitações de novos pacientes
    try {
      const {
        data: { session },
      } = await api.auth.getSession();

      if (!session) {
        console.error("Sessão não encontrada.");
        setSolicitacoesCadastro([]);
      } else {
        const resposta = await fetch("/api/solicitacoes-pacientes", {
          method: "GET",
          cache: "no-store",
        });

        if (!resposta.ok) {
          console.error(
            "Erro ao carregar solicitações de cadastro:",
            resposta.status
          );
          setSolicitacoesCadastro([]);
        } else {
          const resultado = await resposta.json();
          setSolicitacoesCadastro(resultado.solicitacoes ?? []);
        }
      }
        } catch (erro) {
      console.error("Erro ao consultar solicitações:", erro);
      setSolicitacoesCadastro([]);
    }

    setCarregandoPendencias(false);
  }

  carregarPendencias();
}, []);

const pacientesFiltrados = pacientes.filter((paciente) =>
  paciente.name.toLowerCase().includes(busca.toLowerCase())
);

// Pacientes novos que ainda não receberam a primeira dieta
const inicioLancamento = new Date("2026-10-12T00:00:00-03:00");

const pacientesPrimeiraDieta = pacientes.filter((paciente) => {
  // Pacientes antigos não entram automaticamente
  if (!paciente.created_at) return false;

  if (new Date(paciente.created_at) < inicioLancamento) {
    return false;
  }

  // Pacientes do cadastro especial já possuem dieta
  if (paciente.retroactive_registration === true) {
    return false;
  }

  // Não incluir quem já recebeu dieta pelo sistema
  const jaRecebeuDieta = entregasRegistradas.some(
    (entrega) => entrega.patient_id === paciente.id
  );

  return !jaRecebeuDieta;
});

// Lista única de dietas pendentes
const dietasPendentes = [
  ...pacientesPrimeiraDieta.map((paciente) => ({
    id: `primeira-${paciente.id}`,
    tipo: "Primeira dieta",
    nome: paciente.name,
    pacienteId: paciente.id,
paciente,
ultimoPeso: null,
planoEscolhido: null,
observacaoInterna: null,
  })),

  ...renovacoesPendentes
    .filter(
      (renovacao) =>
        !pacientesPrimeiraDieta.some(
          (paciente) => paciente.id === renovacao.patient_id
        )
    )
    .map((renovacao) => {
      const paciente = pacientes.find(
        (item) => item.id === renovacao.patient_id
      );

      return {
  id: `renovacao-${renovacao.id}`,
  tipo: "Renovação",
  nome: paciente?.name ?? "Paciente não localizado",
  pacienteId: renovacao.patient_id,
  paciente,
  ultimoPeso: renovacao.last_weight ?? null,
  planoEscolhido: renovacao.requested_plan ?? null,
  observacaoInterna: paciente?.important_note ?? null,
};
    }),

  ...solicitacoesCadastro.map((solicitacao) => ({
    id: `cadastro-${solicitacao.id}`,
    tipo: "Solicitação de cadastro",
    nome: solicitacao.name,
    pacienteId: null,
paciente: null,
ultimoPeso: null,
planoEscolhido: null,
observacaoInterna: null,
  })),
];

useEffect(() => {
  async function carregarHistorico() {
    if (!pacienteSelecionado) {
      setHistoricoDietas([]);
      setMostrarHistorico(false);
      return;
    }

    setCarregandoHistorico(true);
    setMostrarHistorico(false);

    const { data, error } = await api
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
async function abrirPDF(caminhoArquivo: string, nome?: string) {
  const { data, error } = await api.storage
    .from("dietas")
    .createSignedUrl(caminhoArquivo, 60);

  if (error || !data?.signedUrl) {
    console.error("Erro ao abrir PDF:", error);
    avisar("Não foi possível abrir o PDF.");
    return;
  }

  abrirDocumento(data.signedUrl, nome);
}
async function enviarDieta() {
  // Impedir uma segunda execução enquanto houver envio em andamento
  if (envioEmAndamento.current) {
    return;
  }

  envioEmAndamento.current = true;
  setEnviandoDieta(true);

  try {
    if (!pacienteSelecionado) {
    avisar("Selecione um paciente.");
    return;
  }

  if (arquivosDieta.length === 0) {
    avisar("Selecione pelo menos um arquivo PDF.");
    return;
  }

  if (arquivosDieta.length > 6) {
    avisar("Você pode enviar no máximo 6 arquivos.");
    return;
  }

  if (!dataDieta) {
    avisar("Informe a data da dieta.");
    return;
  }

  const { data: cicloAtivo, error: erroCiclo } = await api
  .from("diet_cycles")
  .select("id, cycle_number, followup_frequency")
  .eq("patient_id", pacienteSelecionado.id)
  .eq("status", "ativo")
  .maybeSingle();

if (erroCiclo) {
  console.error("Erro ao consultar ciclo ativo:", erroCiclo);
  avisar("Não foi possível verificar o ciclo do paciente.");
  return;
}

console.log("CICLO ATIVO:", cicloAtivo);
console.log("É REVISÃO:", ehRevisao);
if (ehRevisao && !cicloAtivo) {
  avisar(
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

// Verificar se existe uma entrega anterior não concluída
// antes de permitir um novo envio para este paciente.
const { data: entregasIncompletas, error: erroVerificacaoEntrega } =
  await api
    .from("diet_deliveries")
    .select("id, diet_date, created_at")
    .eq("patient_id", pacienteSelecionado.id)
    .eq("status", "em_andamento")
    .limit(1);

if (erroVerificacaoEntrega) {
  console.error(
    "Erro ao verificar entregas incompletas:",
    erroVerificacaoEntrega
  );

  avisar(
    "Não foi possível verificar se existe uma entrega incompleta. O envio foi interrompido por segurança."
  );

  return;
}

if (entregasIncompletas && entregasIncompletas.length > 0) {
  console.warn(
    "Entrega incompleta encontrada:",
    entregasIncompletas[0]
  );

  avisar(
    "Este paciente possui uma entrega de dieta que não foi concluída. Para evitar duplicações, verifique essa entrega antes de enviar novamente."
  );

  return;
}

  // 1. Registrar a entrega da dieta
  const { data: entrega, error: erroEntrega } = await api
    .from("diet_deliveries")
    .insert({
      patient_id: pacienteSelecionado.id,
      diet_date: dataDieta,
    })
    .select("id")
    .single();

  if (erroEntrega || !entrega) {
  console.error("Erro ao registrar entrega da dieta:", erroEntrega);

  if (erroEntrega?.code === "23505") {
    avisar(
      "Já existe uma entrega de dieta em andamento para este paciente. O novo envio foi bloqueado para evitar duplicações. Verifique a entrega anterior antes de tentar novamente."
    );
    return;
  }

  avisar(
    "Não foi possível registrar a entrega da dieta. Verifique o erro antes de tentar novamente."
  );

  return;
}

  // 2. Enviar os PDFs e registrar cada arquivo
// Controlar os arquivos concluídos para tratar falhas parciais
let arquivosRegistradosComSucesso = 0;

for (const arquivo of arquivosDieta) {
    const nomeSeguro = arquivo.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    const caminhoArquivo =
      `${pacienteSelecionado.id}/${entrega.id}/${Date.now()}-${nomeSeguro}`;

    const { error: erroUpload } = await api.storage
      .from("dietas")
      .upload(caminhoArquivo, arquivo);

    if (erroUpload) {
  console.error("Erro ao enviar arquivo:", erroUpload);

  // Se nenhum PDF foi registrado, remover a entrega vazia.
  if (arquivosRegistradosComSucesso === 0) {
    const { error: erroLimpeza } = await api
      .from("diet_deliveries")
      .delete()
      .eq("id", entrega.id);

    if (erroLimpeza) {
      console.error(
        "Não foi possível remover a entrega incompleta:",
        erroLimpeza
      );

      avisar(
        "O upload falhou e não foi possível remover o registro da entrega. Não tente enviar novamente antes de verificarmos."
      );
      return;
    }
  }

  avisar(
    arquivosRegistradosComSucesso === 0
      ? `Erro ao enviar ${arquivo.name}. A entrega vazia foi removida.`
      : `Erro ao enviar ${arquivo.name}. Alguns PDFs já foram registrados. Não tente enviar novamente antes de verificarmos.`
  );

  return;
}

    const { error: erroArquivo } = await api
      .from("diet_delivery_files")
      .insert({
        delivery_id: entrega.id,
        file_name: arquivo.name,
        storage_path: caminhoArquivo,
      });

    if (erroArquivo) {
  console.error("Erro ao registrar arquivo:", erroArquivo);

  // Remover do Storage o PDF que não foi registrado no banco.
  const { error: erroRemocaoArquivo } = await api.storage
    .from("dietas")
    .remove([caminhoArquivo]);

  if (erroRemocaoArquivo) {
    console.error(
      "Erro ao remover PDF sem registro:",
      erroRemocaoArquivo
    );

    avisar(
      "O PDF foi enviado, mas não pôde ser registrado nem removido do Storage. Não tente enviar novamente antes de verificarmos."
    );
    return;
  }

  // Se nenhum PDF anterior foi registrado, remover a entrega vazia.
  if (arquivosRegistradosComSucesso === 0) {
    const { error: erroLimpeza } = await api
      .from("diet_deliveries")
      .delete()
      .eq("id", entrega.id);

    if (erroLimpeza) {
      console.error(
        "Erro ao remover entrega incompleta:",
        erroLimpeza
      );

      avisar(
        "O PDF foi removido, mas não foi possível excluir o registro da entrega. Não tente enviar novamente antes de verificarmos."
      );
      return;
    }
  }

  avisar(
    arquivosRegistradosComSucesso === 0
      ? `Não foi possível registrar ${arquivo.name}. O PDF e a entrega vazia foram removidos.`
      : `Não foi possível registrar ${arquivo.name}. O PDF com erro foi removido, mas existem outros arquivos registrados. Não tente enviar novamente antes de verificarmos.`
  );

  return;
}

    arquivosRegistradosComSucesso += 1;
    }

// Confirmar que todos os PDFs selecionados foram registrados
// antes de iniciar um novo ciclo ou concluir a entrega.
if (arquivosRegistradosComSucesso !== arquivosDieta.length) {
  console.error("Quantidade de PDFs não corresponde:", {
    selecionados: arquivosDieta.length,
    registrados: arquivosRegistradosComSucesso,
    entregaId: entrega.id,
  });

  avisar(
    "Nem todos os PDFs foram registrados corretamente. A entrega continuará em andamento. Não envie novamente antes de verificarmos o problema."
  );

  return;
}

// Conferir diretamente no banco os PDFs desta entrega
const {
  data: pdfsRegistrados,
  error: erroConferenciaPDFs,
} = await api
  .from("diet_delivery_files")
  .select("id, storage_path")
  .eq("delivery_id", entrega.id);

const totalPDFsNoBanco = pdfsRegistrados?.length ?? 0;

if (
  erroConferenciaPDFs ||
  totalPDFsNoBanco !== arquivosDieta.length
) {
  console.error("Falha na conferência dos PDFs:", {
    erro: erroConferenciaPDFs,
    esperados: arquivosDieta.length,
    encontrados: totalPDFsNoBanco,
    entregaId: entrega.id,
  });

  avisar(
    "Não foi possível confirmar todos os PDFs no banco de dados. A entrega permanecerá em andamento. Não tente enviar novamente antes de verificarmos."
  );

  return;
}

// Confirmar que os PDFs também existem no Storage
const { data: arquivosNoStorage, error: erroConsultaStorage } =
  await api.storage
    .from("dietas")
    .list(`${pacienteSelecionado.id}/${entrega.id}`, {
      limit: 100,
    });

if (erroConsultaStorage) {
  console.error(
    "Erro ao verificar PDFs no Storage:",
    erroConsultaStorage
  );

  avisar(
    "Não foi possível confirmar os PDFs no Storage. A entrega continuará em andamento. Não envie novamente antes de verificarmos."
  );

  return;
}

if (
  !arquivosNoStorage ||
  arquivosNoStorage.length !== arquivosDieta.length
) {
  console.error("Quantidade de PDFs no Storage não corresponde:", {
    esperados: arquivosDieta.length,
    encontrados: arquivosNoStorage?.length ?? 0,
    entregaId: entrega.id,
  });

  avisar(
    "A quantidade de PDFs no Storage não corresponde à quantidade selecionada. A entrega continuará em andamento. Não envie novamente antes de verificarmos."
  );

  return;
}

// Comparar os caminhos registrados com os arquivos reais
const nomesNoStorage = new Set(
  (arquivosNoStorage ?? []).map((arquivo) => arquivo.name)
);

const prefixoEntrega =
  `${pacienteSelecionado.id}/${entrega.id}/`;

const todosArquivosCorrespondem = (pdfsRegistrados ?? []).every(
  (pdf) => {
    if (!pdf.storage_path.startsWith(prefixoEntrega)) {
      return false;
    }

    const nomeArquivo = pdf.storage_path.slice(
      prefixoEntrega.length
    );

    return nomesNoStorage.has(nomeArquivo);
  }
);

if (!todosArquivosCorrespondem) {
  console.error(
    "Divergência entre PDFs registrados e arquivos no Storage:",
    {
      entregaId: entrega.id,
      pdfsRegistrados,
      arquivosNoStorage,
    }
  );

  avisar(
    "Os arquivos encontrados no Storage não correspondem aos PDFs registrados no banco. A entrega continuará em andamento. Não tente enviar novamente antes de verificarmos."
  );

  return;
}

if (!ehRevisao) {
  // Verificar se existe renovação com mudança de plano
  const renovacaoPendente = renovacoesPendentes.find(
    (renovacao) =>
      renovacao.patient_id === pacienteSelecionado.id
  );

  const planoNovoCiclo =
    renovacaoPendente?.requested_plan ||
    pacienteSelecionado.plan;

  const { data: numeroNovoCiclo, error: erroNovoCiclo } =
    await api.rpc("iniciar_ciclo_dieta", {
      p_patient_id: pacienteSelecionado.id,
      p_start_date: dataDieta,
      p_end_date: dataFimNovoCiclo,
      p_followup_frequency: planoNovoCiclo,
    });

  if (erroNovoCiclo) {
    console.error("Erro ao iniciar novo ciclo:", erroNovoCiclo);
    avisar(
      "Os PDFs foram enviados, mas não foi possível iniciar o novo ciclo. Não envie novamente antes de verificarmos o erro."
    );
    return;
  }

    console.log("NOVO CICLO INICIADO:", numeroNovoCiclo);

    // Localizar o ciclo que acabou de ser criado
const { data: cicloCriado, error: erroBuscaCiclo } =
  await api
    .from("diet_cycles")
    .select("id")
    .eq("patient_id", pacienteSelecionado.id)
    .eq("cycle_number", numeroNovoCiclo)
    .eq("status", "ativo")
    .single();

if (erroBuscaCiclo || !cicloCriado) {
  console.error("Erro ao localizar novo ciclo:", erroBuscaCiclo);

  avisar(
    "O novo ciclo foi iniciado, mas não foi possível identificá-lo. Não envie novamente antes de verificarmos."
  );

  return;
}

// Vincular a entrega ao ciclo criado
const { data: entregaVinculada, error: erroVinculoCiclo } =
  await api
    .from("diet_deliveries")
    .update({
      cycle_id: cicloCriado.id,
    })
    .eq("id", entrega.id)
    .eq("status", "em_andamento")
    .select("id, cycle_id")
    .single();

if (
  erroVinculoCiclo ||
  entregaVinculada?.cycle_id !== cicloCriado.id
) {
  console.error("Erro ao vincular entrega ao ciclo:", erroVinculoCiclo);

  avisar(
    "O novo ciclo foi iniciado, mas não foi possível vinculá-lo à entrega. Não envie novamente antes de verificarmos."
  );

  return;
}
    
    // Atualizar o plano cadastrado quando a renovação
// solicitar uma frequência diferente.
if (
  renovacaoPendente?.requested_plan &&
  renovacaoPendente.requested_plan !== pacienteSelecionado.plan
) {
  const { error: erroAtualizacaoPlano } = await api
    .from("patients")
    .update({
      plan: renovacaoPendente.requested_plan,
    })
    .eq("id", pacienteSelecionado.id);

  if (erroAtualizacaoPlano) {
    console.error(
      "Erro ao atualizar plano do paciente:",
      erroAtualizacaoPlano
    );

    avisar(
      "A dieta foi enviada e o novo ciclo foi iniciado, mas não foi possível atualizar o plano do paciente. Não envie novamente antes de verificarmos o erro."
    );
    return;
  }

  setPacientes((anteriores) =>
    anteriores.map((paciente) =>
      paciente.id === pacienteSelecionado.id
        ? {
            ...paciente,
            plan: renovacaoPendente.requested_plan,
          }
        : paciente
    )
  );

  setPacienteSelecionado((anterior: any) =>
    anterior
      ? {
          ...anterior,
          plan: renovacaoPendente.requested_plan,
        }
      : anterior
  );
}

  // Concluir a renovação somente após o envio
  // da nova dieta e a criação do novo ciclo.
  const renovacoesDoPaciente = renovacoesPendentes.filter(
    (renovacao) =>
      renovacao.patient_id === pacienteSelecionado.id
  );

  if (renovacoesDoPaciente.length > 0) {
    const idsRenovacoes = renovacoesDoPaciente.map(
      (renovacao) => renovacao.id
    );

    const { error: erroRenovacao } = await api
      .from("renewal_requests")
      .update({ status: "aprovada" })
      .in("id", idsRenovacoes)
      .eq("status", "pendente");

    if (erroRenovacao) {
      console.error(
        "Erro ao concluir renovação:",
        erroRenovacao
      );

      avisar(
        "A dieta foi enviada e o novo ciclo foi iniciado, mas a renovação continua pendente. Não envie a dieta novamente antes de verificarmos o erro."
      );
      return;
    }

    setRenovacoesPendentes((anteriores) =>
      anteriores.filter(
        (renovacao) =>
          renovacao.patient_id !== pacienteSelecionado.id
      )
    );
  }
}

// Revisões devem utilizar o ciclo já existente,
// sem iniciar um novo ciclo.
if (ehRevisao && cicloAtivo) {
  const { data: revisaoVinculada, error: erroVinculoRevisao } =
    await api
      .from("diet_deliveries")
      .update({
        cycle_id: cicloAtivo.id,
      })
      .eq("id", entrega.id)
      .eq("status", "em_andamento")
      .select("id, cycle_id")
      .single();

  if (
    erroVinculoRevisao ||
    revisaoVinculada?.cycle_id !== cicloAtivo.id
  ) {
    console.error(
      "Erro ao vincular revisão ao ciclo:",
      erroVinculoRevisao
    );

    avisar(
      "Os PDFs foram enviados, mas não foi possível vincular a revisão ao ciclo existente. Não envie novamente antes de verificarmos."
    );

    return;
  }
}

// Marcar a entrega como concluída somente após
// todas as operações de envio terminarem com sucesso.
const {
  data: entregaConcluida,
  error: erroConclusaoEntrega,
} = await api
  .from("diet_deliveries")
  .update({
    status: "concluida",
  })
  .eq("id", entrega.id)
  .eq("status", "em_andamento")
  .select("id, status")
  .single();

if (
  erroConclusaoEntrega ||
  !entregaConcluida ||
  entregaConcluida.status !== "concluida"
) {
  console.error(
    "Erro ao concluir a entrega da dieta:",
    erroConclusaoEntrega
  );

  avisar(
    "Os PDFs foram enviados, mas não foi possível confirmar a conclusão da entrega. Não envie novamente antes de verificarmos o erro."
  );

  return;
}

// Atualizar as entregas registradas após o envio completo
setEntregasRegistradas((anteriores) => [
  ...anteriores,
  {
    id: entrega.id,
    patient_id: pacienteSelecionado.id,
    created_at: new Date().toISOString(),
  },
]);

// Aviso no celular do paciente; uma falha aqui não desfaz o envio.
fetch("/api/notificar-dieta", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ entregaId: entrega.id }),
}).catch((erroNotificacao) =>
  console.error("Erro ao registrar notificação de dieta:", erroNotificacao)
);

avisar("Dieta enviada ao paciente com sucesso!");

setArquivosDieta([]);

  } catch (erro) {
    console.error("Erro inesperado ao enviar dieta:", erro);

    avisar(
      "Ocorreu um erro inesperado durante o envio. Verifique se a dieta foi registrada antes de tentar novamente."
    );
  } finally {
    // Liberar a trava após sucesso, erro ou interrupção
    envioEmAndamento.current = false;
    setEnviandoDieta(false);
  }
}

  return (
    <div>

      <main className="mx-auto min-w-0 max-w-5xl flex-1 p-4 lg:p-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Dietas
        </h1>

        <p className="mt-2 text-gray-600">
          Gerencie e envie as dietas dos pacientes.
        </p>

        
<section className="mt-8 cartao p-5 lg:p-6">
  <h2 className="text-xl font-bold text-gray-900">
    Dietas pendentes ({dietasPendentes.length})
  </h2>

  <p className="mt-2 text-sm text-gray-600">
    Pacientes que precisam receber a primeira dieta, solicitaram
    renovação ou estão aguardando cadastro.
  </p>

  {carregandoPendencias ? (
    <p className="mt-5 text-gray-500">
      Carregando pendências...
    </p>
  ) : dietasPendentes.length === 0 ? (
    <p className="mt-5 text-green-700">
      Nenhuma dieta pendente no momento.
    </p>
  ) : (
    <div className="mt-5 space-y-3">
      {dietasPendentes.map((pendencia) => (
        <div
          key={pendencia.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4"
        >
          <div>
            <p className="font-semibold text-gray-900">
              {pendencia.nome}
            </p>

            <p className="mt-1 text-sm text-gray-600">
  {pendencia.tipo}
</p>

{pendencia.tipo === "Renovação" && (
  <div className="mt-3 space-y-2 rounded-lg border border-primary-100 bg-primary-50 p-3 text-sm">
    <p className="font-semibold text-primary-800">
      Solicitação de renovação
    </p>

    <p className="text-gray-700">
      <strong>Nome completo:</strong> {pendencia.nome}
    </p>

    <p className="text-gray-700">
      <strong>Último peso:</strong>{" "}
      {pendencia.ultimoPeso != null
        ? `${pendencia.ultimoPeso} kg`
        : "Não informado"}
    </p>

    <p className="text-gray-700">
      <strong>Plano escolhido:</strong>{" "}
      {pendencia.planoEscolhido || "Não informado"}
    </p>

    <p className="text-gray-700">
      <strong>Observação interna:</strong>{" "}
      {pendencia.observacaoInterna?.trim() || "Não informado"}
    </p>
  </div>
)}
          </div>

          {pendencia.paciente ? (
            <div className="flex flex-wrap gap-2">
            <Button size="small"
              type="button"
              outlined
              icon="pi pi-th-large"
              label="Módulo de Nutrição"
              onClick={() => router.push(`/nutricao/${pendencia.paciente.id}`)}
            />
            <Button size="small"
              type="button"
              onClick={() => {
                setPacienteSelecionado(pendencia.paciente);
                setBusca(pendencia.nome);
                setEhRevisao(false);
              }}
             
            >
              Preparar dieta
            </Button>
            </div>
          ) : (
            <Button severity="warning" size="small"
              type="button"
              onClick={() => {
                window.location.href = "/pacientes";
              }}
             
            >
              Ver solicitação
            </Button>
          )}
        </div>
      ))}
    </div>
  )}
</section>

        <div className="mt-8 max-w-xl">
  <label className="mb-2 block text-sm font-semibold text-gray-700">
    Buscar paciente
  </label>

  <InputText
    type="text"
    value={busca}
    onChange={(e) => setBusca(e.target.value)}
    placeholder="Digite o nome do paciente..."
    className="w-full"
  />
</div>

{busca.trim() !== "" && (
  <div className="mt-3 max-w-xl overflow-hidden cartao">
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
  <div className="mt-8 max-w-xl cartao p-5 lg:p-6">
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
      avisar("Você pode anexar no máximo 6 arquivos.");
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
          {arquivo.name}
        </div>
      ))}
    </div>
  </div>
)}

<div className="mt-6">
  <label className="mb-2 block text-sm font-semibold text-gray-700">
    Data da dieta
  </label>

  <InputText
    type="date"
    value={dataDieta}
    onChange={(e) => setDataDieta(e.target.value)}
    className="w-full"
  />

  <p className="mt-2 text-xs text-gray-500">
    A data atual é preenchida automaticamente, mas pode ser alterada.
  </p>
</div>

<Button
  type="button"
  onClick={() => {
  setEhRevisao(false);
  setMostrarConfirmacao(true);
}}
  className="mt-6 w-full"
>
  Enviar dieta ao paciente
</Button>
  </div>

  <div className="mt-6 max-w-xl cartao p-5 lg:p-6">
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
    {arquivo.file_name}
  </p>

  <Button size="small"
    type="button"
    onClick={() => abrirPDF(arquivo.storage_path, arquivo.file_name)}
    className="mt-2"
  >
    Abrir PDF
  </Button>
</div>
          ))}
        </div>
      </div>
    )}
  </div>
{historicoDietas.length > 1 && (
  <div className="mt-4 max-w-xl cartao p-5 lg:p-6">
    <Button severity="secondary" text
      type="button"
      onClick={() => setMostrarHistorico(!mostrarHistorico)}
      className="w-full"
    >
      <span>Histórico de dietas</span>
      <span className="text-2xl">
        {mostrarHistorico ? "−" : "+"}
      </span>
    </Button>

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
    {arquivo.file_name}
  </p>

  <Button size="small"
    type="button"
    onClick={() => abrirPDF(arquivo.storage_path, arquivo.file_name)}
    className="mt-2"
  >
    Abrir PDF
  </Button>
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
        <Button severity="secondary" outlined size="small"
          type="button"
          onClick={() => setMostrarConfirmacao(false)}
         
        >
          Cancelar
        </Button>

        <button
  type="button"
  disabled={enviandoDieta}
  onClick={() => {
    if (envioEmAndamento.current) return;

    setMostrarConfirmacao(false);
    enviarDieta();
  }}
  className={`rounded-xl px-4 py-2 font-semibold text-white ${
    enviandoDieta
      ? "cursor-not-allowed bg-gray-400"
      : "bg-primary-600 hover:bg-primary-700"
  }`}
>
  {enviandoDieta ? "Enviando dieta..." : "Confirmar envio"}
</button>
      </div>
    </div>
  </div>
)}
    </div>
  );
}
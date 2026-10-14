import { NextResponse } from "next/server";
import { banco } from "@/lib/servidor/banco";
import { origemPermitida } from "@/lib/servidor/http";
import {
  criarUsuario,
  EmailJaCadastrado,
  excluirUsuario,
} from "@/lib/servidor/usuarios";

export const runtime = "nodejs";

function cadastroEspecialDisponivel() {
  const inicioConfigurado =
    process.env.CADASTRO_ESPECIAL_INICIO;

  if (!inicioConfigurado) {
    return false;
  }

  const inicio = new Date(inicioConfigurado);

  if (Number.isNaN(inicio.getTime())) {
    return false;
  }

  const agora = new Date();

  const fim = new Date(
    inicio.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  return agora >= inicio && agora < fim;
}

function calcularInicioRetroativo(
  semanaConcluida: number
): string {
  const agora = new Date();

  const partesData = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(agora);

const ano = partesData.find((parte) => parte.type === "year")?.value;
const mes = partesData.find((parte) => parte.type === "month")?.value;
const dia = partesData.find((parte) => parte.type === "day")?.value;

if (!ano || !mes || !dia) {
  throw new Error("Não foi possível calcular a data do cadastro.");
}

const dataBrasil = `${ano}-${mes}-${dia}`;

  const inicio = new Date(`${dataBrasil}T12:00:00Z`);

  inicio.setUTCDate(
    inicio.getUTCDate() - semanaConcluida * 7
  );

  return inicio.toISOString().slice(0, 10);
}

function calcularFimCiclo(dataInicio: string): string {
  const dataFim = new Date(`${dataInicio}T12:00:00Z`);

  dataFim.setUTCDate(dataFim.getUTCDate() + 33);

  return dataFim.toISOString().slice(0, 10);
}

async function criarAcessoPaciente(
  email: string,
  senha: string
) {
  let usuarioId: string;

  try {
    usuarioId = await criarUsuario(email, senha);
  } catch (error) {
    console.error("Erro ao criar usuário:", error);

    if (error instanceof EmailJaCadastrado) {
      throw new Error("EMAIL_JA_CADASTRADO");
    }

    throw new Error(
      "Não foi possível criar o acesso do paciente."
    );
  }

  const { error: erroPerfil } = await banco
    .from("profiles")
    .upsert(
      {
        id: usuarioId,
        role: "paciente",
      },
      { onConflict: "id" }
    );

 if (erroPerfil) {
  console.error("Erro ao criar perfil:", erroPerfil);

  await excluirUsuario(usuarioId);

  throw new Error(
    "Não foi possível criar o perfil do paciente."
  );
}

  return usuarioId;
}

async function salvarCadastroPaciente(
  usuarioId: string,
  cadastro: {
    name: string;
    phone: string;
    objective: string;
    plan: string;
    initial_weight: number;
    training_weekly_goal: number;
    cardio_weekly_goal: number;
    current_followup_week: number;
  }
) {
  const { data: paciente, error } = await banco
    .from("patients")
    .insert({
      ...cadastro,
      auth_user_id: usuarioId,
      payment_status: "Pendente",
    })
    .select("id")
    .single();

  if (error || !paciente) {
    console.error("Erro ao salvar paciente:", error);

    throw new Error(
      "Não foi possível registrar os dados do paciente."
    );
  }

  return paciente.id;
}

async function criarCicloRetroativo(
  pacienteId: string,
  plano: string,
  semanaConcluida: number
) {
  const inicio = calcularInicioRetroativo(semanaConcluida);
  const fim = calcularFimCiclo(inicio);

  const partesDataCadastro = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).formatToParts(new Date());

const anoCadastro = partesDataCadastro.find(
  (parte) => parte.type === "year"
)?.value;

const mesCadastro = partesDataCadastro.find(
  (parte) => parte.type === "month"
)?.value;

const diaCadastro = partesDataCadastro.find(
  (parte) => parte.type === "day"
)?.value;

if (!anoCadastro || !mesCadastro || !diaCadastro) {
  throw new Error("Não foi possível identificar a data do cadastro.");
}

const dataCadastroBrasil =
  `${anoCadastro}-${mesCadastro}-${diaCadastro}`;

  const { data: ciclo, error } = await banco
    .from("diet_cycles")
    .insert({
      patient_id: pacienteId,
      start_date: inicio,
      end_date: fim,
      followup_frequency: plano,
      status: "ativo",
      cycle_number: 1,
      retroactive_registered_at: dataCadastroBrasil,
    })
    .select("id")
    .single();

  if (error || !ciclo) {
    console.error("Erro ao criar ciclo retroativo:", error);

    throw new Error(
      "Não foi possível iniciar o acompanhamento retroativo."
    );
  }

  return ciclo.id;
}

async function limparCadastroIncompleto(
  usuarioId: string,
  pacienteId?: string
) {
  if (pacienteId) {
    const { error: erroCiclos } = await banco
      .from("diet_cycles")
      .delete()
      .eq("patient_id", pacienteId);

    if (erroCiclos) {
      console.error("Erro ao limpar ciclos:", erroCiclos);
      return false;
    }

    const { error: erroPaciente } = await banco
      .from("patients")
      .delete()
      .eq("id", pacienteId)
      .eq("auth_user_id", usuarioId);

    if (erroPaciente) {
      console.error("Erro ao limpar paciente:", erroPaciente);
      return false;
    }
  }

  try {
    await excluirUsuario(usuarioId);
  } catch (erroUsuario) {
    console.error("Erro ao limpar acesso:", erroUsuario);
    return false;
  }

  return true;
}

async function verificarLimiteCadastro(
  identificador: string
): Promise<boolean> {
  const { data, error } = await banco.rpc(
    "verificar_limite_cadastro",
    {
      p_identificador: identificador,
    }
  );

  if (error) {
    console.error(
      "Erro ao verificar limite de cadastro:",
      error
    );

    // Se a verificação falhar, não permitimos
    // continuar criando contas.
    return false;
  }

  return data === true;
}

export async function GET() {
  const inicioConfigurado =
    process.env.CADASTRO_ESPECIAL_INICIO;

  const inicio = inicioConfigurado
    ? new Date(inicioConfigurado)
    : null;

  const inicioValido =
    inicio !== null &&
    !Number.isNaN(inicio.getTime());

  const agora = Date.now();

  const aguardandoLiberacao =
    !inicioValido ||
    (inicio !== null && agora < inicio.getTime());

  return NextResponse.json(
    {
      cadastroEspecial: cadastroEspecialDisponivel(),
      aguardandoLiberacao,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function POST(request: Request) {
  let usuarioCriadoId: string | null = null;
  let pacienteCriadoId: string | null = null;

  try {
    if (!cadastroEspecialDisponivel()) {

        
      return NextResponse.json(
        {
          erro: "O período de cadastro especial não está disponível.",
        },
        { status: 403 }
      );
    }

    // Verifica se a requisição veio do próprio sistema.
if (!origemPermitida(request)) {
  return NextResponse.json(
    {
      erro: "Origem da solicitação não permitida.",
    },
    { status: 403 }
  );
}

    const tipoConteudo = request.headers
  .get("content-type")
  ?.toLowerCase();

if (
  !tipoConteudo ||
  !/^application\/json(?:\s*;|$)/.test(tipoConteudo)
) {
  return NextResponse.json(
    { erro: "O cadastro deve ser enviado em formato JSON." },
    { status: 415 }
  );
}

    const tamanhoInformado = Number(
  request.headers.get("content-length")
);

if (
  Number.isFinite(tamanhoInformado) &&
  tamanhoInformado > 10000
) {
  return NextResponse.json(
    { erro: "Os dados enviados excedem o limite permitido." },
    { status: 413 }
  );
}

const textoRecebido = await request.text();

if (textoRecebido.length > 10000) {
  return NextResponse.json(
    { erro: "Os dados enviados excedem o limite permitido." },
    { status: 413 }
  );
}

let dados: Record<string, unknown>;

try {
  const conteudo = JSON.parse(textoRecebido);

  if (
    !conteudo ||
    typeof conteudo !== "object" ||
    Array.isArray(conteudo)
  ) {
    return NextResponse.json(
      { erro: "Formato de cadastro inválido." },
      { status: 400 }
    );
  }

  dados = conteudo;
} catch {
  return NextResponse.json(
    { erro: "Os dados enviados não são um JSON válido." },
    { status: 400 }
  );
}

    const nome =
  typeof dados.nome === "string"
    ? dados.nome.trim()
    : "";

const telefone =
  typeof dados.telefone === "string"
    ? dados.telefone.trim()
    : "";

const email =
  typeof dados.email === "string"
    ? dados.email.trim().toLowerCase()
    : "";

const emailValido =
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const senha = dados.senha;

const pesoInicial =
  typeof dados.pesoInicial === "number"
    ? dados.pesoInicial
    : NaN;

const objetivo =
  typeof dados.objetivo === "string"
    ? dados.objetivo.trim()
    : "";

const plano =
  typeof dados.plano === "string"
    ? dados.plano.trim()
    : "";

const treinosSemana =
  typeof dados.treinosSemana === "number"
    ? dados.treinosSemana
    : NaN;

const aerobicosSemana =
  typeof dados.aerobicosSemana === "number"
    ? dados.aerobicosSemana
    : NaN;

const semanaAtual =
  typeof dados.semanaAtual === "number"
    ? dados.semanaAtual
    : NaN;

    const planosPermitidos = ["Semanal", "Quinzenal", "Mensal"];

    const tamanhosValidos =
  nome.length <= 150 &&
  telefone.length <= 14 &&
  objetivo.length <= 200 &&
  typeof senha === "string" &&
  senha.length === 6;
    
const senhasProibidas = [
  "000000",
  "111111",
  "123456",
  "654321",
  "121212",
  "112233",
  "999999",
];

const senhaValida =
  typeof senha === "string" &&
  /^\d{6}$/.test(senha) &&
  !senhasProibidas.includes(senha);

    const dadosValidos =
  tamanhosValidos &&
  typeof nome === "string" &&
      nome.length >= 3 &&
      typeof telefone === "string" &&
      telefone.length >= 8 &&
      emailValido &&
      senhaValida &&
      Number.isFinite(pesoInicial) &&
      pesoInicial > 0 &&
      pesoInicial <= 500 &&
      typeof objetivo === "string" &&
      objetivo.length >= 2 &&
      planosPermitidos.includes(plano) &&
      Number.isInteger(treinosSemana) &&
      treinosSemana >= 0 &&
      treinosSemana <= 14 &&
      Number.isInteger(aerobicosSemana) &&
      aerobicosSemana >= 0 &&
      aerobicosSemana <= 14 &&
      Number.isInteger(semanaAtual) &&
      semanaAtual >= 1 &&
      semanaAtual <= 4;

    if (!dadosValidos) {
      return NextResponse.json(
        { erro: "Verifique os dados informados no cadastro." },
        { status: 400 }
      );
    }

// Preparação da criação do acesso do paciente.
// A gravação será ativada somente após concluirmos
// as verificações de segurança e duplicidade.


// Limita tentativas de cadastro para o mesmo e-mail.
// A verificação ocorre no servidor, sem CAPTCHA.

// Identifica a origem da solicitação para aplicar
// um limite adicional contra cadastros automatizados.

// O limite por IP só será ativado depois de
// validarmos a origem confiável do endereço
// repassado pelo proxy (nginx).

const identificadorIp: string | null = null;

const limitePermitido = await verificarLimiteCadastro(
  `cadastro-email:${email}`
);

if (!limitePermitido) {
  return NextResponse.json(
    {
      erro: "Muitas tentativas de cadastro. Aguarde 15 minutos antes de tentar novamente.",
    },
    { status: 429 }
  );
}

// Impede que um paciente já vinculado a este e-mail
// seja cadastrado novamente.

// A criação do usuário recusa e-mails já cadastrados
// (índice único em public.users).

// Controle dos registros criados durante o cadastro.
// Esses identificadores serão usados para desfazer
// uma tentativa incompleta, se necessário.

const cadastroPaciente = {
  name: nome,
  phone: telefone,
  objective: objetivo,
  plan: plano,
  initial_weight: pesoInicial,
  training_weekly_goal: treinosSemana,
  cardio_weekly_goal: aerobicosSemana,
  current_followup_week: semanaAtual,
  retroactive_registration: true,
  retroactive_completed_weeks: semanaAtual,
  payment_status: "Pendente",
};

const inicioRetroativo = calcularInicioRetroativo(semanaAtual);
const fimRetroativo = calcularFimCiclo(inicioRetroativo);

console.log("Cadastro especial validado:", {
  plano: cadastroPaciente.plan,
  semanaConcluida: semanaAtual,
  inicioRetroativo,
  fimRetroativo,
});

usuarioCriadoId = await criarAcessoPaciente(
  email,
  senha
);

pacienteCriadoId = await salvarCadastroPaciente(
  usuarioCriadoId,
  cadastroPaciente
);
await criarCicloRetroativo(
  pacienteCriadoId!,
  plano,
  semanaAtual
);

    return NextResponse.json(
  {
    sucesso: true,
    mensagem: "Cadastro realizado com sucesso!",
  },
  { status: 201 }
);
    } catch (error) {
    console.error("Erro ao processar cadastro:", error);

    if (
  error instanceof Error &&
  error.message === "EMAIL_JA_CADASTRADO"
) {
  return NextResponse.json(
    {
      erro: "Este e-mail já está cadastrado. Utilize a opção de entrar na sua conta.",
    },
    { status: 409 }
  );
}

    if (usuarioCriadoId) {
      try {

        const limpezaConcluida = await limparCadastroIncompleto(
          usuarioCriadoId,
          pacienteCriadoId ?? undefined
        );

        if (!limpezaConcluida) {
          console.error(
            "ATENÇÃO: cadastro incompleto exige verificação manual."
          );
        }
      } catch (erroLimpeza) {
        console.error(
          "Erro ao tentar limpar cadastro incompleto:",
          erroLimpeza
        );
      }
    }

    return NextResponse.json(
      { erro: "Não foi possível processar o cadastro." },
      { status: 400 }
    );
  }
}
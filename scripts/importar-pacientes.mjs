// Gera o SQL de importação da planilha de pacientes (banco/importacao/modelo-pacientes.csv).
//
// Uso (com os containers no ar):
//   node scripts/importar-pacientes.mjs banco/importacao/pacientes.csv > importacao.sql
//   docker exec -i nutri-postgres psql -v ON_ERROR_STOP=1 -U nutri -d nutri < importacao.sql
//
// Opções:
//   --hoje=AAAA-MM-DD  data de referência para a semana do ciclo (padrão: hoje em Brasília)
//
// Linhas com e-mail recebem acesso ao aplicativo com a senha provisória da
// variável de ambiente SENHA_PROVISORIA; o paciente cria a própria senha no
// primeiro acesso. Sem e-mail, o paciente entra sem acesso, que o nutricionista
// cria depois na tela de edição ("Criar acesso").
//
// O ciclo é importado com a data de início informada:
//   - até 33 dias atrás: ciclo ativo na semana correspondente;
//   - mais antigo: sem ciclo ativo (o próximo começa com o envio da dieta);
//   - em branco: sem ciclo.
// Relatórios de semanas anteriores à importação não contam como atraso.
//
// Toda a planilha é validada antes de gerar o SQL. Pacientes que já existem
// (mesmo nome ou mesmo e-mail) são ignorados, então o SQL pode rodar de novo.

import fs from "node:fs";
import bcrypt from "bcryptjs";

const COLUNAS = [
  "nome",
  "email",
  "telefone",
  "plano",
  "inicio_acompanhamento",
  "objetivo",
  "peso_inicial_kg",
  "treinos_por_semana",
  "aerobicos_por_semana",
  "meta_individual",
  "status_pagamento",
  "lembrete_importante",
];

const META_PADRAO = "Planejar e organizar as refeições do dia seguinte com antecedência.";
const DURACAO_CICLO = 33;
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

const argumentos = process.argv.slice(2);
const arquivo = argumentos.find((argumento) => !argumento.startsWith("--"));
const hoje =
  argumentos.find((argumento) => argumento.startsWith("--hoje="))?.slice(7) ??
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

if (!arquivo) {
  console.error("Informe o caminho do CSV.");
  process.exit(1);
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(hoje)) {
  console.error("--hoje deve estar no formato AAAA-MM-DD.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Leitura do CSV (aceita ; ou , e campos entre aspas)

function lerCsv(texto) {
  texto = texto.replace(/^﻿/, "");
  const primeiraLinha = texto.slice(0, texto.search(/\r?\n|$/));
  const separador =
    primeiraLinha.split(";").length >= primeiraLinha.split(",").length ? ";" : ",";

  const linhas = [];
  let linha = [];
  let campo = "";
  let entreAspas = false;

  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];

    if (entreAspas) {
      if (caractere === '"' && texto[i + 1] === '"') {
        campo += '"';
        i += 1;
      } else if (caractere === '"') {
        entreAspas = false;
      } else {
        campo += caractere;
      }
    } else if (caractere === '"') {
      entreAspas = true;
    } else if (caractere === separador) {
      linha.push(campo);
      campo = "";
    } else if (caractere === "\n" || caractere === "\r") {
      if (caractere === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += caractere;
    }
  }

  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas.filter((celulas) => celulas.some((celula) => celula.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Normalização e validação

function formatarNome(texto) {
  return texto
    .trim()
    .split(/\s+/)
    .map((palavra, indice) => {
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      if (indice > 0 && PARTICULAS.has(minuscula)) return minuscula;
      return palavra.charAt(0).toLocaleUpperCase("pt-BR") + palavra.slice(1);
    })
    .join(" ");
}

function chaveDoNome(nome) {
  return nome.toLocaleLowerCase("pt-BR");
}

function lerData(texto) {
  const partes = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!partes) return null;

  const [, dia, mes, ano] = partes;
  const iso = `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  const data = new Date(`${iso}T12:00:00Z`);

  return data.toISOString().slice(0, 10) === iso ? iso : null;
}

function diasEntre(de, ate) {
  return Math.round(
    (new Date(`${ate}T12:00:00Z`).getTime() - new Date(`${de}T12:00:00Z`).getTime()) / 86_400_000
  );
}

function somarDias(dataISO, dias) {
  const data = new Date(`${dataISO}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

function lerInteiro(texto, campo, erros) {
  if (texto === "") return 0;
  const valor = Number(texto);

  if (!Number.isInteger(valor) || valor < 0 || valor > 14) {
    erros.push(`${campo} deve ser um número de 0 a 14 (recebido "${texto}")`);
    return 0;
  }

  return valor;
}

const linhas = lerCsv(fs.readFileSync(arquivo, "utf8"));
const cabecalho = (linhas.shift() ?? []).map((coluna) => coluna.trim().toLowerCase());

const faltando = COLUNAS.filter((coluna) => !cabecalho.includes(coluna));
if (faltando.length > 0) {
  console.error(`Colunas ausentes no cabeçalho: ${faltando.join(", ")}`);
  process.exit(1);
}

const problemas = [];
const pacientes = [];
const nomesVistos = new Map();
const emailsVistos = new Map();

linhas.forEach((celulas, indice) => {
  const numeroLinha = indice + 2;
  const valor = (coluna) => (celulas[cabecalho.indexOf(coluna)] ?? "").trim();
  const erros = [];

  const nome = formatarNome(valor("nome"));
  const email = valor("email").toLowerCase();

  if (!nome) erros.push("nome em branco");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) erros.push(`e-mail inválido "${email}"`);

  const planoTexto = valor("plano").toLowerCase();
  const plano = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal" }[planoTexto];
  if (!plano) erros.push(`plano deve ser Semanal, Quinzenal ou Mensal (recebido "${valor("plano")}")`);

  let inicio = null;
  if (valor("inicio_acompanhamento")) {
    inicio = lerData(valor("inicio_acompanhamento"));
    if (!inicio) {
      erros.push(`data de início inválida "${valor("inicio_acompanhamento")}" (use dd/mm/aaaa)`);
    } else if (inicio > hoje) {
      erros.push(`data de início no futuro (${valor("inicio_acompanhamento")})`);
    }
  }

  let peso = null;
  if (valor("peso_inicial_kg")) {
    peso = Number(valor("peso_inicial_kg").replace(",", "."));
    if (!Number.isFinite(peso) || peso < 20 || peso > 400) {
      erros.push(`peso inicial inválido "${valor("peso_inicial_kg")}"`);
    }
  }

  const treinos = lerInteiro(valor("treinos_por_semana"), "treinos_por_semana", erros);
  const aerobicos = lerInteiro(valor("aerobicos_por_semana"), "aerobicos_por_semana", erros);

  const statusTexto = valor("status_pagamento").toLowerCase() || "ativo";
  const status = { ativo: "Ativo", pendente: "Pendente", cancelado: "Cancelado" }[statusTexto];
  if (!status) {
    erros.push(`status_pagamento deve ser Ativo, Pendente ou Cancelado (recebido "${valor("status_pagamento")}")`);
  }

  if (nome) {
    const chave = chaveDoNome(nome);
    if (nomesVistos.has(chave)) erros.push(`nome repetido na linha ${nomesVistos.get(chave)}`);
    nomesVistos.set(chave, numeroLinha);
  }

  if (email) {
    if (emailsVistos.has(email)) erros.push(`e-mail repetido na linha ${emailsVistos.get(email)}`);
    emailsVistos.set(email, numeroLinha);
  }

  if (erros.length > 0) {
    problemas.push(`Linha ${numeroLinha} (${nome || "sem nome"}): ${erros.join("; ")}`);
    return;
  }

  const dias = inicio ? diasEntre(inicio, hoje) : null;
  const cicloAtivo = dias !== null && dias <= DURACAO_CICLO;

  pacientes.push({
    nome,
    email,
    telefone: valor("telefone"),
    plano,
    inicio: cicloAtivo ? inicio : null,
    semana: cicloAtivo ? Math.min(4, Math.floor(dias / 7) + 1) : null,
    objetivo: valor("objetivo"),
    peso,
    treinos,
    aerobicos,
    meta: valor("meta_individual") || META_PADRAO,
    status,
    lembrete: valor("lembrete_importante"),
  });
});

if (problemas.length > 0) {
  console.error(`A planilha tem ${problemas.length} problema(s). Nada foi gerado.\n`);
  for (const problema of problemas) console.error(`- ${problema}`);
  process.exit(1);
}

const comAcesso = pacientes.filter((paciente) => paciente.email);
const senhaProvisoria = process.env.SENHA_PROVISORIA ?? "";

if (comAcesso.length > 0 && senhaProvisoria.length < 6) {
  console.error(
    `${comAcesso.length} paciente(s) com e-mail: defina SENHA_PROVISORIA (pelo menos 6 caracteres).`
  );
  process.exit(1);
}

const hashProvisorio = comAcesso.length > 0 ? bcrypt.hashSync(senhaProvisoria, 10) : null;

// ---------------------------------------------------------------------------
// SQL

function texto(valor) {
  return valor === null || valor === "" ? "NULL" : `'${String(valor).replace(/'/g, "''")}'`;
}

const saida = [];

saida.push("BEGIN;");
saida.push("DO $importacao$");
saida.push("DECLARE");
saida.push("  v_paciente uuid;");
saida.push("  v_usuario uuid;");
saida.push("  v_ciclo uuid;");
saida.push("  v_importados integer := 0;");
saida.push("  v_ignorados integer := 0;");
saida.push("BEGIN");

for (const paciente of pacientes) {
  const condicoes = [`lower(btrim(name)) = lower(${texto(paciente.nome)})`];

  saida.push("");
  saida.push(`  -- ${paciente.nome}`);
  saida.push(
    `  IF EXISTS (SELECT 1 FROM public.patients WHERE ${condicoes.join(" OR ")})` +
      (paciente.email
        ? ` OR EXISTS (SELECT 1 FROM public.users WHERE email = ${texto(paciente.email)})`
        : "") +
      " THEN"
  );
  saida.push(`    RAISE NOTICE 'Já existe, ignorado: %', ${texto(paciente.nome)};`);
  saida.push("    v_ignorados := v_ignorados + 1;");
  saida.push("  ELSE");

  if (paciente.email) {
    saida.push("    INSERT INTO public.users (email, password_hash, must_change_password)");
    saida.push(`    VALUES (${texto(paciente.email)}, ${texto(hashProvisorio)}, true)`);
    saida.push("    RETURNING id INTO v_usuario;");
    saida.push("    INSERT INTO public.profiles (id, role) VALUES (v_usuario, 'paciente');");
  } else {
    saida.push("    v_usuario := NULL;");
  }

  saida.push("    INSERT INTO public.patients (");
  saida.push("      name, phone, objective, plan, payment_status, important_note, initial_weight,");
  saida.push("      training_weekly_goal, cardio_weekly_goal, individual_goal, auth_user_id,");
  saida.push("      current_followup_week, retroactive_registration, retroactive_completed_weeks");
  saida.push("    ) VALUES (");
  saida.push(
    `      ${texto(paciente.nome)}, ${texto(paciente.telefone)}, ${texto(paciente.objetivo)}, ` +
      `${texto(paciente.plano)}, ${texto(paciente.status)}, ${texto(paciente.lembrete)}, ` +
      `${paciente.peso ?? "NULL"},`
  );
  saida.push(
    `      ${paciente.treinos}, ${paciente.aerobicos}, ${texto(paciente.meta)}, v_usuario, ` +
      `${paciente.semana ?? "NULL"}, true, 0`
  );
  saida.push("    ) RETURNING id INTO v_paciente;");

  if (paciente.inicio) {
    // O trigger do ciclo cria o pagamento pendente.
    saida.push("    INSERT INTO public.diet_cycles (");
    saida.push("      patient_id, start_date, end_date, followup_frequency, status, cycle_number,");
    saida.push("      retroactive_registered_at");
    saida.push("    ) VALUES (");
    saida.push(
      `      v_paciente, '${paciente.inicio}', '${somarDias(paciente.inicio, DURACAO_CICLO)}', ` +
        `${texto(paciente.plano)}, 'ativo', 1,`
    );
    saida.push(`      '${hoje}'`);
    saida.push("    ) RETURNING id INTO v_ciclo;");

    if (paciente.status === "Ativo") {
      // Pagamento já em dia: confirmado no início do ciclo (o acesso vale 30 dias a partir dele).
      saida.push("    UPDATE public.payments");
      saida.push(
        `    SET status = 'confirmado', confirmed_at = '${paciente.inicio} 12:00:00-03'::timestamptz`
      );
      saida.push("    WHERE cycle_id = v_ciclo;");
    }
  }

  saida.push("    v_importados := v_importados + 1;");
  saida.push("  END IF;");
}

saida.push("");
saida.push("  RAISE NOTICE 'Importados: %, já existentes: %', v_importados, v_ignorados;");
saida.push("END");
saida.push("$importacao$;");
saida.push("COMMIT;");

process.stdout.write(`${saida.join("\n")}\n`);

const ativos = pacientes.filter((paciente) => paciente.inicio);
const porSemana = [1, 2, 3, 4]
  .map((semana) => `semana ${semana}: ${ativos.filter((p) => p.semana === semana).length}`)
  .join(", ");

console.error(`${pacientes.length} paciente(s) válidos (referência ${hoje}).`);
console.error(`- com ciclo ativo: ${ativos.length} (${porSemana})`);
console.error(`- sem ciclo ativo: ${pacientes.length - ativos.length}`);
console.error(`- com acesso ao aplicativo: ${comAcesso.length}`);

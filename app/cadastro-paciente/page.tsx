"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function CadastroPaciente() {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [pesoInicial, setPesoInicial] = useState("");
const [objetivo, setObjetivo] = useState("");
const [plano, setPlano] = useState("Semanal");
const [treinosSemana, setTreinosSemana] = useState("0");
const [aerobicosSemana, setAerobicosSemana] = useState("0");
const [semanaAtual, setSemanaAtual] = useState("1");

const [enviando, setEnviando] = useState(false);

const [cadastroEspecial, setCadastroEspecial] = useState(false);
const [aguardandoLiberacao, setAguardandoLiberacao] = useState(true);
const [consultandoPeriodo, setConsultandoPeriodo] = useState(true);

const [enviandoSolicitacao, setEnviandoSolicitacao] = useState(false);
const [solicitacaoEnviada, setSolicitacaoEnviada] = useState(false);

useEffect(() => {
  async function consultarPeriodoCadastro() {
    try {
      const resposta = await fetch("/api/cadastro-paciente", {
        cache: "no-store",
      });

      if (!resposta.ok) {
        throw new Error("Erro ao consultar período de cadastro.");
      }

      const dados = await resposta.json();

      setCadastroEspecial(dados.cadastroEspecial === true);
      setAguardandoLiberacao(dados.aguardandoLiberacao === true);
    } catch (error) {
      console.error("Erro ao consultar período:", error);

      setCadastroEspecial(false);
      setAguardandoLiberacao(true);
    } finally {
      setConsultandoPeriodo(false);
    }
  }

  consultarPeriodoCadastro();
}, []);

async function enviarCadastro(
  event: React.FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  if (enviando) return;

setEnviando(true);

  try {
    const resposta = await fetch("/api/cadastro-paciente", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome,
        telefone,
        email,
        senha,
        pesoInicial: Number(pesoInicial),
        objetivo,
        plano,
        treinosSemana: Number(treinosSemana),
        aerobicosSemana: Number(aerobicosSemana),
        semanaAtual: Number(semanaAtual),
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      alert(resultado.erro || "Não foi possível realizar o cadastro.");
      return;
    }

    alert("Cadastro realizado com sucesso!");
  } catch (error) {
  console.error("Erro ao enviar cadastro:", error);
  alert("Erro de conexão. Tente novamente.");
} finally {
  setEnviando(false);
}
}

async function enviarSolicitacao(
  event: React.FormEvent<HTMLFormElement>
) {
  event.preventDefault();

  if (enviandoSolicitacao || solicitacaoEnviada) return;

  setEnviandoSolicitacao(true);

  try {
    const resposta = await fetch("/api/solicitacao-cadastro", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nome,
        telefone,
        objetivo,
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      alert(resultado.erro || "Não foi possível enviar a solicitação.");
      return;
    }

    setSolicitacaoEnviada(true);
    alert("Solicitação enviada com sucesso!");
  } catch (error) {
    console.error("Erro ao enviar solicitação:", error);
    alert("Erro de conexão. Tente novamente.");
  } finally {
    setEnviandoSolicitacao(false);
  }
}

if (consultandoPeriodo) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <p className="text-gray-600">
        Carregando cadastro...
      </p>
    </main>
  );
}

if (aguardandoLiberacao) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-100 p-6">
      <h1 className="text-xl font-bold text-gray-900">
        Cadastro em preparação
      </h1>

      <p className="mt-3 text-center text-gray-600">
        O cadastro de pacientes estará disponível em breve.
      </p>

      <Link
        href="/login"
        className="mt-6 font-medium text-blue-600"
      >
        Voltar para o login
      </Link>
    </main>
  );
}

if (!cadastroEspecial) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-md">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Solicitar acompanhamento nutricional
        </h1>

        <p className="mb-6 text-sm text-gray-600">
          Preencha seus dados para solicitar seu cadastro.
        </p>

        <form onSubmit={enviarSolicitacao} className="space-y-4">
          <input
            type="text"
            placeholder="Nome completo"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            required
            className="w-full rounded-lg border p-3"
          />

          <input
            type="tel"
            placeholder="Telefone"
            value={telefone}
            onChange={(event) => setTelefone(event.target.value)}
            maxLength={14}
            required
            className="w-full rounded-lg border p-3"
          />

          <input
            type="text"
            placeholder="Objetivo"
            value={objetivo}
            onChange={(event) => setObjetivo(event.target.value)}
            required
            className="w-full rounded-lg border p-3"
          />

          <button
  type="submit"
  disabled={enviandoSolicitacao || solicitacaoEnviada}
  className="w-full rounded-lg bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
>
  {solicitacaoEnviada
    ? "Solicitação enviada!"
    : enviandoSolicitacao
    ? "Enviando..."
    : "Enviar solicitação"}
</button>
        </form>

              </div>
    </main>
  );
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          Já sou paciente em acompanhamento
        </h1>

        <p className="mt-2 text-gray-600">
          Preencha seus dados para cadastrar seu acesso.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={enviarCadastro}
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Nome completo
            </label>
            <input
              type="text"
              required
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Digite seu nome completo"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Telefone
            </label>
            <input
              type="tel"
              required
              value={telefone}
              onChange={(event) => setTelefone(event.target.value)}
              placeholder="(14) 99999-9999"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <input
  type="password"
  required
  minLength={6}
  maxLength={6}
  inputMode="numeric"
  pattern="[0-9]{6}"
  value={senha}
  onChange={(event) => setSenha(event.target.value)}
  placeholder="Crie um PIN de 6 números"
  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
/>
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Peso inicial (kg)
  </label>
  <input
    type="number"
    step="0.1"
    min="1"
    required
    value={pesoInicial}
    onChange={(event) => setPesoInicial(event.target.value)}
    placeholder="Ex.: 80.5"
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Objetivo
  </label>
  <input
    type="text"
    required
    value={objetivo}
    onChange={(event) => setObjetivo(event.target.value)}
    placeholder="Ex.: Emagrecimento"
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Plano contratado
  </label>
  <select
    value={plano}
    onChange={(event) => setPlano(event.target.value)}
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
  >
    <option value="Semanal">Semanal</option>
    <option value="Quinzenal">Quinzenal</option>
    <option value="Mensal">Mensal</option>
  </select>
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Treinos por semana
  </label>
  <input
    type="number"
    min="0"
    max="14"
    required
    value={treinosSemana}
    onChange={(event) => setTreinosSemana(event.target.value)}
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Aeróbicos por semana
  </label>
  <input
    type="number"
    min="0"
    max="14"
    required
    value={aerobicosSemana}
    onChange={(event) => setAerobicosSemana(event.target.value)}
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Em qual semana do acompanhamento você está?
  </label>
  <select
    value={semanaAtual}
    onChange={(event) => setSemanaAtual(event.target.value)}
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900"
  >
    <option value="1">Semana 1</option>
    <option value="2">Semana 2</option>
    <option value="3">Semana 3</option>
    <option value="4">Semana 4</option>
  </select>
</div>

          <button
  type="submit"
  disabled={enviando}
  className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
>
  {enviando ? "Cadastrando..." : "Continuar cadastro"}
</button>
        </form>

        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Voltar para o login
        </Link>
      </div>
    </main>
  );
}
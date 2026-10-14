"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PainelDeEntrada from "@/components/PainelDeEntrada";
import { avisar } from "@/lib/avisos";
import { InputText } from "primereact/inputtext";
import { Button } from "primereact/button";
import Selecao from "@/components/Selecao";

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
      avisar(resultado.erro || "Não foi possível realizar o cadastro.");
      return;
    }

    avisar("Cadastro realizado com sucesso!");
window.location.replace("/login");
  } catch (error) {
  console.error("Erro ao enviar cadastro:", error);
  avisar("Erro de conexão. Tente novamente.");
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
      avisar(resultado.erro || "Não foi possível enviar a solicitação.");
      return;
    }

    setSolicitacaoEnviada(true);
    avisar("Solicitação enviada com sucesso!");
  } catch (error) {
    console.error("Erro ao enviar solicitação:", error);
    avisar("Erro de conexão. Tente novamente.");
  } finally {
    setEnviandoSolicitacao(false);
  }
}

if (consultandoPeriodo) {
  return (
    <PainelDeEntrada>
      <p className="text-gray-600">
        Carregando cadastro...
      </p>
    </PainelDeEntrada>
  );
}

if (aguardandoLiberacao) {
  return (
    <PainelDeEntrada>
      <h1 className="text-xl font-bold text-gray-900">
        Cadastro em preparação
      </h1>

      <p className="mt-3 text-center text-gray-600">
        O cadastro de pacientes estará disponível em breve.
      </p>

      <Link
        href="/login"
        className="mt-6 font-medium text-primary-600"
      >
        Voltar para o login
      </Link>
    </PainelDeEntrada>
  );
}

if (!cadastroEspecial) {
  return (
    <PainelDeEntrada>
      <div className="w-full">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Solicitar acompanhamento nutricional
        </h1>

        <p className="mb-6 text-sm text-gray-600">
          Preencha seus dados para solicitar seu cadastro.
        </p>

        <form onSubmit={enviarSolicitacao} className="space-y-4">
          <InputText
            type="text"
            placeholder="Nome completo"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            required
            className="w-full"
          />

          <InputText
            type="tel"
            placeholder="Telefone"
            value={telefone}
            onChange={(event) => setTelefone(event.target.value)}
            maxLength={14}
            required
            className="w-full"
          />

          <InputText
            type="text"
            placeholder="Objetivo"
            value={objetivo}
            onChange={(event) => setObjetivo(event.target.value)}
            required
            className="w-full"
          />

          <Button
  type="submit"
  disabled={enviandoSolicitacao || solicitacaoEnviada}
  className="w-full"
>
  {solicitacaoEnviada
    ? "Solicitação enviada!"
    : enviandoSolicitacao
    ? "Enviando..."
    : "Enviar solicitação"}
</Button>
        </form>

              </div>
    </PainelDeEntrada>
  );
}

  return (
    <PainelDeEntrada>
      <div className="w-full max-w-2xl cartao p-5 lg:p-8">
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
            <InputText
              type="text"
              required
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Digite seu nome completo"
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Telefone
            </label>
            <InputText
              type="tel"
              required
              value={telefone}
              onChange={(event) => setTelefone(event.target.value)}
              placeholder="(14) 99999-9999"
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              E-mail
            </label>
            <InputText
              type="email"
              name="email-novo-paciente"
              autoComplete="off"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="seu@email.com"
              className="w-full"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Senha
            </label>
            <InputText
  type="password"
  name="pin-novo-paciente"
  autoComplete="new-password"
  required
  minLength={6}
  maxLength={6}
  inputMode="numeric"
  pattern="[0-9]{6}"
  value={senha}
  onChange={(event) => setSenha(event.target.value)}
  placeholder="Crie um PIN de 6 números"
  className="w-full"
/>
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Peso inicial (kg)
  </label>
  <InputText
    type="number"
    step="0.1"
    min="1"
    required
    value={pesoInicial}
    onChange={(event) => setPesoInicial(event.target.value)}
    placeholder="Ex.: 80.5"
    className="w-full"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Objetivo
  </label>
  <InputText
    type="text"
    required
    value={objetivo}
    onChange={(event) => setObjetivo(event.target.value)}
    placeholder="Ex.: Emagrecimento"
    className="w-full"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Plano contratado
  </label>
  <Selecao
    value={plano}
    onChange={(event) => setPlano(event.target.value)}
    className="w-full"
  >
    <option value="Semanal">Semanal</option>
    <option value="Quinzenal">Quinzenal</option>
    <option value="Mensal">Mensal</option>
  </Selecao>
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Treinos por semana
  </label>
  <InputText
    type="number"
    min="0"
    max="14"
    required
    value={treinosSemana}
    onChange={(event) => setTreinosSemana(event.target.value)}
    className="w-full"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Aeróbicos por semana
  </label>
  <InputText
    type="number"
    min="0"
    max="14"
    required
    value={aerobicosSemana}
    onChange={(event) => setAerobicosSemana(event.target.value)}
    className="w-full"
  />
</div>

<div>
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Em qual semana do acompanhamento você está?
  </label>
  <Selecao
    value={semanaAtual}
    onChange={(event) => setSemanaAtual(event.target.value)}
    className="w-full"
  >
    <option value="1">Semana 1</option>
    <option value="2">Semana 2</option>
    <option value="3">Semana 3</option>
    <option value="4">Semana 4</option>
  </Selecao>
</div>

          <Button
  type="submit"
  disabled={enviando}
  className="w-full"
>
  {enviando ? "Cadastrando..." : "Continuar cadastro"}
</Button>
        </form>

        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Voltar para o login
        </Link>
      </div>
    </PainelDeEntrada>
  );
}
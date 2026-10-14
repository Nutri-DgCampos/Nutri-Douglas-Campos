"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Selecao from "@/components/Selecao";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";

export default function NovoPaciente() {
  const router = useRouter();

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [objetivo, setObjetivo] = useState("");
  const [plano, setPlano] = useState("Semanal");
  const [pagamento, setPagamento] = useState("Ativo");
  const [lembrete, setLembrete] = useState("");
  const [pesoInicial, setPesoInicial] = useState("");
  const [metaTreinoSemanal, setMetaTreinoSemanal] = useState("0");
  const [metaAerobicoSemanal, setMetaAerobicoSemanal] = useState("0");
  const [metaIndividual, setMetaIndividual] = useState(
  "Planejar e organizar as refeições do dia seguinte com antecedência."
);

  const [mostrarFormularioAcesso, setMostrarFormularioAcesso] =
  useState(false);

const [emailAcesso, setEmailAcesso] = useState("");
const [senhaProvisoria, setSenhaProvisoria] = useState("");
const [mostrarSenha, setMostrarSenha] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function cadastrarPaciente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

setErro("");

if (mostrarFormularioAcesso) {
  if (!emailAcesso.trim() || !emailAcesso.includes("@")) {
    setErro("Informe um e-mail válido para criar o acesso do paciente.");
    return;
  }

  if (senhaProvisoria.length < 6) {
    setErro("A senha provisória deve ter pelo menos 8 caracteres.");
    return;
  }
}

setSalvando(true);

    const { data: pacienteCriado, error } = await api.from("patients").insert({
      name: nome,
      phone: telefone,
      objective: objetivo,
      plan: plano,
      payment_status: pagamento,
      important_note: lembrete,
      initial_weight: pesoInicial === "" ? null : Number(pesoInicial),
      training_weekly_goal: Number(metaTreinoSemanal),
      cardio_weekly_goal: Number(metaAerobicoSemanal),
      individual_goal: metaIndividual.trim() === "" ? null : metaIndividual.trim(),
    })
.select("id")
.single();

    if (error || !pacienteCriado) {
  console.error(error);
  setErro("Não foi possível cadastrar o paciente.");
  setSalvando(false);
  return;
}

if (mostrarFormularioAcesso) {
  try {
    const {
      data: { session },
      error: erroSessao,
    } = await api.auth.getSession();

    if (erroSessao || !session) {
      throw new Error(
        "Paciente cadastrado, mas sua sessão expirou. O acesso não foi criado."
      );
    }

    const resposta = await fetch("/api/acesso-paciente", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pacienteId: pacienteCriado.id,
        email: emailAcesso.trim().toLowerCase(),
        senha: senhaProvisoria,
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      throw new Error(
        resultado.erro || "Não foi possível criar o acesso do paciente."
      );
    }
  } catch (error) {
    console.error("Erro ao criar acesso:", error);

    const mensagem =
      error instanceof Error ? error.message : "Erro desconhecido.";

    setErro(
      `O paciente foi cadastrado, mas o login não foi criado. ${mensagem} Não cadastre novamente o mesmo paciente.`
    );

    setSalvando(false);
    return;
  }
}

setSalvando(false);

router.push("/");
router.refresh();
  }

  return (
    <div>

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8">
<h1 className="text-3xl font-bold text-gray-900">
              Novo paciente
            </h1>

            <p className="mt-2 text-gray-600">
              Cadastre as informações iniciais do paciente.
            </p>
          </div>

          <form
            onSubmit={cadastrarPaciente}
            className="cartao p-5 lg:p-8"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Campo
                titulo="Nome completo"
                placeholder="Ex.: Gabrielle Silva"
                value={nome}
                onChange={setNome}
                required
              />

              <Campo
                titulo="Telefone"
                placeholder="Ex.: (14) 99999-9999"
                value={telefone}
                onChange={setTelefone}
              />

              <Campo
  titulo="Peso inicial (kg)"
  placeholder="Ex.: 80.5"
  value={pesoInicial}
  onChange={setPesoInicial}
  required
/>

<Campo
  titulo="Treinos por semana"
  placeholder="0 = não se aplica"
  value={metaTreinoSemanal}
  onChange={setMetaTreinoSemanal}
/>

<Campo
  titulo="Aeróbicos por semana"
  placeholder="0 = não se aplica"
  value={metaAerobicoSemanal}
  onChange={setMetaAerobicoSemanal}
/>

<Campo
  titulo="Meta individual"
  placeholder="Ex.: Levar marmita para o trabalho pelo menos 5 dias"
  value={metaIndividual}
  onChange={setMetaIndividual}
/>

              <Campo
                titulo="Objetivo"
                placeholder="Ex.: Emagrecimento"
                value={objetivo}
                onChange={setObjetivo}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Plano contratado
                </label>

                <Selecao
                  value={plano}
                  onChange={(e) => setPlano(e.target.value)}
                  className="w-full"
                >
                  <option value="Semanal">Semanal</option>
                  <option value="Quinzenal">Quinzenal</option>
                  <option value="Mensal">Mensal</option>
                </Selecao>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Status do pagamento
                </label>

                <Selecao
                  value={pagamento}
                  onChange={(e) => setPagamento(e.target.value)}
                  className="w-full"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Cancelado">Cancelado</option>
                </Selecao>
              </div>

                            <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Acesso do paciente
                </label>

                <Button
                  type="button"
                  onClick={() => setMostrarFormularioAcesso(!mostrarFormularioAcesso)}
                  className="w-full"
                >
                  Criar acesso
                </Button>
                
              </div>

              {mostrarFormularioAcesso && (
  <div className="md:col-span-2 rounded-xl border border-primary-200 bg-primary-50 p-4">
    <h3 className="mb-4 font-semibold text-gray-900">
      Criar acesso do paciente
    </h3>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          E-mail de acesso
        </label>

        <InputText
          type="email"
          value={emailAcesso}
          onChange={(e) => setEmailAcesso(e.target.value)}
          placeholder="paciente@email.com"
          autoComplete="off"
          className="w-full"
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Senha provisória
        </label>

        <div className="flex gap-2">
          <InputText
            type={mostrarSenha ? "text" : "password"}
            value={senhaProvisoria}
            onChange={(e) => setSenhaProvisoria(e.target.value)}
            placeholder="Mínimo de 8 caracteres"
            autoComplete="new-password"
            className="flex-1 flex-1"
          />

          <Button severity="secondary" outlined size="small"
            type="button"
            onClick={() => setMostrarSenha(!mostrarSenha)}
           
          >
            {mostrarSenha ? "Ocultar" : "Mostrar"}
          </Button>
        </div>
      </div>
    </div>

    <p className="mt-3 text-xs text-gray-500">
      O acesso será criado com segurança ao salvar o cadastro.
    </p>
  </div>
)}
              
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Lembrete importante
                </label>

                <InputTextarea autoResize
                  value={lembrete}
                  onChange={(e) => setLembrete(e.target.value)}
                  placeholder="Ex.: Paciente diabético. Realizar exames em 15/12."
                  rows={4}
                  className="w-full"
                />
              </div>
            </div>

            {erro && (
              <div className="mt-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">
                {erro}
              </div>
            )}

            <div className="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6">
              <Button severity="secondary" outlined
                type="button"
                onClick={() => router.push("/")}
               
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={salvando}
               
              >
                {salvando ? "Cadastrando..." : "Cadastrar paciente"}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

function Campo({
  titulo,
  placeholder,
  value,
  onChange,
  required = false,
}: {
  titulo: string;
  placeholder: string;
  value: string;
  onChange: (valor: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {titulo}
      </label>

      <InputText
        type="text"
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full"
      />
    </div>
  );
}
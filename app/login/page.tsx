"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import PainelDeEntrada from "@/components/PainelDeEntrada";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [recuperando, setRecuperando] = useState(false);

  const [textoBotaoCadastro, setTextoBotaoCadastro] = useState(
    "Cadastro em preparação"
  );

  const [cadastroLiberado, setCadastroLiberado] = useState(false);

  useEffect(() => {
    async function consultarCadastro() {
      try {
        const resposta = await fetch("/api/cadastro-paciente", {
          cache: "no-store",
        });

        if (!resposta.ok) return;

        const dados = await resposta.json();

        if (dados.aguardandoLiberacao) {
          setTextoBotaoCadastro("Cadastro em preparação");
          setCadastroLiberado(false);
        } else if (dados.cadastroEspecial) {
          setTextoBotaoCadastro("Já sou paciente em acompanhamento");
          setCadastroLiberado(true);
        } else {
          setTextoBotaoCadastro("Fazer meu cadastro");
          setCadastroLiberado(true);
        }
      } catch (error) {
        console.error("Erro ao consultar cadastro:", error);
      }
    }

    consultarCadastro();
  }, []);

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErro("");
    setCarregando(true);

    const { error } = await api.auth.signInWithPassword({
      email,
      password: senha,
    });

    if (error) {
      setCarregando(false);
      setErro(
        error.code === "429" ? error.message : "E-mail ou senha incorretos."
      );
      return;
    }

    const {
      data: { user },
    } = await api.auth.getUser();

    if (!user) {
      setCarregando(false);
      return;
    }

    if (user.deveTrocarSenha) {
      router.push("/trocar-senha");
      return;
    }

    const { data: paciente } = await api
      .from("patients")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    router.push(paciente ? "/area-paciente" : "/");
  }

  async function recuperarSenha() {
    if (!email) {
      setErro("Digite seu e-mail para recuperar a senha.");
      return;
    }

    setErro("");
    setRecuperando(true);

    const { error } = await api.auth.resetPasswordForEmail(email);

    setRecuperando(false);

    if (error) {
      console.error("ERRO RECUPERAÇÃO:", error);
      setErro("Não foi possível enviar o e-mail de recuperação.");
      return;
    }

    avisar("Enviamos um link de recuperação para o seu e-mail.", "success");
  }

  return (
    <PainelDeEntrada>
      <h1 className="text-3xl font-bold text-gray-900">Entrar</h1>

      <p className="mt-2 text-gray-600">
        Use o e-mail e a senha do seu cadastro.
      </p>

      <form onSubmit={entrar} className="mt-8 space-y-5">
        <div>
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-semibold text-gray-700"
          >
            E-mail
          </label>

          <InputText
            id="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="seu@email.com"
            className="w-full"
          />
        </div>

        <div>
          <label
            htmlFor="senha"
            className="mb-2 block text-sm font-semibold text-gray-700"
          >
            Senha
          </label>

          <Password
            inputId="senha"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            placeholder="Digite sua senha"
            feedback={false}
            toggleMask
            className="w-full"
            inputClassName="w-full"
            pt={{ iconField: { root: { className: "w-full" } } }}
          />
        </div>

        {erro && <Message severity="error" text={erro} className="w-full justify-start" />}

        <Button
          type="submit"
          label={carregando ? "Entrando..." : "Entrar"}
          loading={carregando}
          className="w-full"
        />

        <div className="text-center">
          <Button
            type="button"
            label="Esqueci minha senha"
            link
            loading={recuperando}
            onClick={recuperarSenha}
          />
        </div>
      </form>

      <div className="mt-8 border-t border-gray-200 pt-6">
        <p className="mb-3 text-sm text-gray-600">Ainda não possui cadastro?</p>

        {cadastroLiberado ? (
          <Link
            href="/cadastro-paciente"
            className="p-button p-component p-button-outlined w-full justify-center no-underline"
          >
            <span className="p-button-label">{textoBotaoCadastro}</span>
          </Link>
        ) : (
          <Button
            type="button"
            label={textoBotaoCadastro}
            outlined
            disabled
            className="w-full"
          />
        )}

        {/* Abre em outra aba, para quem ainda está conhecendo os planos. */}
        <a
          href="/planos"
          target="_blank"
          rel="noopener noreferrer"
          className="botao-destaque p-button p-component mt-4 w-full justify-center gap-2 no-underline"
        >
          <i className="pi pi-star-fill" aria-hidden />
          <span className="p-button-label">Planos disponíveis</span>
        </a>
      </div>
    </PainelDeEntrada>
  );
}

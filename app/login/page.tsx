"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErro("");
    setCarregando(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    });

    setCarregando(false);

    if (error) {
      setErro("E-mail ou senha incorretos.");
      return;
    }

    const {
  data: { user },
} = await supabase.auth.getUser();

if (!user) return;

const { data: paciente } = await supabase
  .from("patients")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();

if (paciente) {
  router.push("/area-paciente");
} else {
  router.push("/");
}
  }

  async function recuperarSenha() {
  if (!email) {
    setErro("Digite seu e-mail para recuperar a senha.");
    return;
  }

  setErro("");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  });

  if (error) {
    console.error("ERRO RECUPERAÇÃO:", error);
    setErro("Não foi possível enviar o e-mail de recuperação.");
    return;
  }

  alert("Enviamos um link de recuperação para o seu e-mail.");
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
            Nutri
          </p>

          <h1 className="mt-2 text-3xl font-bold text-gray-900">
            Acompanhamento
          </h1>

          <p className="mt-2 text-gray-500">
            Entre na sua conta para acessar o painel.
          </p>
        </div>

        <form onSubmit={entrar} className="space-y-5">
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
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Senha
            </label>

            <input
              type="password"
              required
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Digite sua senha"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
            />
          </div>

          <div className="text-right">
  <button
    type="button"
    onClick={recuperarSenha}
    className="text-sm font-medium text-blue-600 hover:text-blue-700"
  >
    Esqueci minha senha
  </button>
</div>

          {erro && (
            <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
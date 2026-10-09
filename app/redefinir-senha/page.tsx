"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function RedefinirSenhaPage() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [modoRecuperacao, setModoRecuperacao] = useState(false);

  useEffect(() => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      setModoRecuperacao(true);
      setErro("");
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);

    async function redefinirSenha() {
        if (!modoRecuperacao) {
  setErro("Link de recuperação inválido ou expirado. Solicite um novo link.");
  return;
}
  setErro("");

  if (novaSenha.length < 6) {
    setErro("A nova senha deve ter pelo menos 6 caracteres.");
    return;
  }

  if (novaSenha !== confirmarSenha) {
    setErro("As senhas não coincidem.");
    return;
  }

  setSalvando(true);

  const { error } = await supabase.auth.updateUser({
    password: novaSenha,
  });

  setSalvando(false);

  if (error) {
    setErro("Não foi possível redefinir a senha. Solicite um novo link.");
    return;
  }

  alert("Senha redefinida com sucesso.");
  window.location.href = "/login";
}

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-600">
          Nutri
        </p>

        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Redefinir senha
        </h1>

        <p className="mt-2 text-gray-500">
          Digite e confirme sua nova senha.
        </p>

        <div className="mt-6">
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Nova senha
  </label>

  <input
    type="password"
    value={novaSenha}
    onChange={(event) => setNovaSenha(event.target.value)}
    placeholder="Digite sua nova senha"
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
  />
</div>

<div className="mt-4">
  <label className="mb-2 block text-sm font-medium text-gray-700">
    Confirmar nova senha
  </label>

  <input
    type="password"
    value={confirmarSenha}
    onChange={(event) => setConfirmarSenha(event.target.value)}
    placeholder="Digite novamente sua nova senha"
    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-gray-900 outline-none focus:border-blue-500"
  />
</div>

{erro && (
  <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">
    {erro}
  </div>
)}

<button
  type="button"
  onClick={redefinirSenha}
  disabled={salvando}
  className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
>
  {salvando ? "Salvando..." : "Redefinir senha"}
</button>

      </div>
    </main>
  );
}

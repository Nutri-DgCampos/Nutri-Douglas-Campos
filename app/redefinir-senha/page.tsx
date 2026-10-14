"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import PainelDeEntrada from "@/components/PainelDeEntrada";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";

export default function RedefinirSenhaPage() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [conferindo, setConferindo] = useState(true);
  const [modoRecuperacao, setModoRecuperacao] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    // O link enviado por e-mail traz o token: /redefinir-senha?token=...
    const recebido =
      new URLSearchParams(window.location.search).get("token") ?? "";

    if (!recebido) {
      setConferindo(false);
      return;
    }

    api.auth.tokenDeRedefinicaoValido(recebido).then((valido) => {
      if (valido) {
        setToken(recebido);
        setModoRecuperacao(true);
      }

      setConferindo(false);
    });
  }, []);

  async function redefinirSenha(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    const { error } = await api.auth.redefinirSenha(token, novaSenha);

    setSalvando(false);

    if (error) {
      setErro("Não foi possível redefinir a senha. Solicite um novo link.");
      return;
    }

    avisar("Senha redefinida. Entre com a nova senha.", "success");
    window.location.href = "/login";
  }

  return (
    <PainelDeEntrada>
      <h1 className="text-3xl font-bold text-gray-900">Redefinir senha</h1>

      {conferindo ? (
        <p className="mt-4 text-gray-600">Conferindo o link...</p>
      ) : !modoRecuperacao ? (
        <>
          <Message
            severity="warn"
            text="Link de recuperação inválido ou expirado. Solicite um novo link na tela de entrada."
            className="mt-6 w-full justify-start"
          />

          <Link
            href="/login"
            className="p-button p-component mt-6 w-full justify-center no-underline"
          >
            <span className="p-button-label">Voltar para a entrada</span>
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-gray-600">Digite e confirme sua nova senha.</p>

          <form onSubmit={redefinirSenha} className="mt-8 space-y-5">
            <div>
              <label
                htmlFor="nova-senha"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Nova senha
              </label>

              <Password
                inputId="nova-senha"
                autoComplete="new-password"
                value={novaSenha}
                onChange={(event) => setNovaSenha(event.target.value)}
                placeholder="Pelo menos 6 caracteres"
                feedback={false}
                toggleMask
                className="w-full"
                inputClassName="w-full"
                pt={{ iconField: { root: { className: "w-full" } } }}
              />
            </div>

            <div>
              <label
                htmlFor="confirmar-senha"
                className="mb-2 block text-sm font-semibold text-gray-700"
              >
                Confirmar nova senha
              </label>

              <Password
                inputId="confirmar-senha"
                autoComplete="new-password"
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                placeholder="Digite novamente"
                feedback={false}
                toggleMask
                className="w-full"
                inputClassName="w-full"
                pt={{ iconField: { root: { className: "w-full" } } }}
              />
            </div>

            {erro && (
              <Message severity="error" text={erro} className="w-full justify-start" />
            )}

            <Button
              type="submit"
              label={salvando ? "Salvando..." : "Redefinir senha"}
              loading={salvando}
              className="w-full"
            />
          </form>
        </>
      )}
    </PainelDeEntrada>
  );
}

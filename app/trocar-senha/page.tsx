"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import PainelDeEntrada from "@/components/PainelDeEntrada";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";

const CAMPO = {
  feedback: false,
  toggleMask: true,
  className: "w-full",
  inputClassName: "w-full",
  pt: { iconField: { root: { className: "w-full" } } },
};

// Troca da própria senha. Obrigatória para quem entrou com senha provisória.
export default function TrocarSenhaPage() {
  const router = useRouter();

  const [carregando, setCarregando] = useState(true);
  const [obrigatoria, setObrigatoria] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      setObrigatoria(user.deveTrocarSenha);
      setCarregando(false);
    });
  }, [router]);

  async function irParaInicio() {
    const {
      data: { user },
    } = await api.auth.getUser();

    const { data: paciente } = await api
      .from("patients")
      .select("id")
      .eq("auth_user_id", user?.id ?? "")
      .maybeSingle();

    router.replace(paciente ? "/area-paciente" : "/");
  }

  async function trocar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro("");

    if (novaSenha.length < 6) {
      setErro("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (novaSenha !== confirmacao) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }

    setSalvando(true);
    const { error } = await api.auth.trocarSenha(senhaAtual, novaSenha);
    setSalvando(false);

    if (error) {
      setErro(error.message);
      return;
    }

    avisar("Senha alterada com sucesso.", "success");
    await irParaInicio();
  }

  async function sair() {
    await api.auth.signOut();
    router.replace("/login");
  }

  return (
    <PainelDeEntrada>
      <h1 className="text-3xl font-bold text-gray-900">
        {obrigatoria ? "Crie sua senha" : "Alterar senha"}
      </h1>

      <p className="mt-2 text-gray-600">
        {obrigatoria
          ? "Você entrou com uma senha provisória. Para continuar, crie uma senha só sua."
          : "Informe a senha atual e escolha uma nova."}
      </p>

      {!carregando && (
        <form onSubmit={trocar} className="mt-8 space-y-5">
          <div>
            <label htmlFor="senha-atual" className="mb-2 block text-sm font-semibold text-gray-700">
              {obrigatoria ? "Senha provisória" : "Senha atual"}
            </label>
            <Password
              inputId="senha-atual"
              autoComplete="current-password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              {...CAMPO}
            />
          </div>

          <div>
            <label htmlFor="nova-senha" className="mb-2 block text-sm font-semibold text-gray-700">
              Nova senha
            </label>
            <Password
              inputId="nova-senha"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              placeholder="Pelo menos 6 caracteres"
              {...CAMPO}
            />
          </div>

          <div>
            <label htmlFor="confirmar-senha" className="mb-2 block text-sm font-semibold text-gray-700">
              Confirmar nova senha
            </label>
            <Password
              inputId="confirmar-senha"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              placeholder="Digite novamente"
              {...CAMPO}
            />
          </div>

          {erro && <Message severity="error" text={erro} className="w-full justify-start" />}

          <Button
            type="submit"
            label={salvando ? "Salvando..." : obrigatoria ? "Criar senha e continuar" : "Alterar senha"}
            loading={salvando}
            className="w-full"
          />

          <div className="text-center">
            {obrigatoria ? (
              <Button type="button" label="Sair" link onClick={sair} />
            ) : (
              <Button type="button" label="Cancelar" link onClick={() => router.back()} />
            )}
          </div>
        </form>
      )}
    </PainelDeEntrada>
  );
}

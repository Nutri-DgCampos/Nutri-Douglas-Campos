"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Message } from "primereact/message";
import { Password } from "primereact/password";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

// Acesso do paciente ao sistema (e-mail e senha) e exclusão do cadastro,
// na tela de edição do paciente.
export default function AcessoDoPaciente({
  pacienteId,
  nome,
}: {
  pacienteId: string;
  nome: string;
}) {
  const router = useRouter();

  const [emailAtual, setEmailAtual] = useState<string | null | undefined>(undefined);
  const [editando, setEditando] = useState(false);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [textoConfirmacao, setTextoConfirmacao] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    fetch(`/api/pacientes/${pacienteId}/acesso`, { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados) => {
        setEmailAtual(dados?.email ?? null);
        setEmail(dados?.email ?? "");
      })
      .catch(() => setEmailAtual(null));
  }, [pacienteId]);

  async function criarAcesso() {
    setErro("");

    const novoEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(novoEmail)) {
      setErro("Informe um e-mail válido.");
      return;
    }

    if (senha.length < 6) {
      setErro("A senha provisória deve ter pelo menos 6 caracteres.");
      return;
    }

    setSalvando(true);

    try {
      const resposta = await fetch("/api/acesso-paciente", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pacienteId, email: novoEmail, senha }),
      });

      const resultado = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(resultado?.erro ?? "Não foi possível criar o acesso.");
        return;
      }

      setEmailAtual(novoEmail);
      setSenha("");
      setEditando(false);
      avisar(
        "Acesso criado. Informe ao paciente o e-mail e a senha provisória; no primeiro acesso ele cria uma senha própria.",
        "success"
      );
    } finally {
      setSalvando(false);
    }
  }

  async function salvarAcesso() {
    setErro("");

    const novoEmail = email.trim().toLowerCase();
    const trocarEmail = novoEmail !== "" && novoEmail !== emailAtual;

    if (!trocarEmail && senha === "") {
      setErro("Altere o e-mail ou informe uma nova senha.");
      return;
    }

    if (senha !== "" && senha.length < 6) {
      setErro("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    const confirmado = await pedirConfirmacao(
      [
        trocarEmail && `O e-mail de acesso passará a ser ${novoEmail}.`,
        senha &&
          "A senha anterior deixará de funcionar. No próximo acesso, o paciente terá de criar uma senha própria.",
        "Deseja continuar?",
      ]
        .filter(Boolean)
        .join("\n")
    );

    if (!confirmado) return;

    setSalvando(true);

    try {
      const resposta = await fetch(`/api/pacientes/${pacienteId}/acesso`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trocarEmail ? novoEmail : undefined,
          senha: senha || undefined,
        }),
      });

      const resultado = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        setErro(resultado?.erro ?? "Não foi possível atualizar o acesso.");
        return;
      }

      if (trocarEmail) setEmailAtual(novoEmail);
      setSenha("");
      setEditando(false);
      avisar("Acesso do paciente atualizado com sucesso.", "success");
    } finally {
      setSalvando(false);
    }
  }

  async function excluirPaciente() {
    setExcluindo(true);

    try {
      const resposta = await fetch(`/api/pacientes/${pacienteId}`, { method: "DELETE" });
      const resultado = await resposta.json().catch(() => null);

      if (!resposta.ok) {
        avisar(resultado?.erro ?? "Não foi possível excluir o paciente.", "error");
        return;
      }

      avisar(`${nome || "Paciente"} foi excluído.`, "success");
      router.push("/pacientes");
    } finally {
      setExcluindo(false);
      setConfirmandoExclusao(false);
    }
  }

  return (
    <section className="cartao mb-6 p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-gray-900">Acesso ao aplicativo</h2>
          <p className="mt-1 break-all text-sm text-gray-600">
            {emailAtual === undefined
              ? "Carregando..."
              : emailAtual
                ? `E-mail de acesso: ${emailAtual}`
                : "Este paciente ainda não possui acesso ao aplicativo."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {emailAtual === null && (
            <Button
              type="button"
              icon="pi pi-user-plus"
              label="Criar acesso"
              outlined={editando}
              onClick={() => {
                setEditando(!editando);
                setErro("");
                setEmail("");
                setSenha("");
              }}
            />
          )}

          {emailAtual && (
            <Button
              type="button"
              icon="pi pi-key"
              label="Redefinir e-mail e senha"
              outlined={editando}
              onClick={() => {
                setEditando(!editando);
                setErro("");
                setEmail(emailAtual ?? "");
                setSenha("");
              }}
            />
          )}

          <Button
            type="button"
            icon="pi pi-trash"
            label="Excluir paciente"
            severity="danger"
            outlined
            onClick={() => {
              setTextoConfirmacao("");
              setConfirmandoExclusao(true);
            }}
          />
        </div>
      </div>

      {editando && emailAtual !== undefined && (
        <div className="mt-5 grid gap-4 border-t border-gray-200 pt-5 md:grid-cols-2">
          <div>
            <label htmlFor="acesso-email" className="mb-2 block text-sm font-semibold text-gray-700">
              E-mail de acesso
            </label>
            <InputText
              id="acesso-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="acesso-senha" className="mb-2 block text-sm font-semibold text-gray-700">
              {emailAtual ? "Nova senha provisória" : "Senha provisória"}
            </label>
            <Password
              inputId="acesso-senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={emailAtual ? "Deixe em branco para manter a atual" : "Pelo menos 6 caracteres"}
              autoComplete="new-password"
              feedback={false}
              toggleMask
              className="w-full"
              inputClassName="w-full"
              pt={{ iconField: { root: { className: "w-full" } } }}
            />
          </div>

          {erro && (
            <Message severity="error" text={erro} className="w-full justify-start md:col-span-2" />
          )}

          <div className="flex justify-end gap-2 md:col-span-2">
            <Button
              type="button"
              label="Cancelar"
              severity="secondary"
              outlined
              onClick={() => setEditando(false)}
            />
            <Button
              type="button"
              label={emailAtual ? "Salvar acesso" : "Criar acesso"}
              icon="pi pi-check"
              loading={salvando}
              onClick={emailAtual ? salvarAcesso : criarAcesso}
            />
          </div>
        </div>
      )}

      <Dialog
        header="Excluir paciente"
        visible={confirmandoExclusao}
        onHide={() => !excluindo && setConfirmandoExclusao(false)}
        className="w-[30rem]"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label="Cancelar"
              severity="secondary"
              outlined
              disabled={excluindo}
              onClick={() => setConfirmandoExclusao(false)}
            />
            <Button
              type="button"
              label="Excluir definitivamente"
              icon="pi pi-trash"
              severity="danger"
              loading={excluindo}
              disabled={textoConfirmacao.trim().toUpperCase() !== "EXCLUIR"}
              onClick={excluirPaciente}
            />
          </div>
        }
      >
        <p className="text-gray-700">
          Isto apaga <strong>{nome || "o paciente"}</strong> e todo o histórico:
          ciclos, relatórios, dietas, pagamentos, exames, arquivos enviados e o
          acesso ao aplicativo. Não é possível desfazer.
        </p>

        <label htmlFor="confirmar-exclusao" className="mb-2 mt-4 block text-sm font-semibold text-gray-700">
          Digite EXCLUIR para confirmar
        </label>
        <InputText
          id="confirmar-exclusao"
          autoComplete="off"
          value={textoConfirmacao}
          onChange={(e) => setTextoConfirmacao(e.target.value)}
          className="w-full"
        />
      </Dialog>
    </section>
  );
}

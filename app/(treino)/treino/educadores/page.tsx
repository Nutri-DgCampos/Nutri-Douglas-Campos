"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Educador = {
  usuario_id: string;
  nome: string;
  email: string;
  cref: string | null;
  telefone: string | null;
  ativo: boolean;
  alunos: number;
};

type Formulario = { nome: string; email: string; cref: string; telefone: string; senha: string };

const VAZIO: Formulario = { nome: "", email: "", cref: "", telefone: "", senha: "" };

// Administrador: cadastro dos educadores físicos. Cada um entra com login
// próprio (senha provisória, trocada no primeiro acesso) e vê só o Módulo de
// Treino dos alunos vinculados a ele.
export default function EducadoresPage() {
  const router = useRouter();
  const [educadores, setEducadores] = useState<Educador[] | null>(null);
  const [negado, setNegado] = useState(false);
  const [editando, setEditando] = useState<Educador | "novo" | null>(null);
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [senhaDe, setSenhaDe] = useState<Educador | null>(null);
  const [novaSenha, setNovaSenha] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch("/api/treino/educadores", { cache: "no-store" });
    if (r.status === 403) {
      setNegado(true);
      return;
    }
    setEducadores(r.ok ? (await r.json()).educadores : []);
  }, []);

  useEffect(() => {
    fetch("/api/treino/educadores", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 403) setNegado(true);
        else setEducadores(r.ok ? (await r.json()).educadores : []);
      })
      .catch(() => setEducadores([]));
  }, []);

  function abrir(educador: Educador | "novo") {
    setEditando(educador);
    setForm(
      educador === "novo"
        ? VAZIO
        : { nome: educador.nome, email: educador.email, cref: educador.cref ?? "", telefone: educador.telefone ?? "", senha: "" }
    );
  }

  async function chamar(url: string, metodo: string, corpo: unknown, sucesso: string) {
    setSalvando(true);
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    setSalvando(false);
    if (!r.ok) {
      avisar((await r.json().catch(() => null))?.erro ?? "Não foi possível salvar.", "error");
      return false;
    }
    avisar(sucesso, "success");
    await carregar();
    return true;
  }

  async function salvar() {
    const ok =
      editando === "novo"
        ? await chamar("/api/treino/educadores", "POST", form, "Educador físico cadastrado.")
        : editando
          ? await chamar(`/api/treino/educadores/${editando.usuario_id}`, "PATCH", { nome: form.nome, cref: form.cref, telefone: form.telefone }, "Dados salvos.")
          : false;
    if (ok) setEditando(null);
  }

  async function alternarAtivo(e: Educador) {
    if (
      e.ativo &&
      !(await pedirConfirmacao(`Desativar ${e.nome}? O acesso é bloqueado na hora. Os vínculos e o histórico ficam guardados.`))
    )
      return;
    await chamar(`/api/treino/educadores/${e.usuario_id}`, "PATCH", { ativo: !e.ativo }, e.ativo ? "Acesso desativado." : "Acesso reativado.");
  }

  async function redefinirSenha() {
    if (!senhaDe) return;
    const ok = await chamar(
      `/api/treino/educadores/${senhaDe.usuario_id}`,
      "PATCH",
      { acao: "redefinir_senha", senha: novaSenha },
      "Senha provisória definida. A troca é pedida no próximo acesso."
    );
    if (ok) {
      setSenhaDe(null);
      setNovaSenha("");
    }
  }

  const campo = (rotulo: string, chave: keyof Formulario, extra: { tipo?: string; desativado?: boolean } = {}) => (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">{rotulo}</span>
      <InputText
        type={extra.tipo ?? "text"}
        value={form[chave]}
        disabled={extra.desativado}
        onChange={(e) => setForm((f) => ({ ...f, [chave]: e.target.value }))}
        className="w-full"
        aria-label={rotulo}
      />
    </label>
  );

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <BotaoVoltar rotulo="Voltar para o Módulo de Treino" onClick={() => router.push("/treino")} />
        <CabecalhoPagina
          titulo="Educadores físicos"
          descricao="Cada educador tem login próprio e vê só o Módulo de Treino dos alunos vinculados a ele."
          acao={negado ? undefined : <Button type="button" icon="pi pi-plus" label="Novo educador físico" onClick={() => abrir("novo")} />}
        />

        {negado ? (
          <div className="cartao p-6 text-center text-gray-700">Somente o administrador cadastra educadores físicos.</div>
        ) : educadores === null ? (
          <Skeleton height="12rem" borderRadius="16px" />
        ) : educadores.length === 0 ? (
          <div className="cartao p-6 text-center text-gray-600">Nenhum educador físico cadastrado.</div>
        ) : (
          <ul className="cartao divide-y divide-gray-100">
            {educadores.map((e) => (
              <li key={e.usuario_id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">
                    {e.nome} {e.ativo ? null : <Tag value="Desativado" severity="secondary" className="ml-1" />}
                  </p>
                  <p className="text-sm text-gray-600">
                    {e.email}
                    {e.cref ? ` · CREF ${e.cref}` : ""}
                    {e.telefone ? ` · ${e.telefone}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {e.alunos} {e.alunos === 1 ? "aluno vinculado" : "alunos vinculados"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" size="small" text label="Editar" onClick={() => abrir(e)} />
                  <Button type="button" size="small" text label="Redefinir senha" onClick={() => setSenhaDe(e)} />
                  <Button
                    type="button"
                    size="small"
                    text
                    severity={e.ativo ? "danger" : undefined}
                    label={e.ativo ? "Desativar" : "Reativar"}
                    disabled={salvando}
                    onClick={() => alternarAtivo(e)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        header={editando === "novo" ? "Novo educador físico" : "Editar educador físico"}
        visible={editando !== null}
        onHide={() => !salvando && setEditando(null)}
        className="w-[32rem] max-w-[calc(100vw-2rem)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" severity="secondary" outlined disabled={salvando} onClick={() => setEditando(null)} />
            <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvar} />
          </div>
        }
      >
        <div className="space-y-3">
          {campo("Nome", "nome")}
          {campo("E-mail de acesso", "email", { tipo: "email", desativado: editando !== "novo" })}
          {campo("CREF (opcional)", "cref")}
          {campo("Telefone (opcional)", "telefone")}
          {editando === "novo" ? (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Senha inicial (provisória)</span>
              <Password
                value={form.senha}
                onChange={(e) => setForm((f) => ({ ...f, senha: e.target.value }))}
                feedback={false}
                toggleMask
                className="w-full"
                inputClassName="w-full"
                aria-label="Senha inicial"
              />
              <span className="mt-1 block text-xs text-gray-500">Mínimo de 6 caracteres. A troca é pedida no primeiro acesso.</span>
            </label>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        header={`Redefinir senha${senhaDe ? ` de ${senhaDe.nome}` : ""}`}
        visible={senhaDe !== null}
        onHide={() => !salvando && setSenhaDe(null)}
        className="w-[28rem] max-w-[calc(100vw-2rem)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" severity="secondary" outlined disabled={salvando} onClick={() => setSenhaDe(null)} />
            <Button type="button" label="Definir senha" icon="pi pi-key" loading={salvando} onClick={redefinirSenha} />
          </div>
        }
      >
        <Password
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          feedback={false}
          toggleMask
          className="w-full"
          inputClassName="w-full"
          aria-label="Nova senha provisória"
        />
        <p className="mt-2 text-xs text-gray-500">Senha provisória: a troca é pedida no próximo acesso.</p>
      </Dialog>
    </main>
  );
}

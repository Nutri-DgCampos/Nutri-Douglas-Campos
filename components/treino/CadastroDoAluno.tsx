"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Password } from "primereact/password";
import { avisar } from "@/lib/avisos";

// Alunos próprios do educador físico (T7b): cadastro com e-mail e senha
// provisória (o aluno troca no primeiro acesso), edição e nova senha.

export type DadosDoAluno = { nome: string; telefone: string | null; email: string | null };

type Formulario = { nome: string; telefone: string; email: string; senha: string };

async function enviar(url: string, metodo: string, corpo: unknown) {
  const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
  if (!r) {
    avisar("Sem conexão. Tente de novo.", "error");
    return null;
  }
  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    avisar(dados?.erro ?? "Não foi possível salvar.", "error");
    return null;
  }
  return dados ?? {};
}

function Campo({ rotulo, valor, tipo = "text", onChange }: { rotulo: string; valor: string; tipo?: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">{rotulo}</span>
      <InputText type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} className="w-full" aria-label={rotulo} />
    </label>
  );
}

function CampoSenha({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">Senha provisória</span>
      <Password
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        feedback={false}
        toggleMask
        className="w-full"
        inputClassName="w-full"
        aria-label="Senha provisória"
      />
      <span className="mt-1 block text-xs text-gray-500">Pelo menos 6 caracteres. O aluno troca no primeiro acesso.</span>
    </label>
  );
}

// Novo aluno: devolve o id criado.
export function NovoAluno({ aberto, onFechar, onCriado }: { aberto: boolean; onFechar: () => void; onCriado: (id: string) => void }) {
  const [form, setForm] = useState<Formulario>({ nome: "", telefone: "", email: "", senha: "" });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const dados = await enviar("/api/treino/alunos", "POST", form);
    setSalvando(false);
    if (!dados?.id) return;
    avisar("Aluno cadastrado. Envie a ele o e-mail e a senha provisória.", "success");
    setForm({ nome: "", telefone: "", email: "", senha: "" });
    onCriado(dados.id);
  }

  return (
    <Dialog header="Cadastrar aluno" visible={aberto} onHide={onFechar} className="w-full max-w-lg" modal>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          O aluno fica só com você: o nutricionista não vê este cadastro. Na Área do Paciente, ele usa só o Treino.
        </p>
        <Campo rotulo="Nome completo" valor={form.nome} onChange={(v) => setForm((f) => ({ ...f, nome: v }))} />
        <Campo rotulo="Telefone (opcional)" valor={form.telefone} tipo="tel" onChange={(v) => setForm((f) => ({ ...f, telefone: v }))} />
        <Campo rotulo="E-mail de acesso" valor={form.email} tipo="email" onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        <CampoSenha valor={form.senha} onChange={(v) => setForm((f) => ({ ...f, senha: v }))} />
        <div className="flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={onFechar} />
          <Button type="button" label="Cadastrar" icon="pi pi-check" loading={salvando} onClick={salvar} />
        </div>
      </div>
    </Dialog>
  );
}

// Cartão na ficha do aluno próprio: dados de cadastro, acesso e nova senha.
export function CartaoDoAluno({ alunoId, dados, onAlterado }: { alunoId: string; dados: DadosDoAluno; onAlterado: () => void }) {
  const [editando, setEditando] = useState(false);
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [form, setForm] = useState<Formulario>({ nome: "", telefone: "", email: "", senha: "" });
  const [salvando, setSalvando] = useState(false);

  function abrirEdicao() {
    setForm({ nome: dados.nome, telefone: dados.telefone ?? "", email: dados.email ?? "", senha: "" });
    setEditando(true);
  }

  async function salvarDados() {
    setSalvando(true);
    const ok = await enviar(`/api/treino/alunos/${alunoId}`, "PATCH", { nome: form.nome, telefone: form.telefone, email: form.email });
    setSalvando(false);
    if (!ok) return;
    avisar("Cadastro salvo.", "success");
    setEditando(false);
    onAlterado();
  }

  async function salvarSenha() {
    setSalvando(true);
    const ok = await enviar(`/api/treino/alunos/${alunoId}`, "PATCH", { acao: "redefinir_senha", senha: form.senha });
    setSalvando(false);
    if (!ok) return;
    avisar("Senha provisória definida. A troca é pedida no próximo acesso.", "success");
    setTrocandoSenha(false);
  }

  return (
    <section className="cartao p-5" aria-label="Cadastro do aluno">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Cadastro do aluno</h2>
          <p className="mt-1 text-sm text-gray-500">Aluno próprio: só você vê este cadastro.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="small" outlined icon="pi pi-pencil" label="Editar" onClick={abrirEdicao} />
          <Button
            type="button"
            size="small"
            outlined
            icon="pi pi-key"
            label="Nova senha provisória"
            onClick={() => {
              setForm((f) => ({ ...f, senha: "" }));
              setTrocandoSenha(true);
            }}
          />
        </div>
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">E-mail de acesso</dt>
          <dd className="font-medium text-gray-900 break-all">{dados.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Telefone</dt>
          <dd className="font-medium text-gray-900">{dados.telefone ?? "—"}</dd>
        </div>
      </dl>

      <Dialog header="Editar cadastro" visible={editando} onHide={() => setEditando(false)} className="w-full max-w-lg" modal>
        <div className="space-y-4">
          <Campo rotulo="Nome completo" valor={form.nome} onChange={(v) => setForm((f) => ({ ...f, nome: v }))} />
          <Campo rotulo="Telefone (opcional)" valor={form.telefone} tipo="tel" onChange={(v) => setForm((f) => ({ ...f, telefone: v }))} />
          <Campo rotulo="E-mail de acesso" valor={form.email} tipo="email" onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setEditando(false)} />
            <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvarDados} />
          </div>
        </div>
      </Dialog>

      <Dialog header="Nova senha provisória" visible={trocandoSenha} onHide={() => setTrocandoSenha(false)} className="w-full max-w-md" modal>
        <div className="space-y-4">
          <CampoSenha valor={form.senha} onChange={(v) => setForm((f) => ({ ...f, senha: v }))} />
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setTrocandoSenha(false)} />
            <Button type="button" label="Definir senha" icon="pi pi-check" loading={salvando} onClick={salvarSenha} />
          </div>
        </div>
      </Dialog>
    </section>
  );
}

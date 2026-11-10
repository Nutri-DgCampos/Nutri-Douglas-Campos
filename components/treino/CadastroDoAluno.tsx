"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Password } from "primereact/password";
import CamposComplementares from "@/components/CamposComplementares";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { DADOS_VAZIOS, dadosDoBanco, dadosParaBanco, type DadosComplementares } from "@/lib/nutricao/dadosPessoais";
import { idadeEm, rotuloDoSexo } from "@/lib/nutricao/paciente";

// Alunos próprios do educador físico (T7b): cadastro com e-mail e senha
// provisória (o aluno troca no primeiro acesso), edição e nova senha.
// T8 (R10): desativar (reversível) e excluir de vez, só a pedido do aluno.

export type DadosDoAluno = {
  nome: string;
  telefone: string | null;
  email: string | null;
  desativado_em?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  height_cm?: string | number | null;
  contact_email?: string | null;
};

// Nascimento, sexo, altura e e-mail de contato (SPEC 06/11, cadastro): os
// mesmos campos e regras do cadastro da Nutrição, sem plano nem pagamento.
type Formulario = { nome: string; telefone: string; email: string; senha: string; pessoais: DadosComplementares };

const FORM_VAZIO: Formulario = { nome: "", telefone: "", email: "", senha: "", pessoais: DADOS_VAZIOS };

// Corpo para a API (os dados pessoais já conferidos na tela).
function corpoDoFormulario(form: Formulario) {
  const conferido = dadosParaBanco(form.pessoais);
  if ("erro" in conferido) {
    avisar(conferido.erro, "error");
    return null;
  }
  const { nascimento, sexo, altura, emailContato } = form.pessoais;
  return { nome: form.nome, telefone: form.telefone, email: form.email, nascimento, sexo, altura, emailContato };
}

function CamposPessoais({ valor, onChange }: { valor: DadosComplementares; onChange: (v: DadosComplementares) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CamposComplementares valor={valor} onChange={onChange} />
    </div>
  );
}

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

// autoComplete: nos dados do aluno, o navegador não deve sugerir o login
// salvo do próprio profissional (SPEC de correções 10/11, item 002).
function Campo({
  rotulo,
  valor,
  tipo = "text",
  autoComplete = "off",
  onChange,
}: {
  rotulo: string;
  valor: string;
  tipo?: string;
  autoComplete?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-gray-700">{rotulo}</span>
      <InputText type={tipo} value={valor} autoComplete={autoComplete} onChange={(e) => onChange(e.target.value)} className="w-full" aria-label={rotulo} />
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
        // "new-password": o navegador não preenche a senha salva de quem está conectado.
        autoComplete="new-password"
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
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  // E-mail que já tem cadastro: pedido de vínculo a quem cadastrou o aluno.
  const [pedido, setPedido] = useState<{ email: string; mensagem: string } | null>(null);

  async function salvar() {
    const corpo = corpoDoFormulario(form);
    if (!corpo) return;
    setSalvando(true);
    const r = await fetch("/api/treino/alunos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...corpo, senha: form.senha }),
    }).catch(() => null);
    setSalvando(false);
    const dados = await r?.json().catch(() => null);
    if (r?.status === 409 && dados?.codigo === "email_existente") {
      setPedido({ email: form.email.trim().toLowerCase(), mensagem: "" });
      return;
    }
    if (!r?.ok) {
      avisar(dados?.erro ?? "Sem conexão. Tente de novo.", "error");
      return;
    }
    if (!dados?.id) return;
    avisar("Aluno cadastrado. Envie a ele o e-mail e a senha provisória.", "success");
    setForm(FORM_VAZIO);
    onCriado(dados.id);
  }

  // Fechar sem cadastrar descarta o que foi digitado: cada abertura começa vazia.
  function fechar() {
    setForm(FORM_VAZIO);
    setPedido(null);
    onFechar();
  }

  async function pedirVinculo() {
    if (!pedido) return;
    setSalvando(true);
    const r = await fetch("/api/treino/pedidos-vinculo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pedido),
    }).catch(() => null);
    setSalvando(false);
    const dados = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(dados?.erro ?? "Sem conexão. Tente de novo.", "error");
      return;
    }
    avisar("Pedido enviado. Quando o profissional responsável aprovar, o aluno aparece na sua lista.", "success");
    fechar();
  }

  return (
    <Dialog header={pedido ? "Solicitar vínculo" : "Cadastrar aluno"} visible={aberto} onHide={fechar} className="w-full max-w-lg" modal>
      {pedido ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            O e-mail <strong className="break-all">{pedido.email}</strong> já tem cadastro de aluno. Você pode pedir ao profissional responsável por
            esse cadastro que vincule o aluno a você. Nenhum dado do aluno aparece antes da aprovação.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700">Mensagem para o profissional responsável</span>
            <InputTextarea
              value={pedido.mensagem}
              maxLength={1000}
              rows={3}
              autoResize
              placeholder="Ex.: Sou o personal do aluno e vou acompanhar o treino dele."
              onChange={(e) => setPedido({ ...pedido, mensagem: e.target.value })}
              className="w-full"
              aria-label="Mensagem para o profissional responsável"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" label="Voltar" text onClick={() => setPedido(null)} />
            <Button type="button" label="Solicitar vínculo" icon="pi pi-send" loading={salvando} onClick={pedirVinculo} />
          </div>
        </div>
      ) : (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          O aluno fica só com você: o nutricionista não vê este cadastro. Na Área do Paciente, ele usa só o Treino.
        </p>
        <Campo rotulo="Nome completo" valor={form.nome} onChange={(v) => setForm((f) => ({ ...f, nome: v }))} />
        <Campo rotulo="Telefone (opcional)" valor={form.telefone} tipo="tel" onChange={(v) => setForm((f) => ({ ...f, telefone: v }))} />
        <Campo rotulo="E-mail de acesso" valor={form.email} tipo="email" onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
        <CampoSenha valor={form.senha} onChange={(v) => setForm((f) => ({ ...f, senha: v }))} />
        <CamposPessoais valor={form.pessoais} onChange={(v) => setForm((f) => ({ ...f, pessoais: v }))} />
        <div className="flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={fechar} />
          <Button type="button" label="Cadastrar" icon="pi pi-check" loading={salvando} onClick={salvar} />
        </div>
      </div>
      )}
    </Dialog>
  );
}

// Cartão na ficha do aluno próprio: dados de cadastro, acesso e nova senha.
export function CartaoDoAluno({
  alunoId,
  dados,
  onAlterado,
  onExcluido,
}: {
  alunoId: string;
  dados: DadosDoAluno;
  onAlterado: () => void;
  onExcluido: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [exclusao, setExclusao] = useState({ pedido: false, nome: "" });
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [form, setForm] = useState<Formulario>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);

  function abrirEdicao() {
    setForm({ nome: dados.nome, telefone: dados.telefone ?? "", email: dados.email ?? "", senha: "", pessoais: dadosDoBanco(dados) });
    setEditando(true);
  }

  async function salvarDados() {
    setSalvando(true);
    const corpo = corpoDoFormulario(form);
    if (!corpo) return;
    const ok = await enviar(`/api/treino/alunos/${alunoId}`, "PATCH", corpo);
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

  async function alterarAtivo(ativo: boolean) {
    const pergunta = ativo
      ? `Reativar o acesso de ${dados.nome}?`
      : `Desativar ${dados.nome}? O acesso dele cai na hora e nada é apagado. Você pode reativar depois.`;
    if (!(await pedirConfirmacao(pergunta, { aceitar: ativo ? "Reativar" : "Desativar", rejeitar: "Cancelar" }))) return;
    if (await enviar(`/api/treino/alunos/${alunoId}`, "PATCH", { acao: ativo ? "reativar" : "desativar" })) {
      avisar(ativo ? "Acesso reativado." : "Aluno desativado.", "success");
      onAlterado();
    }
  }

  async function excluir() {
    setSalvando(true);
    const ok = await enviar(`/api/treino/alunos/${alunoId}`, "DELETE", { pedidoDoAluno: exclusao.pedido, confirmacao: exclusao.nome });
    setSalvando(false);
    if (!ok) return;
    avisar("Aluno excluído com todo o histórico.", "success");
    setExcluindo(false);
    onExcluido();
  }

  return (
    <section className="cartao p-5" aria-label="Cadastro do aluno">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Cadastro do aluno</h2>
          <p className="mt-1 text-sm text-gray-500">Aluno próprio: só você vê este cadastro.</p>
          {dados.desativado_em ? (
            <p className="mt-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold text-gray-700">
              Desativado em {new Date(dados.desativado_em).toLocaleDateString("pt-BR")}: o aluno não entra no sistema.
            </p>
          ) : null}
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
        <div>
          <dt className="text-gray-500">Nascimento</dt>
          <dd className={`font-medium ${dados.birth_date ? "text-gray-900" : "text-amber-700"}`}>
            {dados.birth_date ? `${dados.birth_date.split("-").reverse().join("/")} (${idadeEm(dados.birth_date)} anos)` : "Não informado (a avaliação física precisa)"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Sexo</dt>
          <dd className={`font-medium ${dados.sex ? "text-gray-900" : "text-amber-700"}`}>{rotuloDoSexo(dados.sex) ?? "Não informado (a avaliação física precisa)"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Altura</dt>
          <dd className="font-medium text-gray-900">{dados.height_cm ? `${String(dados.height_cm).replace(".", ",")} cm` : "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">E-mail de contato</dt>
          <dd className="font-medium text-gray-900 break-all">{dados.contact_email ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        {dados.desativado_em ? (
          <Button type="button" size="small" outlined icon="pi pi-replay" label="Reativar acesso" onClick={() => alterarAtivo(true)} />
        ) : (
          <Button type="button" size="small" outlined severity="secondary" icon="pi pi-ban" label="Desativar aluno" onClick={() => alterarAtivo(false)} />
        )}
        <Button
          type="button"
          size="small"
          text
          severity="danger"
          icon="pi pi-trash"
          label="Excluir a pedido do aluno"
          onClick={() => {
            setExclusao({ pedido: false, nome: "" });
            setExcluindo(true);
          }}
        />
      </div>

      <Dialog header="Excluir aluno de vez" visible={excluindo} onHide={() => setExcluindo(false)} className="w-full max-w-lg" modal>
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Apaga o cadastro, o acesso, os treinos, os registros, as avaliações, os contratos e os arquivos do aluno. Não dá para desfazer. Só exclua
            quando o próprio aluno pedir; para parar o acompanhamento, use “Desativar aluno”.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox inputId="pedido-do-aluno" checked={exclusao.pedido} onChange={(e) => setExclusao((x) => ({ ...x, pedido: Boolean(e.checked) }))} />
            O aluno pediu a exclusão definitiva dos dados dele.
          </label>
          <Campo rotulo={`Digite o nome do aluno: ${dados.nome}`} valor={exclusao.nome} onChange={(v) => setExclusao((x) => ({ ...x, nome: v }))} />
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setExcluindo(false)} />
            <Button
              type="button"
              label="Excluir de vez"
              severity="danger"
              icon="pi pi-trash"
              loading={salvando}
              disabled={!exclusao.pedido || exclusao.nome.trim().toLowerCase() !== dados.nome.trim().toLowerCase()}
              onClick={excluir}
            />
          </div>
        </div>
      </Dialog>

      <Dialog header="Editar cadastro" visible={editando} onHide={() => setEditando(false)} className="w-full max-w-lg" modal>
        <div className="space-y-4">
          <Campo rotulo="Nome completo" valor={form.nome} onChange={(v) => setForm((f) => ({ ...f, nome: v }))} />
          <Campo rotulo="Telefone (opcional)" valor={form.telefone} tipo="tel" onChange={(v) => setForm((f) => ({ ...f, telefone: v }))} />
          <Campo rotulo="E-mail de acesso" valor={form.email} tipo="email" onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
          <CamposPessoais valor={form.pessoais} onChange={(v) => setForm((f) => ({ ...f, pessoais: v }))} />
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

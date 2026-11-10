"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import Selecao from "@/components/Selecao";
import { avisar } from "@/lib/avisos";
import { hojeNoBrasil } from "@/lib/cronograma";
import { SEXOS, idadeEm, rotuloDoSexo } from "@/lib/nutricao/paciente";

type Dados = { nascimento: string | null; sexo: string | null; altura: number | null };

// Dados físicos do cadastro comum na ficha do Treino (SPEC 06/11, cadastro;
// decisão do cliente em 10/11): nascimento, sexo e altura, que a avaliação
// física usa. O profissional que acompanha o aluno pode alterar só estes três;
// a mudança vale também na Nutrição (o cadastro é um só).
export default function DadosFisicosDoAluno({ alunoId }: { alunoId: string }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [form, setForm] = useState<{ nascimento: string; sexo: string; altura: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch(`/api/treino/alunos/${alunoId}/dados-fisicos`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDados(d?.dados ?? null))
      .catch(() => setDados(null));
  }, [alunoId]);

  if (!dados) return null;

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    const r = await fetch(`/api/treino/alunos/${alunoId}/dados-fisicos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).catch(() => null);
    setSalvando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(d?.erro ?? "Não foi possível salvar.", "error");
      return;
    }
    setDados(d.dados);
    setForm(null);
    avisar("Dados salvos. Valem também no cadastro da Nutrição.", "success");
  }

  const faltando = !dados.nascimento || !dados.sexo;

  return (
    <section className="cartao p-5" aria-label="Dados pessoais">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Dados pessoais</h2>
          <p className="mt-1 text-sm text-gray-500">Do cadastro comum: usados na avaliação física. Alterações aparecem também para o nutricionista.</p>
        </div>
        <Button
          type="button"
          size="small"
          outlined
          icon="pi pi-pencil"
          label="Editar"
          onClick={() => setForm({ nascimento: dados.nascimento ?? "", sexo: dados.sexo ?? "", altura: dados.altura === null ? "" : String(dados.altura).replace(".", ",") })}
        />
      </div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-gray-500">Nascimento</dt>
          <dd className={`font-medium ${dados.nascimento ? "text-gray-900" : "text-amber-700"}`}>
            {dados.nascimento ? `${dados.nascimento.split("-").reverse().join("/")} (${idadeEm(dados.nascimento)} anos)` : "Não informado"}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Sexo</dt>
          <dd className={`font-medium ${dados.sexo ? "text-gray-900" : "text-amber-700"}`}>{rotuloDoSexo(dados.sexo) ?? "Não informado"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Altura</dt>
          <dd className="font-medium text-gray-900">{dados.altura ? `${String(dados.altura).replace(".", ",")} cm` : "—"}</dd>
        </div>
      </dl>
      {faltando ? <p className="mt-2 text-xs text-amber-700">Sem nascimento ou sexo, as equações da avaliação física que dependem deles não são calculadas.</p> : null}

      <Dialog header="Dados pessoais" visible={form !== null} onHide={() => setForm(null)} className="w-full max-w-md" modal>
        {form ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Data de nascimento</span>
              <InputText type="date" value={form.nascimento} max={hojeNoBrasil()} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} className="w-full" aria-label="Data de nascimento" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Sexo</span>
              <Selecao value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })} className="w-full">
                <option value="">Selecione…</option>
                {SEXOS.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </Selecao>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Altura (cm)</span>
              <InputText inputMode="decimal" value={form.altura} placeholder="Ex.: 165" onChange={(e) => setForm({ ...form, altura: e.target.value })} className="w-full" aria-label="Altura em centímetros" />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setForm(null)} />
              <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvar} />
            </div>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

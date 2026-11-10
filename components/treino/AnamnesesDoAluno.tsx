"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dropdown } from "primereact/dropdown";
import { Tag } from "primereact/tag";
import JanelaLinkDoPaciente from "@/components/nutricao/anamnese/JanelaLinkDoPaciente";
import { avisar } from "@/lib/avisos";
import { SITUACOES_DO_FORMULARIO, type SituacaoDoFormulario } from "@/lib/nutricao/anamnese";
import { PERGUNTAS_DA_ANAMNESE } from "@/lib/treinoAnamnese";

type Ficha = {
  id: string;
  titulo: string | null;
  situacao: SituacaoDoFormulario;
  arquivado_em: string | null;
  respondido_em: string | null;
  atualizado_em: string;
  modulo: "nutricao" | "treino";
  autor: string;
  minha: boolean;
};
type Modelo = { id: string; nome: string; meu: boolean; autor: string; arquivado_em: string | null };
type Dados = { anamneses: Ficha[]; modelos: Modelo[]; antiga: { respostas: Record<string, string>; atualizada_em: string } | null };

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

// Anamneses do aluno na ficha do Treino (SPEC 06/11, anamnese): a mesma
// rotina da Nutrição (modelo, ficha, link para o aluno responder no celular).
// Aparecem as do profissional e as preenchidas dos outros profissionais que
// acompanham o aluno (Treino e Nutrição), só para leitura. A anamnese simples
// antiga continua privada e só para ler (decisão do cliente em 10/11).
export default function AnamnesesDoAluno({ alunoId }: { alunoId: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [modelo, setModelo] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [link, setLink] = useState(false);
  const [verAntiga, setVerAntiga] = useState(false);

  useEffect(() => {
    fetch(`/api/treino/alunos/${alunoId}/anamneses`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Dados>) : null))
      .then((d) => {
        setDados(d);
        setModelo(d?.modelos[0]?.id ?? null);
      })
      .catch(() => setDados(null));
  }, [alunoId]);

  async function nova() {
    if (!modelo) return;
    setCriando(true);
    const r = await fetch(`/api/treino/alunos/${alunoId}/anamneses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modeloId: modelo }),
    }).catch(() => null);
    setCriando(false);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) return avisar(d?.erro ?? "Não foi possível criar a anamnese.", "error");
    router.push(`/treino/alunos/${alunoId}/anamnese/${d.id}`);
  }

  if (!dados) return null;

  return (
    <section className="cartao p-5" aria-label="Anamneses">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-gray-900">Anamneses</h2>
          <p className="mt-1 text-sm text-gray-500">
            Envie pelo link e o aluno responde no celular. As preenchidas aparecem também para os outros profissionais que acompanham o aluno.
          </p>
        </div>
        <Button type="button" size="small" text icon="pi pi-link" label="Link do aluno" onClick={() => setLink(true)} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Dropdown
          value={modelo}
          options={dados.modelos.map((m) => ({ label: m.meu ? m.nome : `${m.nome} (de ${m.autor})`, value: m.id }))}
          onChange={(e) => setModelo(e.value)}
          placeholder="Escolha o modelo"
          className="min-w-[14rem] flex-1 sm:flex-none"
          aria-label="Modelo da anamnese"
        />
        <Button type="button" size="small" icon="pi pi-plus" label="Nova anamnese" loading={criando} disabled={!modelo} onClick={nova} />
        <Link href="/treino/biblioteca?aba=anamneses" className="text-sm font-semibold text-primary-700 underline">
          Modelos de anamnese
        </Link>
      </div>

      {dados.anamneses.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Nenhuma anamnese ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {dados.anamneses.map((f) => {
            const situacao = SITUACOES_DO_FORMULARIO[f.situacao];
            return (
              <li key={f.id}>
                <Link href={`/treino/alunos/${alunoId}/anamnese/${f.id}`} className="flex flex-wrap items-center gap-2 py-3 hover:bg-primary-50">
                  <i className="pi pi-file-edit text-primary-700" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900">{f.titulo}</span>
                    <span className="block text-xs text-gray-500">
                      {f.minha ? "Sua" : `${f.modulo === "nutricao" ? "Nutrição" : "Treino"} · ${f.autor} · só leitura`} ·{" "}
                      {dataCurta(f.respondido_em ?? f.atualizado_em)}
                    </span>
                  </span>
                  {f.arquivado_em ? <Tag value="Arquivada" severity="secondary" /> : null}
                  <Tag value={situacao.rotulo.split(" — ")[0]} severity={situacao.cor} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {dados.antiga ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Button
            type="button"
            size="small"
            text
            icon={verAntiga ? "pi pi-chevron-up" : "pi pi-chevron-down"}
            label={`Anamnese anterior (só você vê) · ${dataCurta(dados.antiga.atualizada_em)}`}
            onClick={() => setVerAntiga((v) => !v)}
          />
          {verAntiga ? (
            <dl className="mt-2 space-y-2 text-sm">
              {PERGUNTAS_DA_ANAMNESE.map((p) => (
                <div key={p.chave}>
                  <dt className="font-semibold text-gray-700">{p.pergunta}</dt>
                  <dd className="whitespace-pre-wrap text-gray-900">{dados.antiga?.respostas[p.chave] || "—"}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}

      {link ? <JanelaLinkDoPaciente pacienteId={alunoId} treino onFechar={() => setLink(false)} /> : null}
    </section>
  );
}

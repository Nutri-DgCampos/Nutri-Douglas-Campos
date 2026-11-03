"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import Link from "next/link";
import RelatorioDaSemana, { type RelatorioNaTela } from "@/components/treino/RelatorioDaSemana";
import { ROTULO_DA_MODALIDADE, rotuloDaSemana } from "@/lib/treinoRelatorio";

type Relatorio = RelatorioNaTela & {
  patient_id: string;
  paciente: string;
  profissional: string;
  rascunho: string;
  rascunho_revisao: number;
  devolutiva: string | null;
  devolutiva_enviada_em: string | null;
  lida_em: string | null;
  pode_responder: boolean;
};

// Relatório semanal do Treino (T3): o que o aluno registrou na semana, com a
// devolutiva do profissional. O aluno só recebe o texto enviado.
export default function RelatorioDoTreinoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [relatorio, setRelatorio] = useState<Relatorio | null | undefined>(undefined);
  const [ia, setIa] = useState(false);
  const [texto, setTexto] = useState("");
  const [gravado, setGravado] = useState<"salvo" | "salvando" | "erro" | null>(null);
  const [gerando, setGerando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const revisao = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aplicar = useCallback((r: Relatorio | null) => {
    setRelatorio(r);
    if (r) {
      setTexto(r.devolutiva ?? r.rascunho);
      revisao.current = r.rascunho_revisao;
    }
  }, []);

  useEffect(() => {
    fetch(`/api/treino/relatorios/${params.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setIa(Boolean(d?.ia));
        aplicar(d?.relatorio ?? null);
      })
      .catch(() => aplicar(null));
  }, [params.id, aplicar]);

  async function gravar(valor: string) {
    setGravado("salvando");
    const r = await fetch(`/api/treino/relatorios/${params.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: valor, revisao: revisao.current }),
    }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (r?.ok) {
      revisao.current = d.revisao;
      setGravado("salvo");
    } else if (r?.status === 409) {
      revisao.current = d.revisao;
      setTexto(d.rascunho);
      setGravado("salvo");
      avisar("O rascunho foi substituído por uma versão mais nova.", "warn");
    } else {
      setGravado("erro");
    }
  }

  function digitar(valor: string) {
    setTexto(valor);
    setGravado(null);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => gravar(valor), 800);
  }

  async function acao(corpo: Record<string, unknown>) {
    const r = await fetch(`/api/treino/relatorios/${params.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
    const d = await r?.json().catch(() => null);
    if (!r?.ok) avisar(d?.erro ?? "Não foi possível concluir.", "error");
    return r?.ok ? d : null;
  }

  async function gerar() {
    if (texto.trim() && !(await pedirConfirmacao("Substituir o texto atual por um novo rascunho da IA?"))) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    setGerando(true);
    const d = await acao({ acao: "gerar" });
    setGerando(false);
    if (d) {
      revisao.current = d.revisao;
      setTexto(d.rascunho);
      setGravado("salvo");
      if (!d.descartada) avisar("Rascunho gerado. Revise antes de enviar.", "success");
    }
  }

  async function enviar() {
    if (!(await pedirConfirmacao("Enviar a devolutiva ao aluno? Depois de enviada, ela não pode ser alterada."))) return;
    if (temporizador.current) clearTimeout(temporizador.current);
    setEnviando(true);
    const d = await acao({ acao: "enviar", texto });
    setEnviando(false);
    if (d) {
      aplicar(d.relatorio);
      avisar("Devolutiva enviada ao aluno.", "success");
    }
  }

  async function marcar(metaId: string, atingida: boolean | null) {
    const d = await acao({ acao: "meta", metaId, atingida });
    if (d) setRelatorio(d.relatorio);
  }

  if (relatorio === undefined) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <Skeleton height="20rem" borderRadius="16px" className="mx-auto max-w-5xl" />
      </main>
    );
  }
  if (relatorio === null) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <Message severity="warn" text="Relatório não encontrado." />
        </div>
      </main>
    );
  }

  const enviada = relatorio.devolutiva !== null;

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <BotaoVoltar rotulo="Voltar para o aluno" onClick={() => router.push(`/treino/alunos/${relatorio.patient_id}`)} />
          <p className="text-sm font-semibold text-primary-700">
            <span className="rounded-full bg-primary-50 px-2 py-0.5">Treino</span>{" "}
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">{ROTULO_DA_MODALIDADE[relatorio.modalidade ?? "musculacao"]}</span> Relatório semanal
          </p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{relatorio.paciente}</h1>
          <p className="text-sm text-gray-600">
            Semana de {rotuloDaSemana(relatorio.semana_inicio, relatorio.semana_fim)}
            {relatorio.pode_responder || enviada ? "" : ` · responsável: ${relatorio.profissional}`}
          </p>
        </div>

        <RelatorioDaSemana relatorio={relatorio} podeMarcarMetas={relatorio.pode_responder} onMarcarMeta={marcar} />

        <p className="text-sm">
          <Link href={`/treino/alunos/${relatorio.patient_id}`} className="font-semibold text-primary-700 underline">
            Ver os registros originais do aluno
          </Link>
          <span className="text-gray-500"> (o relatório guarda uma cópia da semana; o que o aluno mudar depois não altera este relatório)</span>
        </p>
        <section className="cartao p-5" aria-label="Devolutiva">
          <h2 className="font-bold text-gray-900">Devolutiva ao aluno</h2>
          {enviada ? (
            <>
              <p className="mt-1 text-sm text-gray-500">
                Enviada em {new Date(relatorio.devolutiva_enviada_em!).toLocaleString("pt-BR")}
                {relatorio.lida_em ? " · lida pelo aluno" : " · ainda não lida"}
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-900">{relatorio.devolutiva}</p>
            </>
          ) : relatorio.pode_responder ? (
            <>
              <p className="mt-1 text-sm text-gray-600">O aluno recebe no cartão Relatórios: “Chegou a devolutiva do seu Personal Trainer”.</p>
              <InputTextarea
                value={texto}
                onChange={(e) => digitar(e.target.value)}
                rows={10}
                autoResize
                aria-label="Texto da devolutiva"
                className="mt-2 w-full"
                placeholder="Escreva a devolutiva ou gere um rascunho com a IA."
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {ia ? <Button type="button" outlined icon="pi pi-sparkles" label="Gerar rascunho com IA" loading={gerando} onClick={gerar} /> : null}
                <Button type="button" icon="pi pi-send" label="Enviar devolutiva ao aluno" loading={enviando} disabled={!texto.trim() || gerando} onClick={enviar} />
                <span className="text-xs text-gray-500">
                  {gravado === "salvando" ? "Salvando..." : gravado === "salvo" ? "Rascunho salvo" : gravado === "erro" ? "Não foi possível salvar o rascunho" : ""}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm text-gray-500">Aguardando a devolutiva de {relatorio.profissional}.</p>
          )}
        </section>
      </div>
    </main>
  );
}

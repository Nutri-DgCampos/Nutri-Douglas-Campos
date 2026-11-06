"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";
import type { DiaDeTreino, Exercicio, Grupo, PlanoDeTreino } from "@/lib/treino";
import {
  MAX_SESSOES,
  PESO_SECUNDARIO_PADRAO,
  novaSessao,
  problemasParaEnvio,
  proximoDiaLivre,
  volumeSemanalPorGrupo,
} from "@/lib/treinoEditor";
import PainelTreino from "@/components/PainelTreino";
import { Dropdown } from "primereact/dropdown";
import ObservacoesDoTreino from "./ObservacoesDoTreino";
import SessaoDoEditor, { type ItemDaBiblioteca } from "./SessaoDoEditor";
import { JanelaDetalhes, JanelaIa, JanelaImportar, JanelaSalvarModelo, JanelaTroca, type Sugestao } from "./JanelasDoEditor";

// Editor de musculação (VIS-03, T4a). O que se edita aqui é o rascunho do
// programa: Salvar e o salvamento automático só gravam o rascunho. "Enviar
// ao paciente" confere o mínimo, pede confirmação e cria uma versão nova,
// imutável, que passa a valer no "Meu treino" do aluno.

const ESPERA_AUTOSAVE = 1500;
const CHAVE_SESSAO_COPIADA = "treino:sessao-copiada";
const CHAVE_PESO_SECUNDARIO = "treino:peso-secundario";

type Estado = "salvo" | "pendente" | "salvando" | "erro" | "conflito";

type Programa = {
  programa_id: string;
  patient_id: string;
  titulo: string;
  objetivo: string;
  plano: PlanoDeTreino;
  revisao: number;
  atualizada_em: string;
  arquivada_em: string | null;
  importacao: { em: string; origem: "texto" | "arquivo"; nome: string | null; caminho: string | null } | null;
  versoes: { id: string; versao: number; publicada_em: string }[];
};

type Documento = { titulo: string; objetivo: string; plano: PlanoDeTreino };

const TEXTO_DO_ESTADO: Record<Estado, string> = {
  salvo: "Rascunho gravado",
  pendente: "Alterações ainda não gravadas…",
  salvando: "Gravando…",
  erro: "Não foi possível gravar. Tentaremos de novo ao alterar.",
  conflito: "Alterado em outra janela: recarregue antes de continuar.",
};

const horaCurta = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function lerArmazenado<T>(chave: string, padrao: T): T {
  try {
    const valor = localStorage.getItem(chave);
    return valor === null ? padrao : (JSON.parse(valor) as T);
  } catch {
    return padrao;
  }
}

function guardar(chave: string, valor: unknown) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Conveniência apenas.
  }
}

export default function EditorMusculacao({
  programaId,
  aluno,
  equipamentosDaAcademia,
  onAlterado,
  onNovoAPartirDe,
  onAbrirImportarRotina,
  onAbrirModelos,
  onModeloSalvo,
}: {
  programaId: string;
  aluno: { nome: string; idade: number | null; sexo: string | null };
  equipamentosDaAcademia: string[] | null;
  // Título, envio ou arquivamento mudaram: a lista de programas recarrega.
  onAlterado: () => void;
  onNovoAPartirDe: (origem: { origem: "vazio" } | { origem: "duplicar"; programaId: string }) => void;
  onAbrirImportarRotina: () => void;
  onAbrirModelos: () => void;
  onModeloSalvo: () => void;
}) {
  const [programa, setPrograma] = useState<Programa | null | undefined>(undefined);
  const [documento, setDocumento] = useState<Documento | null>(null);
  const [estado, setEstado] = useState<Estado>("salvo");
  const [gravadoEm, setGravadoEm] = useState<string | null>(null);
  const [biblioteca, setBiblioteca] = useState<ItemDaBiblioteca[]>([]);
  const [opcoesAbertas, setOpcoesAbertas] = useState<Record<number, boolean>>({});
  const [detalhe, setDetalhe] = useState<{ sessao: number; exercicio: number } | null>(null);
  // Versão enviada ao aluno, só leitura (SPEC complementar 06/11, item 1).
  const [enviada, setEnviada] = useState<{ versao: number; titulo: string | null; plano: PlanoDeTreino; publicada_em: string } | null | "carregando">(null);
  const [troca, setTroca] = useState<{ sessao: number; exercicio: number } | null>(null);
  const [importando, setImportando] = useState(false);
  const [ia, setIa] = useState(false);
  const [modelo, setModelo] = useState<{ plano: PlanoDeTreino; nome: string; descricao: string } | null>(null);
  const [problemas, setProblemas] = useState<string[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [sessaoCopiada, setSessaoCopiada] = useState<DiaDeTreino | null>(null);
  const [pesoSecundario, setPesoSecundario] = useState(PESO_SECUNDARIO_PADRAO);

  const documentoRef = useRef<Documento | null>(null);
  const revisaoRef = useRef(0);
  const pendenteRef = useRef(false);
  const conflitoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravacaoRef = useRef<Promise<boolean> | null>(null);
  const tituloRef = useRef("");

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/treino/programas/${programaId}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) {
      setPrograma(null);
      return;
    }
    const { programa: p } = (await r.json()) as { programa: Programa };
    const doc = { titulo: p.titulo, objetivo: p.objetivo, plano: p.plano };
    setPrograma(p);
    setDocumento(doc);
    documentoRef.current = doc;
    revisaoRef.current = p.revisao;
    tituloRef.current = p.titulo;
    pendenteRef.current = false;
    conflitoRef.current = false;
    setEstado("salvo");
    setGravadoEm(p.atualizada_em);
  }, [programaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    fetch("/api/treino/exercicios", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { exercicios: [] }))
      .then((d) => setBiblioteca(d.exercicios))
      .catch(() => setBiblioteca([]));
    setSessaoCopiada(lerArmazenado<DiaDeTreino | null>(CHAVE_SESSAO_COPIADA, null));
    setPesoSecundario(lerArmazenado(CHAVE_PESO_SECUNDARIO, PESO_SECUNDARIO_PADRAO));
  }, []);

  // ---------------------------------------------------------------------
  // Gravação

  const gravar = useCallback(async (): Promise<boolean> => {
    if (conflitoRef.current) return false;
    if (timerRef.current) clearTimeout(timerRef.current);
    while (gravacaoRef.current) await gravacaoRef.current;
    const doc = documentoRef.current;
    if (!doc) return false;
    if (!pendenteRef.current) return true;

    pendenteRef.current = false;
    setEstado("salvando");
    const promessa = (async () => {
      try {
        const r = await fetch(`/api/treino/programas/${programaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...doc, revisao: revisaoRef.current }),
        });
        const corpo = await r.json().catch(() => null);
        if (r.status === 409) {
          conflitoRef.current = true;
          setEstado("conflito");
          avisar(corpo?.erro ?? "O treino foi alterado em outra janela.", "error");
          return false;
        }
        if (!r.ok) {
          pendenteRef.current = true;
          setEstado("erro");
          if (r.status === 400) avisar(corpo?.erro ?? "Dados inválidos no treino.", "error");
          return false;
        }
        revisaoRef.current = corpo.revisao;
        setGravadoEm(corpo.atualizada_em);
        setEstado(pendenteRef.current ? "pendente" : "salvo");
        if (doc.titulo !== tituloRef.current) {
          tituloRef.current = doc.titulo;
          onAlterado();
        }
        return true;
      } catch {
        pendenteRef.current = true;
        setEstado("erro");
        return false;
      }
    })();
    gravacaoRef.current = promessa;
    const ok = await promessa;
    gravacaoRef.current = null;
    if (ok && pendenteRef.current) agendar();
    return ok;
    // agendar só usa refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programaId, onAlterado]);

  function agendar() {
    pendenteRef.current = true;
    setEstado((atual) => (atual === "conflito" ? atual : "pendente"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void gravar(), ESPERA_AUTOSAVE);
  }

  useEffect(() => {
    const aoSair = (evento: BeforeUnloadEvent) => {
      if (pendenteRef.current || gravacaoRef.current) {
        evento.preventDefault();
        void gravar();
      }
    };
    window.addEventListener("beforeunload", aoSair);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      if (pendenteRef.current && documentoRef.current && !conflitoRef.current) {
        void fetch(`/api/treino/programas/${programaId}`, {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...documentoRef.current, revisao: revisaoRef.current }),
        });
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [programaId, gravar]);

  const somenteLeitura = Boolean(programa?.arquivada_em) || estado === "conflito";

  const alterar = useCallback(
    (mudanca: (doc: Documento) => void) => {
      if (somenteLeitura || !documentoRef.current) return;
      const copia = structuredClone(documentoRef.current);
      mudanca(copia);
      documentoRef.current = copia;
      setDocumento(copia);
      agendar();
    },
    // agendar só usa refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [somenteLeitura]
  );

  const alterarSessao = (indice: number) => (mudanca: (s: DiaDeTreino) => void) => alterar((d) => mudanca(d.plano.dias[indice]));

  // ---------------------------------------------------------------------
  // Ações

  async function salvar() {
    pendenteRef.current = true;
    if (await gravar()) avisar("Rascunho salvo. O aluno só recebe quando você enviar.", "success");
  }

  async function enviar() {
    if (!(await gravar()) || !documentoRef.current || !programa) return;
    const lista = problemasParaEnvio(documentoRef.current);
    if (lista.length) {
      setProblemas(lista);
      return;
    }
    const proxima = (programa.versoes[0]?.versao ?? 0) + 1;
    const confirmado = await pedirConfirmacao(
      `Enviar a versão ${proxima} para ${aluno.nome}? Ela passa a valer no “Meu treino” do aluno, que recebe um aviso no celular. As versões anteriores e os registros continuam guardados.`,
      { aceitar: "Enviar ao paciente", rejeitar: "Cancelar", titulo: "Enviar treino" }
    );
    if (!confirmado) return;
    setEnviando(true);
    const r = await fetch(`/api/treino/programas/${programaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "enviar", revisao: revisaoRef.current }),
    }).catch(() => null);
    const corpo = await r?.json().catch(() => null);
    setEnviando(false);
    if (!r?.ok) {
      avisar(corpo?.erro ?? "Sem conexão. Tente de novo.", "error");
      return;
    }
    avisar(`Versão ${corpo.versao.versao} enviada ao aluno.`, "success");
    await carregar();
    onAlterado();
  }

  async function arquivar() {
    if (!programa) return;
    const arquivar = !programa.arquivada_em;
    if (arquivar) {
      const ok = await pedirConfirmacao(
        programa.versoes.length
          ? "Arquivar este treino? Ele sai da lista e deixa de valer no “Meu treino” do aluno (vale o treino anterior, se houver). Nada é apagado: versões, registros e PDFs ficam guardados, e você pode reativar."
          : "Arquivar este rascunho? Nada é apagado e você pode reativar.",
        { aceitar: "Arquivar", rejeitar: "Cancelar", titulo: "Arquivar treino" }
      );
      if (!ok) return;
      await gravar();
    }
    const r = await fetch(`/api/treino/programas/${programaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: arquivar ? "arquivar" : "reativar" }),
    }).catch(() => null);
    if (!r?.ok) {
      avisar("Não foi possível concluir. Tente de novo.", "error");
      return;
    }
    avisar(arquivar ? "Treino arquivado." : "Treino reativado.", "success");
    await carregar();
    onAlterado();
  }

  async function verVersao(versao: number) {
    setEnviada("carregando");
    const r = await fetch(`/api/treino/programas/${programaId}?versao=${versao}`, { cache: "no-store" }).catch(() => null);
    const dados = await r?.json().catch(() => null);
    if (!r?.ok) {
      setEnviada(null);
      avisar(dados?.erro ?? "Não foi possível abrir a versão enviada.", "error");
      return;
    }
    setEnviada(dados.versao);
  }

  async function abrirPdf(detalhado: boolean) {
    await gravar();
    const versao = programa?.versoes[0]?.versao;
    // Com versão enviada e sem alterações pendentes no rascunho, o PDF é o da
    // versão; senão, o do rascunho (marcado como tal no documento).
    const params = new URLSearchParams();
    if (versao && !alteradoDesdeOEnvio) params.set("versao", String(versao));
    if (detalhado) params.set("detalhado", "1");
    abrirDocumento(`/api/treino/programas/${programaId}/pdf?${params}`, detalhado ? "Treino detalhado" : "Treino");
  }

  function aplicarPlano(plano: PlanoDeTreino, modo: "substituir" | "acrescentar", titulo?: string) {
    alterar((d) => {
      if (modo === "substituir") {
        // Troca as sessões; as observações do treino ficam, salvo se o plano
        // novo trouxer as suas.
        const observacoes = plano.observacoes?.length ? plano.observacoes : d.plano.observacoes;
        d.plano = { ...structuredClone(plano), ...(observacoes?.length ? { observacoes: structuredClone(observacoes) } : {}) };
      }
      else {
        for (const sessao of plano.dias) {
          if (d.plano.dias.length >= MAX_SESSOES) break;
          const livre = d.plano.dias.some((s) => s.dia === sessao.dia) ? proximoDiaLivre(d.plano) : sessao.dia;
          d.plano.dias.push({ ...structuredClone(sessao), dia: livre });
        }
      }
      if (titulo && !d.titulo.trim()) d.titulo = titulo;
    });
    avisar(modo === "substituir" ? "Sessões substituídas no rascunho. Revise antes de enviar." : "Sessões acrescentadas ao rascunho. Revise antes de enviar.", "info");
  }

  async function salvarModelo(plano: PlanoDeTreino, nome: string, compartilhado: boolean) {
    const r = await fetch("/api/treino/modelos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, plano, compartilhado }),
    }).catch(() => null);
    if (!r?.ok) {
      avisar((await r?.json().catch(() => null))?.erro ?? "Não foi possível salvar o modelo.", "error");
      return false;
    }
    avisar("Modelo salvo.", "success");
    onModeloSalvo();
    return true;
  }

  // ---------------------------------------------------------------------

  const volume = useMemo(() => (documento ? volumeSemanalPorGrupo(documento.plano, pesoSecundario) : []), [documento, pesoSecundario]);

  if (programa === undefined || !documento) return <Skeleton height="24rem" borderRadius="16px" />;
  if (programa === null)
    return (
      <div className="cartao p-6 text-center">
        <p className="font-semibold text-gray-900">Treino não encontrado.</p>
      </div>
    );

  const ultima = programa.versoes[0] ?? null;
  const alteradoDesdeOEnvio = Boolean(ultima) && (estado !== "salvo" || (gravadoEm !== null && new Date(gravadoEm) > new Date(ultima.publicada_em)));
  const diasOcupados = documento.plano.dias.map((d) => d.dia);
  const exercicioDetalhe = detalhe ? documento.plano.dias[detalhe.sessao]?.exercicios[detalhe.exercicio] ?? null : null;
  const exercicioTroca = troca ? documento.plano.dias[troca.sessao]?.exercicios[troca.exercicio] ?? null : null;

  return (
    <div className="space-y-3">
      {programa.arquivada_em ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
          <span>Treino arquivado em {horaCurta(programa.arquivada_em)} — somente leitura. Não vale para o aluno.</span>
          <Button type="button" size="small" outlined label="Reativar" icon="pi pi-replay" onClick={arquivar} />
        </div>
      ) : null}

      {!somenteLeitura ? (
        <div className="pointer-events-none sticky top-2 z-20 -mb-11 flex justify-end">
          <Button type="button" icon="pi pi-sparkles" label="Auxílio da IA" size="small" className="pointer-events-auto shadow-lg" onClick={() => setIa(true)} />
        </div>
      ) : null}

      <div className="cartao grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
        <div className="flex flex-wrap gap-1 pr-36 sm:col-span-2" inert={somenteLeitura}>
          <Button type="button" icon="pi pi-download" label="Importar" size="small" outlined onClick={() => setImportando(true)} />
          <Button type="button" icon="pi pi-history" label="Importar rotina" size="small" outlined onClick={onAbrirImportarRotina} />
          <Button type="button" icon="pi pi-plus" label="Gerar novo treino" size="small" text onClick={() => onNovoAPartirDe({ origem: "vazio" })} />
          <Button
            type="button"
            icon="pi pi-clone"
            label="Duplicar"
            size="small"
            text
            onClick={async () => {
              await gravar();
              onNovoAPartirDe({ origem: "duplicar", programaId });
            }}
          />
          <Button
            type="button"
            icon="pi pi-bookmark"
            label="Salvar como modelo"
            size="small"
            text
            onClick={() =>
              setModelo({
                plano: documento.plano,
                nome: documento.titulo.trim(),
                descricao: "O modelo guarda as sessões, os exercícios, as séries, as repetições e o descanso. Cargas, observações e notas não entram (são do aluno).",
              })
            }
          />
          <Button type="button" icon="pi pi-folder-open" label="Modelos" size="small" text onClick={onAbrirModelos} />
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Objetivo</span>
          <InputText
            value={documento.objetivo}
            disabled={somenteLeitura}
            maxLength={120}
            placeholder="Ex.: Hipertrofia"
            onChange={(e) => alterar((d) => void (d.objetivo = e.target.value))}
            className="w-full"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Título</span>
          <InputText
            value={documento.titulo}
            disabled={somenteLeitura}
            maxLength={120}
            placeholder="Ex.: Treino ABC – Hipertrofia"
            onChange={(e) => alterar((d) => void (d.titulo = e.target.value))}
            className={`w-full ${documento.titulo.trim() ? "" : "p-invalid"}`}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 sm:col-span-2">
          <span className={estado === "erro" || estado === "conflito" ? "font-semibold text-red-700" : ""}>
            {TEXTO_DO_ESTADO[estado]}
            {estado === "salvo" && gravadoEm ? ` às ${horaCurta(gravadoEm)}` : ""}
          </span>
          {ultima ? (
            <>
              <Tag value={`Enviado: versão ${ultima.versao} em ${horaCurta(ultima.publicada_em)}${alteradoDesdeOEnvio ? " · alterado depois" : ""}`} severity="success" className="selo-status" />
              <Button type="button" size="small" text icon="pi pi-eye" label="Ver versão enviada" onClick={() => verVersao(ultima.versao)} />
            </>
          ) : (
            <Tag value="Rascunho, ainda não enviado" severity="info" className="selo-status" />
          )}
          {programa.importacao ? (
            <span>
              · Importado {programa.importacao.origem === "arquivo" ? `do arquivo ${programa.importacao.nome ?? ""}` : "de texto colado"} em {horaCurta(programa.importacao.em)}
            </span>
          ) : null}
          {estado === "conflito" ? <Button type="button" size="small" label="Recarregar" onClick={() => carregar()} /> : null}
        </div>
      </div>

      <div inert={somenteLeitura} className={`space-y-3 ${somenteLeitura ? "opacity-70" : ""}`}>
        {documento.plano.dias.length === 0 ? (
          <div className="cartao p-6 text-center text-sm text-gray-600">
            Nenhuma sessão ainda. Adicione a primeira, importe um treino ou peça ao Auxílio da IA.
          </div>
        ) : null}

        {documento.plano.dias.map((sessao, indice) => (
          <SessaoDoEditor
            key={indice}
            sessao={sessao}
            indice={indice}
            total={documento.plano.dias.length}
            diasOcupados={diasOcupados}
            biblioteca={biblioteca}
            equipamentosDaAcademia={equipamentosDaAcademia}
            mostrarOpcoes={Boolean(opcoesAbertas[indice])}
            podeColar={Boolean(sessaoCopiada)}
            onAlterar={alterarSessao(indice)}
            onRemover={async () => {
              if (sessao.exercicios.length && !(await pedirConfirmacao(`Excluir a sessão “${sessao.titulo || "sem nome"}” do rascunho? A versão já enviada ao aluno não muda.`, { aceitar: "Excluir", rejeitar: "Cancelar" })))
                return;
              alterar((d) => void d.plano.dias.splice(indice, 1));
            }}
            onMover={(direcao) =>
              alterar((d) => {
                const [s] = d.plano.dias.splice(indice, 1);
                d.plano.dias.splice(indice + direcao, 0, s);
              })
            }
            onAlternarOpcoes={() => setOpcoesAbertas((a) => ({ ...a, [indice]: !a[indice] }))}
            onCopiar={() => {
              setSessaoCopiada(sessao);
              guardar(CHAVE_SESSAO_COPIADA, sessao);
              avisar("Sessão copiada. Use “Colar” em outra sessão, inclusive de outro treino.", "info");
            }}
            onColar={async () => {
              if (!sessaoCopiada) return;
              if (sessao.exercicios.length && !(await pedirConfirmacao("Substituir os exercícios desta sessão pela sessão copiada?", { aceitar: "Substituir", rejeitar: "Cancelar" }))) return;
              alterar((d) => {
                d.plano.dias[indice] = { ...structuredClone(sessaoCopiada), dia: d.plano.dias[indice].dia };
              });
            }}
            onSalvarComoModelo={() =>
              setModelo({
                plano: { dias: [sessao] },
                nome: sessao.titulo.trim(),
                descricao: "Salva só esta sessão como modelo, sem cargas, observações e notas.",
              })
            }
            onDetalhes={(e) => setDetalhe({ sessao: indice, exercicio: e })}
            onTrocar={(e) => setTroca({ sessao: indice, exercicio: e })}
          />
        ))}

        <Button
          type="button"
          icon="pi pi-plus"
          label="Adicionar treino (dia)"
          outlined
          disabled={documento.plano.dias.length >= MAX_SESSOES}
          onClick={() => alterar((d) => void d.plano.dias.push(novaSessao(proximoDiaLivre(d.plano))))}
        />

        <ObservacoesDoTreino plano={documento.plano} somenteLeitura={somenteLeitura} onAlterar={(mudanca) => alterar((d) => mudanca(d.plano))} />

        {volume.some((v) => v.series > 0) ? (
          <section className="cartao p-4" aria-label="Volume semanal por grupo muscular">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">Volume semanal por grupo muscular</h2>
                <p className="text-xs text-gray-500">
                  Aproximação: série no músculo principal = 1; no secundário = o peso ao lado. Prescrito, não o que o aluno registrou.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                Peso da série secundária
                <InputNumber
                  value={pesoSecundario}
                  onValueChange={(e) => {
                    const v = Math.min(1, Math.max(0, e.value ?? PESO_SECUNDARIO_PADRAO));
                    setPesoSecundario(v);
                    guardar(CHAVE_PESO_SECUNDARIO, v);
                  }}
                  min={0}
                  max={1}
                  maxFractionDigits={2}
                  locale="pt-BR"
                  inputClassName="w-16 text-center"
                  aria-label="Peso da série secundária"
                />
              </label>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              {volume.map((v) => (
                <div key={v.grupo} className="flex justify-between border-b border-gray-100 py-1">
                  <dt className="text-gray-700">{v.grupo}</dt>
                  <dd className={`font-semibold tabular-nums ${v.series ? "text-gray-900" : "text-gray-400"}`}>{v.series.toLocaleString("pt-BR")}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur">
        <Button type="button" icon="pi pi-save" label="Salvar" onClick={salvar} disabled={somenteLeitura} />
        <Button type="button" icon="pi pi-file-pdf" label="PDF" outlined onClick={() => abrirPdf(false)} disabled={estado === "conflito"} />
        <Button type="button" label="PDF detalhado" outlined onClick={() => abrirPdf(true)} disabled={estado === "conflito"} />
        {!programa.arquivada_em ? <Button type="button" icon="pi pi-inbox" label="Arquivar" severity="danger" text onClick={arquivar} /> : null}
        <span className="flex-1" />
        <Button type="button" icon="pi pi-send" label="Enviar ao paciente" severity="success" loading={enviando} onClick={enviar} disabled={somenteLeitura} />
      </div>

      <Dialog
        header="Versão enviada ao aluno"
        visible={enviada !== null}
        onHide={() => setEnviada(null)}
        className="w-[56rem] max-w-[calc(100vw-1rem)]"
        modal
      >
        {enviada === "carregando" ? (
          <Skeleton height="16rem" borderRadius="16px" />
        ) : enviada ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <Tag value={`Publicada · versão ${enviada.versao}`} severity="success" />
              <span>
                {enviada.titulo || "Treino sem título"} · enviada em {horaCurta(enviada.publicada_em)}. É o que o aluno recebeu; o rascunho do editor não muda esta versão.
              </span>
              {programa.versoes.length > 1 ? (
                <Dropdown
                  value={enviada.versao}
                  options={programa.versoes.map((v) => ({ label: `Versão ${v.versao} (${horaCurta(v.publicada_em)})`, value: v.versao }))}
                  onChange={(e) => verVersao(e.value)}
                  aria-label="Escolher a versão"
                />
              ) : null}
            </div>
            <PainelTreino plano={enviada.plano} />
          </div>
        ) : null}
      </Dialog>

      <JanelaDetalhes
        key={detalhe ? `detalhe-${detalhe.sessao}-${detalhe.exercicio}` : "detalhe-fechada"}
        exercicio={exercicioDetalhe}
        onFechar={() => setDetalhe(null)}
        onSalvar={(e: Exercicio) => {
          if (!detalhe) return;
          alterar((d) => void (d.plano.dias[detalhe.sessao].exercicios[detalhe.exercicio] = e));
          setDetalhe(null);
        }}
      />

      <JanelaTroca
        exercicio={exercicioTroca}
        biblioteca={biblioteca}
        equipamentosDaAcademia={equipamentosDaAcademia}
        onFechar={() => setTroca(null)}
        onEscolher={(item) => {
          if (!troca) return;
          alterar((d) => {
            const e = d.plano.dias[troca.sessao].exercicios[troca.exercicio];
            e.nome = item.nome;
            e.grupo = item.grupo as Grupo;
            e.exercicio_id = item.id;
            e.video_url = item.video_url;
          });
          setTroca(null);
        }}
      />

      <JanelaImportar aberta={importando} programaId={programaId} onFechar={() => setImportando(false)} onAplicar={(p, modo) => aplicarPlano(p, modo)} />

      <JanelaIa
        aberta={ia}
        programaId={programaId}
        antesDePedir={gravar}
        onFechar={() => setIa(false)}
        onAplicar={(s: Sugestao, modo) => aplicarPlano(s.plano, modo, s.titulo)}
      />

      <JanelaSalvarModelo
        key={modelo ? `modelo-${modelo.nome}-${modelo.plano.dias.length}` : "modelo-fechada"}
        aberta={Boolean(modelo)}
        nomeInicial={modelo?.nome ?? ""}
        descricao={modelo?.descricao ?? ""}
        onFechar={() => setModelo(null)}
        onSalvar={(nome, compartilhado) => (modelo ? salvarModelo(modelo.plano, nome, compartilhado) : Promise.resolve(false))}
      />

      <Dialog header="Antes de enviar" visible={Boolean(problemas)} onHide={() => setProblemas(null)} className="w-full max-w-lg" modal>
        <p className="text-sm text-gray-600">Corrija estes pontos no rascunho:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-900">
          {problemas?.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button type="button" label="Entendi" onClick={() => setProblemas(null)} />
        </div>
      </Dialog>
    </div>
  );
}

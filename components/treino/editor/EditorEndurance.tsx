"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";
import { DIAS } from "@/lib/treino";
import { textoDaDuracao, type Atividade } from "@/lib/treinoAtividades";
import {
  FASES,
  MAX_SEMANAS,
  MAX_SESSOES_SEMANA,
  TERRENOS,
  TIPOS,
  ajustarVolume,
  novaSessaoEndurance,
  ordenarSessoesDaSemana,
  problemasParaEnvioEndurance,
  textoDosMinutos,
  totaisDaSemana,
  zonasDePotencia,
  type BlocoDaSessao,
  type FaixaDeZona,
  type ModalidadeEndurance,
  type PlanoEndurance,
  type SessaoEndurance,
  type ZonasDoAluno,
} from "@/lib/treinoEndurance";
import { JanelaIa, JanelaImportar, JanelaSalvarModelo, type Sugestao } from "./JanelasDoEditor";

// Editores de corrida (VIS-04) e ciclismo (VIS-05), T4c. Mesmo padrão do
// editor de musculação: o que se edita é o rascunho; "Enviar ao paciente"
// cria uma versão nova e imutável. Totais vêm das linhas; sem dado, "Não
// disponível". Nada de TSS, calorias ou distribuição de zonas estimados.

const ESPERA_AUTOSAVE = 1500;
const CHAVE_SEMANA_COPIADA = "treino:semana-copiada";

type Estado = "salvo" | "pendente" | "salvando" | "erro" | "conflito";
type Documento = { titulo: string; objetivo: string; plano: PlanoEndurance };
type Programa = Documento & {
  programa_id: string;
  revisao: number;
  atualizada_em: string;
  arquivada_em: string | null;
  importacao: { em: string; origem: "texto" | "arquivo"; nome: string | null } | null;
  versoes: { id: string; versao: number; publicada_em: string }[];
};
type ZonasNaTela = ZonasDoAluno & { atualizado_em: string | null; autor: string | null };

const TEXTO_DO_ESTADO: Record<Estado, string> = {
  salvo: "Rascunho gravado",
  pendente: "Alterações ainda não gravadas…",
  salvando: "Gravando…",
  erro: "Não foi possível gravar. Tentaremos de novo ao alterar.",
  conflito: "Alterado em outra janela: recarregue antes de continuar.",
};

const horaCurta = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const num = (v: number | null, sufixo = "") => (v === null ? "Não disponível" : `${v.toLocaleString("pt-BR")}${sufixo}`);

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
const ddmm = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");
const DESDE_DOMINGO: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

const COR_DO_TIPO: Record<string, string> = {
  Regenerativo: "bg-primary-50 text-primary-800",
  Recuperativo: "bg-primary-50 text-primary-800",
  Fácil: "bg-primary-50 text-primary-800",
  Endurance: "bg-primary-100 text-primary-800",
  Intervalado: "bg-red-50 text-red-700",
  "VO2máx.": "bg-red-50 text-red-700",
  Fartlek: "bg-atencao-50 text-atencao-700",
  "Tempo / limiar": "bg-sky-50 text-sky-800",
  Tempo: "bg-sky-50 text-sky-800",
  "Sweet spot": "bg-sky-50 text-sky-800",
  Longo: "bg-violet-50 text-violet-800",
  Subida: "bg-atencao-50 text-atencao-700",
};

export default function EditorEndurance({
  modalidade,
  programaId,
  alunoId,
  aluno,
  zonas: zonasIniciais,
  onAlterado,
  onNovoAPartirDe,
  onAbrirImportarRotina,
  onAbrirModelos,
  onModeloSalvo,
}: {
  modalidade: ModalidadeEndurance;
  programaId: string;
  alunoId: string;
  aluno: { nome: string; idade: number | null; sexo: string | null };
  zonas: ZonasNaTela | null;
  onAlterado: () => void;
  onNovoAPartirDe: (origem: { origem: "vazio" } | { origem: "duplicar"; programaId: string }) => void;
  onAbrirImportarRotina: () => void;
  onAbrirModelos: () => void;
  onModeloSalvo: () => void;
}) {
  const ciclismo = modalidade === "ciclismo";
  const [programa, setPrograma] = useState<Programa | null | undefined>(undefined);
  const [documento, setDocumento] = useState<Documento | null>(null);
  const [estado, setEstado] = useState<Estado>("salvo");
  const [gravadoEm, setGravadoEm] = useState<string | null>(null);
  const [aba, setAba] = useState<"planilha" | "progressao" | "zonas" | "historico">("planilha");
  const [semana, setSemana] = useState(0);
  const [mostrarZonas, setMostrarZonas] = useState(true);
  const [mostrarOpcoes, setMostrarOpcoes] = useState(false);
  const [zonas, setZonas] = useState<ZonasNaTela | null>(zonasIniciais);
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const [ajuste, setAjuste] = useState(false);
  const [importando, setImportando] = useState(false);
  const [ia, setIa] = useState(false);
  const [modelo, setModelo] = useState(false);
  const [problemas, setProblemas] = useState<string[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [semanaCopiada, setSemanaCopiada] = useState<SessaoEndurance[] | null>(() => {
    try {
      const copiada = localStorage.getItem(`${CHAVE_SEMANA_COPIADA}:${modalidade}`);
      return copiada ? (JSON.parse(copiada) as SessaoEndurance[]) : null;
    } catch {
      return null;
    }
  });

  const documentoRef = useRef<Documento | null>(null);
  const revisaoRef = useRef(0);
  const pendenteRef = useRef(false);
  const conflitoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravacaoRef = useRef<Promise<boolean> | null>(null);
  const tituloRef = useRef("");

  const buscar = useCallback(
    () =>
      fetch(`/api/treino/programas/${programaId}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<{ programa: Programa }>) : null))
        .then((d) => d?.programa ?? null)
        .catch(() => null),
    [programaId]
  );

  const aplicar = useCallback((p: Programa | null) => {
    if (!p) {
      setPrograma(null);
      return;
    }
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
  }, []);

  const carregar = useCallback(async () => aplicar(await buscar()), [aplicar, buscar]);

  useEffect(() => {
    buscar().then(aplicar);
  }, [buscar, aplicar]);

  // ---------------------------------------------------------------------
  // Gravação (mesmo padrão do editor de musculação)

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
          avisar(corpo?.erro ?? "A planilha foi alterada em outra janela.", "error");
          return false;
        }
        if (!r.ok) {
          pendenteRef.current = true;
          setEstado("erro");
          if (r.status === 400) avisar(corpo?.erro ?? "Dados inválidos na planilha.", "error");
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

  const totais = useMemo(() => (documento ? totaisDaSemana(documento.plano.semanas[semana] ?? { sessoes: [] }) : null), [documento, semana]);

  if (programa === undefined || !documento || !totais) return <Skeleton height="24rem" borderRadius="16px" />;
  if (programa === null)
    return (
      <div className="cartao p-6 text-center">
        <p className="font-semibold text-gray-900">Planilha não encontrada.</p>
      </div>
    );

  const plano = documento.plano;
  const semanaAtual = plano.semanas[semana] ?? { sessoes: [] };
  const inicioDaSemana = plano.ciclo.inicio ? somarDias(plano.ciclo.inicio, semana * 7) : null;
  const ultima = programa.versoes[0] ?? null;
  const alteradoDesdeOEnvio = Boolean(ultima) && (estado !== "salvo" || (gravadoEm !== null && new Date(gravadoEm) > new Date(ultima.publicada_em)));
  const alterarSessao = (indice: number, m: (s: SessaoEndurance) => void) => alterar((d) => m(d.plano.semanas[semana].sessoes[indice]));

  async function salvar() {
    pendenteRef.current = true;
    if (await gravar()) avisar("Rascunho salvo. O aluno só recebe quando você enviar.", "success");
  }

  async function enviar() {
    if (!(await gravar()) || !documentoRef.current || !programa) return;
    const lista = problemasParaEnvioEndurance(documentoRef.current);
    if (lista.length) {
      setProblemas(lista);
      return;
    }
    const proxima = (programa.versoes[0]?.versao ?? 0) + 1;
    const ok = await pedirConfirmacao(
      `Enviar a versão ${proxima} para ${aluno.nome}? As sessões aparecem no “Meu treino” do aluno a partir do início do ciclo, e ele recebe um aviso no celular. As versões anteriores e os registros continuam guardados.`,
      { aceitar: "Enviar ao paciente", rejeitar: "Cancelar", titulo: "Enviar planilha" }
    );
    if (!ok) return;
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
    const arquivando = !programa.arquivada_em;
    if (
      arquivando &&
      !(await pedirConfirmacao("Arquivar esta planilha? Ela deixa de valer para o aluno. Nada é apagado e você pode reativar.", { aceitar: "Arquivar", rejeitar: "Cancelar" }))
    )
      return;
    if (arquivando) await gravar();
    const r = await fetch(`/api/treino/programas/${programaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: arquivando ? "arquivar" : "reativar" }),
    }).catch(() => null);
    if (!r?.ok) {
      avisar("Não foi possível concluir. Tente de novo.", "error");
      return;
    }
    await carregar();
    onAlterado();
  }

  async function abrirPdf(detalhado: boolean, versao?: number) {
    await gravar();
    const params = new URLSearchParams();
    const v = versao ?? (ultima && !alteradoDesdeOEnvio ? ultima.versao : undefined);
    if (v) params.set("versao", String(v));
    if (detalhado) params.set("detalhado", "1");
    abrirDocumento(`/api/treino/programas/${programaId}/pdf?${params}`, ciclismo ? "Planilha de ciclismo" : "Planilha de corrida");
  }

  function aplicarPlano(novo: PlanoEndurance, modo: "substituir" | "acrescentar", titulo?: string) {
    alterar((d) => {
      if (modo === "substituir") d.plano = { ciclo: { ...d.plano.ciclo, fase: novo.ciclo.fase ?? d.plano.ciclo.fase }, semanas: structuredClone(novo.semanas) };
      else d.plano.semanas = [...d.plano.semanas, ...structuredClone(novo.semanas)].slice(0, MAX_SEMANAS);
      if (titulo && !d.titulo.trim()) d.titulo = titulo;
    });
    avisar("Planilha atualizada no rascunho. Revise antes de enviar.", "info");
  }

  function mudarDuracao(semanas: number) {
    const n = Math.max(1, Math.min(MAX_SEMANAS, semanas));
    alterar((d) => {
      while (d.plano.semanas.length < n) d.plano.semanas.push({ sessoes: [] });
      d.plano.semanas = d.plano.semanas.slice(0, n);
    });
    if (semana >= n) setSemana(n - 1);
  }

  const sessaoDetalhe = detalhe !== null ? semanaAtual.sessoes[detalhe] : null;

  return (
    <div className="space-y-3">
      {programa.arquivada_em ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
          <span>Planilha arquivada em {horaCurta(programa.arquivada_em)} — somente leitura. Não vale para o aluno.</span>
          <Button type="button" size="small" outlined label="Reativar" icon="pi pi-replay" onClick={arquivar} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1 border-b border-gray-200" role="tablist" aria-label="Seções da planilha">
        {(
          [
            ["planilha", "Planilha semanal", "pi-calendar"],
            ["progressao", "Progressão", "pi-chart-bar"],
            ["zonas", ciclismo ? "Zonas e métricas" : "Zonas e metas", "pi-bullseye"],
            ["historico", "Histórico", "pi-history"],
          ] as const
        ).map(([chave, rotulo, icone]) => (
          <button
            key={chave}
            type="button"
            role="tab"
            aria-selected={aba === chave}
            onClick={() => setAba(chave)}
            className={`-mb-px flex items-center gap-2 rounded-t-xl border px-3 py-2 text-sm font-semibold ${aba === chave ? "border-gray-200 border-b-white bg-white text-primary-800" : "border-transparent text-gray-600"}`}
          >
            <i className={`pi ${icone}`} aria-hidden /> {rotulo}
          </button>
        ))}
      </div>

      {aba === "zonas" ? (
        <PainelDeZonas modalidade={modalidade} alunoId={alunoId} zonas={zonas} onSalvas={setZonas} />
      ) : aba === "progressao" ? (
        <Progressao modalidade={modalidade} alunoId={alunoId} plano={plano} />
      ) : aba === "historico" ? (
        <section className="cartao p-4" aria-label="Histórico de versões">
          <h2 className="font-bold text-gray-900">Versões enviadas</h2>
          {programa.versoes.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">Ainda não enviada ao aluno.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {programa.versoes.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    Versão {v.versao} · enviada em {horaCurta(v.publicada_em)}
                    {v.versao === ultima?.versao ? " · a mais recente" : ""}
                  </span>
                  <span className="flex gap-1">
                    <Button type="button" size="small" text icon="pi pi-file-pdf" label="PDF" onClick={() => abrirPdf(false, v.versao)} />
                    <Button type="button" size="small" text label="PDF detalhado" onClick={() => abrirPdf(true, v.versao)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          {programa.importacao ? (
            <p className="mt-3 text-xs text-gray-500">
              Importada {programa.importacao.origem === "arquivo" ? `do arquivo ${programa.importacao.nome ?? ""}` : "de texto colado"} em {horaCurta(programa.importacao.em)}.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          {!somenteLeitura ? (
            <div className="pointer-events-none sticky top-2 z-20 -mb-11 flex justify-end">
              <Button type="button" icon="pi pi-sparkles" label="Auxílio da IA" size="small" className="pointer-events-auto shadow-lg" onClick={() => setIa(true)} />
            </div>
          ) : null}

          <div className="cartao grid gap-3 p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
            <div className="flex flex-wrap gap-1 pr-36 sm:col-span-2 lg:col-span-4" inert={somenteLeitura}>
              <Button type="button" icon="pi pi-download" label="Importar" size="small" outlined onClick={() => setImportando(true)} />
              <Button type="button" icon="pi pi-history" label="Importar planilha" size="small" outlined onClick={onAbrirImportarRotina} />
              <Button type="button" icon="pi pi-plus" label="Gerar nova planilha" size="small" text onClick={() => onNovoAPartirDe({ origem: "vazio" })} />
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
              <Button type="button" icon="pi pi-bookmark" label="Salvar como modelo" size="small" text onClick={() => setModelo(true)} />
              <Button type="button" icon="pi pi-book" label="Biblioteca de treinos" size="small" text onClick={onAbrirModelos} />
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Objetivo</span>
              <InputText value={documento.objetivo} disabled={somenteLeitura} maxLength={120} placeholder={ciclismo ? "Ex.: Resistência (estrada)" : "Ex.: Performance (10 km)"} onChange={(e) => alterar((d) => void (d.objetivo = e.target.value))} className="w-full" />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Título da planilha</span>
              <InputText
                value={documento.titulo}
                disabled={somenteLeitura}
                maxLength={120}
                placeholder="Ex.: Ciclo 1 – Base aeróbia"
                onChange={(e) => alterar((d) => void (d.titulo = e.target.value))}
                className={`w-full ${documento.titulo.trim() ? "" : "p-invalid"}`}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Periodização</span>
              <Dropdown value={plano.ciclo.fase} options={FASES} editable disabled={somenteLeitura} onChange={(e) => alterar((d) => void (d.plano.ciclo.fase = (e.value as string)?.slice(0, 60) || null))} className="w-full" aria-label="Periodização" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Início (domingo)</span>
                <InputText
                  type="date"
                  value={plano.ciclo.inicio ?? ""}
                  disabled={somenteLeitura}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v && new Date(`${v}T12:00:00Z`).getUTCDay() !== 0) {
                      avisar("O ciclo começa num domingo (semana oficial: domingo a sábado).", "warn");
                      return;
                    }
                    alterar((d) => void (d.plano.ciclo.inicio = v || null));
                  }}
                  className={`w-full ${plano.ciclo.inicio ? "" : "p-invalid"}`}
                  aria-label="Início do ciclo"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-gray-700">Duração</span>
                <InputNumber value={plano.semanas.length} onValueChange={(e) => mudarDuracao(e.value ?? 1)} min={1} max={MAX_SEMANAS} suffix=" sem." disabled={somenteLeitura} showButtons={false} className="w-full" inputClassName="w-full" aria-label="Duração do ciclo em semanas" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 sm:col-span-2 lg:col-span-4">
              <span className={estado === "erro" || estado === "conflito" ? "font-semibold text-red-700" : ""}>
                {TEXTO_DO_ESTADO[estado]}
                {estado === "salvo" && gravadoEm ? ` às ${horaCurta(gravadoEm)}` : ""}
              </span>
              {ultima ? (
                <Tag value={`Enviado: versão ${ultima.versao} em ${horaCurta(ultima.publicada_em)}${alteradoDesdeOEnvio ? " · alterado depois" : ""}`} severity="success" className="selo-status" />
              ) : (
                <Tag value="Rascunho, ainda não enviado" severity="info" className="selo-status" />
              )}
              {estado === "conflito" ? <Button type="button" size="small" label="Recarregar" onClick={() => carregar()} /> : null}
              <label className="ml-auto flex items-center gap-1">
                <input type="checkbox" checked={mostrarZonas} onChange={(e) => setMostrarZonas(e.target.checked)} />
                Exibir zonas ({ciclismo ? "FC/potência" : "FC/ritmo"})
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Cartao rotulo="Volume da semana" valor={num(totais.distancia_km, " km")} icone="pi-map" />
            <Cartao rotulo="Tempo planejado" valor={totais.duracao_min === null ? "Não disponível" : textoDosMinutos(totais.duracao_min)} icone="pi-clock" />
            {ciclismo ? <Cartao rotulo="Carga (TSS)" valor={totais.tss === null ? "Não disponível" : `${totais.tss.toLocaleString("pt-BR")}${totais.tssParcial ? " (parcial)" : ""}`} icone="pi-bolt" /> : null}
            {ciclismo ? <Cartao rotulo="Ganho altimétrico" valor={num(totais.altimetria_m, " m")} icone="pi-chart-line" /> : null}
            <div className="cartao flex items-center gap-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">Semana do ciclo</p>
                <p className="font-bold text-gray-900">
                  Semana {semana + 1} de {plano.semanas.length}
                </p>
                {inicioDaSemana ? <p className="text-xs text-gray-500">{ddmm(inicioDaSemana)} a {ddmm(somarDias(inicioDaSemana, 6))}</p> : null}
              </div>
              <Button type="button" icon="pi pi-chevron-left" text rounded aria-label="Semana anterior" disabled={semana === 0} onClick={() => setSemana(semana - 1)} />
              <Button type="button" icon="pi pi-chevron-right" text rounded aria-label="Próxima semana" disabled={semana >= plano.semanas.length - 1} onClick={() => setSemana(semana + 1)} />
            </div>
          </div>

          {mostrarZonas ? <ResumoDasZonas modalidade={modalidade} zonas={zonas} onEditar={() => setAba("zonas")} /> : null}

          <section className={`cartao p-3 sm:p-4 ${somenteLeitura ? "opacity-70" : ""}`} inert={somenteLeitura} aria-label={`Semana ${semana + 1}`}>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                type="button"
                icon="pi pi-minus-circle"
                text
                rounded
                severity="danger"
                aria-label="Excluir esta semana"
                tooltip="Excluir esta semana"
                disabled={plano.semanas.length === 1}
                onClick={async () => {
                  if (semanaAtual.sessoes.length && !(await pedirConfirmacao(`Excluir a semana ${semana + 1} do rascunho?`, { aceitar: "Excluir", rejeitar: "Cancelar" }))) return;
                  alterar((d) => void d.plano.semanas.splice(semana, 1));
                  setSemana(Math.max(0, semana - 1));
                }}
              />
              <Dropdown
                value={semana}
                options={plano.semanas.map((_, i) => ({ label: `Semana ${i + 1}`, value: i }))}
                onChange={(e) => setSemana(e.value)}
                aria-label="Semana"
                className="w-40"
              />
              <Button type="button" icon="pi pi-chevron-up" text rounded aria-label="Mover semana para antes" tooltip="Mover semana para antes" disabled={semana === 0} onClick={() => { alterar((d) => { const [w] = d.plano.semanas.splice(semana, 1); d.plano.semanas.splice(semana - 1, 0, w); }); setSemana(semana - 1); }} />
              <Button type="button" icon="pi pi-chevron-down" text rounded aria-label="Mover semana para depois" tooltip="Mover semana para depois" disabled={semana >= plano.semanas.length - 1} onClick={() => { alterar((d) => { const [w] = d.plano.semanas.splice(semana, 1); d.plano.semanas.splice(semana + 1, 0, w); }); setSemana(semana + 1); }} />
              <Button type="button" icon="pi pi-clone" text size="small" label="Opção" aria-pressed={mostrarOpcoes} severity={mostrarOpcoes ? undefined : "secondary"} onClick={() => setMostrarOpcoes((v) => !v)} />
              <Button
                type="button"
                icon="pi pi-copy"
                text
                size="small"
                severity="secondary"
                label="Copiar"
                onClick={() => {
                  setSemanaCopiada(semanaAtual.sessoes);
                  try {
                    localStorage.setItem(`${CHAVE_SEMANA_COPIADA}:${modalidade}`, JSON.stringify(semanaAtual.sessoes));
                  } catch {
                    // Conveniência apenas.
                  }
                  avisar("Semana copiada. Use “Colar” em outra semana, inclusive de outra planilha.", "info");
                }}
              />
              <Button
                type="button"
                icon="pi pi-clipboard"
                text
                size="small"
                severity="secondary"
                label="Colar"
                disabled={!semanaCopiada}
                onClick={async () => {
                  if (!semanaCopiada) return;
                  if (semanaAtual.sessoes.length && !(await pedirConfirmacao("Substituir as sessões desta semana pela semana copiada?", { aceitar: "Substituir", rejeitar: "Cancelar" }))) return;
                  alterar((d) => void (d.plano.semanas[semana] = { sessoes: structuredClone(semanaCopiada) }));
                }}
              />
              <Button type="button" icon="pi pi-sliders-h" text size="small" severity="secondary" label="Ajustar volume" onClick={() => setAjuste(true)} />
              <Button type="button" icon="pi pi-download" text size="small" severity="secondary" label="Exportar" onClick={() => abrirPdf(false)} />
              <Button
                type="button"
                icon="pi pi-plus"
                text
                size="small"
                label="Semana"
                className="ml-auto"
                disabled={plano.semanas.length >= MAX_SEMANAS}
                onClick={() => {
                  alterar((d) => void d.plano.semanas.push({ sessoes: [] }));
                  setSemana(plano.semanas.length);
                }}
              />
            </div>

            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[76rem] text-sm">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-600">
                    <th className="w-8" />
                    <th className="w-28 px-1 pb-1">Dia</th>
                    <th className="w-40 px-1 pb-1">Tipo de treino</th>
                    <th className="min-w-[16rem] px-1 pb-1">Descrição do treino</th>
                    <th className="w-20 px-1 pb-1 text-center">{ciclismo ? "Distância (km)" : "Volume (km)"}</th>
                    <th className="w-20 px-1 pb-1 text-center">Tempo (min)</th>
                    <th className="w-32 px-1 pb-1">Zona / intensidade</th>
                    {ciclismo ? (
                      <>
                        <th className="w-32 px-1 pb-1">Meta (FC / potência)</th>
                        <th className="w-16 px-1 pb-1 text-center">TSS</th>
                        <th className="w-20 px-1 pb-1 text-center">Altimetria (m)</th>
                      </>
                    ) : (
                      <>
                        <th className="w-28 px-1 pb-1">Ritmo alvo (min/km)</th>
                        <th className="w-24 px-1 pb-1">FC alvo (bpm)</th>
                      </>
                    )}
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {ordenarSessoesDaSemana(semanaAtual.sessoes).map(({ s, i }) => (
                    <LinhaDaSessao
                      key={i}
                      sessao={s}
                      numero={i + 1}
                      modalidade={modalidade}
                      data={inicioDaSemana ? somarDias(inicioDaSemana, DESDE_DOMINGO[s.dia]) : null}
                      zonas={zonas}
                      mostrarOpcao={mostrarOpcoes}
                      onAlterar={(m) => alterarSessao(i, m)}
                      onRemover={() => alterar((d) => void d.plano.semanas[semana].sessoes.splice(i, 1))}
                      onDetalhes={() => setDetalhe(i)}
                    />
                  ))}
                  {DIAS.filter((d) => !semanaAtual.sessoes.some((s) => s.dia === d.chave)).length === 7 ? (
                    <tr>
                      <td colSpan={ciclismo ? 11 : 10} className="py-4 text-center text-sm text-gray-500">
                        Semana sem sessões (descanso). Adicione o primeiro treino.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-sm">
              <Button
                type="button"
                icon="pi pi-plus"
                label="Adicionar treino (dia)"
                text
                disabled={semanaAtual.sessoes.length >= MAX_SESSOES_SEMANA}
                onClick={() =>
                  alterar((d) => {
                    const livre = DIAS.find((x) => x.chave !== "dom" && !d.plano.semanas[semana].sessoes.some((s) => s.dia === x.chave))?.chave ?? "seg";
                    d.plano.semanas[semana].sessoes.push(novaSessaoEndurance(modalidade, livre));
                  })
                }
              />
              <span className="flex-1" />
              <span className="rounded-full bg-gray-50 px-3 py-1 text-gray-700">Total da semana: <strong>{num(totais.distancia_km, " km")}</strong></span>
              <span className="rounded-full bg-gray-50 px-3 py-1 text-gray-700">Tempo total: <strong>{totais.duracao_min === null ? "Não disponível" : textoDosMinutos(totais.duracao_min)}</strong></span>
              {ciclismo ? (
                <>
                  <span className="rounded-full bg-gray-50 px-3 py-1 text-gray-700">TSS total: <strong>{totais.tss === null ? "Não disponível" : `${totais.tss.toLocaleString("pt-BR")}${totais.tssParcial ? " (parcial)" : ""}`}</strong></span>
                  <span className="rounded-full bg-gray-50 px-3 py-1 text-gray-700">Altimetria total: <strong>{num(totais.altimetria_m, " m")}</strong></span>
                </>
              ) : null}
            </div>
          </section>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur">
            <Button type="button" icon="pi pi-save" label="Salvar" onClick={salvar} disabled={somenteLeitura} />
            <Button type="button" icon="pi pi-file-pdf" label="PDF" outlined onClick={() => abrirPdf(false)} disabled={estado === "conflito"} />
            <Button type="button" label="PDF detalhado" outlined onClick={() => abrirPdf(true)} disabled={estado === "conflito"} />
            {!programa.arquivada_em ? <Button type="button" icon="pi pi-inbox" label="Arquivar" severity="danger" text onClick={arquivar} /> : null}
            <span className="flex-1" />
            <Button type="button" icon="pi pi-send" label="Enviar ao paciente" severity="success" loading={enviando} onClick={enviar} disabled={somenteLeitura} />
          </div>
        </>
      )}

      {sessaoDetalhe ? (
        <JanelaDaSessao
          key={`sessao-${semana}-${detalhe}`}
          modalidade={modalidade}
          sessao={sessaoDetalhe}
          onFechar={() => setDetalhe(null)}
          onAplicar={(s) => {
            alterar((d) => void (d.plano.semanas[semana].sessoes[detalhe!] = s));
            setDetalhe(null);
          }}
        />
      ) : null}

      {ajuste ? (
        <JanelaAjuste
          plano={plano}
          semana={semana}
          onFechar={() => setAjuste(false)}
          onAplicar={(p) => {
            alterar((d) => void (d.plano = p));
            setAjuste(false);
            avisar("Volume ajustado no rascunho. A versão já enviada não muda.", "success");
          }}
        />
      ) : null}

      <JanelaImportar<PlanoEndurance>
        aberta={importando}
        programaId={programaId}
        onFechar={() => setImportando(false)}
        onAplicar={(p, modo) => aplicarPlano(p, modo)}
        resumo={(p) => <ResumoDaPlanilha plano={p} />}
      />

      <JanelaIa<PlanoEndurance>
        aberta={ia}
        programaId={programaId}
        antesDePedir={gravar}
        onFechar={() => setIa(false)}
        onAplicar={(s: Sugestao<PlanoEndurance>, modo) => aplicarPlano(s.plano, modo, s.titulo)}
        resumo={(p) => <ResumoDaPlanilha plano={p} />}
        exemplo={ciclismo ? "Ex.: Monte 4 semanas de base em estrada, 4 pedais por semana, com um longo no sábado." : "Ex.: Monte 4 semanas de base para 10 km, 4 corridas por semana, com um longo no sábado."}
      />

      <JanelaSalvarModelo
        key={modelo ? "modelo-aberto" : "modelo-fechado"}
        aberta={modelo}
        nomeInicial={documento.titulo.trim()}
        descricao="O modelo guarda as semanas e as sessões, sem a data de início e sem as notas privadas."
        onFechar={() => setModelo(false)}
        onSalvar={async (nome, compartilhado) => {
          const r = await fetch("/api/treino/modelos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nome, plano, compartilhado, modalidade }),
          }).catch(() => null);
          if (!r?.ok) {
            avisar((await r?.json().catch(() => null))?.erro ?? "Não foi possível salvar o modelo.", "error");
            return false;
          }
          avisar("Modelo salvo.", "success");
          onModeloSalvo();
          return true;
        }}
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

function Cartao({ rotulo, valor, icone }: { rotulo: string; valor: string; icone: string }) {
  return (
    <div className="cartao flex items-center gap-3 p-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
        <i className={`pi ${icone}`} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-gray-500">{rotulo}</span>
        <span className="block truncate font-bold text-gray-900">{valor}</span>
      </span>
    </div>
  );
}

function opcoesDeZona(zonas: ZonasDoAluno | null) {
  const lista = [...(zonas?.fc ?? []), ...(zonas?.potencia ?? [])].map((z) => `${z.zona}${z.nome ? ` – ${z.nome}` : ""}`);
  return [...new Set(lista.length ? lista : ["Z1 – Recuperação", "Z2 – Aeróbia", "Z3 – Moderada", "Z4 – Limiar", "Z5 – Alta"])];
}

function LinhaDaSessao({
  sessao: s,
  numero,
  modalidade,
  data,
  zonas,
  mostrarOpcao,
  onAlterar,
  onRemover,
  onDetalhes,
}: {
  sessao: SessaoEndurance;
  numero: number;
  modalidade: ModalidadeEndurance;
  data: string | null;
  zonas: ZonasDoAluno | null;
  mostrarOpcao: boolean;
  onAlterar: (m: (s: SessaoEndurance) => void) => void;
  onRemover: () => void;
  onDetalhes: () => void;
}) {
  const ciclismo = modalidade === "ciclismo";
  const detalhes = s.blocos.length > 0 || Boolean(s.terreno || s.percurso || s.notas || s.observacao || s.rpe_alvo !== null || s.alternativa);
  const texto = (rotulo: string, valor: string | null, set: (x: SessaoEndurance, v: string | null) => void, limite = 30, placeholder?: string) => (
    <InputText value={valor ?? ""} maxLength={limite} placeholder={placeholder} onChange={(e) => onAlterar((x) => set(x, e.target.value || null))} aria-label={`${rotulo} da sessão ${numero}`} className="p-inputtext-sm w-full" />
  );
  return (
    <>
      <tr className="border-t border-gray-100 align-middle">
        <td>
          <Button type="button" icon="pi pi-minus" text rounded size="small" severity="danger" aria-label={`Excluir sessão ${numero}`} tooltip="Excluir sessão" onClick={onRemover} />
        </td>
        <td className="px-1 py-1">
          <Dropdown value={s.dia} options={DIAS.map((d) => ({ label: d.rotulo.charAt(0) + d.rotulo.slice(1).toLowerCase(), value: d.chave }))} onChange={(e) => onAlterar((x) => void (x.dia = e.value))} aria-label={`Dia da sessão ${numero}`} className="p-inputtext-sm w-full" />
          {data ? <span className="block text-center text-xs text-gray-500">{ddmm(data)}</span> : null}
        </td>
        <td className="px-1 py-1">
          <Dropdown
            value={s.tipo}
            options={TIPOS[modalidade]}
            onChange={(e) => onAlterar((x) => void (x.tipo = e.value))}
            aria-label={`Tipo da sessão ${numero}`}
            className="p-inputtext-sm w-full"
            valueTemplate={(v: string) => <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COR_DO_TIPO[v] ?? "bg-gray-100 text-gray-700"}`}>{v}</span>}
          />
        </td>
        <td className="px-1 py-1">{texto("Descrição", s.descricao, (x, v) => void (x.descricao = v ?? ""), 300, "Ex.: Aquecimento 10 min + 6 × 400 m forte")}</td>
        <td className="px-1 py-1">
          <InputNumber value={s.distancia_km} onValueChange={(e) => onAlterar((x) => void (x.distancia_km = e.value ?? null))} min={0} max={500} maxFractionDigits={2} locale="pt-BR" aria-label={`Distância da sessão ${numero}`} inputClassName="p-inputtext-sm w-full text-center" className="w-full" />
        </td>
        <td className="px-1 py-1">
          <InputNumber value={s.duracao_min} onValueChange={(e) => onAlterar((x) => void (x.duracao_min = e.value ?? null))} min={0} max={1440} aria-label={`Tempo da sessão ${numero}`} inputClassName="p-inputtext-sm w-full text-center" className="w-full" />
        </td>
        <td className="px-1 py-1">
          <Dropdown value={s.zona} options={opcoesDeZona(zonas)} editable showClear onChange={(e) => onAlterar((x) => void (x.zona = (e.value as string)?.slice(0, 40) || null))} aria-label={`Zona da sessão ${numero}`} className="p-inputtext-sm w-full" placeholder="—" />
        </td>
        {ciclismo ? (
          <>
            <td className="px-1 py-1">
              <div className="flex gap-1">
                {texto("FC alvo", s.fc_alvo, (x, v) => void (x.fc_alvo = v), 30, "FC")}
                {texto("Potência alvo", s.potencia_alvo, (x, v) => void (x.potencia_alvo = v), 30, "W")}
              </div>
            </td>
            <td className="px-1 py-1">
              <InputNumber value={s.tss} onValueChange={(e) => onAlterar((x) => void (x.tss = e.value ?? null))} min={0} max={2000} aria-label={`TSS da sessão ${numero}`} inputClassName="p-inputtext-sm w-full text-center" className="w-full" />
            </td>
            <td className="px-1 py-1">
              <InputNumber value={s.altimetria_m} onValueChange={(e) => onAlterar((x) => void (x.altimetria_m = e.value ?? null))} min={0} max={20000} aria-label={`Altimetria da sessão ${numero}`} inputClassName="p-inputtext-sm w-full text-center" className="w-full" />
            </td>
          </>
        ) : (
          <>
            <td className="px-1 py-1">{texto("Ritmo alvo", s.ritmo_alvo, (x, v) => void (x.ritmo_alvo = v), 30, "5:30–5:50")}</td>
            <td className="px-1 py-1">{texto("FC alvo", s.fc_alvo, (x, v) => void (x.fc_alvo = v), 30, "140–155")}</td>
          </>
        )}
        <td className="whitespace-nowrap py-1">
          <Button
            type="button"
            icon="pi pi-arrow-right-arrow-left"
            text
            rounded
            size="small"
            aria-label={`Trocar o tipo da sessão ${numero}`}
            tooltip="Trocar o tipo de treino (biblioteca)"
            onClick={() => {
              const lista = TIPOS[modalidade];
              onAlterar((x) => void (x.tipo = lista[(lista.indexOf(x.tipo) + 1) % lista.length]));
            }}
          />
          <Button type="button" icon="pi pi-bars" text rounded size="small" severity={detalhes ? undefined : "secondary"} aria-label={`Detalhes da sessão ${numero}`} tooltip="Detalhes (blocos, terreno, percurso, RPE, observação, Opção)" onClick={onDetalhes} />
        </td>
      </tr>
      {mostrarOpcao ? (
        <tr>
          <td />
          <td colSpan={ciclismo ? 10 : 9} className="px-1 pb-2">
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-2 py-1.5">
              <span className="text-xs font-semibold text-gray-600">Opção</span>
              <InputText
                value={s.alternativa?.descricao ?? ""}
                maxLength={300}
                placeholder={ciclismo ? "Ex.: com chuva, 1h no rolo em Z2" : "Ex.: na esteira, 40 min leves"}
                aria-label={`Opção da sessão ${numero}`}
                onChange={(e) => onAlterar((x) => void (x.alternativa = e.target.value ? { descricao: e.target.value, visivel: x.alternativa?.visivel ?? true } : null))}
                className="p-inputtext-sm min-w-0 flex-1"
              />
              <label className="flex items-center gap-1 text-xs text-gray-700">
                <input type="checkbox" checked={s.alternativa?.visivel ?? true} disabled={!s.alternativa} onChange={(e) => onAlterar((x) => void (x.alternativa && (x.alternativa.visivel = e.target.checked)))} />
                O aluno vê
              </label>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

const BLOCO_VAZIO: BlocoDaSessao = { tipo: "bloco", descricao: "", repeticoes: null, duracao_min: null, distancia_km: null, intensidade: null };
const ROTULO_DO_BLOCO: Record<BlocoDaSessao["tipo"], string> = { aquecimento: "Aquecimento", bloco: "Bloco", recuperacao: "Recuperação", desaquecimento: "Desaquecimento" };

// ≡ Detalhes da sessão (P2): blocos (aquecimento → blocos → recuperação →
// desaquecimento), terreno, percurso, RPE alvo, observação ao aluno, Opção e
// notas privadas.
function JanelaDaSessao({ modalidade, sessao, onFechar, onAplicar }: { modalidade: ModalidadeEndurance; sessao: SessaoEndurance; onFechar: () => void; onAplicar: (s: SessaoEndurance) => void }) {
  const [s, setS] = useState<SessaoEndurance>(() => structuredClone(sessao));
  const alterarBloco = (i: number, m: Partial<BlocoDaSessao>) => setS({ ...s, blocos: s.blocos.map((b, j) => (j === i ? { ...b, ...m } : b)) });
  return (
    <Dialog header={`Detalhes: ${s.tipo}`} visible onHide={onFechar} className="w-full max-w-3xl" modal>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Estrutura da sessão</p>
            <Button type="button" text size="small" icon="pi pi-plus" label="Bloco" onClick={() => setS({ ...s, blocos: [...s.blocos, { ...BLOCO_VAZIO, tipo: s.blocos.length ? "bloco" : "aquecimento" }] })} />
          </div>
          {s.blocos.length === 0 ? <p className="text-xs text-gray-500">Opcional. Ex.: aquecimento 10 min → 6 × 400 m forte com 2 min de trote → desaquecimento 10 min.</p> : null}
          <ul className="space-y-2">
            {s.blocos.map((b, i) => (
              <li key={i} className="grid grid-cols-2 gap-1.5 rounded-lg bg-gray-50 p-2 sm:grid-cols-[9rem_1fr_4rem_5rem_5rem_7rem_auto]">
                <Dropdown value={b.tipo} options={Object.entries(ROTULO_DO_BLOCO).map(([value, label]) => ({ value, label }))} onChange={(e) => alterarBloco(i, { tipo: e.value })} aria-label={`Tipo do bloco ${i + 1}`} className="p-inputtext-sm w-full" />
                <InputText value={b.descricao} maxLength={200} placeholder="Descrição" onChange={(e) => alterarBloco(i, { descricao: e.target.value })} aria-label={`Descrição do bloco ${i + 1}`} className="p-inputtext-sm w-full" />
                <InputNumber value={b.repeticoes} onValueChange={(e) => alterarBloco(i, { repeticoes: e.value ?? null })} min={0} max={100} placeholder="×" aria-label={`Repetições do bloco ${i + 1}`} inputClassName="p-inputtext-sm w-full" className="w-full" />
                <InputNumber value={b.duracao_min} onValueChange={(e) => alterarBloco(i, { duracao_min: e.value ?? null })} min={0} max={1440} maxFractionDigits={1} locale="pt-BR" placeholder="min" aria-label={`Duração do bloco ${i + 1}`} inputClassName="p-inputtext-sm w-full" className="w-full" />
                <InputNumber value={b.distancia_km} onValueChange={(e) => alterarBloco(i, { distancia_km: e.value ?? null })} min={0} max={500} maxFractionDigits={2} locale="pt-BR" placeholder="km" aria-label={`Distância do bloco ${i + 1}`} inputClassName="p-inputtext-sm w-full" className="w-full" />
                <InputText value={b.intensidade ?? ""} maxLength={60} placeholder="Intensidade" onChange={(e) => alterarBloco(i, { intensidade: e.target.value || null })} aria-label={`Intensidade do bloco ${i + 1}`} className="p-inputtext-sm w-full" />
                <Button type="button" icon="pi pi-trash" text severity="danger" aria-label={`Remover bloco ${i + 1}`} onClick={() => setS({ ...s, blocos: s.blocos.filter((_, j) => j !== i) })} />
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700">Terreno</span>
            <Dropdown value={s.terreno} options={TERRENOS[modalidade]} editable showClear onChange={(e) => setS({ ...s, terreno: (e.value as string)?.slice(0, 40) || null })} className="w-full" aria-label="Terreno" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700">RPE alvo (0 a 10)</span>
            <InputNumber value={s.rpe_alvo} onValueChange={(e) => setS({ ...s, rpe_alvo: e.value ?? null })} min={0} max={10} maxFractionDigits={1} locale="pt-BR" className="w-full" inputClassName="w-full" aria-label="RPE alvo" />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700">{modalidade === "ciclismo" ? "Rota / percurso" : "Percurso"}</span>
            <InputText value={s.percurso ?? ""} maxLength={300} placeholder="Opcional" onChange={(e) => setS({ ...s, percurso: e.target.value || null })} className="w-full" aria-label="Percurso" />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Observação para o aluno</span>
          <InputTextarea value={s.observacao ?? ""} maxLength={1000} autoResize rows={2} onChange={(e) => setS({ ...s, observacao: e.target.value || null })} className="w-full" aria-label="Observação para o aluno" />
        </label>
        <div className="rounded-xl border border-gray-200 p-3">
          <p className="text-sm font-semibold text-gray-700">Opção (alternativa à sessão)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <InputText value={s.alternativa?.descricao ?? ""} maxLength={300} placeholder="Ex.: na esteira, 40 min leves" onChange={(e) => setS({ ...s, alternativa: e.target.value ? { descricao: e.target.value, visivel: s.alternativa?.visivel ?? true } : null })} className="min-w-0 flex-1" aria-label="Opção da sessão" />
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={s.alternativa?.visivel ?? true} disabled={!s.alternativa} onChange={(e) => s.alternativa && setS({ ...s, alternativa: { ...s.alternativa, visivel: e.target.checked } })} />
              O aluno vê
            </label>
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-gray-700">Notas privadas</span>
          <InputTextarea value={s.notas ?? ""} maxLength={1000} autoResize rows={2} onChange={(e) => setS({ ...s, notas: e.target.value || null })} className="w-full" aria-label="Notas privadas" />
          <span className="mt-1 block text-xs text-gray-500">Só o profissional vê. Não saem no PDF.</span>
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={onFechar} />
          <Button type="button" label="Aplicar" icon="pi pi-check" onClick={() => onAplicar(s)} />
        </div>
      </div>
    </Dialog>
  );
}

// "Ajustar volume" (P3): por porcentagem, na semana ou no ciclo, com prévia.
function JanelaAjuste({ plano, semana, onFechar, onAplicar }: { plano: PlanoEndurance; semana: number; onFechar: () => void; onAplicar: (p: PlanoEndurance) => void }) {
  const [percentual, setPercentual] = useState<number | null>(-10);
  const [escopo, setEscopo] = useState<"semana" | "todas">("semana");
  const previa = ajustarVolume(plano, percentual ?? 0, escopo === "semana" ? semana : null);
  const linhas = plano.semanas.map((w, i) => ({ i, antes: totaisDaSemana(w), depois: totaisDaSemana(previa.semanas[i]) })).filter((l) => escopo === "todas" || l.i === semana);
  return (
    <Dialog header="Ajustar volume" visible onHide={onFechar} className="w-full max-w-lg" modal>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">Aumenta ou reduz a distância e o tempo planejados. Altimetria e TSS não mudam. Só o rascunho muda; a versão enviada ao aluno continua igual.</p>
        <div className="flex flex-wrap items-center gap-3">
          <InputNumber value={percentual} onValueChange={(e) => setPercentual(e.value ?? null)} min={-90} max={100} suffix=" %" showButtons step={5} aria-label="Percentual de ajuste" inputClassName="w-24" />
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" checked={escopo === "semana"} onChange={() => setEscopo("semana")} /> Semana {semana + 1}
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="radio" checked={escopo === "todas"} onChange={() => setEscopo("todas")} /> Todas as semanas
          </label>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="py-1">Semana</th>
              <th className="py-1">Distância</th>
              <th className="py-1">Tempo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.i} className="border-t border-gray-100">
                <td className="py-1">{l.i + 1}</td>
                <td className="py-1">
                  {l.antes.distancia_km === null ? "—" : `${l.antes.distancia_km.toLocaleString("pt-BR")} → ${l.depois.distancia_km?.toLocaleString("pt-BR")} km`}
                </td>
                <td className="py-1">{l.antes.duracao_min === null ? "—" : `${textoDosMinutos(l.antes.duracao_min)} → ${textoDosMinutos(l.depois.duracao_min)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={onFechar} />
          <Button type="button" label="Aplicar no rascunho" icon="pi pi-check" disabled={!percentual} onClick={() => onAplicar(previa)} />
        </div>
      </div>
    </Dialog>
  );
}

function ResumoDaPlanilha({ plano }: { plano: PlanoEndurance }) {
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-gray-200 p-3 text-sm">
      {plano.semanas.map((w, i) => {
        const t = totaisDaSemana(w);
        return (
          <li key={i}>
            <p className="font-semibold text-gray-900">
              Semana {i + 1} · {t.distancia_km === null ? "distância não informada" : `${t.distancia_km.toLocaleString("pt-BR")} km`}
            </p>
            <p className="text-gray-600">{ordenarSessoesDaSemana(w.sessoes).map(({ s }) => `${DIAS.find((d) => d.chave === s.dia)?.rotulo} ${s.tipo}: ${s.descricao}`).join(" · ") || "Descanso"}</p>
          </li>
        );
      })}
    </ul>
  );
}

function ResumoDasZonas({ modalidade, zonas, onEditar }: { modalidade: ModalidadeEndurance; zonas: ZonasDoAluno | null; onEditar: () => void }) {
  const faixa = (z: FaixaDeZona, sufixo: string) => `${z.zona}${z.nome ? ` ${z.nome}` : ""}: ${z.min === null ? "até" : z.min}${z.min !== null && z.max !== null ? "–" : z.min !== null ? "+" : " "}${z.max ?? ""} ${sufixo}`;
  const partes = [
    ...(zonas?.fc ?? []).map((z) => faixa(z, "bpm")),
    ...(modalidade === "corrida" ? (zonas?.ritmo ?? []).map((r) => `${r.zona}: ${r.de ?? "?"}–${r.ate ?? "?"} /km`) : []),
    ...(modalidade === "ciclismo" ? (zonas?.potencia ?? []).map((z) => faixa(z, "W")) : []),
  ];
  return (
    <div className="cartao flex flex-wrap items-center gap-2 px-4 py-2 text-xs text-gray-700">
      <span className="font-semibold text-gray-900">Zonas do aluno:</span>
      {partes.length ? partes.map((p) => <span key={p} className="rounded-full bg-gray-50 px-2 py-0.5">{p}</span>) : <span className="text-gray-500">não informadas.</span>}
      {modalidade === "ciclismo" && zonas?.ftp ? <span className="rounded-full bg-primary-50 px-2 py-0.5 text-primary-800">FTP {zonas.ftp} W</span> : null}
      <Button type="button" text size="small" label="Editar zonas" onClick={onEditar} className="ml-auto" />
    </div>
  );
}

const NOMES_FC = ["Recuperação", "Aeróbia", "Moderada", "Limiar", "Alta"];

function PainelDeZonas({ modalidade, alunoId, zonas, onSalvas }: { modalidade: ModalidadeEndurance; alunoId: string; zonas: ZonasNaTela | null; onSalvas: (z: ZonasNaTela) => void }) {
  const [z, setZ] = useState<ZonasDoAluno>(() => ({
    fc: zonas?.fc.length ? zonas.fc : NOMES_FC.map((nome, i) => ({ zona: `Z${i + 1}`, nome, min: null, max: null })),
    ritmo: modalidade === "corrida" ? (zonas?.ritmo.length ? zonas.ritmo : NOMES_FC.map((nome, i) => ({ zona: `Z${i + 1}`, nome, de: null, ate: null }))) : [],
    ftp: zonas?.ftp ?? null,
    potencia: zonas?.potencia ?? [],
  }));
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await fetch(`/api/treino/alunos/${alunoId}/zonas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modalidade, zonas: z }),
    }).catch(() => null);
    setSalvando(false);
    const corpo = await r?.json().catch(() => null);
    if (!r?.ok) {
      avisar(corpo?.erro ?? "Não foi possível salvar as zonas.", "error");
      return;
    }
    onSalvas(corpo.zonas);
    avisar("Zonas salvas.", "success");
  }

  return (
    <section className="cartao space-y-5 p-4" aria-label="Zonas do aluno">
      <div>
        <h2 className="font-bold text-gray-900">Zonas de frequência cardíaca</h2>
        <p className="text-xs text-gray-500">Informadas por você (resposta E1): o sistema não calcula FC por fórmula. Não é preciso teste máximo.</p>
        <TabelaDeFaixas lista={z.fc} onMudar={(fc) => setZ({ ...z, fc })} sufixo="bpm" />
      </div>
      {modalidade === "corrida" ? (
        <div>
          <h2 className="font-bold text-gray-900">Zonas de ritmo</h2>
          <p className="text-xs text-gray-500">Em min/km (ex.: 5:30). Informadas por você.</p>
          <table className="mt-2 w-full max-w-xl text-sm">
            <tbody>
              {z.ritmo.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="w-12 py-1 font-semibold">{r.zona}</td>
                  <td className="py-1 text-gray-700">{r.nome}</td>
                  <td className="w-24 py-1">
                    <InputText value={r.de ?? ""} maxLength={5} placeholder="de" onChange={(e) => setZ({ ...z, ritmo: z.ritmo.map((x, j) => (j === i ? { ...x, de: e.target.value || null } : x)) })} className="p-inputtext-sm w-full" aria-label={`Ritmo mais rápido da zona ${r.zona}`} />
                  </td>
                  <td className="w-24 py-1">
                    <InputText value={r.ate ?? ""} maxLength={5} placeholder="até" onChange={(e) => setZ({ ...z, ritmo: z.ritmo.map((x, j) => (j === i ? { ...x, ate: e.target.value || null } : x)) })} className="p-inputtext-sm w-full" aria-label={`Ritmo mais lento da zona ${r.zona}`} />
                  </td>
                  <td className="w-12 py-1 text-xs text-gray-500">/km</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div>
          <h2 className="font-bold text-gray-900">Potência (FTP)</h2>
          <p className="text-xs text-gray-500">7 zonas de Coggan em % do FTP (resposta R2; Allen e Coggan, Training and Racing with a Power Meter). Você pode editar qualquer zona à mão. Sem medidor de potência, deixe em branco.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <InputNumber value={z.ftp} onValueChange={(e) => setZ({ ...z, ftp: e.value ?? null })} min={0} max={1000} suffix=" W" placeholder="FTP" aria-label="FTP" inputClassName="w-28" />
            <Button type="button" size="small" outlined label="Calcular as zonas de Coggan" disabled={!z.ftp} onClick={() => z.ftp && setZ({ ...z, potencia: zonasDePotencia(z.ftp) })} />
          </div>
          {z.potencia.length ? <TabelaDeFaixas lista={z.potencia} onMudar={(potencia) => setZ({ ...z, potencia })} sufixo="W" /> : null}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-500">{zonas?.atualizado_em ? `Última alteração em ${horaCurta(zonas.atualizado_em)}${zonas.autor ? ` por ${zonas.autor}` : ""}. ` : ""}Valem para todos os profissionais que acompanham o aluno.</p>
        <Button type="button" label="Salvar zonas" icon="pi pi-check" loading={salvando} onClick={salvar} />
      </div>
    </section>
  );
}

function TabelaDeFaixas({ lista, onMudar, sufixo }: { lista: FaixaDeZona[]; onMudar: (l: FaixaDeZona[]) => void; sufixo: string }) {
  return (
    <table className="mt-2 w-full max-w-xl text-sm">
      <tbody>
        {lista.map((f, i) => (
          <tr key={i} className="border-t border-gray-100">
            <td className="w-12 py-1 font-semibold">{f.zona}</td>
            <td className="py-1">
              <InputText value={f.nome} maxLength={40} onChange={(e) => onMudar(lista.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} className="p-inputtext-sm w-full" aria-label={`Nome da zona ${f.zona} (${sufixo})`} />
            </td>
            <td className="w-24 py-1">
              <InputNumber value={f.min} onValueChange={(e) => onMudar(lista.map((x, j) => (j === i ? { ...x, min: e.value ?? null } : x)))} min={0} max={3000} placeholder="de" aria-label={`Mínimo da zona ${f.zona} (${sufixo})`} inputClassName="p-inputtext-sm w-full" className="w-full" />
            </td>
            <td className="w-24 py-1">
              <InputNumber value={f.max} onValueChange={(e) => onMudar(lista.map((x, j) => (j === i ? { ...x, max: e.value ?? null } : x)))} min={0} max={3000} placeholder="até" aria-label={`Máximo da zona ${f.zona} (${sufixo})`} inputClassName="p-inputtext-sm w-full" className="w-full" />
            </td>
            <td className="w-12 py-1 text-xs text-gray-500">{sufixo}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}


// Progressão: planejado (das linhas) × registrado pelo aluno (T4b), por
// semana do ciclo. Sem dado, "—".
function Progressao({ modalidade, alunoId, plano }: { modalidade: ModalidadeEndurance; alunoId: string; plano: PlanoEndurance }) {
  const [atividades, setAtividades] = useState<(Atividade & { data: string })[] | null>(null);
  useEffect(() => {
    fetch(`/api/treino/registros/${alunoId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { atividades: [] }))
      .then((d) => setAtividades((d.atividades ?? []).filter((a: Atividade) => a.modalidade === modalidade)))
      .catch(() => setAtividades([]));
  }, [alunoId, modalidade]);
  if (atividades === null) return <Skeleton height="12rem" borderRadius="16px" />;
  return (
    <section className="cartao p-4" aria-label="Progressão">
      <h2 className="font-bold text-gray-900">Progressão: planejado × registrado</h2>
      <p className="text-xs text-gray-500">Registrado = o que o aluno informou nas datas da semana (corridas ou pedais). Ausência de registro não quer dizer que não treinou.</p>
      {!plano.ciclo.inicio ? (
        <p className="mt-3 text-sm text-gray-500">Informe o início do ciclo para comparar com os registros.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1">Semana</th>
                <th className="py-1">Período</th>
                <th className="py-1 text-right">Planejado (km)</th>
                <th className="py-1 text-right">Variação</th>
                <th className="py-1 text-right">Registrado (km)</th>
                <th className="py-1 text-right">Tempo planejado</th>
                <th className="py-1 text-right">Tempo registrado</th>
                <th className="py-1 text-right">Sessões / registros</th>
              </tr>
            </thead>
            <tbody>
              {plano.semanas.map((w, i) => {
                const inicio = somarDias(plano.ciclo.inicio!, i * 7);
                const fim = somarDias(inicio, 6);
                const t = totaisDaSemana(w);
                const daSemana = atividades.filter((a) => a.data >= inicio && a.data <= fim);
                const km = daSemana.reduce((s, a) => s + (a.distancia_km ?? 0), 0);
                const seg = daSemana.reduce((s, a) => s + (a.duracao_segundos ?? 0), 0);
                const anterior = i > 0 ? totaisDaSemana(plano.semanas[i - 1]).distancia_km : null;
                const salto = anterior && t.distancia_km !== null ? (t.distancia_km - anterior) / anterior : null;
                return (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="py-1">{i + 1}</td>
                    <td className="py-1">{ddmm(inicio)} a {ddmm(fim)}</td>
                    <td className="py-1 text-right tabular-nums">{t.distancia_km === null ? "—" : t.distancia_km.toLocaleString("pt-BR")}</td>
                    <td className="py-1 text-right tabular-nums text-gray-600">{salto === null ? "—" : `${salto > 0 ? "+" : ""}${Math.round(salto * 100)}%`}</td>
                    <td className="py-1 text-right tabular-nums">{daSemana.length ? km.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"}</td>
                    <td className="py-1 text-right">{t.duracao_min === null ? "—" : textoDosMinutos(t.duracao_min)}</td>
                    <td className="py-1 text-right">{seg ? textoDaDuracao(seg) : "—"}</td>
                    <td className="py-1 text-right">
                      {t.sessoes} / {daSemana.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500">Variação: diferença do volume planejado em relação à semana anterior, para você avaliar a progressão (o sistema não aplica regra universal).</p>
    </section>
  );
}

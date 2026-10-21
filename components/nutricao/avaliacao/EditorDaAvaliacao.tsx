"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { RadioButton } from "primereact/radiobutton";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import InfoMetodo from "@/components/nutricao/InfoMetodo";
import CampoNumero from "@/components/nutricao/editor/CampoNumero";
import { horaCurta } from "@/components/nutricao/editor/tipos";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";
import {
  ATIVIDADES,
  CAMPOS_BIOIMPEDANCIA,
  CATEGORIAS_DRI,
  DESCRICAO_METS,
  DESCRICAO_SIRI,
  DOBRAS,
  FAIXAS_NAF_FAO,
  METODOS_GET,
  PERIMETRIA,
  PROTOCOLOS_DOBRAS,
  PROTOCOLOS_TMB,
  dobrasDoProtocolo,
  type CampoBio,
  type Calculo,
  type ProtocoloDobras,
  type ProtocoloTmb,
  type Regiao,
} from "@/lib/nutricao/avaliacao";
import { calcularAvaliacao, type AvaliacaoDoc } from "@/lib/nutricao/avaliacaoDocumento";
import { formatarData, idadeEm, rotuloDoSexo } from "@/lib/nutricao/paciente";

type Dados = {
  avaliacao: { id: string; patient_id: string; data: string; status: string; documento: AvaliacaoDoc; revisao: number; finalizada_em: string | null };
  paciente: { nome: string; sexo: "masculino" | "feminino" | null; idade: number | null; nascimento: string | null };
  historico: { id: string; data: string; peso: number | null; perimetria: AvaliacaoDoc["perimetria"] }[];
  envios: { id: string; numero: number; enviada_em: string; storage_path: string }[];
};

type Estado = "salvo" | "pendente" | "salvando" | "erro" | "conflito";
type LeituraBio = { valores: Partial<Record<CampoBio, number | null>>; aguaUnidade: string | null; gorduraVisceralEscala: string | null; massaVisceralUnidade: string | null; observacoes: string | null };

const n = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas });

function Secao({ titulo, children, info }: { titulo: string; children: React.ReactNode; info?: React.ReactNode }) {
  return (
    <section className="cartao p-4" aria-label={titulo}>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-gray-900">
        {titulo}
        {info}
      </h2>
      {children}
    </section>
  );
}

function Campo({ rotulo, children, ajuda }: { rotulo: React.ReactNode; children: React.ReactNode; ajuda?: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-700">{rotulo}</span>
      {children}
      {ajuda ? <span className="mt-0.5 block text-xs text-gray-500">{ajuda}</span> : null}
    </label>
  );
}

function Resultado({ rotulo, calculo, unidade = "kcal/dia", casas = 0 }: { rotulo: string; calculo: Calculo; unidade?: string; casas?: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-2">
      <p className="text-xs text-gray-500">{rotulo}</p>
      <p className="text-lg font-bold tabular-nums text-gray-900">{calculo.valor === null ? "—" : `${n(calculo.valor, casas)} ${unidade}`}</p>
      {calculo.falta.length ? <p className="text-xs text-amber-700">Falta: {calculo.falta.join(", ")}.</p> : null}
      {calculo.avisos.map((a) => (
        <p key={a} className="text-xs text-amber-700">
          {a}
        </p>
      ))}
    </div>
  );
}

const MODALIDADES = [...new Set(ATIVIDADES.map((a) => a.modalidade))];

export default function EditorDaAvaliacao({ avaliacaoId, voltar, resultadosHref }: { avaliacaoId: string; voltar: () => void; resultadosHref: string }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [doc, setDoc] = useState<AvaliacaoDoc | null>(null);
  const [data, setData] = useState("");
  const [estado, setEstado] = useState<Estado>("salvo");
  const [gravadoEm, setGravadoEm] = useState<string | null>(null);
  const [perguntarEnvio, setPerguntarEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [lendoPdf, setLendoPdf] = useState(false);
  const [leitura, setLeitura] = useState<LeituraBio | null>(null);
  const [aplicar, setAplicar] = useState<Partial<Record<CampoBio, boolean>>>({});

  const docRef = useRef<AvaliacaoDoc | null>(null);
  const dataRef = useRef("");
  const revisaoRef = useRef(0);
  const pendenteRef = useRef(false);
  const conflitoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravacaoRef = useRef<Promise<boolean> | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/avaliacoes/${avaliacaoId}`, { cache: "no-store" });
    if (!resposta.ok) return setDados(null);
    const recebidos = (await resposta.json()) as Dados;
    setDados(recebidos);
    setDoc(recebidos.avaliacao.documento);
    docRef.current = recebidos.avaliacao.documento;
    setData(recebidos.avaliacao.data);
    dataRef.current = recebidos.avaliacao.data;
    revisaoRef.current = recebidos.avaliacao.revisao;
    pendenteRef.current = false;
    conflitoRef.current = false;
    setEstado("salvo");
  }, [avaliacaoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const finalizada = dados?.avaliacao.status === "finalizada";

  const gravar = useCallback(async (): Promise<boolean> => {
    if (conflitoRef.current || !docRef.current) return false;
    if (timerRef.current) clearTimeout(timerRef.current);
    while (gravacaoRef.current) await gravacaoRef.current;
    if (!pendenteRef.current) return true;
    pendenteRef.current = false;
    setEstado("salvando");
    const promessa = (async () => {
      try {
        const resposta = await fetch(`/api/nutricao/avaliacoes/${avaliacaoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documento: docRef.current, revisao: revisaoRef.current, data: dataRef.current }),
        });
        const resultado = await resposta.json().catch(() => null);
        if (resposta.status === 409) {
          conflitoRef.current = true;
          setEstado("conflito");
          avisar(resultado?.erro ?? "A avaliação foi alterada em outra janela.", "error");
          return false;
        }
        if (!resposta.ok) {
          pendenteRef.current = true;
          setEstado("erro");
          if (resposta.status === 400) avisar(resultado?.erro ?? "Dados inválidos.", "error");
          return false;
        }
        revisaoRef.current = resultado.revisao;
        setGravadoEm(resultado.atualizada_em);
        setEstado(pendenteRef.current ? "pendente" : "salvo");
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
    // agendar usa só refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avaliacaoId]);

  function agendar() {
    pendenteRef.current = true;
    setEstado((e) => (e === "conflito" ? e : "pendente"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void gravar(), 1200);
  }

  useEffect(() => {
    const aoSair = (e: BeforeUnloadEvent) => {
      if (pendenteRef.current || gravacaoRef.current) {
        e.preventDefault();
        void gravar();
      }
    };
    window.addEventListener("beforeunload", aoSair);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [gravar]);

  function alterar(mudanca: (d: AvaliacaoDoc) => void) {
    if (finalizada || conflitoRef.current || !docRef.current) return;
    const copia = structuredClone(docRef.current);
    mudanca(copia);
    docRef.current = copia;
    setDoc(copia);
    agendar();
  }

  async function finalizar() {
    if (!(await gravar())) return avisar("Não foi possível gravar as últimas alterações.", "error");
    const confirmado = await pedirConfirmacao(
      "Finalizar a avaliação? Os resultados ficam guardados como estão. O peso entra no histórico e a altura passa a ser a do cadastro.",
      { aceitar: "Finalizar", rejeitar: "Cancelar", titulo: "Finalizar avaliação" }
    );
    if (!confirmado) return;
    const resposta = await fetch(`/api/nutricao/avaliacoes/${avaliacaoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "finalizar", revisao: revisaoRef.current }),
    });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível finalizar.", "error");
    await carregar();
    setPerguntarEnvio(true);
  }

  async function reabrir() {
    const confirmado = await pedirConfirmacao(
      "Reabrir a avaliação para correção? A correção fica registrada no histórico. PDFs já enviados não mudam; depois de finalizar de novo, você pode enviar uma nova versão.",
      { aceitar: "Reabrir", rejeitar: "Cancelar", titulo: "Corrigir avaliação" }
    );
    if (!confirmado) return;
    const resposta = await fetch(`/api/nutricao/avaliacoes/${avaliacaoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "reabrir" }),
    });
    if (!resposta.ok) return avisar("Não foi possível reabrir a avaliação.", "error");
    await carregar();
  }

  async function enviar() {
    setEnviando(true);
    try {
      const resposta = await fetch(`/api/nutricao/avaliacoes/${avaliacaoId}/enviar`, { method: "POST" });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível enviar.", "error");
      setPerguntarEnvio(false);
      avisar("PDF da avaliação enviado à área do paciente.", "success");
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  async function excluir() {
    const confirmado = await pedirConfirmacao("Excluir este rascunho de avaliação? Esta ação não pode ser desfeita.", {
      aceitar: "Excluir",
      rejeitar: "Cancelar",
    });
    if (!confirmado) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    pendenteRef.current = false;
    const resposta = await fetch(`/api/nutricao/avaliacoes/${avaliacaoId}`, { method: "DELETE" });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível excluir.", "error");
    avisar("Rascunho excluído.", "success");
    voltar();
  }

  async function anexarPdf(arquivo: File) {
    if (!(await gravar())) return avisar("Grave as alterações antes de anexar.", "warn");
    setLendoPdf(true);
    try {
      const formulario = new FormData();
      formulario.append("arquivo", arquivo);
      const resposta = await fetch(`/api/nutricao/avaliacoes/${avaliacaoId}/bioimpedancia`, { method: "POST", body: formulario });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível anexar o PDF.", "error");
      alterar((d) => void (d.bioimpedancia.pdf = resultado.pdf));
      if (resultado.erro || !resultado.leitura) {
        avisar(resultado.erro ?? "Não foi possível ler o PDF.", "warn");
        return;
      }
      const lidos = resultado.leitura as LeituraBio;
      setLeitura(lidos);
      setAplicar(Object.fromEntries(Object.entries(lidos.valores).map(([k, v]) => [k, v !== null])));
    } finally {
      setLendoPdf(false);
    }
  }

  function aplicarLeitura() {
    const lidos = leitura;
    setLeitura(null);
    if (!lidos) return;
    alterar((d) => {
      for (const campo of Object.keys(lidos.valores) as CampoBio[]) {
        if (aplicar[campo] && lidos.valores[campo] !== null) {
          d.bioimpedancia.valores[campo] = lidos.valores[campo];
          d.bioimpedancia.origem[campo] = "pdf";
        }
      }
      if (aplicar.agua_corporal && lidos.aguaUnidade) d.bioimpedancia.aguaUnidade = lidos.aguaUnidade;
      if (aplicar.gordura_visceral && lidos.gorduraVisceralEscala) d.bioimpedancia.gorduraVisceralEscala = lidos.gorduraVisceralEscala;
      if (aplicar.massa_visceral && lidos.massaVisceralUnidade) d.bioimpedancia.massaVisceralUnidade = lidos.massaVisceralUnidade;
    });
    avisar("Valores conferidos aplicados à bioimpedância.", "success");
  }

  async function abrirPdfAnexado() {
    const caminho = doc?.bioimpedancia.pdf?.caminho;
    if (!caminho) return;
    const { data: assinado } = await api.storage.from("avaliacoes").createSignedUrl(caminho, 120);
    if (assinado?.signedUrl) abrirDocumento(assinado.signedUrl);
  }

  if (dados === undefined || !doc) return <Skeleton height="20rem" />;
  if (dados === null) return <p>Avaliação não encontrada.</p>;

  const { paciente } = dados;
  const idade = idadeEm(paciente.nascimento, data);
  const sexo = paciente.sexo;
  const r = calcularAvaliacao(doc, { sexo, idade });
  const anteriores = dados.historico.filter((h) => h.id !== avaliacaoId).reverse();
  const ultimoEnvio = dados.envios[0];
  const enviadaEstaVersao = Boolean(ultimoEnvio && dados.avaliacao.finalizada_em && ultimoEnvio.enviada_em >= dados.avaliacao.finalizada_em);
  const somenteLeitura = finalizada || estado === "conflito";

  const textoEstado: Record<Estado, string> = {
    salvo: gravadoEm ? `Alterações salvas às ${horaCurta(gravadoEm)}` : "Alterações salvas",
    pendente: "Alterações a gravar…",
    salvando: "Salvando…",
    erro: "Erro ao salvar. Tentando de novo ao editar ou clicar em Salvar.",
    conflito: "Alterada em outra janela: recarregue.",
  };

  const protocoloDobras = doc.dobras.protocolo;
  const sitios = protocoloDobras && sexo ? dobrasDoProtocolo(protocoloDobras, sexo, doc.dobras.versaoSlaughter) : [];
  const infoDobras = protocoloDobras && sexo ? PROTOCOLOS_DOBRAS[protocoloDobras].porSexo[sexo] : null;
  const temDobras = r.dobras.percentual !== null;
  const temBio = r.bioimpedancia.percentual !== null;

  return (
    <div className="space-y-4">
      <div className="cartao flex flex-wrap items-center gap-x-6 gap-y-2 p-3 text-sm">
        <span className="font-bold text-gray-900">{paciente.nome}</span>
        <span>{idade !== null ? `${idade} anos na data` : <span className="text-amber-700">Sem data de nascimento</span>}</span>
        <span>{rotuloDoSexo(sexo) ?? <span className="text-amber-700">Sexo não cadastrado (as equações precisam)</span>}</span>
        <label className="flex items-center gap-2">
          Data da avaliação
          <InputText
            type="date"
            value={data}
            disabled={somenteLeitura}
            onChange={(e) => {
              setData(e.target.value);
              dataRef.current = e.target.value;
              agendar();
            }}
            className="w-40"
          />
        </label>
        <Tag value={finalizada ? "Finalizada" : "Rascunho"} severity={finalizada ? "success" : "info"} className="selo-status" />
        <span className={`text-xs ${estado === "erro" || estado === "conflito" ? "font-semibold text-red-700" : "text-gray-500"}`}>
          {finalizada ? `Finalizada em ${horaCurta(dados.avaliacao.finalizada_em)}` : textoEstado[estado]}
        </span>
      </div>

      <div inert={somenteLeitura} className={`space-y-4 ${somenteLeitura ? "opacity-80" : ""}`}>
        <Secao titulo="Peso e altura">
          <div className="grid max-w-xl gap-3 sm:grid-cols-3">
            <Campo rotulo="Peso (kg)" ajuda={anteriores[0]?.peso ? `Anterior: ${n(anteriores[0].peso, 2)} kg (${formatarData(anteriores[0].data)})` : undefined}>
              <CampoNumero valor={doc.peso} maximo={500} ariaLabel="Peso em kg" onChange={(v) => alterar((d) => void (d.peso = v))} />
            </Campo>
            <Campo rotulo="Altura (cm)">
              <CampoNumero valor={doc.alturaCm} maximo={260} ariaLabel="Altura em cm" onChange={(v) => alterar((d) => void (d.alturaCm = v))} />
            </Campo>
            <div className="rounded-lg bg-gray-50 p-2 text-sm">
              <p className="text-xs text-gray-500">IMC</p>
              <p className="text-lg font-bold">{n(r.imc)}</p>
            </div>
          </div>
        </Secao>

        <Secao titulo="Gasto energético">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Campo
                rotulo={
                  <>
                    TMB — protocolo
                    {doc.tmb.protocolo && doc.tmb.protocolo !== "manual" ? <InfoMetodo descricao={PROTOCOLOS_TMB[doc.tmb.protocolo]} /> : null}
                  </>
                }
              >
                <Dropdown
                  aria-label="Protocolo da TMB"
                  value={doc.tmb.protocolo}
                  options={[
                    ...Object.entries(PROTOCOLOS_TMB).map(([valor, d]) => ({ label: d.nome, value: valor })),
                    { label: "Valor informado (manual)", value: "manual" },
                  ]}
                  onChange={(e) => alterar((d) => void (d.tmb.protocolo = e.value as ProtocoloTmb | "manual"))}
                  placeholder="Escolha o protocolo"
                  className="w-full"
                />
              </Campo>
              {doc.tmb.protocolo === "manual" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Campo rotulo="Valor (kcal/dia)">
                    <CampoNumero valor={doc.tmb.manual.valor} maximo={20000} ariaLabel="TMB informada" onChange={(v) => alterar((d) => void (d.tmb.manual.valor = v))} />
                  </Campo>
                  <Campo rotulo="Método ou justificativa">
                    <InputText value={doc.tmb.manual.metodo} onChange={(e) => alterar((d) => void (d.tmb.manual.metodo = e.target.value))} className="w-full" />
                  </Campo>
                  <Campo rotulo="Observação">
                    <InputText value={doc.tmb.manual.observacao} onChange={(e) => alterar((d) => void (d.tmb.manual.observacao = e.target.value))} className="w-full" />
                  </Campo>
                </div>
              ) : null}
              <Resultado rotulo={doc.tmb.protocolo === "manual" ? "TMB (informada pelo profissional)" : "TMB / gasto de repouso"} calculo={r.tmb} />
            </div>

            <div className="space-y-2">
              <Campo
                rotulo={
                  <>
                    Gasto energético total — método
                    {doc.gasto.metodo ? <InfoMetodo descricao={METODOS_GET[doc.gasto.metodo]} /> : null}
                  </>
                }
              >
                <Dropdown
                  aria-label="Método do gasto energético total"
                  value={doc.gasto.metodo}
                  options={Object.entries(METODOS_GET).map(([valor, d]) => ({ label: d.nome, value: valor }))}
                  onChange={(e) => alterar((d) => void (d.gasto.metodo = e.value))}
                  placeholder="Escolha o método"
                  className="w-full"
                />
              </Campo>
              {doc.gasto.metodo === "dri_2023" ? (
                <Campo rotulo="Categoria de atividade">
                  <Dropdown
                    aria-label="Categoria de atividade"
                    value={doc.gasto.categoria}
                    options={Object.entries(CATEGORIAS_DRI).map(([valor, c]) => ({ label: `${c.nome} (${c.naf})`, value: valor }))}
                    onChange={(e) => alterar((d) => void (d.gasto.categoria = e.value))}
                    placeholder="Escolha a categoria"
                    className="w-full"
                  />
                </Campo>
              ) : null}
              {doc.gasto.metodo === "tmb_naf" ? (
                <Campo rotulo="NAF" ajuda={FAIXAS_NAF_FAO.map((f) => `${f.nome}: ${n(f.de, 2)}–${n(f.ate, 2)}`).join(" · ")}>
                  <CampoNumero valor={doc.gasto.naf} maximo={5} ariaLabel="NAF" onChange={(v) => alterar((d) => void (d.gasto.naf = v))} />
                </Campo>
              ) : null}
              <Resultado rotulo="GET" calculo={r.get} />
              {doc.gasto.metodo === "dri_2023" && doc.gasto.categoria === "inativo" ? (
                <Resultado
                  rotulo="GET + METs (média diária, gasto líquido das atividades)"
                  calculo={{ valor: r.getMaisMets, falta: r.mets.atividades.length ? [] : ["atividades por METs"], avisos: [] }}
                />
              ) : r.mets.atividades.length ? (
                <p className="text-xs text-gray-500">
                  “GET + METs” só soma na categoria Inativo das DRIs: nas outras, a atividade habitual já está no GET (evita contar duas vezes).
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 flex items-center gap-2 font-semibold text-gray-900">
              Atividades por METs <InfoMetodo descricao={DESCRICAO_METS} />
            </h3>
            <div className="space-y-2">
              {doc.atividades.map((at, i) => {
                const calc = r.mets.atividades.find((x) => x.id === at.id);
                return (
                  <div key={at.id} className="grid items-end gap-2 rounded-lg border border-gray-200 p-2 sm:grid-cols-[minmax(0,1fr)_6rem_6rem_auto]">
                    <Campo rotulo="Atividade">
                      <Dropdown
                        aria-label="Atividade"
                        value={at.atividadeId}
                        options={MODALIDADES.map((m) => ({
                          label: m,
                          itens: ATIVIDADES.filter((x) => x.modalidade === m).map((x) => ({ label: `${x.nome} — MET ${n(x.adulto.met)}`, value: x.id })),
                        }))}
                        optionGroupLabel="label"
                        optionGroupChildren="itens"
                        onChange={(e) => alterar((d) => void (d.atividades[i].atividadeId = e.value))}
                        className="w-full"
                        filter
                      />
                    </Campo>
                    <Campo rotulo="Minutos">
                      <CampoNumero valor={at.minutos} maximo={1440} ariaLabel="Minutos por sessão" onChange={(v) => alterar((d) => void (d.atividades[i].minutos = v))} />
                    </Campo>
                    <Campo rotulo="Vezes/semana">
                      <CampoNumero valor={at.vezesPorSemana} maximo={21} ariaLabel="Vezes por semana" onChange={(v) => alterar((d) => void (d.atividades[i].vezesPorSemana = v))} />
                    </Campo>
                    <Button type="button" icon="pi pi-trash" text severity="danger" aria-label="Remover atividade" onClick={() => alterar((d) => void d.atividades.splice(i, 1))} />
                    {calc ? (
                      <p className="text-xs text-gray-600 sm:col-span-4">
                        MET {n(calc.valor.met)} ({calc.valor.codigo}): {n(calc.porSessao, 0)} kcal por sessão · {n(calc.semanal, 0)} kcal por semana ·{" "}
                        {n(calc.semanal / 7, 0)} kcal/dia em média. Líquido (acima do repouso): {n(calc.porSessaoLiquido, 0)} kcal por sessão.
                        {calc.aviso ? <span className="block text-amber-700">{calc.aviso}</span> : null}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Button
              type="button"
              icon="pi pi-plus"
              label="Atividade"
              text
              onClick={() => alterar((d) => void d.atividades.push({ id: globalThis.crypto.randomUUID(), atividadeId: ATIVIDADES[0].id, minutos: null, vezesPorSemana: null }))}
            />
            {r.mets.atividades.length ? (
              <p className="text-sm text-gray-700">
                Total estimado: {n(r.mets.semanal, 0)} kcal por semana · {n(r.mets.mediaDiaria, 0)} kcal/dia em média (líquido: {n(r.mets.mediaDiariaLiquida, 0)} kcal/dia).
              </p>
            ) : null}
          </div>
        </Secao>

        <Secao
          titulo="Dobras cutâneas (mm)"
          info={
            <>
              {infoDobras ? <InfoMetodo descricao={infoDobras} /> : null}
              {protocoloDobras && ["jp7", "jp3", "petroski"].includes(protocoloDobras) ? <InfoMetodo descricao={DESCRICAO_SIRI} /> : null}
            </>
          }
        >
          {!sexo ? <p className="mb-2 text-sm text-amber-700">Cadastre o sexo do paciente para usar os protocolos.</p> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Protocolo">
              <Dropdown
                aria-label="Protocolo de dobras"
                value={protocoloDobras}
                options={Object.entries(PROTOCOLOS_DOBRAS).map(([valor, p]) => ({ label: sexo ? p.porSexo[sexo].nome : p.nome, value: valor }))}
                onChange={(e) => alterar((d) => void (d.dobras.protocolo = e.value as ProtocoloDobras))}
                placeholder="Escolha o protocolo"
                className="w-full"
                disabled={!sexo}
              />
            </Campo>
            {protocoloDobras === "slaughter" ? (
              <Campo rotulo="Versão">
                <Dropdown
                  aria-label="Versão de Slaughter"
                  value={doc.dobras.versaoSlaughter}
                  options={[
                    { label: "Tríceps + subescapular", value: "ts" },
                    { label: "Tríceps + panturrilha", value: "tc" },
                  ]}
                  onChange={(e) => alterar((d) => void (d.dobras.versaoSlaughter = e.value))}
                  className="w-full"
                />
              </Campo>
            ) : null}
            {protocoloDobras === "slaughter" && sexo === "masculino" && doc.dobras.versaoSlaughter === "ts" ? (
              <>
                <Campo rotulo="Maturação sexual (Tanner)">
                  <Dropdown
                    aria-label="Maturação sexual"
                    value={doc.dobras.maturacao}
                    options={[
                      { label: "Pré-púbere (Tanner 1–2)", value: "pre" },
                      { label: "Púbere (Tanner 3)", value: "pubere" },
                      { label: "Pós-púbere (Tanner 4–5)", value: "pos" },
                    ]}
                    onChange={(e) => alterar((d) => void (d.dobras.maturacao = e.value))}
                    placeholder="Escolha"
                    className="w-full"
                  />
                </Campo>
                <Campo rotulo="Etnia (da equação)">
                  <Dropdown
                    aria-label="Etnia"
                    value={doc.dobras.etnia}
                    options={[
                      { label: "Branca", value: "branca" },
                      { label: "Negra", value: "negra" },
                    ]}
                    onChange={(e) => alterar((d) => void (d.dobras.etnia = e.value))}
                    placeholder="Escolha"
                    className="w-full"
                  />
                </Campo>
              </>
            ) : null}
          </div>
          {sitios.length ? (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {sitios.map((s) => (
                <Campo key={s} rotulo={DOBRAS[s]}>
                  <CampoNumero valor={doc.dobras.valores[s] ?? null} maximo={200} ariaLabel={`Dobra ${DOBRAS[s]}`} onChange={(v) => alterar((d) => void (d.dobras.valores[s] = v))} />
                </Campo>
              ))}
            </div>
          ) : null}
          {protocoloDobras ? (
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <span>Soma: <strong>{n(r.dobras.soma)}</strong> mm</span>
              {r.dobras.densidade !== null ? <span>Densidade: <strong>{n(r.dobras.densidade, 5)}</strong> g/mL</span> : null}
              <span>% de gordura: <strong>{r.dobras.percentual === null ? "—" : `${n(r.dobras.percentual)}%`}</strong></span>
              {r.dobras.falta.length ? <span className="text-amber-700">Falta: {r.dobras.falta.join(", ")}.</span> : null}
              {r.dobras.avisos.map((a) => (
                <span key={a} className="text-amber-700">
                  {a}
                </span>
              ))}
            </div>
          ) : null}
        </Secao>

        <Secao titulo="Perimetria (cm)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(PERIMETRIA) as Regiao[]).map((k) => {
              const anterior = anteriores.find((h) => h.perimetria?.[k])?.perimetria?.[k];
              return (
                <Campo key={k} rotulo={PERIMETRIA[k]} ajuda={anterior ? `Anterior: ${n(anterior)} cm` : undefined}>
                  <CampoNumero valor={doc.perimetria[k] ?? null} maximo={400} ariaLabel={`Perimetria ${PERIMETRIA[k]}`} onChange={(v) => alterar((d) => void (d.perimetria[k] = v))} />
                </Campo>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-gray-500">Preencha só as medidas feitas hoje. Campo vazio é “não medido”, nunca zero.</p>
        </Secao>

        <Secao titulo="Bioimpedância">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              ref={arquivoRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                if (arquivo) void anexarPdf(arquivo);
              }}
            />
            <Button type="button" icon="pi pi-paperclip" label="Anexar exame de bioimpedância" outlined loading={lendoPdf} onClick={() => arquivoRef.current?.click()} />
            {doc.bioimpedancia.pdf ? (
              <Button type="button" icon="pi pi-file-pdf" label={doc.bioimpedancia.pdf.nome} text onClick={abrirPdfAnexado} />
            ) : null}
            {lendoPdf ? <span className="text-sm text-gray-500">Lendo os resultados do PDF…</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(Object.keys(CAMPOS_BIOIMPEDANCIA) as CampoBio[]).map((k) => {
              const info = CAMPOS_BIOIMPEDANCIA[k];
              const unidade =
                k === "agua_corporal" ? doc.bioimpedancia.aguaUnidade : k === "gordura_visceral" ? doc.bioimpedancia.gorduraVisceralEscala : k === "massa_visceral" ? doc.bioimpedancia.massaVisceralUnidade : info.unidade;
              return (
                <Campo
                  key={k}
                  rotulo={`${info.nome}${unidade ? ` (${unidade})` : ""}`}
                  ajuda={doc.bioimpedancia.origem[k] === "pdf" ? "Lido do PDF e conferido" : undefined}
                >
                  <CampoNumero
                    valor={doc.bioimpedancia.valores[k] ?? null}
                    maximo={1000}
                    ariaLabel={info.nome}
                    onChange={(v) =>
                      alterar((d) => {
                        d.bioimpedancia.valores[k] = v;
                        d.bioimpedancia.origem[k] = "manual";
                      })
                    }
                  />
                </Campo>
              );
            })}
          </div>
          <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-3">
            <Campo rotulo="Unidade da água corporal">
              <InputText value={doc.bioimpedancia.aguaUnidade} onChange={(e) => alterar((d) => void (d.bioimpedancia.aguaUnidade = e.target.value))} className="w-full" />
            </Campo>
            <Campo rotulo="Escala da gordura visceral">
              <InputText value={doc.bioimpedancia.gorduraVisceralEscala} placeholder="Ex.: nível 1–59" onChange={(e) => alterar((d) => void (d.bioimpedancia.gorduraVisceralEscala = e.target.value))} className="w-full" />
            </Campo>
            <Campo rotulo="Unidade da massa visceral">
              <InputText value={doc.bioimpedancia.massaVisceralUnidade} onChange={(e) => alterar((d) => void (d.bioimpedancia.massaVisceralUnidade = e.target.value))} className="w-full" />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="Resultado da composição corporal">
          {temDobras && temBio ? (
            <fieldset className="mb-3 space-y-1 text-sm">
              <legend className="mb-1 font-semibold text-gray-700">Há dois métodos. Qual é o resultado desta avaliação?</legend>
              <label className="flex items-center gap-2">
                <RadioButton checked={(doc.composicao ?? "dobras") === "dobras"} onChange={() => alterar((d) => void (d.composicao = "dobras"))} />
                Dobras cutâneas ({n(r.dobras.percentual)}%)
              </label>
              <label className="flex items-center gap-2">
                <RadioButton checked={doc.composicao === "bioimpedancia"} onChange={() => alterar((d) => void (d.composicao = "bioimpedancia"))} />
                Bioimpedância ({n(r.bioimpedancia.percentual)}%)
              </label>
              <p className="text-xs text-gray-500">Os métodos não são combinados.</p>
            </fieldset>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-4">
            <Resultado rotulo={`% de gordura${r.metodoComposicao ? ` (${r.metodoComposicao === "dobras" ? "dobras" : "bioimpedância"})` : ""}`} calculo={{ valor: r.percentualGordura, falta: [], avisos: [] }} unidade="%" casas={1} />
            <Resultado rotulo="Massa de gordura" calculo={{ valor: r.massaGorda, falta: [], avisos: [] }} unidade="kg" casas={1} />
            <Resultado rotulo="Massa livre de gordura" calculo={{ valor: r.massaLivre, falta: [], avisos: [] }} unidade="kg" casas={1} />
            <div className="rounded-lg bg-gray-50 p-2 text-sm">
              <p className="text-xs text-gray-500">Referência (Gallagher, 2000)</p>
              <p className="font-semibold">
                {r.referencia ? `${r.referencia.adequadoDe}% a menos de ${r.referencia.adequadoAte}%` : "Referência não disponível"}
              </p>
            </div>
          </div>
        </Secao>

        <Secao titulo="Observações">
          <InputTextarea value={doc.observacoes} autoResize rows={3} className="w-full" onChange={(e) => alterar((d) => void (d.observacoes = e.target.value))} />
        </Secao>
      </div>

      <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
        {!finalizada ? (
          <>
            <Button type="button" icon="pi pi-save" label="Salvar" onClick={async () => (await gravar()) && avisar("Avaliação salva.", "success")} />
            <Button type="button" icon="pi pi-check" label="Finalizar" severity="success" onClick={finalizar} />
          </>
        ) : (
          <>
            <Button type="button" icon="pi pi-pencil" label="Reabrir para correção" outlined onClick={reabrir} />
            <Button
              type="button"
              icon="pi pi-send"
              label={enviadaEstaVersao ? `Enviada (v${ultimoEnvio.numero})` : "Enviar ao paciente"}
              severity="success"
              disabled={enviadaEstaVersao}
              onClick={() => setPerguntarEnvio(true)}
            />
          </>
        )}
        <Button
          type="button"
          icon="pi pi-chart-bar"
          label="Resultados"
          outlined
          onClick={async () => {
            if (!finalizada) await gravar();
            router.push(resultadosHref);
          }}
        />
        <Button
          type="button"
          icon="pi pi-file-pdf"
          label="PDF"
          outlined
          onClick={async () => {
            if (!finalizada) await gravar();
            abrirDocumento(`/api/nutricao/avaliacoes/${avaliacaoId}/pdf`);
          }}
        />
        <span className="flex-1" />
        {!finalizada ? <Button type="button" icon="pi pi-trash" label="Excluir rascunho" text severity="danger" onClick={excluir} /> : null}
      </div>

      <Dialog
        header="Enviar ao paciente?"
        visible={perguntarEnvio}
        onHide={() => setPerguntarEnvio(false)}
        className="w-[min(30rem,calc(100vw-1rem))]"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" label="Não, manter somente no prontuário" text onClick={() => setPerguntarEnvio(false)} />
            <Button type="button" label="Sim, gerar e enviar" icon="pi pi-send" loading={enviando} onClick={enviar} />
          </div>
        }
      >
        <p>Deseja gerar e enviar o PDF desta avaliação física para a área do paciente?</p>
        <p className="mt-2 text-sm text-gray-500">Enviar não publica dieta nem mexe no ciclo de 33 dias.</p>
      </Dialog>

      <Dialog
        header="Confira os valores lidos do PDF"
        visible={Boolean(leitura)}
        onHide={() => setLeitura(null)}
        className="w-[min(36rem,calc(100vw-1rem))]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setLeitura(null)} />
            <Button type="button" label="Aplicar valores marcados" icon="pi pi-check" onClick={aplicarLeitura} />
          </div>
        }
      >
        {leitura ? (
          <div className="space-y-1 text-sm">
            <p className="mb-2 text-gray-600">Confira com o PDF. Só os campos marcados vão para a avaliação; valores já digitados são substituídos.</p>
            {(Object.keys(CAMPOS_BIOIMPEDANCIA) as CampoBio[]).map((k) => {
              const v = leitura.valores[k];
              const atual = doc.bioimpedancia.valores[k];
              return (
                <label key={k} className={`flex items-center gap-2 ${v === null ? "text-gray-400" : ""}`}>
                  <input type="checkbox" disabled={v === null} checked={Boolean(aplicar[k]) && v !== null} onChange={(e) => setAplicar({ ...aplicar, [k]: e.target.checked })} />
                  <span className="flex-1">{CAMPOS_BIOIMPEDANCIA[k].nome}</span>
                  <span className="tabular-nums">{v === null ? "não encontrado" : n(v, 2)}</span>
                  {atual !== null && atual !== undefined && v !== null && atual !== v ? (
                    <span className="text-xs text-amber-700">(atual: {n(atual, 2)})</span>
                  ) : null}
                </label>
              );
            })}
            {leitura.observacoes ? <p className="mt-2 text-xs text-gray-500">{leitura.observacoes}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

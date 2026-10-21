"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import {
  SITUACOES_DO_FORMULARIO,
  type Pergunta,
  type Recordatorio,
  type Respostas,
  type SituacaoDoFormulario,
} from "@/lib/nutricao/anamnese";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirDocumento } from "@/lib/visualizador";
import CamposDaAnamnese from "./CamposDaAnamnese";
import FormularioRecordatorio from "./FormularioRecordatorio";
import JanelaLinkDoPaciente from "./JanelaLinkDoPaciente";

type Formulario = {
  id: string;
  patient_id: string;
  status: "rascunho" | "concluido";
  situacao: SituacaoDoFormulario;
  comPaciente: boolean;
  enviado_em: string | null;
  respondido_em: string | null;
  lido_em: string | null;
  concluido_em: string | null;
  arquivado_em: string | null;
  revisao: number;
  modelo_versao?: number | null;
  titulo?: string;
  perguntas?: Pergunta[];
  respostas?: Respostas;
  respostas_paciente?: Respostas | null;
  observacoes?: string;
  lembrete?: string;
  conteudo?: Recordatorio;
  conteudo_paciente?: Recordatorio | null;
};

type Dados = {
  formulario: Formulario;
  paciente: { id: string; name: string } | null;
  consulta: { data: string } | null;
};

type Estado = "salvo" | "pendente" | "salvando" | "erro" | "conflito";
const ESTADOS: Record<Estado, string> = {
  salvo: "Salvo",
  pendente: "Alterações não salvas",
  salvando: "Salvando…",
  erro: "Erro ao salvar",
  conflito: "Alterado em outra janela ou pelo paciente: recarregue",
};

const quando = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";

// Ficha de anamnese ou recordatório na consulta (nutricionista).
export default function FichaDoFormulario({ tipo, id, voltar }: { tipo: "anamnese" | "recordatorio"; id: string; voltar: () => void }) {
  const api = `/api/nutricao/${tipo === "anamnese" ? "anamneses" : "recordatorios"}/${id}`;
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [respostas, setRespostas] = useState<Respostas>({});
  const [conteudo, setConteudo] = useState<Recordatorio>({ refeicoes: [], observacoes: "" });
  const [observacoes, setObservacoes] = useState("");
  const [lembrete, setLembrete] = useState("");
  const [estado, setEstado] = useState<Estado>("salvo");
  const [verOriginal, setVerOriginal] = useState(false);
  const [link, setLink] = useState(false);
  const atual = useRef({ respostas: {} as Respostas, conteudo: { refeicoes: [], observacoes: "" } as Recordatorio, observacoes: "", lembrete: "" });
  const revisao = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    const resposta = await fetch(api, { cache: "no-store" });
    if (!resposta.ok) {
      setDados(null);
      return;
    }
    const d: Dados = await resposta.json();
    const f = d.formulario;
    atual.current = {
      respostas: f.respostas ?? {},
      conteudo: f.conteudo ?? { refeicoes: [], observacoes: "" },
      observacoes: f.observacoes ?? "",
      lembrete: f.lembrete ?? "",
    };
    revisao.current = f.revisao;
    setRespostas(atual.current.respostas);
    setConteudo(atual.current.conteudo);
    setObservacoes(atual.current.observacoes);
    setLembrete(atual.current.lembrete);
    setEstado("salvo");
    setDados(d);
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const gravar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setEstado("salvando");
    const corpo =
      tipo === "anamnese"
        ? { respostas: atual.current.respostas, observacoes: atual.current.observacoes, lembrete: atual.current.lembrete, revisao: revisao.current }
        : { conteudo: atual.current.conteudo, revisao: revisao.current };
    const resposta = await fetch(api, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
    if (!resposta?.ok) {
      const resultado = await resposta?.json().catch(() => null);
      setEstado(resposta?.status === 409 ? "conflito" : "erro");
      avisar(resultado?.erro ?? "Não foi possível salvar.", "error");
      return false;
    }
    revisao.current = (await resposta.json()).revisao;
    setEstado("salvo");
    return true;
  }, [api, tipo]);

  useEffect(() => {
    if (estado === "salvo") return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [estado]);

  function agendar() {
    setEstado("pendente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void gravar(), 1200);
  }

  async function acao(nome: string, mensagem: string) {
    if (estado !== "salvo" && !(await gravar())) return;
    const resposta = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: nome }) });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível concluir.", "error");
    avisar(mensagem, "success");
    await carregar();
    if (nome === "enviar") setLink(true);
  }

  async function excluir() {
    const confirmado = await pedirConfirmacao(`Excluir este rascunho de ${tipo === "anamnese" ? "anamnese" : "recordatório"}? Não dá para desfazer.`, {
      aceitar: "Excluir",
      rejeitar: "Cancelar",
      titulo: "Excluir rascunho",
    });
    if (!confirmado) return;
    const resposta = await fetch(api, { method: "DELETE" });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível excluir.", "error");
    avisar("Rascunho excluído.", "success");
    voltar();
  }

  async function sair() {
    if (estado !== "salvo" && !(await gravar())) {
      const ok = await pedirConfirmacao("Não foi possível salvar as últimas alterações. Sair mesmo assim?", {
        aceitar: "Sair sem salvar",
        rejeitar: "Ficar",
      });
      if (!ok) return;
    }
    voltar();
  }

  if (dados === undefined) return <Skeleton height="20rem" />;
  if (dados === null) return <p>Formulário não encontrado.</p>;

  const f = dados.formulario;
  const fechado = f.status === "concluido" || Boolean(f.arquivado_em);
  const respostasTravadas = fechado || f.comPaciente;
  const situacao = SITUACOES_DO_FORMULARIO[f.situacao];
  const podeExcluir = f.status === "rascunho" && !f.enviado_em && !f.respondido_em;
  const titulo = tipo === "anamnese" ? f.titulo : "Recordatório alimentar";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary-700">{dados.paciente?.name}</p>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
            {dados.consulta ? <span>Consulta de {formatarData(dados.consulta.data)}</span> : null}
            {tipo === "anamnese" && f.modelo_versao ? <span>· modelo versão {f.modelo_versao}</span> : null}
            <Tag value={situacao.rotulo} severity={situacao.cor} />
            {f.arquivado_em ? <Tag value="Arquivado" severity="secondary" /> : null}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {f.enviado_em ? `Enviado ao paciente em ${quando(f.enviado_em)}. ` : ""}
            {f.respondido_em ? `Respondido em ${quando(f.respondido_em)}. ` : ""}
            {f.lido_em ? `Aberto pelo nutricionista em ${quando(f.lido_em)} (edição pelo paciente encerrada). ` : ""}
            {f.concluido_em ? `Concluído em ${quando(f.concluido_em)}.` : ""}
          </p>
        </div>
        <span className={`text-sm ${estado === "erro" || estado === "conflito" ? "text-red-700" : "text-gray-500"}`} role="status">
          {ESTADOS[estado]}
        </span>
      </div>

      {f.comPaciente ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
          <span className="min-w-0 flex-1">
            Com o paciente: as respostas aparecem aqui conforme ele preenche. Para editar no consultório, cancele o envio.
            {tipo === "anamnese" ? " Observações e lembrete podem ser escritos a qualquer momento." : ""}
          </span>
          <Button type="button" icon="pi pi-refresh" label="Atualizar" size="small" outlined onClick={() => void carregar()} />
          <Button type="button" label="Cancelar envio" size="small" text onClick={() => acao("cancelar_envio", "Envio cancelado: o formulário voltou ao consultório.")} />
        </div>
      ) : null}
      {estado === "conflito" ? (
        <div className="flex items-center gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <span className="flex-1">O formulário mudou em outra janela ou pelo paciente. Recarregue para ver a versão atual.</span>
          <Button type="button" label="Recarregar" size="small" onClick={() => void carregar()} />
        </div>
      ) : null}

      <section className="cartao p-4">
        <h2 className="mb-3 text-lg font-bold text-gray-900">{tipo === "anamnese" ? "Respostas" : "Refeições informadas"}</h2>
        {tipo === "anamnese" ? (
          <CamposDaAnamnese
            perguntas={f.perguntas ?? []}
            respostas={respostas}
            somenteLeitura={respostasTravadas}
            originais={f.respostas_paciente ?? null}
            onChange={(perguntaId, valor) => {
              const novas = { ...atual.current.respostas };
              if (valor === undefined) delete novas[perguntaId];
              else novas[perguntaId] = valor;
              atual.current = { ...atual.current, respostas: novas };
              setRespostas(novas);
              agendar();
            }}
          />
        ) : (
          <>
            {f.conteudo_paciente && JSON.stringify(f.conteudo_paciente) !== JSON.stringify(conteudo) ? (
              <div className="mb-3">
                <Button
                  type="button"
                  size="small"
                  text
                  icon={verOriginal ? "pi pi-eye-slash" : "pi pi-eye"}
                  label={verOriginal ? "Voltar à versão atual" : "Ver o que o paciente enviou (original)"}
                  onClick={() => setVerOriginal((v) => !v)}
                />
              </div>
            ) : null}
            <FormularioRecordatorio
              conteudo={verOriginal && f.conteudo_paciente ? f.conteudo_paciente : conteudo}
              somenteLeitura={respostasTravadas || verOriginal}
              onChange={(alterar) => {
                const copia = structuredClone(atual.current.conteudo);
                alterar(copia);
                atual.current = { ...atual.current, conteudo: copia };
                setConteudo(copia);
                agendar();
              }}
            />
          </>
        )}
      </section>

      {tipo === "anamnese" ? (
        <section className="cartao space-y-4 p-4">
          <h2 className="text-lg font-bold text-gray-900">Do nutricionista</h2>
          <label className="block">
            <span className="mb-1 block font-semibold text-gray-900">Observações profissionais</span>
            <span className="mb-1 block text-xs text-gray-500">Separadas das respostas; o paciente não vê.</span>
            <InputTextarea
              aria-label="Observações profissionais"
              value={observacoes}
              disabled={fechado}
              rows={4}
              autoResize
              onChange={(e) => {
                atual.current = { ...atual.current, observacoes: e.target.value };
                setObservacoes(e.target.value);
                agendar();
              }}
              className="w-full"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex items-center gap-2 font-semibold text-gray-900">
              <i className="pi pi-star-fill text-amber-500" aria-hidden /> Lembrete importante da anamnese
            </span>
            <span className="mb-1 block text-xs text-gray-500">
              Aparece só para você, na estrela do editor de dietas (vale o último lembrete atualizado). Nunca vai para o PDF nem
              para o paciente.
            </span>
            <InputTextarea
              aria-label="Lembrete importante da anamnese"
              value={lembrete}
              disabled={fechado}
              rows={2}
              autoResize
              onChange={(e) => {
                atual.current = { ...atual.current, lembrete: e.target.value };
                setLembrete(e.target.value);
                agendar();
              }}
              className="w-full"
              maxLength={2000}
            />
          </label>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-arrow-left" label="Voltar à consulta" text onClick={sair} />
        {!fechado && !f.comPaciente ? (
          <Button
            type="button"
            icon="pi pi-send"
            label={f.respondido_em ? "Reenviar ao paciente" : "Enviar ao paciente"}
            outlined
            onClick={() => acao("enviar", "Disponível para o paciente preencher.")}
          />
        ) : null}
        <Button type="button" icon="pi pi-link" label="Link do paciente" text onClick={() => setLink(true)} />
        {!fechado && !f.comPaciente ? (
          <Button type="button" icon="pi pi-check" label="Concluir" onClick={() => acao("concluir", "Formulário concluído.")} />
        ) : null}
        {f.status === "concluido" && !f.arquivado_em ? (
          <Button type="button" icon="pi pi-pencil" label="Reabrir para correção" outlined onClick={() => acao("reabrir", "Formulário reaberto.")} />
        ) : null}
        <Button type="button" icon="pi pi-file-pdf" label="PDF" outlined onClick={() => abrirDocumento(`${api}/pdf`)} />
        <span className="flex-1" />
        {podeExcluir ? (
          <Button type="button" icon="pi pi-trash" label="Excluir rascunho" text severity="danger" onClick={excluir} />
        ) : f.arquivado_em ? (
          <Button type="button" icon="pi pi-replay" label="Desarquivar" text onClick={() => acao("desarquivar", "Formulário desarquivado.")} />
        ) : (
          <Button type="button" icon="pi pi-inbox" label="Arquivar" text severity="secondary" onClick={() => acao("arquivar", "Formulário arquivado.")} />
        )}
      </div>

      {link ? <JanelaLinkDoPaciente pacienteId={f.patient_id} onFechar={() => setLink(false)} /> : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import { avisar } from "@/lib/avisos";
import { obrigatoriasEmBranco, type Pergunta, type Recordatorio, type Respostas } from "@/lib/nutricao/anamnese";
import CamposDaAnamnese from "./CamposDaAnamnese";
import FormularioRecordatorio from "./FormularioRecordatorio";

type Comum = { id: string; enviado_em: string; respondido_em: string | null; editavel: boolean; revisao: number };
type AnamneseDoPaciente = Comum & { titulo: string; perguntas: Pergunta[]; respostas: Respostas };
type RecordatorioDoPaciente = Comum & { conteudo: Recordatorio };
type Dados = { primeiroNome: string; anamneses: AnamneseDoPaciente[]; recordatorios: RecordatorioDoPaciente[] };
type Aberto = { tipo: "anamnese"; f: AnamneseDoPaciente } | { tipo: "recordatorio"; f: RecordatorioDoPaciente };
type Estado = "salvo" | "pendente" | "salvando" | "erro";

const ESTADOS: Record<Estado, string> = { salvo: "Salvo", pendente: "Alterações não salvas", salvando: "Salvando…", erro: "Erro ao salvar" };

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Um formulário aberto: rascunho gravado sozinho e "Enviar respostas".
function Preenchimento({ base, aberto, onVoltar }: { base: string; aberto: Aberto; onVoltar: (recarregar: boolean) => void }) {
  const [respostas, setRespostas] = useState<Respostas>(aberto.tipo === "anamnese" ? aberto.f.respostas : {});
  const [conteudo, setConteudo] = useState<Recordatorio>(
    aberto.tipo === "recordatorio" ? aberto.f.conteudo : { refeicoes: [], observacoes: "" }
  );
  const [editavel, setEditavel] = useState(aberto.f.editavel);
  const [estado, setEstado] = useState<Estado>("salvo");
  const [faltando, setFaltando] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const revisao = useRef(aberto.f.revisao);
  const dadosRef = useRef({ respostas, conteudo });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = `${base}/${aberto.tipo}/${aberto.f.id}`;

  const corpo = useCallback(
    () =>
      aberto.tipo === "anamnese"
        ? { respostas: dadosRef.current.respostas, revisao: revisao.current }
        : { conteudo: dadosRef.current.conteudo, revisao: revisao.current },
    [aberto.tipo]
  );

  const tratarErro = useCallback(async (resposta: Response) => {
    const resultado = await resposta.json().catch(() => null);
    if (resposta.status === 423) {
      setEditavel(false);
      avisar(resultado?.erro ?? "O nutricionista já recebeu suas respostas.", "warn");
    } else {
      avisar(resultado?.erro ?? "Não foi possível salvar. Verifique a internet e tente novamente.", "error");
    }
    return resultado;
  }, []);

  const gravar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setEstado("salvando");
    try {
      const resposta = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo()) });
      if (!resposta.ok) {
        setEstado("erro");
        await tratarErro(resposta);
        return false;
      }
      revisao.current = (await resposta.json()).revisao;
      setEstado("salvo");
      return true;
    } catch {
      setEstado("erro");
      return false;
    }
  }, [url, corpo, tratarErro]);

  const agendar = useCallback(() => {
    setEstado("pendente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void gravar(), 1200);
  }, [gravar]);

  useEffect(() => {
    if (estado === "salvo") return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [estado]);

  async function enviar() {
    if (aberto.tipo === "anamnese") {
      const vazias = obrigatoriasEmBranco(aberto.f.perguntas, dadosRef.current.respostas).map((p) => p.id);
      setFaltando(vazias);
      if (vazias.length) {
        document.querySelector(`[data-pergunta="${vazias[0]}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        avisar("Responda as perguntas obrigatórias (marcadas com *).", "warn");
        return;
      }
    }
    if (temporizador.current) clearTimeout(temporizador.current);
    setEnviando(true);
    setEstado("salvando");
    const resposta = await fetch(`${url}/enviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo()),
    }).catch(() => null);
    setEnviando(false);
    if (!resposta || !resposta.ok) {
      setEstado("erro");
      if (resposta) {
        const resultado = await tratarErro(resposta);
        if (resultado?.obrigatorias) setFaltando(resultado.obrigatorias);
      } else avisar("Sem conexão. Suas respostas continuam aqui; tente enviar de novo.", "error");
      return;
    }
    revisao.current = (await resposta.json()).revisao;
    setEstado("salvo");
    avisar("Respostas enviadas ao nutricionista. Obrigado!", "success");
    onVoltar(true);
  }

  async function voltar() {
    if (estado === "pendente" || estado === "erro") {
      const ok = await gravar();
      if (!ok) return;
    }
    onVoltar(true);
  }

  const titulo = aberto.tipo === "anamnese" ? aberto.f.titulo : "Recordatório alimentar";

  return (
    <div>
      <Button type="button" icon="pi pi-arrow-left" label="Voltar" text className="mb-2" onClick={voltar} />
      <h2 className="text-2xl font-bold text-gray-900">{titulo}</h2>
      {aberto.tipo === "recordatorio" ? (
        <p className="mt-1 text-sm text-gray-600">
          Conte o que você costuma comer e beber em um dia comum: o nome da refeição, o horário, cada alimento e a quantidade
          aproximada (pode usar medidas caseiras, como colher, xícara ou unidade). Não precisa saber calorias.
        </p>
      ) : (
        <p className="mt-1 text-sm text-gray-600">Responda com calma. As respostas ficam salvas enquanto você preenche.</p>
      )}

      {!editavel ? (
        <p className="mt-3 rounded-lg bg-primary-50 p-3 text-sm text-primary-900">
          O nutricionista já recebeu suas respostas. Para mudar algo, fale com ele.
        </p>
      ) : aberto.f.respondido_em ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Você já enviou este formulário. Ainda pode corrigir até o nutricionista abrir; depois de corrigir, toque em
          &quot;Enviar respostas&quot; de novo.
        </p>
      ) : null}

      <div className="mt-4">
        {aberto.tipo === "anamnese" ? (
          <CamposDaAnamnese
            perguntas={aberto.f.perguntas}
            respostas={respostas}
            somenteLeitura={!editavel}
            faltando={faltando}
            onChange={(perguntaId, valor) => {
              const novas = { ...dadosRef.current.respostas };
              if (valor === undefined) delete novas[perguntaId];
              else novas[perguntaId] = valor;
              dadosRef.current = { ...dadosRef.current, respostas: novas };
              setRespostas(novas);
              setFaltando((f) => f.filter((x) => x !== perguntaId));
              agendar();
            }}
          />
        ) : (
          <FormularioRecordatorio
            conteudo={conteudo}
            somenteLeitura={!editavel}
            mostrarExemplo={editavel}
            onChange={(alterar) => {
              const copia = structuredClone(dadosRef.current.conteudo);
              alterar(copia);
              dadosRef.current = { ...dadosRef.current, conteudo: copia };
              setConteudo(copia);
              agendar();
            }}
          />
        )}
      </div>

      {editavel ? (
        <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
          <span className={`text-sm ${estado === "erro" ? "text-red-700" : "text-gray-500"}`} role="status">
            {ESTADOS[estado]}
          </span>
          {estado === "erro" ? <Button type="button" label="Tentar de novo" size="small" text onClick={() => void gravar()} /> : null}
          <span className="flex-1" />
          <Button type="button" icon="pi pi-send" label="Enviar respostas" loading={enviando} onClick={enviar} />
        </div>
      ) : null}
    </div>
  );
}

// Lista dos formulários enviados pelo nutricionista. "base": API do link
// individual (/api/formulario/<token>) ou da área do paciente.
export default function FormulariosDoPaciente({ base, saudacao = false }: { base: string; saudacao?: boolean }) {
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Aberto | null>(null);

  const carregar = useCallback(async () => {
    const resposta = await fetch(base, { cache: "no-store" }).catch(() => null);
    if (!resposta) {
      setErro("Sem conexão com a internet. Tente de novo.");
      setDados(null);
      return;
    }
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      setErro(resultado?.erro ?? "Não foi possível abrir os formulários.");
      setDados(null);
      return;
    }
    setDados(resultado);
  }, [base]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  if (dados === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton height="5rem" borderRadius="16px" />
        <Skeleton height="5rem" borderRadius="16px" />
      </div>
    );
  }
  if (dados === null) return <p className="cartao p-5 text-center text-gray-700">{erro}</p>;

  if (aberto) {
    return (
      <Preenchimento
        key={`${aberto.tipo}-${aberto.f.id}`}
        base={base}
        aberto={aberto}
        onVoltar={(recarregar) => {
          setAberto(null);
          if (recarregar) void carregar();
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  const itens: Aberto[] = [
    ...dados.anamneses.map((f) => ({ tipo: "anamnese" as const, f })),
    ...dados.recordatorios.map((f) => ({ tipo: "recordatorio" as const, f })),
  ].sort((a, b) => b.f.enviado_em.localeCompare(a.f.enviado_em));

  return (
    <div>
      {saudacao && dados.primeiroNome ? <h1 className="text-2xl font-bold text-gray-900">Olá, {dados.primeiroNome}!</h1> : null}
      {itens.length === 0 ? (
        <div className="cartao mt-4 p-6 text-center">
          <i className="pi pi-file-edit text-3xl text-gray-400" aria-hidden />
          <p className="mt-3 font-semibold text-gray-900">Nenhum formulário para preencher no momento.</p>
          <p className="mt-1 text-sm text-gray-500">Quando o nutricionista enviar um formulário, ele aparece aqui.</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {itens.map((item) => {
            const titulo = item.tipo === "anamnese" ? item.f.titulo : "Recordatório alimentar";
            const pendente = item.f.editavel && !item.f.respondido_em;
            return (
              <li key={`${item.tipo}-${item.f.id}`}>
                <button type="button" className="cartao flex w-full items-center gap-3 p-4 text-left hover:border-primary-700" onClick={() => setAberto(item)}>
                  <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <i className={`pi ${item.tipo === "anamnese" ? "pi-file-edit" : "pi-list"} text-lg`} aria-hidden />
                    {pendente ? <span className="absolute -right-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-red-600" aria-hidden /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-gray-900">{titulo}</span>
                    <span className="block text-xs text-gray-500">Enviado em {dataCurta(item.f.enviado_em)}</span>
                  </span>
                  {pendente ? (
                    <Tag value="Preencher" severity="danger" />
                  ) : item.f.editavel ? (
                    <Tag value="Enviado (pode corrigir)" severity="warning" />
                  ) : (
                    <Tag value="Recebido" severity="success" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

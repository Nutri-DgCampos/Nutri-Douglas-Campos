"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import {
  TIPOS_DE_PERGUNTA,
  novaOpcao,
  novaPergunta,
  pendenciasDoModelo,
  type Pergunta,
  type TipoDePergunta,
} from "@/lib/nutricao/anamnese";

type Estado = "salvo" | "pendente" | "salvando" | "erro" | "conflito";
const ESTADOS: Record<Estado, string> = {
  salvo: "Salvo",
  pendente: "Alterações não salvas",
  salvando: "Salvando…",
  erro: "Erro ao salvar",
  conflito: "Alterado em outra janela: recarregue",
};

function mover<T>(lista: T[], indice: number, direcao: -1 | 1) {
  const destino = indice + direcao;
  if (destino < 0 || destino >= lista.length) return;
  const [item] = lista.splice(indice, 1);
  lista.splice(destino, 0, item);
}

// Modelo de anamnese: nome e sequência de perguntas (sem seções). Salva
// sozinho; fichas já criadas guardam a versão que usaram.
// treino: modelos do Módulo de Treino (SPEC 06/11, anamnese), de cada
// profissional; o autor pode compartilhar com os profissionais do Treino, e o
// compartilhado por outro aparece só para leitura.
export default function EditorDeModeloAnamnese({ id, treino = false }: { id: string; treino?: boolean }) {
  const router = useRouter();
  const lista = treino ? "/treino/biblioteca?aba=anamneses" : "/nutricao/configuracoes/anamnese";
  const base = treino ? "/api/treino/modelos-anamnese" : "/api/nutricao/modelos-anamnese";
  const [carregado, setCarregado] = useState(false);
  const [nome, setNome] = useState("");
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [info, setInfo] = useState<{ versao: number; fichas: number; arquivado: boolean; meu: boolean; compartilhado: boolean; autor: string | null }>({
    versao: 1,
    fichas: 0,
    arquivado: false,
    meu: true,
    compartilhado: false,
    autor: null,
  });
  const [estado, setEstado] = useState<Estado>("salvo");
  const dados = useRef({ nome: "", perguntas: [] as Pergunta[] });
  const revisao = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${base}/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((resultado) => {
        if (!resultado) {
          avisar("Modelo não encontrado.", "error");
          router.push(lista);
          return;
        }
        const m = resultado.modelo;
        dados.current = { nome: m.nome, perguntas: m.perguntas };
        revisao.current = m.revisao;
        setNome(m.nome);
        setPerguntas(m.perguntas);
        setInfo({
          versao: m.versao,
          fichas: m.fichas,
          arquivado: Boolean(m.arquivado_em),
          meu: m.meu !== false,
          compartilhado: Boolean(m.compartilhado),
          autor: m.autor ?? null,
        });
        setCarregado(true);
      });
  }, [id, router, base, lista]);

  const gravar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setEstado("salvando");
    const resposta = await fetch(`${base}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dados.current, revisao: revisao.current }),
    }).catch(() => null);
    if (!resposta?.ok) {
      const resultado = await resposta?.json().catch(() => null);
      setEstado(resposta?.status === 409 ? "conflito" : "erro");
      if (resultado?.erro) avisar(resultado.erro, "error");
      return false;
    }
    const resultado = await resposta.json();
    revisao.current = resultado.revisao;
    setInfo((i) => ({ ...i, versao: resultado.versao }));
    setEstado("salvo");
    return true;
  }, [id, base]);

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

  function alterarPerguntas(mudanca: (lista: Pergunta[]) => void) {
    const copia = structuredClone(dados.current.perguntas);
    mudanca(copia);
    dados.current = { ...dados.current, perguntas: copia };
    setPerguntas(copia);
    agendar();
  }

  function pergunta(pid: string, mudanca: (p: Pergunta) => void) {
    alterarPerguntas((l) => {
      const alvo = l.find((p) => p.id === pid);
      if (alvo) mudanca(alvo);
    });
  }

  async function voltar() {
    if (estado !== "salvo") {
      const ok = await gravar();
      if (!ok) {
        const sair = await pedirConfirmacao("Não foi possível salvar as últimas alterações. Sair mesmo assim e perdê-las?", {
          aceitar: "Sair sem salvar",
          rejeitar: "Ficar e tentar de novo",
          titulo: "Alterações não salvas",
        });
        if (!sair) return;
      }
    }
    router.push(lista);
  }

  async function alternarCompartilhado() {
    const acao = info.compartilhado ? "privar" : "compartilhar";
    const r = await fetch(`${base}/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao }) }).catch(() => null);
    if (!r?.ok) return avisar("Não foi possível alterar o compartilhamento.", "error");
    setInfo((i) => ({ ...i, compartilhado: !i.compartilhado }));
    avisar(
      acao === "compartilhar"
        ? "Modelo compartilhado com os profissionais do Treino (só as perguntas; nunca respostas de pacientes)."
        : "Modelo privado de novo. Anamneses já feitas com ele não mudam.",
      "success"
    );
  }

  if (!carregado) return <Skeleton height="20rem" />;

  // Modelo compartilhado por outro profissional: só leitura.
  if (treino && !info.meu) {
    return (
      <div>
        <BotaoVoltar rotulo="Voltar aos modelos de anamnese" onClick={() => router.push(lista)} />
        <h1 className="text-2xl font-bold text-gray-900">{nome}</h1>
        <p className="mt-1 text-sm text-gray-600">
          Compartilhado por {info.autor ?? "outro profissional"}. Só leitura: para usar, escolha este modelo ao criar a anamnese na ficha do aluno.
        </p>
        <ol className="mt-4 space-y-2">
          {perguntas.map((p, indice) => (
            <li key={p.id} className="cartao p-3 text-sm">
              <span className="font-semibold text-gray-900">
                {indice + 1}. {p.texto || "(sem título)"}
              </span>
              <span className="ml-2 text-xs text-gray-500">
                {TIPOS_DE_PERGUNTA[p.tipo]}
                {p.obrigatoria ? " · obrigatória" : ""}
              </span>
              {p.tipo === "multipla" ? <p className="mt-1 text-gray-600">{p.opcoes.map((o) => o.texto).join(" · ")}</p> : null}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const pendencias = pendenciasDoModelo(nome, perguntas);

  return (
    <div>
      <BotaoVoltar rotulo="Voltar aos modelos de anamnese" onClick={voltar} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Modelo de anamnese</h1>
        <span className={`text-sm ${estado === "erro" || estado === "conflito" ? "text-red-700" : "text-gray-500"}`} role="status">
          {ESTADOS[estado]}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Versão {info.versao}
        {info.fichas ? ` · usado em ${info.fichas} ficha(s)` : " · ainda não usado"}. As alterações valem para as próximas fichas; as
        fichas já criadas guardam as perguntas da versão que usaram.
        {info.arquivado ? " Modelo arquivado: não aparece para novas anamneses." : ""}
      </p>
      {treino ? (
        <div className="mt-2 flex items-center gap-2">
          <Checkbox inputId="modelo-compartilhado" checked={info.compartilhado} onChange={alternarCompartilhado} />
          <label htmlFor="modelo-compartilhado" className="text-sm text-gray-700">
            Compartilhar com os profissionais do Treino (só as perguntas; nunca as respostas dos alunos)
          </label>
        </div>
      ) : null}

      <label className="mt-4 block">
        <span className="mb-1 block font-semibold text-gray-900">Tipo de anamnese</span>
        <InputText
          aria-label="Nome do modelo"
          value={nome}
          placeholder="Ex.: Primeira consulta"
          onChange={(e) => {
            dados.current = { ...dados.current, nome: e.target.value };
            setNome(e.target.value);
            agendar();
          }}
          className="w-full"
          maxLength={200}
        />
      </label>

      <ol className="mt-4 space-y-3">
        {perguntas.map((p, indice) => (
          <li key={p.id} className="cartao p-3" aria-label={`Pergunta ${indice + 1}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-right text-sm text-gray-400">{indice + 1}.</span>
              <InputText
                aria-label={`Texto da pergunta ${indice + 1}`}
                value={p.texto}
                placeholder={p.tipo === "texto_livre" ? "Título do campo (opcional)" : "Campo anamnese"}
                onChange={(e) => pergunta(p.id, (x) => void (x.texto = e.target.value))}
                className="min-w-[12rem] flex-1"
                maxLength={300}
              />
              <Dropdown
                aria-label={`Tipo da pergunta ${indice + 1}`}
                value={p.tipo}
                options={Object.entries(TIPOS_DE_PERGUNTA).map(([valor, rotulo]) => ({ label: rotulo, value: valor }))}
                onChange={(e) =>
                  pergunta(p.id, (x) => {
                    x.tipo = e.value as TipoDePergunta;
                    if (x.tipo === "multipla" && x.opcoes.length === 0) x.opcoes = [novaOpcao(), novaOpcao()];
                  })
                }
                className="w-full sm:w-60"
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  inputId={`obrigatoria-${p.id}`}
                  checked={p.obrigatoria}
                  onChange={(e) => pergunta(p.id, (x) => void (x.obrigatoria = Boolean(e.checked)))}
                />
                <label htmlFor={`obrigatoria-${p.id}`} className="text-sm text-gray-700">
                  Obrigatória
                </label>
              </div>
              <div className="flex">
                <Button type="button" icon="pi pi-angle-down" text aria-label={`Descer pergunta ${indice + 1}`} disabled={indice === perguntas.length - 1} onClick={() => alterarPerguntas((l) => mover(l, indice, 1))} />
                <Button type="button" icon="pi pi-angle-up" text aria-label={`Subir pergunta ${indice + 1}`} disabled={indice === 0} onClick={() => alterarPerguntas((l) => mover(l, indice, -1))} />
                <Button
                  type="button"
                  icon="pi pi-plus-circle"
                  text
                  aria-label={`Nova pergunta depois da ${indice + 1}`}
                  tooltip="Nova pergunta abaixo"
                  onClick={() => alterarPerguntas((l) => void l.splice(indice + 1, 0, novaPergunta()))}
                />
                <Button
                  type="button"
                  icon="pi pi-minus-circle"
                  text
                  severity="danger"
                  aria-label={`Remover pergunta ${indice + 1}`}
                  onClick={() => alterarPerguntas((l) => void l.splice(indice, 1))}
                />
              </div>
            </div>

            {p.tipo === "multipla" ? (
              <div className="ml-8 mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    inputId={`varias-${p.id}`}
                    checked={p.variasRespostas}
                    onChange={(e) => pergunta(p.id, (x) => void (x.variasRespostas = Boolean(e.checked)))}
                  />
                  <label htmlFor={`varias-${p.id}`} className="text-sm text-gray-700">
                    Permitir mais de uma resposta
                  </label>
                </div>
                {p.opcoes.map((o, m) => (
                  <div key={o.id} className="flex items-center gap-1">
                    <i className={`pi ${p.variasRespostas ? "pi-stop" : "pi-circle"} mr-1 text-xs text-gray-400`} aria-hidden />
                    <InputText
                      aria-label={`Alternativa ${m + 1} da pergunta ${indice + 1}`}
                      value={o.texto}
                      placeholder={`Alternativa ${m + 1}`}
                      onChange={(e) =>
                        pergunta(p.id, (x) => {
                          const alvo = x.opcoes.find((y) => y.id === o.id);
                          if (alvo) alvo.texto = e.target.value;
                        })
                      }
                      className="w-full max-w-sm"
                      maxLength={300}
                    />
                    <Button type="button" icon="pi pi-angle-down" text aria-label="Descer alternativa" disabled={m === p.opcoes.length - 1} onClick={() => pergunta(p.id, (x) => mover(x.opcoes, m, 1))} />
                    <Button type="button" icon="pi pi-angle-up" text aria-label="Subir alternativa" disabled={m === 0} onClick={() => pergunta(p.id, (x) => mover(x.opcoes, m, -1))} />
                    <Button
                      type="button"
                      icon="pi pi-plus-circle"
                      text
                      aria-label={`Nova alternativa depois da ${m + 1}`}
                      onClick={() => pergunta(p.id, (x) => void x.opcoes.splice(m + 1, 0, novaOpcao()))}
                    />
                    <Button
                      type="button"
                      icon="pi pi-minus-circle"
                      text
                      severity="danger"
                      aria-label={`Remover alternativa ${m + 1}`}
                      onClick={() => pergunta(p.id, (x) => void x.opcoes.splice(m, 1))}
                    />
                  </div>
                ))}
                {p.opcoes.length === 0 ? (
                  <Button type="button" icon="pi pi-plus" label="Alternativa" text size="small" onClick={() => pergunta(p.id, (x) => void x.opcoes.push(novaOpcao()))} />
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ol>

      <Button type="button" icon="pi pi-plus" label="Nova pergunta" outlined className="mt-3" onClick={() => alterarPerguntas((l) => void l.push(novaPergunta()))} />

      {pendencias.length ? (
        <ul className="mt-4 list-inside list-disc rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {pendencias.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" label="Voltar" outlined onClick={voltar} />
        <Button type="button" icon="pi pi-save" label="Salvar" onClick={() => void gravar().then((ok) => ok && avisar("Modelo salvo.", "success"))} />
      </div>
    </div>
  );
}

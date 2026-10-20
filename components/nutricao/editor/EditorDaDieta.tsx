"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { OverlayPanel } from "primereact/overlaypanel";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import type { AlimentoEncontrado } from "@/components/nutricao/BuscaAlimento";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { alimentosDoDocumento, novaRefeicao, type DocumentoDieta, type Refeicao } from "@/lib/nutricao/dieta";
import { formatarData, idadeEm, rotuloDoSexo } from "@/lib/nutricao/paciente";
import BlocoRefeicao, { SUGESTOES_DE_NOME } from "./BlocoRefeicao";
import DialogoEnvio, { type OpcoesDoEnvio } from "./DialogoEnvio";
import JanelaSubstituicoes from "./JanelaSubstituicoes";
import ObservacoesDaDieta from "./ObservacoesDaDieta";
import PainelNutricional from "./PainelNutricional";
import { carregarAlimentos, horaCurta, type BaseDosAlimentos, type DadosDoEditor } from "./tipos";

type EstadoGravacao = "salvo" | "pendente" | "salvando" | "erro" | "conflito";

const ESPERA_AUTOSAVE = 1200;
const CHAVE_PAINEL = "editor-dieta-painel";

// Preferência visual do painel lateral (aberto e largura), por navegador.
function lerPainel() {
  try {
    const guardado = JSON.parse(localStorage.getItem(CHAVE_PAINEL) ?? "null");
    return {
      aberto: guardado?.aberto !== false,
      largura: typeof guardado?.largura === "number" ? Math.min(Math.max(guardado.largura, 280), 640) : 360,
    };
  } catch {
    return { aberto: true, largura: 360 };
  }
}

function iguais(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Lembrete em estrela: só leitura, nunca vai para o PDF nem para o paciente.
function Lembrete({ titulo, texto, origem }: { titulo: string; texto: string | null; origem: string }) {
  const painel = useRef<OverlayPanel>(null);
  return (
    <>
      <Button
        type="button"
        icon={texto ? "pi pi-star-fill" : "pi pi-star"}
        rounded
        text
        aria-label={titulo}
        tooltip={titulo}
        className={texto ? "text-amber-500" : "text-gray-400"}
        onClick={(e) => painel.current?.toggle(e)}
      />
      <OverlayPanel ref={painel} className="max-w-sm">
        <p className="font-semibold text-gray-900">{titulo}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{texto ?? "Nenhum lembrete cadastrado."}</p>
        <p className="mt-2 text-xs text-gray-500">{origem}. Somente leitura: edite na origem.</p>
      </OverlayPanel>
    </>
  );
}

export default function EditorDaDieta({
  dietaId,
  onAlterada,
  onRemovida,
}: {
  dietaId: string;
  // Título ou situação mudaram (para atualizar a aba).
  onAlterada: () => void;
  onRemovida: () => void;
}) {
  const [dados, setDados] = useState<DadosDoEditor | null | undefined>(undefined);
  const [documento, setDocumento] = useState<DocumentoDieta | null>(null);
  const [base, setBase] = useState<BaseDosAlimentos>({ alimentos: {}, composicoes: {} });
  const [estado, setEstado] = useState<EstadoGravacao>("salvo");
  const [rascunhoEm, setRascunhoEm] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [escolherVersao, setEscolherVersao] = useState(false);
  const [substituindo, setSubstituindo] = useState<{ opcaoId: string; itemId: string } | null>(null);
  const [envio, setEnvio] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mostrarNutrientes, setMostrarNutrientes] = useState(true);
  const [painelAberto, setPainelAberto] = useState(() => lerPainel().aberto);
  const [larguraPainel, setLarguraPainel] = useState(() => lerPainel().largura);

  const documentoRef = useRef<DocumentoDieta | null>(null);
  const revisaoRef = useRef(0);
  const pendenteRef = useRef(false);
  const conflitoRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gravacaoRef = useRef<Promise<boolean> | null>(null);
  const tituloRef = useRef<string>("");

  // ---------------------------------------------------------------------
  // Carga

  const carregar = useCallback(async () => {
    const resposta = await fetch(`/api/nutricao/dietas/${dietaId}`, { cache: "no-store" });
    if (!resposta.ok) {
      setDados(null);
      return;
    }
    const recebidos = (await resposta.json()) as DadosDoEditor;
    setDados(recebidos);
    setDocumento(recebidos.dieta.rascunho);
    documentoRef.current = recebidos.dieta.rascunho;
    tituloRef.current = recebidos.dieta.rascunho.titulo;
    revisaoRef.current = recebidos.dieta.revisao;
    pendenteRef.current = false;
    conflitoRef.current = false;
    setEstado("salvo");
    setRascunhoEm(recebidos.dieta.rascunho_em);
    setSalvoEm(recebidos.dieta.salvo_em);
    setBase({ alimentos: recebidos.alimentos, composicoes: recebidos.composicoes });

    // Ao voltar: há alterações automáticas depois da última versão salva?
    const { salvo, rascunho } = recebidos.dieta;
    setEscolherVersao(Boolean(salvo) && !iguais(salvo, rascunho) && !recebidos.dieta.arquivada_em);
  }, [dietaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function guardarPainel(aberto: boolean, largura: number) {
    try {
      localStorage.setItem(CHAVE_PAINEL, JSON.stringify({ aberto, largura }));
    } catch {
      // Preferência visual apenas.
    }
  }

  // ---------------------------------------------------------------------
  // Gravação (automática e pelo botão Salvar)

  const gravar = useCallback(
    async (salvar: boolean): Promise<boolean> => {
      if (conflitoRef.current) return false;
      if (timerRef.current) clearTimeout(timerRef.current);

      // Uma gravação por vez, na ordem.
      while (gravacaoRef.current) await gravacaoRef.current;

      const doc = documentoRef.current;
      if (!doc) return false;
      if (!salvar && !pendenteRef.current) return true;

      pendenteRef.current = false;
      setEstado("salvando");

      const promessa = (async () => {
        try {
          const resposta = await fetch(`/api/nutricao/dietas/${dietaId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ documento: doc, revisao: revisaoRef.current, salvar }),
          });
          const resultado = await resposta.json().catch(() => null);

          if (resposta.status === 409) {
            conflitoRef.current = true;
            setEstado("conflito");
            avisar(resultado?.erro ?? "A dieta foi alterada em outra janela.", "error");
            return false;
          }
          if (!resposta.ok) {
            pendenteRef.current = true;
            setEstado("erro");
            if (resposta.status === 400) avisar(resultado?.erro ?? "Dados inválidos na dieta.", "error");
            return false;
          }

          revisaoRef.current = resultado.revisao;
          setRascunhoEm(resultado.rascunho_em);
          if (salvar) setSalvoEm(resultado.salvo_em);
          setEstado(pendenteRef.current ? "pendente" : "salvo");

          if (doc.titulo !== tituloRef.current) {
            tituloRef.current = doc.titulo;
            onAlterada();
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

      // Mudanças feitas durante a gravação: grava de novo.
      if (ok && pendenteRef.current) agendar();
      return ok;
    },
    // agendar é estável (usa só refs).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dietaId, onAlterada]
  );

  function agendar() {
    pendenteRef.current = true;
    setEstado((atual) => (atual === "conflito" ? atual : "pendente"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void gravar(false), ESPERA_AUTOSAVE);
  }

  // Ao sair da aba da dieta ou da página: grava o que faltar.
  useEffect(() => {
    const aoSair = (evento: BeforeUnloadEvent) => {
      if (pendenteRef.current || gravacaoRef.current) {
        evento.preventDefault();
        void gravar(false);
      }
    };
    window.addEventListener("beforeunload", aoSair);
    return () => {
      window.removeEventListener("beforeunload", aoSair);
      if (pendenteRef.current && documentoRef.current && !conflitoRef.current) {
        void fetch(`/api/nutricao/dietas/${dietaId}`, {
          method: "PUT",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documento: documentoRef.current, revisao: revisaoRef.current, salvar: false }),
        });
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [dietaId, gravar]);

  const somenteLeitura = Boolean(dados?.dieta.arquivada_em) || estado === "conflito";

  const alterar = useCallback(
    (mudanca: (doc: DocumentoDieta) => void) => {
      if (somenteLeitura) return;
      const atual = documentoRef.current;
      if (!atual) return;
      const copia = structuredClone(atual);
      mudanca(copia);
      documentoRef.current = copia;
      setDocumento(copia);
      agendar();
    },
    // agendar usa só refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [somenteLeitura]
  );

  const garantirAlimentos = useCallback(async (ids: string[]) => {
    const faltando = ids.filter((id) => !base.alimentos[id]);
    if (faltando.length === 0) return;
    const novos = await carregarAlimentos(faltando);
    setBase((atual) => ({
      alimentos: { ...atual.alimentos, ...novos.alimentos },
      composicoes: { ...atual.composicoes, ...novos.composicoes },
    }));
  }, [base.alimentos]);

  // Escolher (ou trocar) o alimento de uma linha: a quantidade zera
  // (decisão B.3) e a medida padrão do alimento já vem selecionada.
  async function escolherAlimento(refeicaoId: string, opcaoId: string, itemId: string, alimento: AlimentoEncontrado) {
    let dadosDoAlimento = base.alimentos[alimento.id];
    try {
      if (!dadosDoAlimento) {
        const novos = await carregarAlimentos([alimento.id]);
        setBase((atual) => ({
          alimentos: { ...atual.alimentos, ...novos.alimentos },
          composicoes: { ...atual.composicoes, ...novos.composicoes },
        }));
        dadosDoAlimento = novos.alimentos[alimento.id];
      }
    } catch {
      avisar("Não foi possível carregar o alimento.", "error");
      return;
    }

    const item = documentoRef.current?.refeicoes
      .find((r) => r.id === refeicaoId)
      ?.opcoes.find((o) => o.id === opcaoId)
      ?.itens.find((i) => i.id === itemId);

    if (item?.alimentoId && item.substituicoes.length > 0) {
      const confirmado = await pedirConfirmacao(
        "Trocar o alimento remove as substituições escolhidas para ele nesta linha. Continuar?",
        { aceitar: "Trocar alimento", rejeitar: "Cancelar" }
      );
      if (!confirmado) return;
    }

    const padrao = dadosDoAlimento?.medidas.find((m) => m.padrao) ?? dadosDoAlimento?.medidas[0];

    alterar((doc) => {
      const alvo = doc.refeicoes
        .find((r) => r.id === refeicaoId)
        ?.opcoes.find((o) => o.id === opcaoId)
        ?.itens.find((i) => i.id === itemId);
      if (!alvo) return;
      Object.assign(alvo, {
        alimentoId: alimento.id,
        nomeOriginal: alimento.nome,
        nomeExibido: null,
        unidade: alimento.unidade_base,
        medida: padrao
          ? { id: padrao.id, singular: padrao.nome_singular, plural: padrao.nome_plural, quantidade: padrao.quantidade }
          : null,
        numeroMedidas: null,
        quantidadeAjustada: null,
        substituicoes: [],
      });
    });
  }

  // ---------------------------------------------------------------------
  // Comandos

  async function salvar() {
    if (await gravar(true)) avisar("Dieta salva.", "success");
    else if (!conflitoRef.current) avisar("Não foi possível salvar. Verifique a conexão e tente de novo.", "error");
  }

  async function voltarParaSalva() {
    const resposta = await fetch(`/api/nutricao/dietas/${dietaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "descartar_rascunho" }),
    });
    if (!resposta.ok) {
      avisar("Não foi possível restaurar a versão salva.", "error");
      return;
    }
    await carregar();
    onAlterada();
    avisar("Última versão salva restaurada.", "success");
  }

  async function apagar() {
    if (!dados || !documento) return;

    if (dados.versoes.length > 0) {
      const confirmado = await pedirConfirmacao(
        `“${documento.titulo || "Dieta"}” já foi enviada ao paciente e fica guardada no histórico. Arquivar a dieta? Ela sai das abas, mas a versão enviada continua no histórico.`,
        { aceitar: "Arquivar", rejeitar: "Cancelar", titulo: "Arquivar dieta" }
      );
      if (!confirmado) return;
      await gravar(false);
      const resposta = await fetch(`/api/nutricao/dietas/${dietaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "arquivar" }),
      });
      if (!resposta.ok) return avisar("Não foi possível arquivar a dieta.", "error");
      avisar("Dieta arquivada.", "success");
      onRemovida();
      return;
    }

    const confirmado = await pedirConfirmacao(
      `Apagar a dieta “${documento.titulo || "sem título"}”? Ela nunca foi enviada. O cadastro do paciente não é afetado.`,
      { aceitar: "Apagar dieta", rejeitar: "Cancelar", titulo: "Apagar dieta" }
    );
    if (!confirmado) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    pendenteRef.current = false;
    const resposta = await fetch(`/api/nutricao/dietas/${dietaId}`, { method: "DELETE" });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível apagar a dieta.", "error");
    avisar("Dieta apagada.", "success");
    onRemovida();
  }

  async function abrirPdf(modelo: "simples" | "detalhado") {
    // O PDF sai do que está gravado: grava antes as últimas alterações.
    const janela = window.open("", "_blank");
    const ok = await gravar(false);
    if (!ok) {
      janela?.close();
      avisar("Grave a dieta antes de gerar o PDF.", "warn");
      return;
    }
    const endereco = `/api/nutricao/dietas/${dietaId}/pdf?modelo=${modelo}`;
    if (janela) janela.location.href = endereco;
    else window.open(endereco, "_blank");
  }

  async function abrirEnvio() {
    if (!(await gravar(false))) {
      avisar("Não foi possível gravar as últimas alterações. Tente de novo antes de enviar.", "error");
      return;
    }
    setEnvio(true);
  }

  async function enviar(opcoes: OpcoesDoEnvio) {
    setEnviando(true);
    try {
      const resposta = await fetch(`/api/nutricao/dietas/${dietaId}/enviar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...opcoes, revisao: revisaoRef.current }),
      });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        const pendencias = Array.isArray(resultado?.pendencias) ? `\n${resultado.pendencias.join("\n")}` : "";
        avisar(`${resultado?.erro ?? "Não foi possível enviar a dieta."}${pendencias}`, "error");
        return;
      }
      setEnvio(false);
      avisar(`Dieta enviada ao paciente (versão ${resultado.versao}).`, "success");
      await carregar();
      onAlterada();
    } catch {
      avisar("Falha de conexão durante o envio. Confira o histórico antes de tentar de novo.", "error");
    } finally {
      setEnviando(false);
    }
  }

  // Redimensionar o painel lateral arrastando a borda.
  function iniciarArraste(evento: React.PointerEvent) {
    const inicio = evento.clientX;
    const larguraInicial = larguraPainel;
    let ultima = larguraInicial;
    const mover = (e: PointerEvent) => {
      ultima = Math.min(Math.max(larguraInicial + (inicio - e.clientX), 280), 640);
      setLarguraPainel(ultima);
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      guardarPainel(true, ultima);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  }

  // ---------------------------------------------------------------------

  if (dados === undefined || !documento) {
    return (
      <div className="space-y-3">
        <Skeleton height="3rem" />
        <Skeleton height="10rem" />
      </div>
    );
  }

  if (dados === null) return <p className="text-gray-600">Dieta não encontrada.</p>;

  const { paciente, consulta, versoes } = dados;
  const idade = idadeEm(paciente.birth_date, consulta?.data);
  const ultimaVersao = versoes[0];
  const itemEmSubstituicao = substituindo
    ? documento.refeicoes.flatMap((r) => r.opcoes).find((o) => o.id === substituindo.opcaoId)?.itens.find((i) => i.id === substituindo.itemId) ?? null
    : null;

  const textoDoEstado: Record<EstadoGravacao, string> = {
    salvo: rascunhoEm ? `Rascunho gravado às ${horaCurta(rascunhoEm)}` : "",
    pendente: "Alterações a gravar…",
    salvando: "Gravando…",
    erro: "Falha ao gravar o rascunho. Tentando de novo ao editar ou ao clicar em Salvar.",
    conflito: "A dieta foi alterada em outra janela. Recarregue para continuar.",
  };

  return (
    <div>
      <datalist id="sugestoes-refeicao">
        {SUGESTOES_DE_NOME.map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>

      {/* Identificação do paciente e da consulta */}
      <div className="cartao mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 p-3 text-sm">
        <span className="font-bold text-gray-900">{paciente.name}</span>
        {idade !== null ? <span>{idade} anos</span> : <span className="text-gray-400">Idade não informada</span>}
        <span>{rotuloDoSexo(paciente.sex) ?? <span className="text-gray-400">Sexo não informado</span>}</span>
        {consulta ? <span>Consulta de {formatarData(consulta.data)}</span> : null}
        {paciente.objective ? <span className="text-gray-600">Objetivo do cadastro: {paciente.objective}</span> : null}
        <span className="ml-auto flex items-center">
          <Lembrete titulo="Lembrete importante do cadastro" texto={dados.lembretes.cadastro} origem="Cadastro do paciente" />
          <Lembrete titulo="Lembrete da anamnese" texto={dados.lembretes.anamnese} origem="Anamnese" />
        </span>
      </div>

      {dados.dieta.arquivada_em ? (
        <div className="mb-3 rounded-lg border border-gray-300 bg-gray-50 p-3 text-sm text-gray-700">
          Dieta arquivada em {horaCurta(dados.dieta.arquivada_em)} — somente leitura.
        </div>
      ) : null}

      <div className="flex gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="cartao grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Objetivo</span>
              <InputText
                value={documento.objetivo}
                disabled={somenteLeitura}
                placeholder="Ex.: Hipertrofia muscular"
                onChange={(e) => alterar((d) => void (d.objetivo = e.target.value))}
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Título</span>
              <InputText
                value={documento.titulo}
                disabled={somenteLeitura}
                placeholder="Ex.: Dieta para dias com treino"
                onChange={(e) => alterar((d) => void (d.titulo = e.target.value))}
                className={`w-full ${documento.titulo.trim() ? "" : "p-invalid"}`}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 sm:col-span-2">
              <span className={estado === "erro" || estado === "conflito" ? "font-semibold text-red-700" : ""}>{textoDoEstado[estado]}</span>
              {salvoEm ? <span>· Última versão salva: {horaCurta(salvoEm)}</span> : <span>· Ainda não salva</span>}
              {ultimaVersao ? (
                <Tag
                  value={`Enviada: versão ${ultimaVersao.numero} em ${horaCurta(ultimaVersao.enviada_em)}`}
                  severity="success"
                  className="selo-status"
                />
              ) : (
                <Tag value="Em elaboração" severity="info" className="selo-status" />
              )}
              {estado === "conflito" ? <Button type="button" size="small" label="Recarregar" onClick={() => carregar()} /> : null}
              <label className="ml-auto flex items-center gap-1">
                <input type="checkbox" checked={mostrarNutrientes} onChange={(e) => setMostrarNutrientes(e.target.checked)} />
                Kcal e macros por alimento
              </label>
            </div>
          </div>

          {/* Somente leitura (arquivada ou alterada em outra janela): nada responde a cliques. */}
          <div inert={somenteLeitura} className={`min-w-0 space-y-3 ${somenteLeitura ? "opacity-70" : ""}`}>
            {documento.refeicoes.map((refeicao, indice) => (
              <BlocoRefeicao
                key={refeicao.id}
                refeicao={refeicao}
                indice={indice}
                total={documento.refeicoes.length}
                base={base}
                nutrientes={dados.nutrientes}
                acompanhados={documento.nutrientesAcompanhados}
                mostrarNutrientes={mostrarNutrientes}
                onAlterar={(mudanca) =>
                  alterar((d) => {
                    const alvo = d.refeicoes.find((r) => r.id === refeicao.id);
                    if (alvo) mudanca(alvo as Refeicao);
                  })
                }
                onRemover={async () => {
                  const confirmado = await pedirConfirmacao(
                    `Remover ${refeicao.nome.trim() || `a refeição ${indice + 1}`} e todos os alimentos dela desta dieta?`,
                    { aceitar: "Remover refeição", rejeitar: "Cancelar" }
                  );
                  if (confirmado) alterar((d) => void (d.refeicoes = d.refeicoes.filter((r) => r.id !== refeicao.id)));
                }}
                onMover={(direcao) =>
                  alterar((d) => {
                    const destino = indice + direcao;
                    if (destino < 0 || destino >= d.refeicoes.length) return;
                    [d.refeicoes[indice], d.refeicoes[destino]] = [d.refeicoes[destino], d.refeicoes[indice]];
                  })
                }
                onEscolherAlimento={(opcaoId, itemId, alimento) => escolherAlimento(refeicao.id, opcaoId, itemId, alimento)}
                onSubstituicoes={(opcaoId, itemId) => setSubstituindo({ opcaoId, itemId })}
              />
            ))}

            <Button
              type="button"
              icon="pi pi-plus"
              label="Adicionar refeição"
              outlined
              onClick={() => alterar((d) => void d.refeicoes.push(novaRefeicao()))}
            />

            <ObservacoesDaDieta documento={documento} onAlterar={alterar} />
          </div>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap gap-2 border-t border-gray-200 bg-white/95 px-1 py-3 backdrop-blur">
            <Button type="button" icon="pi pi-save" label="Salvar" onClick={salvar} disabled={somenteLeitura} />
            <Button
              type="button"
              icon="pi pi-file-pdf"
              label="PDF"
              outlined
              onClick={() => abrirPdf("simples")}
              disabled={estado === "conflito"}
            />
            <Button
              type="button"
              label="PDF detalhado"
              outlined
              onClick={() => abrirPdf("detalhado")}
              disabled={estado === "conflito"}
            />
            <Button
              type="button"
              icon={versoes.length ? "pi pi-inbox" : "pi pi-trash"}
              label={versoes.length ? "Arquivar" : "Apagar"}
              severity="danger"
              text
              onClick={apagar}
              disabled={Boolean(dados.dieta.arquivada_em)}
            />
            <span className="flex-1" />
            <Button
              type="button"
              icon="pi pi-send"
              label="Enviar ao paciente"
              severity="success"
              onClick={abrirEnvio}
              disabled={somenteLeitura}
            />
          </div>
        </div>

        {/* Painel nutricional lateral: retrátil e com largura ajustável */}
        <aside
          className={`hidden shrink-0 lg:block ${painelAberto ? "" : "w-10"}`}
          style={painelAberto ? { width: larguraPainel } : undefined}
          aria-label="Resumo nutricional da dieta"
        >
          <div className="sticky top-4 flex max-h-[calc(100vh-2rem)]">
            {painelAberto ? (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Ajustar largura do painel"
                onPointerDown={iniciarArraste}
                className="w-1.5 shrink-0 cursor-col-resize rounded bg-gray-200 hover:bg-primary-300"
              />
            ) : null}
            <div className="cartao min-w-0 flex-1 overflow-y-auto p-3">
              <div className="mb-2 flex items-center justify-between">
                {painelAberto ? <h2 className="font-bold text-gray-900">Resumo nutricional da dieta</h2> : null}
                <Button
                  type="button"
                  icon={painelAberto ? "pi pi-angle-double-right" : "pi pi-angle-double-left"}
                  text
                  aria-label={painelAberto ? "Recolher painel" : "Expandir painel"}
                  aria-expanded={painelAberto}
                  onClick={() => {
                    setPainelAberto(!painelAberto);
                    guardarPainel(!painelAberto, larguraPainel);
                  }}
                />
              </div>
              {painelAberto ? (
                <PainelNutricional
                  dietaId={dietaId}
                  documento={documento}
                  base={base}
                  nutrientes={dados.nutrientes}
                  anteriores={dados.anteriores}
                  pesoAtual={dados.pesoAtual}
                  onAlterar={alterar}
                />
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {/* No celular e tablet, o painel fica abaixo do editor, recolhível */}
      <details className="cartao mt-3 p-3 lg:hidden" open={false}>
        <summary className="cursor-pointer font-bold text-gray-900">Resumo nutricional da dieta</summary>
        <div className="mt-3">
          <PainelNutricional
            dietaId={dietaId}
            documento={documento}
            base={base}
            nutrientes={dados.nutrientes}
            anteriores={dados.anteriores}
            pesoAtual={dados.pesoAtual}
            onAlterar={alterar}
          />
        </div>
      </details>

      <JanelaSubstituicoes
        key={substituindo ? `${substituindo.opcaoId}-${substituindo.itemId}` : "fechada"}
        item={itemEmSubstituicao}
        base={base}
        visivel={Boolean(substituindo)}
        garantirAlimentos={garantirAlimentos}
        onFechar={() => setSubstituindo(null)}
        onConfirmar={(substituicoes) => {
          const alvo = substituindo;
          setSubstituindo(null);
          if (!alvo) return;
          alterar((d) => {
            const item = d.refeicoes
              .flatMap((r) => r.opcoes)
              .find((o) => o.id === alvo.opcaoId)
              ?.itens.find((i) => i.id === alvo.itemId);
            if (item) item.substituicoes = substituicoes;
          });
        }}
      />

      <DialogoEnvio
        key={envio ? "envio-aberto" : "envio-fechado"}
        visivel={envio}
        documento={documento}
        paciente={paciente.name}
        cicloAtivo={dados.cicloAtivo}
        enviando={enviando}
        onFechar={() => setEnvio(false)}
        onEnviar={enviar}
      />

      <Dialog
        header="Continuar de onde parou?"
        visible={escolherVersao}
        closable={false}
        onHide={() => setEscolherVersao(false)}
        className="w-[min(32rem,calc(100vw-1rem))]"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              label="Voltar à última versão salva"
              outlined
              onClick={async () => {
                setEscolherVersao(false);
                await voltarParaSalva();
              }}
            />
            <Button type="button" label="Continuar do rascunho" onClick={() => setEscolherVersao(false)} />
          </div>
        }
      >
        <p className="text-gray-700">Esta dieta tem alterações gravadas automaticamente depois da última vez que foi salva.</p>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700">
          <li>Rascunho mais recente: {horaCurta(dados.dieta.rascunho_em)}</li>
          <li>Última versão salva: {horaCurta(dados.dieta.salvo_em)}</li>
        </ul>
        <p className="mt-2 text-sm text-gray-500">
          {alimentosDoDocumento(documento).length} alimento(s) no rascunho. Voltar à versão salva descarta o rascunho.
        </p>
      </Dialog>
    </div>
  );
}

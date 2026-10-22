"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputTextarea } from "primereact/inputtextarea";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { pontosDoRelatorio } from "@/lib/relatorios/pontos";

// Pontos do relatório e devolutiva (tela "Responder relatório").
// - Pontos de atenção vêm da regra única (lib/relatorios/pontos.ts); cada um
//   pode ser removido deste relatório (D1), com regeneração da devolutiva.
// - A devolutiva fica gravada como rascunho (só o nutricionista vê), com
//   versões recuperáveis. Nada é enviado sem "Enviar devolutiva ao paciente".

type Rascunho = { texto: string; revisao: number; editado: boolean; desatualizada: boolean };
type Versao = { id: string; numero: number; texto: string; origem: "ia" | "manual" | "restaurada"; criada_em: string };

const ORIGENS: Record<Versao["origem"], string> = { ia: "Gerada pela IA", manual: "Editada à mão", restaurada: "Restaurada" };
const ESPERA = 900;

export default function DevolutivaERelatorio({
  relatorio,
  onRelatorio,
  onEnviar,
  onExcluir,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  relatorio: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRelatorio: (mudanca: Record<string, any>) => void;
  onEnviar: (texto: string) => Promise<void>;
  onExcluir: () => void;
}) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [texto, setTexto] = useState("");
  const [versoes, setVersoes] = useState<Versao[]>([]);
  const [gerando, setGerando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [verVersoes, setVerVersoes] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const revisao = useRef(0);
  const pendente = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = `/api/relatorios/${relatorio.id}/devolutiva`;

  const aplicar = useCallback((r: Rascunho, lista?: Versao[]) => {
    setRascunho(r);
    setTexto(r.texto);
    revisao.current = r.revisao;
    pendente.current = null;
    if (lista) setVersoes(lista);
  }, []);

  useEffect(() => {
    let cancelado = false;
    fetch(base, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => {
        if (!cancelado && dados) aplicar(dados.rascunho, dados.versoes);
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [base, aplicar]);

  // Gravação automática da edição à mão.
  const gravar = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const valor = pendente.current;
    if (valor === null) return true;
    pendente.current = null;
    const resposta = await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: valor, revisao: revisao.current }),
    }).catch(() => null);
    const dados = await resposta?.json().catch(() => null);
    if (resposta?.status === 409 && dados?.rascunho) {
      avisar("A devolutiva foi atualizada enquanto você editava. Confira o texto atual.", "warn");
      aplicar(dados.rascunho);
      return false;
    }
    if (!resposta?.ok) {
      pendente.current = valor;
      avisar("Não foi possível gravar a devolutiva. Tente de novo.", "error");
      return false;
    }
    revisao.current = dados.rascunho.revisao;
    setRascunho(dados.rascunho);
    return true;
  }, [base, aplicar]);

  useEffect(() => () => void gravar(), [gravar]);

  function editar(valor: string) {
    setTexto(valor);
    pendente.current = valor;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void gravar(), ESPERA);
  }

  async function gerar() {
    if (gerando) return;
    if (!(await gravar())) return;
    setGerando(true);
    try {
      const resposta = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "gerar" }) });
      const dados = await resposta.json().catch(() => null);
      if (dados?.rascunho) aplicar(dados.rascunho, dados.versoes);
      if (!resposta.ok) avisar(dados?.erro ?? "Não foi possível gerar a devolutiva.", "error");
    } finally {
      setGerando(false);
    }
  }

  async function remover(codigo: string, textoDoPonto: string) {
    const confirmado = await pedirConfirmacao(
      `Remover este ponto de atenção deste relatório?\n\n“${textoDoPonto}”\n\nA resposta do paciente não muda. Se o ponto descontou do score, a parte volta ao máximo neste relatório.`,
      { aceitar: "Remover ponto", rejeitar: "Cancelar", titulo: "Remover ponto de atenção" }
    );
    if (!confirmado) return;
    if (!(await gravar())) return;
    setRemovendo(codigo);
    try {
      const resposta = await fetch(`/api/relatorios/${relatorio.id}/pontos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo }),
      });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) {
        avisar(dados?.erro ?? "Não foi possível remover o ponto de atenção.", "error");
        return;
      }
      onRelatorio(dados.relatorio);
      aplicar(dados.rascunho, dados.versoes);
      if (dados.regeneracao === "ok") avisar("Ponto removido e devolutiva regenerada.", "success");
      else if (dados.regeneracao === "falhou") avisar("Ponto removido, mas a devolutiva não foi regenerada. Tente de novo.", "warn");
      else avisar("Ponto de atenção removido.", "success");
    } finally {
      setRemovendo(null);
    }
  }

  async function restaurar(versao: Versao) {
    const confirmado = await pedirConfirmacao(
      `Restaurar a versão ${versao.numero} (${ORIGENS[versao.origem].toLowerCase()})? O texto atual continua guardado nas versões.`,
      { aceitar: "Restaurar", rejeitar: "Cancelar" }
    );
    if (!confirmado) return;
    if (!(await gravar())) return;
    const resposta = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "restaurar", versaoId: versao.id }),
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      avisar(dados?.erro ?? "Não foi possível restaurar.", "error");
      return;
    }
    aplicar(dados.rascunho, dados.versoes);
    setVerVersoes(false);
    avisar("Versão restaurada.", "success");
  }

  async function enviar() {
    if (!texto.trim()) {
      avisar("Gere ou escreva uma devolutiva antes de enviar.");
      return;
    }
    if (!(await gravar())) return;
    setEnviando(true);
    try {
      await onEnviar(texto.trim());
    } finally {
      setEnviando(false);
    }
  }

  const { positivos, atencao } = pontosDoRelatorio(relatorio);
  const ocupado = gerando || removendo !== null;

  return (
    <>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {positivos.length > 0 && (
          <div>
            <p className="font-semibold text-primary-700">Pontos positivos</p>
            <ul className="mt-2 space-y-2 text-sm text-gray-700">
              {positivos.map((ponto, index) => (
                <li key={index} className="flex gap-2">
                  <i className="pi pi-check-circle mt-0.5 text-primary-600" aria-hidden />
                  <span>{ponto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {atencao.length > 0 && (
          <div>
            <p className="font-semibold text-atencao-700">Pontos de atenção</p>
            <ul className="mt-2 space-y-1 text-sm text-gray-700">
              {atencao.map((ponto) => {
                const [rotulo, ...resto] = ponto.texto.split(": ");
                const destaque = ponto.codigo === "dieta_dificuldade" && resto.length > 0;
                return (
                  <li key={ponto.codigo} className="flex items-start gap-2">
                    <i className="pi pi-exclamation-circle mt-1 text-atencao-600" aria-hidden />
                    <span className="flex-1 pt-0.5">
                      {destaque ? (
                        <>
                          {rotulo}: <strong>{resto.join(": ")}</strong>
                        </>
                      ) : (
                        ponto.texto
                      )}
                    </span>
                    <Button
                      type="button"
                      icon="pi pi-times"
                      rounded
                      text
                      severity="secondary"
                      size="small"
                      className="h-7 w-7 shrink-0"
                      aria-label={`Remover ponto de atenção: ${ponto.texto}`}
                      tooltip="Remover ponto de atenção"
                      tooltipOptions={{ position: "left" }}
                      loading={removendo === ponto.codigo}
                      disabled={ocupado && removendo !== ponto.codigo}
                      onClick={() => remover(ponto.codigo, ponto.texto)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {relatorio.general_notes && String(relatorio.general_notes).trim() !== "" && (
        <div className="mt-5 rounded-xl bg-gray-50 p-4">
          <p className="font-semibold text-gray-900">Observações do paciente</p>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">{relatorio.general_notes}</p>
        </div>
      )}

      <div className="mt-6 border-t border-gray-200 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label htmlFor={`devolutiva-${relatorio.id}`} className="font-semibold text-gray-900">
            Devolutiva ao paciente
          </label>
          <div className="flex flex-wrap gap-2">
            {versoes.length > 0 && (
              <Button type="button" text size="small" icon="pi pi-history" label={`Versões anteriores (${versoes.length})`} onClick={() => setVerVersoes(true)} />
            )}
            <Button
              type="button"
              outlined
              size="small"
              icon="pi pi-sparkles"
              loading={gerando || removendo !== null}
              disabled={ocupado || rascunho === null}
              onClick={gerar}
              label={gerando || removendo !== null ? "Gerando devolutiva..." : texto.trim() ? "Gerar de novo com IA" : "Gerar devolutiva com IA"}
            />
          </div>
        </div>

        {rascunho?.desatualizada && !ocupado ? (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
            <i className="pi pi-exclamation-triangle" aria-hidden />
            Este texto ainda não considera o ponto de atenção removido: a regeneração não foi concluída.
            <Button type="button" size="small" text label="Tentar de novo" onClick={gerar} />
          </p>
        ) : null}

        <InputTextarea
          id={`devolutiva-${relatorio.id}`}
          autoResize
          rows={6}
          value={texto}
          disabled={ocupado || rascunho === null}
          onChange={(e) => editar(e.target.value)}
          className="mt-3 w-full"
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" severity="danger" text size="small" icon="pi pi-trash" label="Excluir relatório" onClick={onExcluir} />
          <Button type="button" icon="pi pi-send" label="Enviar devolutiva ao paciente" loading={enviando} disabled={ocupado} onClick={enviar} />
        </div>
      </div>

      <Dialog
        header="Versões da devolutiva"
        visible={verVersoes}
        onHide={() => setVerVersoes(false)}
        className="w-[min(44rem,calc(100vw-1rem))]"
      >
        <ul className="space-y-3">
          {versoes.map((versao) => (
            <li key={versao.id} className="rounded-lg border border-gray-200 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-gray-900">Versão {versao.numero}</span>
                <span className="text-gray-600">{ORIGENS[versao.origem]}</span>
                <span className="text-gray-500">{new Date(versao.criada_em).toLocaleString("pt-BR")}</span>
                <Button type="button" size="small" text label="Restaurar" className="ml-auto" onClick={() => restaurar(versao)} />
              </div>
              <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line text-sm text-gray-700">{versao.texto}</p>
            </li>
          ))}
        </ul>
      </Dialog>
    </>
  );
}

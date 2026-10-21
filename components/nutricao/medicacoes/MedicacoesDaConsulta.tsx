"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AutoComplete } from "primereact/autocomplete";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import {
  AVISO_DA_FERRAMENTA,
  STATUS,
  calcularSemana,
  comUnidade,
  formatar,
  resumoEmTexto,
  textoDaConcentracao,
  textoDaSemana,
  type StatusDaMedicacao,
} from "@/lib/nutricao/medicacao";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirDocumento } from "@/lib/visualizador";
import CartaoDaMedicacao, { type Medicacao, type Receita } from "./CartaoDaMedicacao";

type Dados = {
  paciente: string;
  data: string;
  medicacoes: Medicacao[];
  receitas: (Receita & { criada_em: string })[];
  anotacoes: { texto: string; revisao: number };
  anterior: { id: string; data: string; quantidade: number; anotacoes: string | null } | null;
  emitidos: { id: string; file_name: string; storage_path: string; emitido_em: string }[];
};

type Medicamento = { id: string; nome: string; principio_ativo: string | null; apresentacao: string | null };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const TIPOS: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

// Medicações da consulta (registro do que o paciente usa; não é prescrição).
export default function MedicacoesDaConsulta({ pacienteId, consultaId }: { pacienteId: string; consultaId: string }) {
  const base = `/api/nutricao/consultas/${consultaId}/medicacoes`;
  const [dados, setDados] = useState<Dados | null>(null);
  // Muda a cada leitura do servidor: os cartões recomeçam com os dados novos.
  const [geracao, setGeracao] = useState(0);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<StatusDaMedicacao | null>(null);
  const [verExcluidas, setVerExcluidas] = useState(false);
  const [novo, setNovo] = useState<string | Medicamento>("");
  const [sugestoes, setSugestoes] = useState<Medicamento[]>([]);
  const [anotacoes, setAnotacoes] = useState("");
  const [estadoAnotacoes, setEstadoAnotacoes] = useState<"salvo" | "pendente" | "erro">("salvo");
  const [verReceitas, setVerReceitas] = useState(false);
  const [buscaReceita, setBuscaReceita] = useState("");
  const [prescritor, setPrescritor] = useState("");
  const [enviandoReceita, setEnviandoReceita] = useState(false);
  const entradaReceita = useRef<HTMLInputElement>(null);
  const revisaoAnotacoes = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = useCallback(async () => {
    const resposta = await fetch(base, { cache: "no-store" });
    if (!resposta.ok) return;
    const d: Dados = await resposta.json();
    revisaoAnotacoes.current = d.anotacoes.revisao;
    setAnotacoes(d.anotacoes.texto);
    setDados(d);
    setGeracao((g) => g + 1);
  }, [base]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  async function acaoDaLista(corpo: Record<string, unknown>, mensagem?: string) {
    const resposta = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      avisar(resultado?.erro ?? "Não foi possível concluir.", "error");
      return null;
    }
    if (mensagem) avisar(mensagem, "success");
    await carregar();
    return resultado;
  }

  async function acaoDaMedicacao(m: Medicacao, acao: "excluir" | "restaurar" | "duplicar" | "salvar_na_biblioteca") {
    if (acao === "excluir") {
      const ok = await pedirConfirmacao(`Excluir “${m.dados.nome || "esta medicação"}” desta consulta? A biblioteca e as consultas anteriores não mudam.`, {
        aceitar: "Excluir",
        rejeitar: "Cancelar",
      });
      if (!ok) return;
    }
    const resposta = await fetch(`/api/nutricao/medicacoes/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao }),
    });
    if (!resposta.ok) return avisar("Não foi possível concluir.", "error");
    await carregar();
    if (acao === "excluir") avisar("Medicação excluída. Para desfazer, use “Excluídas” e restaure.", "info");
    if (acao === "salvar_na_biblioteca") avisar("Salva também na biblioteca de medicamentos.", "success");
  }

  async function mover(lista: Medicacao[], indice: number, direcao: -1 | 1) {
    const ids = lista.map((m) => m.id);
    const destino = indice + direcao;
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    // Mantém a ordem relativa das que não aparecem (filtradas ou excluídas).
    const todas = dados!.medicacoes.map((m) => m.id);
    const visiveis = new Set(ids);
    let k = 0;
    const final = todas.map((id) => (visiveis.has(id) ? ids[k++] : id));
    await acaoDaLista({ acao: "ordem", ids: final });
  }

  function alterarAnotacoes(texto: string) {
    setAnotacoes(texto);
    setEstadoAnotacoes("pendente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      const resposta = await fetch(`${base}/anotacoes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, revisao: revisaoAnotacoes.current }),
      }).catch(() => null);
      if (!resposta?.ok) return setEstadoAnotacoes("erro");
      revisaoAnotacoes.current = (await resposta.json()).revisao;
      setEstadoAnotacoes("salvo");
    }, 1000);
  }

  async function anexarReceita(arquivo: File) {
    const extensao = TIPOS[arquivo.type];
    if (!extensao) return avisar("Envie a receita em PDF, JPG ou PNG.", "warn");
    if (arquivo.size > 20 * 1024 * 1024) return avisar("O arquivo deve ter no máximo 20 MB.", "warn");
    setEnviandoReceita(true);
    const caminho = `${pacienteId}/${crypto.randomUUID()}.${extensao}`;
    const { error } = await api.storage.from("receitas").upload(caminho, arquivo, { contentType: arquivo.type });
    if (error) {
      setEnviandoReceita(false);
      return avisar("Não foi possível enviar a receita.", "error");
    }
    const resposta = await fetch(`/api/nutricao/consultas/${consultaId}/receitas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caminho, nome: arquivo.name, prescritor }),
    });
    setEnviandoReceita(false);
    if (!resposta.ok) return avisar("Não foi possível registrar a receita.", "error");
    setPrescritor("");
    avisar("Receita anexada. Vincule-a ao medicamento.", "success");
    carregar();
  }

  async function abrirReceita(r: Receita) {
    const { data, error } = await api.storage.from("receitas").createSignedUrl(r.storage_path, 120);
    if (error || !data?.signedUrl) return avisar("Não foi possível abrir a receita.", "error");
    abrirDocumento(data.signedUrl, r.file_name);
  }

  async function emitirPdf() {
    const resposta = await fetch(`${base}/pdf`, { method: "POST" });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível emitir o PDF.", "error");
    avisar("PDF emitido e guardado nesta consulta.", "success");
    await carregar();
    abrirEmitido({ storage_path: resultado.caminho, file_name: resultado.nome });
  }

  async function abrirEmitido(d: { storage_path: string; file_name: string }) {
    const { data, error } = await api.storage.from("documentos").createSignedUrl(d.storage_path, 120);
    if (error || !data?.signedUrl) return avisar("Não foi possível abrir o PDF.", "error");
    abrirDocumento(data.signedUrl, d.file_name);
  }

  async function copiarResumo() {
    if (!dados) return;
    const texto = resumoEmTexto({
      paciente: dados.paciente,
      data: formatarData(dados.data),
      profissional: "",
      medicacoes: dados.medicacoes.filter((m) => !m.excluida_em && m.status === "em_uso").map((m) => m.dados),
      anotacoes,
    });
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Resumo semanal copiado.", "success");
    } catch {
      avisar("Não foi possível copiar.", "warn");
    }
  }

  const ativas = useMemo(() => dados?.medicacoes.filter((m) => !m.excluida_em) ?? [], [dados]);
  const contagem = useMemo(
    () => Object.fromEntries((Object.keys(STATUS) as StatusDaMedicacao[]).map((s) => [s, ativas.filter((m) => m.status === s).length])) as Record<StatusDaMedicacao, number>,
    [ativas]
  );

  if (!dados) return <Skeleton height="20rem" />;

  const termo = semAcento(busca.trim());
  const visiveis = (verExcluidas ? dados.medicacoes.filter((m) => m.excluida_em) : ativas).filter(
    (m) => (!filtro || m.status === filtro) && (!termo || semAcento(`${m.dados.nome} ${m.dados.principioAtivo}`).includes(termo))
  );
  const emUso = ativas.filter((m) => m.status === "em_uso");
  const excluidas = dados.medicacoes.filter((m) => m.excluida_em).length;
  const jaTrazidas = dados.anterior && dados.medicacoes.some((m) => m.origem_id);
  const receitasFiltradas = dados.receitas.filter((r) => {
    if (!buscaReceita.trim()) return true;
    const ligadas = ativas.filter((m) => m.dados.receitas.some((x) => x.id === r.id)).map((m) => `${m.dados.nome} ${m.dados.principioAtivo}`);
    return semAcento(`${r.file_name} ${r.prescritor} ${ligadas.join(" ")}`).includes(semAcento(buscaReceita.trim()));
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-primary-700">{dados.paciente}</p>
        <h1 className="text-2xl font-bold text-gray-900">Medicações</h1>
        <p className="text-sm text-gray-600">Consulta de {formatarData(dados.data)}. Registro do que o paciente usa, conforme a prescrição de outro profissional.</p>
      </div>

      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-900" role="note">
        {AVISO_DA_FERRAMENTA}
      </p>

      {dados.anterior && !jaTrazidas && dados.anterior.quantidade > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-700">
          <span className="flex-1">
            A consulta de {formatarData(dados.anterior.data)} tem {dados.anterior.quantidade} medicação(ões). Traga-as como referência, não confirmadas, para
            conferir com o paciente.
          </span>
          <Button type="button" icon="pi pi-history" label="Trazer da consulta anterior" size="small" outlined onClick={() => acaoDaLista({ acao: "trazer_anteriores" }, "Medicações trazidas como não confirmadas.")} />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(STATUS) as StatusDaMedicacao[]).map((s) => (
          <Button
            key={s}
            type="button"
            size="small"
            label={`${STATUS[s]} (${contagem[s]})`}
            outlined={filtro !== s}
            severity={s === "em_uso" ? undefined : "secondary"}
            onClick={() => setFiltro((f) => (f === s ? null : s))}
          />
        ))}
        <InputText aria-label="Pesquisar medicação" placeholder="Pesquisar nome ou princípio ativo" value={busca} onChange={(e) => setBusca(e.target.value)} className="min-w-[14rem] flex-1" />
        {filtro || busca ? <Button type="button" label="Limpar filtros" size="small" text onClick={() => (setFiltro(null), setBusca(""))} /> : null}
        {contagem.nao_confirmado ? (
          <Button type="button" icon="pi pi-check-square" label="Confirmar todos" size="small" onClick={() => acaoDaLista({ acao: "confirmar_todos" }, "Medicações confirmadas.")} />
        ) : null}
        {excluidas || verExcluidas ? (
          <Button type="button" label={verExcluidas ? "Voltar à lista" : `Excluídas (${excluidas})`} size="small" text onClick={() => setVerExcluidas((v) => !v)} />
        ) : null}
      </div>

      {!verExcluidas ? (
        <div className="flex flex-wrap items-center gap-2">
          <AutoComplete
            inputId="novo-medicamento"
            aria-label="Adicionar medicamento"
            value={novo}
            suggestions={sugestoes}
            field="nome"
            placeholder="Adicionar medicamento: buscar na biblioteca ou digitar o nome"
            completeMethod={async (e) => {
              const r = await fetch(`/api/nutricao/biblioteca/medicamentos?q=${encodeURIComponent(e.query)}`, { cache: "no-store" });
              setSugestoes(((await r.json().catch(() => null))?.modelos ?? []) as Medicamento[]);
            }}
            itemTemplate={(m: Medicamento) => (
              <span>
                <strong>{m.nome}</strong>
                {m.principio_ativo ? <span className="text-gray-500"> · {m.principio_ativo}</span> : null}
                {m.apresentacao ? <span className="text-gray-500"> · {m.apresentacao}</span> : null}
              </span>
            )}
            onChange={(e) => setNovo(e.value)}
            onSelect={async (e) => {
              setNovo("");
              await acaoDaLista({ acao: "nova", medicamentoId: (e.value as Medicamento).id }, "Medicamento adicionado.");
            }}
            className="min-w-0 flex-1"
            inputClassName="w-full"
          />
          <Button
            type="button"
            icon="pi pi-plus"
            label="Adicionar sem cadastro"
            outlined
            disabled={typeof novo !== "string" || !novo.trim()}
            onClick={async () => {
              const nome = typeof novo === "string" ? novo.trim() : "";
              setNovo("");
              await acaoDaLista({ acao: "nova", nome }, "Medicamento adicionado.");
            }}
          />
        </div>
      ) : null}

      {visiveis.length === 0 ? (
        <p className="text-sm text-gray-500">{verExcluidas ? "Nenhuma medicação excluída." : "Nenhuma medicação registrada nesta consulta."}</p>
      ) : (
        <ul className="space-y-3">
          {visiveis.map((m, i) =>
            verExcluidas ? (
              <li key={m.id} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
                <span className="flex-1 text-gray-500 line-through">{m.dados.nome || "Medicamento"}</span>
                <Button type="button" icon="pi pi-undo" label="Restaurar" size="small" text onClick={() => acaoDaMedicacao(m, "restaurar")} />
              </li>
            ) : (
              <CartaoDaMedicacao
                key={`${m.id}-${geracao}`}
                medicacao={m}
                receitas={dados.receitas}
                primeira={i === 0}
                ultima={i === visiveis.length - 1}
                onMover={(d) => mover(visiveis, i, d)}
                onAcao={(acao) => acaoDaMedicacao(m, acao)}
                onAbrirReceita={abrirReceita}
                onAtualizada={(novos, status) =>
                  setDados((d) => (d ? { ...d, medicacoes: d.medicacoes.map((x) => (x.id === m.id ? { ...x, dados: novos, status } : x)) } : d))
                }
              />
            )
          )}
        </ul>
      )}

      <section className="cartao p-4">
        <h2 className="mb-2 font-bold text-gray-900">Resumo semanal (em uso)</h2>
        {emUso.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma medicação em uso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                  <th className="py-1 pr-2">Medicamento</th>
                  <th className="py-1 pr-2">Concentração</th>
                  <th className="py-1 pr-2">Semana</th>
                  <th className="py-1 pr-2 text-right">Total físico</th>
                  <th className="py-1 text-right">Princípio ativo</th>
                </tr>
              </thead>
              <tbody>
                {emUso.map((m) => {
                  const c = calcularSemana(m.dados);
                  return (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="py-1 pr-2">
                        <span className="font-semibold">{m.dados.nome}</span>
                        {m.dados.principioAtivo ? <span className="block text-xs text-gray-500">{m.dados.principioAtivo}</span> : null}
                      </td>
                      <td className="py-1 pr-2">{textoDaConcentracao(m.dados) || "—"}</td>
                      <td className="py-1 pr-2 text-xs">{textoDaSemana(m.dados) || "—"}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{c.fisicoSemanal !== null ? comUnidade(c.fisicoSemanal, c.unidadeFisica) : "Dados insuficientes"}</td>
                      <td className="py-1 text-right tabular-nums">{c.ativoSemanal !== null ? `${formatar(c.ativoSemanal)} ${c.unidadeAtivo}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-1 text-xs text-gray-500">Cada medicamento tem seu total; substâncias diferentes não são somadas e não há conversão entre UI, mg, mcg e g.</p>
      </section>

      <section className="cartao p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold text-gray-900">Anotações sobre medicações</h2>
          <span className={`text-xs ${estadoAnotacoes === "erro" ? "text-red-700" : "text-gray-400"}`}>{{ salvo: "Salvo", pendente: "…", erro: "Erro ao salvar" }[estadoAnotacoes]}</span>
        </div>
        {!anotacoes.trim() && dados.anterior?.anotacoes?.trim() ? (
          <div className="mb-2 rounded-lg bg-gray-100 p-2 text-sm text-gray-500">
            <p className="text-xs font-semibold">Anotações da consulta de {formatarData(dados.anterior.data)} (referência):</p>
            <p className="whitespace-pre-wrap">{dados.anterior.anotacoes}</p>
            <Button type="button" label="Aproveitar e editar" size="small" text onClick={() => alterarAnotacoes(dados.anterior!.anotacoes ?? "")} />
          </div>
        ) : null}
        <InputTextarea aria-label="Anotações sobre medicações" value={anotacoes} rows={3} autoResize onChange={(e) => alterarAnotacoes(e.target.value)} className="w-full" />
      </section>

      <section className="cartao p-4">
        <h2 className="mb-2 font-bold text-gray-900">Receitas da consulta ({dados.receitas.length})</h2>
        <div className="flex flex-wrap items-center gap-2">
          <InputText aria-label="Prescritor da receita" placeholder="Profissional prescritor (opcional)" value={prescritor} onChange={(e) => setPrescritor(e.target.value)} className="min-w-[12rem] flex-1" />
          <Button type="button" icon="pi pi-upload" label="Anexar receita" outlined loading={enviandoReceita} onClick={() => entradaReceita.current?.click()} />
          <input
            ref={entradaReceita}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            className="sr-only"
            aria-label="Arquivo da receita"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void anexarReceita(arquivo);
              e.target.value = "";
            }}
          />
          {dados.receitas.length ? <Button type="button" icon="pi pi-folder-open" label="Visualizar todas as receitas" text onClick={() => setVerReceitas(true)} /> : null}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-eye" label="Pré-visualizar PDF" outlined onClick={() => abrirDocumento(`${base}/pdf`)} />
        <Button type="button" icon="pi pi-file-pdf" label="Gerar PDF do resumo de medicações" onClick={emitirPdf} />
        <Button type="button" icon="pi pi-copy" label="Copiar resumo semanal" text onClick={copiarResumo} />
      </div>
      {dados.emitidos.length ? (
        <div className="text-sm">
          <p className="font-semibold text-gray-900">PDFs emitidos nesta consulta</p>
          <ul>
            {dados.emitidos.map((d) => (
              <li key={d.id}>
                <button type="button" className="text-primary-700 hover:underline" onClick={() => abrirEmitido(d)}>
                  {new Date(d.emitido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} — {d.file_name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog header="Receitas da consulta" visible={verReceitas} onHide={() => setVerReceitas(false)} className="w-[min(40rem,calc(100vw-1rem))]">
        <InputText aria-label="Pesquisar receitas" placeholder="Medicamento, princípio ativo ou prescritor" value={buscaReceita} onChange={(e) => setBuscaReceita(e.target.value)} className="mb-3 w-full" />
        <ul className="divide-y divide-gray-200">
          {receitasFiltradas.map((r) => {
            const ligadas = ativas.filter((m) => m.dados.receitas.some((x) => x.id === r.id));
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{r.file_name}</span>
                  <span className="block text-xs text-gray-500">
                    {r.prescritor ? `${r.prescritor} · ` : ""}
                    {ligadas.length ? ligadas.map((m) => m.dados.nome).join(", ") : "sem medicamento vinculado"}
                  </span>
                </span>
                <Button type="button" label="Visualizar" size="small" text onClick={() => abrirReceita(r)} />
              </li>
            );
          })}
        </ul>
        <a href={`/api/nutricao/consultas/${consultaId}/receitas`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary-700 hover:underline" download>
          <i className="pi pi-download" aria-hidden /> Baixar todas as receitas (ZIP)
        </a>
      </Dialog>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";
import { Skeleton } from "primereact/skeleton";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { pendenciasDaFormula, type Formula } from "@/lib/nutricao/formula";
import { formatarData } from "@/lib/nutricao/paciente";
import { abrirDocumento } from "@/lib/visualizador";
import EditorDeFormula from "./EditorDeFormula";
import EnvioAoPaciente from "@/components/nutricao/EnvioAoPaciente";

type Linha = { id: string; dieta_id: string | null; ordem: number; conteudo: Formula; origem: { tipo: string } | null; pendente_revisao: boolean; salva_em: string | null; revisao: number };
type Dados = {
  paciente: string;
  data: string;
  formulas: Linha[];
  dietas: { id: string; titulo: string | null }[];
  emitidos: { id: string; tipo: string; titulo: string; file_name: string; storage_path: string; emitido_em: string }[];
};
type Origem = { tipo: "modelo" | "formula"; id: string; rotulo: string };
type Aba = "modelos" | "consultas" | "outros";

// Uma fórmula aberta: salva sozinha (rascunho) e no botão Salvar.
function FormulaAberta({
  linha,
  dietas,
  onAtualizada,
}: {
  linha: Linha;
  dietas: Dados["dietas"];
  onAtualizada: (conteudo: Formula, dietaId: string | null, salvaEm?: string | null) => void;
}) {
  const [formula, setFormula] = useState(linha.conteudo);
  const [dietaId, setDietaId] = useState(linha.dieta_id);
  const [estado, setEstado] = useState<"salvo" | "pendente" | "salvando" | "erro">("salvo");
  const atual = useRef({ formula: linha.conteudo, dietaId: linha.dieta_id });
  const revisao = useRef(linha.revisao);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gravar = useCallback(
    async (salvar = false) => {
      if (temporizador.current) clearTimeout(temporizador.current);
      setEstado("salvando");
      const resposta = await fetch(`/api/nutricao/formulas/${linha.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conteudo: atual.current.formula, dietaId: atual.current.dietaId, revisao: revisao.current, salvar }),
      }).catch(() => null);
      if (!resposta?.ok) {
        const resultado = await resposta?.json().catch(() => null);
        setEstado("erro");
        avisar(resultado?.erro ?? "Não foi possível salvar a fórmula.", "error");
        return false;
      }
      const r = await resposta.json();
      revisao.current = r.revisao;
      setEstado("salvo");
      if (salvar) onAtualizada(atual.current.formula, atual.current.dietaId, r.salva_em);
      return true;
    },
    [linha.id, onAtualizada]
  );

  useEffect(() => {
    if (estado === "salvo") return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [estado]);

  function agendar() {
    setEstado("pendente");
    onAtualizada(atual.current.formula, atual.current.dietaId);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void gravar(), 1000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Dieta:
          <Dropdown
            aria-label="Dieta da fórmula"
            value={dietaId ?? ""}
            options={[{ label: "Sem dieta específica", value: "" }, ...dietas.map((d) => ({ label: d.titulo?.trim() || "Sem título", value: d.id }))]}
            onChange={(e) => {
              atual.current = { ...atual.current, dietaId: e.value || null };
              setDietaId(e.value || null);
              agendar();
            }}
            className="w-60"
          />
        </label>
        <span className="flex-1" />
        <span className={`text-xs ${estado === "erro" ? "text-red-700" : "text-gray-500"}`}>
          {{ salvo: linha.salva_em ? `Salva em ${new Date(linha.salva_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}` : "Rascunho gravado", pendente: "Alterações não gravadas", salvando: "Gravando…", erro: "Erro ao gravar" }[estado]}
        </span>
        <Button type="button" icon="pi pi-save" label="Salvar" size="small" onClick={() => void gravar(true).then((ok) => ok && avisar("Fórmula salva.", "success"))} />
      </div>
      <EditorDeFormula
        formula={formula}
        onAlterar={(mudanca) => {
          const copia = structuredClone(atual.current.formula);
          mudanca(copia);
          atual.current = { ...atual.current, formula: copia };
          setFormula(copia);
          agendar();
        }}
      />
    </div>
  );
}

// Área de fórmulas da consulta (FIG-181): importar, nova, salvar como
// modelo, duplicar, apagar, PDF individual e consolidado ("Manipulados").
export default function FormulasDaConsulta({ consultaId, dietaInicial }: { consultaId: string; dietaInicial: string | null }) {
  const base = `/api/nutricao/consultas/${consultaId}/formulas`;
  const [dados, setDados] = useState<Dados | null>(null);
  const [geracao, setGeracao] = useState(0);
  const [aberta, setAberta] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [aba, setAba] = useState<Aba>("modelos");
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<Origem[] | null>(null);
  const [escolhida, setEscolhida] = useState<Origem | null>(null);

  const carregar = useCallback(async (abrir?: string) => {
    const resposta = await fetch(base, { cache: "no-store" });
    if (!resposta.ok) return;
    const d: Dados = await resposta.json();
    setDados(d);
    setGeracao((g) => g + 1);
    setAberta((atual) => abrir ?? (atual && d.formulas.some((f) => f.id === atual) ? atual : d.formulas[0]?.id ?? null));
  }, [base]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!importando) return;
    const t = setTimeout(async () => {
      if (aba === "modelos") {
        const r = await fetch(`/api/nutricao/biblioteca/formulas?q=${encodeURIComponent(busca)}`, { cache: "no-store" });
        const lista = ((await r.json().catch(() => null))?.modelos ?? []) as { id: string; nome: string; quantidade: number }[];
        setOpcoes(lista.map((m) => ({ tipo: "modelo", id: m.id, rotulo: `${m.nome} · modelo · ${m.quantidade} ingrediente(s)` })));
      } else {
        const r = await fetch(`/api/nutricao/formulas/importacao?consulta=${consultaId}&q=${encodeURIComponent(busca)}${aba === "outros" ? "&outros=1" : ""}`, { cache: "no-store" });
        const lista = ((await r.json().catch(() => null))?.formulas ?? []) as { id: string; nome: string; quantidade: number; consulta_data: string }[];
        setOpcoes(
          lista.map((f) => ({
            tipo: "formula",
            id: f.id,
            rotulo: `${f.nome || "Sem nome"} · ${aba === "outros" ? "outro paciente" : "consulta"} de ${formatarData(f.consulta_data)} · ${f.quantidade} ingrediente(s)`,
          }))
        );
      }
    }, 250);
    return () => clearTimeout(t);
  }, [importando, aba, busca, consultaId]);

  async function criar(corpo: Record<string, unknown>, mensagem: string) {
    const resposta = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dietaId: dietaInicial, ...corpo }) });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível concluir.", "error");
    avisar(mensagem, "success");
    await carregar(resultado.id);
  }

  async function importar() {
    if (!escolhida) return;
    const ok = await pedirConfirmacao(
      `Importar “${escolhida.rotulo.split(" · ")[0]}” como uma nova fórmula desta consulta? As fórmulas já preenchidas não mudam.${
        aba === "outros" ? " De outro paciente vem só a estrutura (sem observação nem orientações ao paciente)." : ""
      }`,
      { aceitar: "Importar", rejeitar: "Cancelar", titulo: "Importar fórmula" }
    );
    if (!ok) return;
    setImportando(false);
    await criar({ acao: "importar", origem: { tipo: escolhida.tipo, id: escolhida.id } }, "Fórmula importada. Revise antes de emitir.");
    setEscolhida(null);
  }

  async function acao(id: string, nome: string, corpo: Record<string, unknown>, mensagem: string) {
    const resposta = await fetch(`/api/nutricao/formulas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível concluir.", "error");
    avisar(mensagem.replace("{nome}", nome), "success");
    await carregar(resultado?.id);
  }

  async function apagar(f: Linha) {
    const ok = await pedirConfirmacao("Deseja realmente apagar esta fórmula do atendimento? Esta ação não apagará o modelo cadastrado.", {
      aceitar: "Apagar",
      rejeitar: "Cancelar",
      titulo: `Apagar “${f.conteudo.nome || "fórmula"}”`,
    });
    if (!ok) return;
    const resposta = await fetch(`/api/nutricao/formulas/${f.id}`, { method: "DELETE" });
    if (!resposta.ok) return avisar("Não foi possível apagar.", "error");
    setSelecionadas((s) => s.filter((x) => x !== f.id));
    avisar("Fórmula apagada.", "success");
    carregar();
  }

  async function mover(indice: number, direcao: -1 | 1) {
    const ids = dados!.formulas.map((f) => f.id);
    const destino = indice + direcao;
    [ids[indice], ids[destino]] = [ids[destino], ids[indice]];
    await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: "ordem", ids }) });
    carregar();
  }

  async function emitir(ids: string[]) {
    const resposta = await fetch(`${base}/pdf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    const resultado = await resposta.json().catch(() => null);
    if (!resposta.ok) {
      avisar(resultado?.pendencias?.length ? `Revise antes de emitir: ${resultado.pendencias[0]}` : resultado?.erro ?? "Não foi possível emitir.", "warn");
      return;
    }
    avisar("PDF emitido e guardado nesta consulta.", "success");
    await carregar();
    abrirEmitido({ storage_path: resultado.caminho, file_name: resultado.nome });
  }

  async function abrirEmitido(d: { storage_path: string; file_name: string }) {
    const { data, error } = await api.storage.from("documentos").createSignedUrl(d.storage_path, 120);
    if (error || !data?.signedUrl) return avisar("Não foi possível abrir o PDF.", "error");
    abrirDocumento(data.signedUrl, d.file_name);
  }

  if (!dados) return <Skeleton height="20rem" />;
  const atual = dados.formulas.find((f) => f.id === aberta) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-primary-700">{dados.paciente}</p>
          <h1 className="text-2xl font-bold text-gray-900">Fórmulas</h1>
          <p className="text-sm text-gray-600">Consulta de {formatarData(dados.data)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" icon="pi pi-folder-open" label="Importar" outlined onClick={() => (setImportando(true), setEscolhida(null), setOpcoes(null))} />
          <Button type="button" icon="pi pi-file-plus" label="Nova fórmula" outlined onClick={() => criar({ acao: "nova" }, "Nova fórmula criada.")} />
          {atual ? (
            <Button
              type="button"
              icon="pi pi-star"
              label="Salvar como modelo"
              outlined
              onClick={() => acao(atual.id, atual.conteudo.nome, { acao: "salvar_como_modelo" }, "“{nome}” salva como modelo (sem dados do paciente).")}
            />
          ) : null}
        </div>
      </div>

      {dados.formulas.length === 0 ? (
        <p className="cartao p-5 text-sm text-gray-500">Nenhuma fórmula nesta consulta. Crie uma nova ou importe de um modelo, de consultas anteriores ou de outros pacientes.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="cartao h-fit p-2">
            <ul className="space-y-1">
              {dados.formulas.map((f, i) => (
                <li key={f.id} className={`flex items-center gap-1 rounded-lg p-1 ${f.id === aberta ? "bg-primary-50" : ""}`}>
                  <Checkbox
                    inputId={`pdf-${f.id}`}
                    aria-label={`Incluir ${f.conteudo.nome || "fórmula"} no PDF consolidado`}
                    checked={selecionadas.includes(f.id)}
                    onChange={(e) => setSelecionadas((s) => (e.checked ? [...s, f.id] : s.filter((x) => x !== f.id)))}
                  />
                  <button type="button" className={`min-w-0 flex-1 truncate text-left text-sm ${f.pendente_revisao ? "text-gray-400" : "text-gray-900"}`} onClick={() => setAberta(f.id)}>
                    {f.conteudo.nome || "Sem nome"}
                    {pendenciasDaFormula(f.conteudo).length ? <i className="pi pi-exclamation-circle ml-1 text-xs text-amber-600" aria-label="com pendências" /> : null}
                  </button>
                  <Button type="button" icon="pi pi-angle-up" text size="small" className="h-6 w-6" aria-label={`Subir ${f.conteudo.nome}`} disabled={i === 0} onClick={() => mover(i, -1)} />
                  <Button type="button" icon="pi pi-angle-down" text size="small" className="h-6 w-6" aria-label={`Descer ${f.conteudo.nome}`} disabled={i === dados.formulas.length - 1} onClick={() => mover(i, 1)} />
                </li>
              ))}
            </ul>
            <div className="mt-2 border-t border-gray-200 pt-2">
              <p className="text-xs font-semibold text-gray-600">PDF consolidado (Manipulados)</p>
              <Button
                type="button"
                label={selecionadas.length === dados.formulas.length ? "Desmarcar todas" : "Selecionar todas"}
                text
                size="small"
                onClick={() => setSelecionadas(selecionadas.length === dados.formulas.length ? [] : dados.formulas.map((f) => f.id))}
              />
              <div className="flex flex-wrap gap-1">
                <Button type="button" icon="pi pi-eye" label="Prévia" size="small" outlined disabled={!selecionadas.length} onClick={() => abrirDocumento(`${base}/pdf?ids=${selecionadas.join(",")}`)} />
                <Button type="button" icon="pi pi-file-pdf" label="Emitir" size="small" disabled={!selecionadas.length} onClick={() => emitir(selecionadas)} />
              </div>
            </div>
          </aside>

          {atual ? (
            <section className={`cartao p-4 ${atual.pendente_revisao ? "bg-gray-50" : ""}`}>
              {atual.pendente_revisao ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-200 p-2 text-sm text-gray-700">
                  <span className="flex-1">Trazida de uma consulta anterior: revise ingredientes, dosagens e orientações antes de usar.</span>
                  <Button type="button" icon="pi pi-check" label="Aprovar fórmula" size="small" onClick={() => acao(atual.id, atual.conteudo.nome, { acao: "aprovar" }, "Fórmula aprovada.")} />
                </div>
              ) : null}
              <FormulaAberta
                key={`${atual.id}-${geracao}`}
                linha={atual}
                dietas={dados.dietas}
                onAtualizada={(conteudo, dietaId, salvaEm) =>
                  setDados((d) =>
                    d ? { ...d, formulas: d.formulas.map((f) => (f.id === atual.id ? { ...f, conteudo, dieta_id: dietaId, ...(salvaEm !== undefined ? { salva_em: salvaEm } : {}) } : f)) } : d
                  )
                }
              />
              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-200 pt-3">
                <Button type="button" icon="pi pi-eye" label="Prévia do PDF" outlined onClick={() => abrirDocumento(`${base}/pdf?ids=${atual.id}`)} />
                <Button type="button" icon="pi pi-file-pdf" label="PDF" onClick={() => emitir([atual.id])} />
                <Button type="button" icon="pi pi-copy" label="Duplicar" text onClick={() => acao(atual.id, atual.conteudo.nome, { acao: "duplicar" }, "Fórmula duplicada.")} />
                <span className="flex-1" />
                <Button type="button" icon="pi pi-trash" label="Apagar" text severity="danger" onClick={() => apagar(atual)} />
              </div>
            </section>
          ) : null}
        </div>
      )}

      {dados.emitidos.length ? (
        <div className="text-sm">
          <p className="font-semibold text-gray-900">PDFs emitidos nesta consulta</p>
          <ul>
            {dados.emitidos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-2">
                <button type="button" className="text-primary-700 hover:underline" onClick={() => abrirEmitido(d)}>
                  {new Date(d.emitido_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} — {d.file_name}
                </button>
                <EnvioAoPaciente tipo="formulas" origemId={d.id} paciente={dados.paciente} documento={d.file_name} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Dialog header="Importar fórmula" visible={importando} onHide={() => setImportando(false)} className="w-[min(40rem,calc(100vw-1rem))]">
        <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-gray-200">
          {(
            [
              ["modelos", "Modelos"],
              ["consultas", "Consultas do paciente"],
              ["outros", "Outros pacientes"],
            ] as [Aba, string][]
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => {
                if (valor === aba) return;
                setAba(valor);
                setEscolhida(null);
                setOpcoes(null);
              }}
              className={`rounded-t-md px-3 py-2 text-sm ${aba === valor ? "border-b-2 border-primary-700 font-semibold text-primary-800" : "text-gray-600"}`}
            >
              {rotulo}
            </button>
          ))}
        </div>
        <InputText aria-label="Pesquisar fórmula" placeholder="Pesquisar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-2 w-full" />
        {opcoes === null ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : opcoes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma fórmula encontrada.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {opcoes.map((o) => (
              <li key={o.id}>
                <label className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm ${escolhida?.id === o.id ? "border-primary-400 bg-primary-50" : "border-gray-200"}`}>
                  <RadioButton checked={escolhida?.id === o.id} onChange={() => setEscolhida(o)} />
                  {o.rotulo}
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" label="Cancelar" text onClick={() => setImportando(false)} />
          <Button type="button" icon="pi pi-download" label="Importar" disabled={!escolhida} onClick={importar} />
        </div>
      </Dialog>
    </div>
  );
}

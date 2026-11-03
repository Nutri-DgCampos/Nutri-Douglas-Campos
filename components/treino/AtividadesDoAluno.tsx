"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputNumber } from "primereact/inputnumber";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Skeleton } from "primereact/skeleton";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { SITUACOES, type RelatoDeDesconforto as Relato } from "@/lib/treino";
import {
  CATEGORIAS_DE_BICICLETA,
  CATEGORIAS_DE_CONSUMO,
  UNIDADES,
  ritmo,
  rotuloDoConsumo,
  tenisNoLimite,
  textoDaDuracao,
  velocidade,
  type Atividade,
  type Consumo,
  type Equipamento,
  type Modalidade,
} from "@/lib/treinoAtividades";
import RelatoDeDesconforto from "@/components/treino/RelatoDeDesconforto";
import { textoDosMinutos, type SessaoEndurance } from "@/lib/treinoEndurance";

// "Meu treino" do aluno, corrida e ciclismo (T4b): registrar corrida ou
// pedal com tênis ou bicicleta, números do relógio, consumo durante o treino
// e observação. Nada é obrigatório além da data; nada é estimado.

type AtividadeNaTela = Atividade & { id: string; equipamento: string | null };
type Planejada = SessaoEndurance & { modalidade: Modalidade; prescricao_id: string; referencia: number; data: string; titulo: string | null };
type Dados = { atividades: AtividadeNaTela[]; equipamentos: Equipamento[]; planejadas: Planejada[]; hoje: string; primeiroDia: string };

const ROTULO_DA_SITUACAO = Object.fromEntries(SITUACOES.map((s) => [s.valor, s.rotulo]));
const dataCurta = (iso: string) => iso.split("-").reverse().slice(0, 2).join("/");

function novaAtividade(modalidade: Modalidade, hoje: string, equipamentos: Equipamento[]): Atividade {
  const ativos = equipamentos.filter((e) => !e.aposentado_em && e.tipo === (modalidade === "corrida" ? "tenis" : "bicicleta"));
  return {
    chave_cliente: crypto.randomUUID(),
    modalidade,
    data: hoje,
    situacao: "concluido",
    data_efetiva: null,
    motivo: null,
    observacao: null,
    // Com um só tênis (ou bicicleta), já vem escolhido.
    equipamento_id: ativos.length === 1 ? ativos[0].id : null,
    distancia_km: null,
    duracao_segundos: null,
    fc_media: null,
    fc_max: null,
    rpe: null,
    kcal: null,
    elevacao_m: null,
    potencia_media: null,
    potencia_normalizada: null,
    cadencia_media: null,
    tss: null,
    consumos: [],
  };
}

async function chamar(url: string, metodo: string, corpo?: unknown) {
  const r = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  }).catch(() => null);
  if (!r) {
    avisar("Sem conexão. Tente de novo quando a internet voltar.", "error");
    return null;
  }
  const dados = await r.json().catch(() => null);
  if (!r.ok) {
    avisar(dados?.erro ?? "Não foi possível salvar.", "error");
    return null;
  }
  return dados ?? {};
}

export default function AtividadesDoAluno({
  onRelatarDesconforto,
  onAlterado,
}: {
  onRelatarDesconforto: (relato: Relato) => Promise<string | null>;
  // Calorias da semana mudaram (o painel de musculação mostra o total).
  onAlterado?: () => void;
}) {
  const [dados, setDados] = useState<Dados | null | undefined>(undefined);
  const [editando, setEditando] = useState<Atividade | null>(null);
  const [equipamento, setEquipamento] = useState<{ tipo: "tenis" | "bicicleta"; id?: string; apelido: string; marca: string; modelo: string; categoria: string | null; km_inicial: number | null; inicio_uso: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [relatando, setRelatando] = useState(false);

  useEffect(() => {
    fetch("/api/area-paciente/treino/atividades", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Dados>) : null))
      .then(setDados)
      .catch(() => setDados(null));
  }, []);

  if (dados === undefined) return <Skeleton height="10rem" borderRadius="16px" />;
  if (dados === null) return null;

  const noLimite = dados.equipamentos.filter((e) => !e.aposentado_em && tenisNoLimite(e));

  async function salvarAtividade() {
    if (!editando) return;
    setSalvando(true);
    const r = await chamar("/api/area-paciente/treino/atividades", "PUT", editando);
    setSalvando(false);
    if (!r) return;
    setDados((d) => (d ? { ...d, atividades: r.atividades, equipamentos: r.equipamentos } : d));
    setEditando(null);
    avisar(editando.modalidade === "corrida" ? "Corrida registrada." : "Pedal registrado.", "success");
    onAlterado?.();
  }

  async function excluir(a: AtividadeNaTela) {
    if (!(await pedirConfirmacao("Apagar este registro? Use só para registro feito por engano.", { aceitar: "Apagar", rejeitar: "Cancelar" }))) return;
    const r = await chamar(`/api/area-paciente/treino/atividades/${a.id}`, "DELETE");
    if (!r) return;
    setDados((d) => (d ? { ...d, atividades: d.atividades.filter((x) => x.id !== a.id) } : d));
    setEditando(null);
    onAlterado?.();
    // A quilometragem dos equipamentos muda: recarrega.
    const novos = await fetch("/api/area-paciente/treino/atividades", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (novos) setDados(novos);
  }

  async function salvarEquipamento() {
    if (!equipamento) return;
    setSalvando(true);
    const { id, ...corpo } = equipamento;
    const r = await chamar(id ? `/api/area-paciente/treino/equipamentos/${id}` : "/api/area-paciente/treino/equipamentos", id ? "PATCH" : "POST", corpo);
    setSalvando(false);
    if (!r) return;
    setDados((d) => (d ? { ...d, equipamentos: r.equipamentos } : d));
    // Cadastrado durante um registro: já fica escolhido.
    if (!id && r.id && editando) setEditando({ ...editando, equipamento_id: r.id });
    setEquipamento(null);
  }

  async function aposentar(e: Equipamento) {
    const r = await chamar(`/api/area-paciente/treino/equipamentos/${e.id}`, "PATCH", { acao: e.aposentado_em ? "reativar" : "aposentar" });
    if (r) setDados((d) => (d ? { ...d, equipamentos: r.equipamentos } : d));
  }

  const editavel = (a: AtividadeNaTela) => a.data >= dados.primeiroDia;

  return (
    <section className="cartao p-4 sm:p-5" aria-label="Corrida e ciclismo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-gray-900">Corrida e ciclismo</h2>
          <p className="text-sm text-gray-500">Registre com os números do seu relógio ou app. Tudo é opcional, menos a data.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" icon="pi pi-plus" label="Registrar corrida" size="small" onClick={() => setEditando(novaAtividade("corrida", dados.hoje, dados.equipamentos))} />
          <Button type="button" icon="pi pi-plus" label="Registrar pedal" size="small" outlined onClick={() => setEditando(novaAtividade("ciclismo", dados.hoje, dados.equipamentos))} />
        </div>
      </div>

      {dados.planejadas.length ? (
        <div className="mt-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3">
          <h3 className="text-sm font-bold text-gray-900">Planejado para esta semana</h3>
          <ul className="mt-1 divide-y divide-primary-100">
            {dados.planejadas.map((p) => {
              const feita = dados.atividades.find((a) => a.prescricao_id === p.prescricao_id && a.sessao_indice === p.referencia);
              const alvo = [
                p.distancia_km !== null ? `${p.distancia_km.toLocaleString("pt-BR")} km` : null,
                p.duracao_min !== null ? textoDosMinutos(p.duracao_min) : null,
                p.zona,
                p.ritmo_alvo ? `ritmo ${p.ritmo_alvo}` : null,
                p.fc_alvo ? `FC ${p.fc_alvo}` : null,
                p.potencia_alvo,
              ].filter(Boolean);
              return (
                <li key={`${p.prescricao_id}-${p.referencia}`} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900">
                      {p.modalidade === "corrida" ? "Corrida" : "Pedal"} · {dataCurta(p.data)} · {p.tipo}
                    </span>
                    <span className="ml-auto">
                      {feita ? (
                        <Button type="button" size="small" text icon="pi pi-check" label="Registrado" onClick={() => editavel(feita) && setEditando({ ...feita })} />
                      ) : p.data <= dados.hoje && p.data >= dados.primeiroDia ? (
                        <Button
                          type="button"
                          size="small"
                          outlined
                          label="Registrar"
                          onClick={() => setEditando({ ...novaAtividade(p.modalidade, p.data, dados.equipamentos), prescricao_id: p.prescricao_id, sessao_indice: p.referencia })}
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{p.data > dados.hoje ? "A fazer" : "Sem registro"}</span>
                      )}
                    </span>
                  </div>
                  <p className="text-gray-700">{p.descricao}</p>
                  {alvo.length ? <p className="text-xs text-gray-500">{alvo.join(" · ")}</p> : null}
                  {p.blocos.length ? (
                    <p className="text-xs text-gray-500">
                      {p.blocos.map((b) => [b.repeticoes ? `${b.repeticoes}×` : null, b.descricao, b.duracao_min !== null ? `${b.duracao_min} min` : null, b.distancia_km !== null ? `${b.distancia_km} km` : null, b.intensidade].filter(Boolean).join(" ")).join(" → ")}
                    </p>
                  ) : null}
                  {p.observacao ? <p className="text-xs text-primary-800">{p.observacao}</p> : null}
                  {p.alternativa ? <p className="text-xs text-gray-600">Opção: {p.alternativa.descricao}</p> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {noLimite.map((e) => (
        <p key={e.id} className="mt-3 rounded-xl bg-atencao-50 px-3 py-2 text-sm text-atencao-700" role="status">
          <i className="pi pi-exclamation-triangle mr-1" aria-hidden />
          O tênis <strong>{e.apelido}</strong> chegou a {e.km_total.toLocaleString("pt-BR")} km (limite de {e.alerta_km?.toLocaleString("pt-BR")} km). Converse com seu profissional sobre a troca.
        </p>
      ))}

      {dados.atividades.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">Nenhuma corrida ou pedal registrado nas últimas semanas.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {dados.atividades.slice(0, 20).map((a) => (
            <li key={a.id}>
              <button
                type="button"
                disabled={!editavel(a)}
                onClick={() => setEditando({ ...a })}
                className="flex w-full items-center gap-3 py-2.5 text-left enabled:hover:bg-primary-50 disabled:cursor-default"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                  <i className={`pi ${a.modalidade === "corrida" ? "pi-directions-alt" : "pi-sync"}`} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">
                    {a.modalidade === "corrida" ? "Corrida" : "Pedal"} · {dataCurta(a.data)}
                    {a.situacao && a.situacao !== "concluido" ? <span className="ml-2 text-xs font-semibold text-atencao-700">{ROTULO_DA_SITUACAO[a.situacao]}</span> : null}
                  </span>
                  <span className="block truncate text-sm text-gray-500">
                    {[
                      a.distancia_km !== null ? `${a.distancia_km.toLocaleString("pt-BR")} km` : null,
                      a.duracao_segundos !== null ? textoDaDuracao(a.duracao_segundos) : null,
                      a.modalidade === "corrida" ? ritmo(a.distancia_km, a.duracao_segundos) : velocidade(a.distancia_km, a.duracao_segundos),
                      a.equipamento,
                      a.consumos.length ? `${a.consumos.length} ${a.consumos.length === 1 ? "item consumido" : "itens consumidos"}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Sem números"}
                  </span>
                </span>
                {editavel(a) ? <i className="pi pi-chevron-right text-gray-400" aria-hidden /> : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gray-900">Meus tênis e bicicletas</h3>
          <div className="flex gap-1">
            <Button type="button" text size="small" icon="pi pi-plus" label="Tênis" onClick={() => setEquipamento({ tipo: "tenis", apelido: "", marca: "", modelo: "", categoria: null, km_inicial: null, inicio_uso: "" })} />
            <Button type="button" text size="small" icon="pi pi-plus" label="Bicicleta" onClick={() => setEquipamento({ tipo: "bicicleta", apelido: "", marca: "", modelo: "", categoria: "estrada", km_inicial: null, inicio_uso: "" })} />
          </div>
        </div>
        {dados.equipamentos.length === 0 ? (
          <p className="text-sm text-gray-500">Cadastre para acompanhar a quilometragem de cada um.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm">
            {dados.equipamentos.map((e) => (
              <li key={e.id} className={`flex flex-wrap items-center gap-2 ${e.aposentado_em ? "opacity-60" : ""}`}>
                <i className={`pi ${e.tipo === "tenis" ? "pi-directions-alt" : "pi-sync"} text-gray-400`} aria-hidden />
                <span className="font-semibold text-gray-900">{e.apelido}</span>
                <span className="text-gray-500">
                  {[e.marca, e.modelo, e.categoria ? CATEGORIAS_DE_BICICLETA.find((c) => c.valor === e.categoria)?.rotulo : null].filter(Boolean).join(" ")}
                </span>
                <span className="ml-auto flex shrink-0 items-center">
                <span className={`tabular-nums ${tenisNoLimite(e) ? "font-semibold text-atencao-700" : "text-gray-700"}`}>
                  {e.km_total.toLocaleString("pt-BR")} km{e.tipo === "tenis" && e.alerta_km ? ` / ${e.alerta_km.toLocaleString("pt-BR")}` : ""}
                </span>
                <Button
                  type="button"
                  text
                  size="small"
                  icon="pi pi-pencil"
                  aria-label={`Editar ${e.apelido}`}
                  onClick={() =>
                    setEquipamento({ tipo: e.tipo, id: e.id, apelido: e.apelido, marca: e.marca ?? "", modelo: e.modelo ?? "", categoria: e.categoria, km_inicial: e.km_inicial, inicio_uso: e.inicio_uso ?? "" })
                  }
                />
                <Button type="button" text size="small" severity="secondary" label={e.aposentado_em ? "Reativar" : "Aposentar"} onClick={() => aposentar(e)} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editando ? (
        <JanelaDaAtividade
          atividade={editando}
          equipamentos={dados.equipamentos}
          hoje={dados.hoje}
          primeiroDia={dados.primeiroDia}
          salvando={salvando}
          existente={dados.atividades.find((a) => a.chave_cliente === editando.chave_cliente)}
          onAlterar={setEditando}
          onSalvar={salvarAtividade}
          onFechar={() => setEditando(null)}
          onExcluir={excluir}
          onNovoEquipamento={() =>
            setEquipamento({
              tipo: editando.modalidade === "corrida" ? "tenis" : "bicicleta",
              apelido: "",
              marca: "",
              modelo: "",
              categoria: editando.modalidade === "ciclismo" ? "estrada" : null,
              km_inicial: null,
              inicio_uso: "",
            })
          }
          onRelatar={() => setRelatando(true)}
        />
      ) : null}

      <Dialog
        header={equipamento?.id ? "Editar equipamento" : equipamento?.tipo === "tenis" ? "Cadastrar tênis" : "Cadastrar bicicleta"}
        visible={Boolean(equipamento)}
        onHide={() => setEquipamento(null)}
        className="w-full max-w-md"
        modal
      >
        {equipamento ? (
          <div className="space-y-3">
            <Campo rotulo="Nome para você reconhecer">
              <InputText value={equipamento.apelido} maxLength={60} placeholder={equipamento.tipo === "tenis" ? "Ex.: Tênis azul de treino" : "Ex.: Speed"} onChange={(e) => setEquipamento({ ...equipamento, apelido: e.target.value })} className="w-full" aria-label="Nome do equipamento" />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Marca (opcional)">
                <InputText value={equipamento.marca} maxLength={60} onChange={(e) => setEquipamento({ ...equipamento, marca: e.target.value })} className="w-full" aria-label="Marca" />
              </Campo>
              <Campo rotulo="Modelo (opcional)">
                <InputText value={equipamento.modelo} maxLength={60} onChange={(e) => setEquipamento({ ...equipamento, modelo: e.target.value })} className="w-full" aria-label="Modelo" />
              </Campo>
            </div>
            {equipamento.tipo === "bicicleta" ? (
              <Campo rotulo="Tipo">
                <Dropdown value={equipamento.categoria} options={CATEGORIAS_DE_BICICLETA.map((c) => ({ label: c.rotulo, value: c.valor }))} onChange={(e) => setEquipamento({ ...equipamento, categoria: e.value })} className="w-full" aria-label="Tipo de bicicleta" />
              </Campo>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Km que já tinha (opcional)">
                <InputNumber value={equipamento.km_inicial} onValueChange={(e) => setEquipamento({ ...equipamento, km_inicial: e.value ?? null })} min={0} max={100000} maxFractionDigits={1} locale="pt-BR" suffix=" km" className="w-full" inputClassName="w-full" aria-label="Quilometragem inicial" />
              </Campo>
              <Campo rotulo="Começou a usar em (opcional)">
                <InputText type="date" value={equipamento.inicio_uso} onChange={(e) => setEquipamento({ ...equipamento, inicio_uso: e.target.value })} className="w-full" aria-label="Início do uso" />
              </Campo>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" label="Cancelar" text onClick={() => setEquipamento(null)} />
              <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} disabled={!equipamento.apelido.trim()} onClick={salvarEquipamento} />
            </div>
          </div>
        ) : null}
      </Dialog>

      <RelatoDeDesconforto visivel={relatando} dia={null} exercicios={editando ? [editando.modalidade === "corrida" ? "Corrida" : "Pedal"] : []} onFechar={() => setRelatando(false)} onEnviar={onRelatarDesconforto} />
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{rotulo}</span>
      {children}
    </label>
  );
}

function Numero({ rotulo, valor, onChange, sufixo, max, decimais = 0 }: { rotulo: string; valor: number | null; onChange: (v: number | null) => void; sufixo?: string; max: number; decimais?: number }) {
  return (
    <Campo rotulo={rotulo}>
      <InputNumber
        value={valor}
        onValueChange={(e) => onChange(e.value ?? null)}
        min={0}
        max={max}
        maxFractionDigits={decimais}
        locale="pt-BR"
        suffix={sufixo}
        className="w-full"
        inputClassName="w-full"
        aria-label={rotulo}
      />
    </Campo>
  );
}

function JanelaDaAtividade({
  atividade: a,
  equipamentos,
  hoje,
  primeiroDia,
  salvando,
  existente,
  onAlterar,
  onSalvar,
  onFechar,
  onExcluir,
  onNovoEquipamento,
  onRelatar,
}: {
  atividade: Atividade;
  equipamentos: Equipamento[];
  hoje: string;
  primeiroDia: string;
  salvando: boolean;
  existente: AtividadeNaTela | undefined;
  onAlterar: (a: Atividade) => void;
  onSalvar: () => void;
  onFechar: () => void;
  onExcluir: (a: AtividadeNaTela) => void;
  onNovoEquipamento: () => void;
  onRelatar: () => void;
}) {
  const corrida = a.modalidade === "corrida";
  const alterar = (m: Partial<Atividade>) => onAlterar({ ...a, ...m });
  const opcoes = equipamentos
    .filter((e) => e.tipo === (corrida ? "tenis" : "bicicleta") && (!e.aposentado_em || e.id === a.equipamento_id))
    .map((e) => ({ label: `${e.apelido} (${e.km_total.toLocaleString("pt-BR")} km)`, value: e.id }));
  const segundos = a.duracao_segundos ?? 0;
  const partes = { h: Math.floor(segundos / 3600), m: Math.floor((segundos % 3600) / 60), s: segundos % 60 };
  const definirDuracao = (p: Partial<typeof partes>) => {
    const n = { ...partes, ...p };
    const total = n.h * 3600 + n.m * 60 + n.s;
    alterar({ duracao_segundos: total || null });
  };
  const alterarConsumo = (i: number, m: Partial<Consumo>) => alterar({ consumos: a.consumos.map((c, j) => (j === i ? { ...c, ...m } : c)) });
  const derivado = corrida ? ritmo(a.distancia_km, a.duracao_segundos) : velocidade(a.distancia_km, a.duracao_segundos);

  return (
    <Dialog header={existente ? (corrida ? "Corrida registrada" : "Pedal registrado") : corrida ? "Registrar corrida" : "Registrar pedal"} visible onHide={onFechar} className="w-[44rem] max-w-[calc(100vw-1rem)]" modal>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Data">
            <InputText type="date" value={a.data} min={primeiroDia} max={hoje} onChange={(e) => alterar({ data: e.target.value })} className="w-full" aria-label="Data da atividade" />
          </Campo>
          <Campo rotulo={corrida ? "Tênis" : "Bicicleta"}>
            <div className="flex gap-1">
              <Dropdown value={a.equipamento_id} options={opcoes} onChange={(e) => alterar({ equipamento_id: e.value ?? null })} showClear placeholder={opcoes.length ? "Escolha" : "Nenhum cadastrado"} className="min-w-0 flex-1" aria-label={corrida ? "Tênis usado" : "Bicicleta usada"} />
              <Button type="button" icon="pi pi-plus" outlined aria-label={corrida ? "Cadastrar tênis" : "Cadastrar bicicleta"} tooltip="Cadastrar novo" onClick={onNovoEquipamento} />
            </div>
          </Campo>
        </div>

        <div role="radiogroup" aria-label="Situação" className="flex flex-wrap gap-2">
          {SITUACOES.map((s) => (
            <button
              key={s.valor}
              type="button"
              role="radio"
              aria-checked={a.situacao === s.valor}
              onClick={() => alterar({ situacao: a.situacao === s.valor ? null : s.valor })}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${a.situacao === s.valor ? "border-primary-700 bg-primary-700 text-white" : "border-gray-300 bg-white text-gray-700"}`}
            >
              {s.rotulo}
            </button>
          ))}
        </div>
        {a.situacao === "reagendado" ? (
          <Campo rotulo="Nova data">
            <InputText type="date" value={a.data_efetiva ?? ""} onChange={(e) => alterar({ data_efetiva: e.target.value || null })} className="w-48" aria-label="Nova data" />
          </Campo>
        ) : null}
        {a.situacao && a.situacao !== "concluido" ? (
          <Campo rotulo="Motivo (opcional)">
            <InputText value={a.motivo ?? ""} maxLength={500} onChange={(e) => alterar({ motivo: e.target.value || null })} className="w-full" aria-label="Motivo" />
          </Campo>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero rotulo="Distância" valor={a.distancia_km} onChange={(v) => alterar({ distancia_km: v })} sufixo=" km" max={1000} decimais={2} />
          <Campo rotulo="Tempo (h, min, s)">
            <div className="flex gap-1">
              <InputNumber value={partes.h || null} onValueChange={(e) => definirDuracao({ h: e.value ?? 0 })} min={0} max={47} placeholder="h" inputClassName="w-full px-2 text-center" className="w-full" aria-label="Horas" />
              <InputNumber value={partes.m || null} onValueChange={(e) => definirDuracao({ m: e.value ?? 0 })} min={0} max={59} placeholder="min" inputClassName="w-full px-2 text-center" className="w-full" aria-label="Minutos" />
              <InputNumber value={partes.s || null} onValueChange={(e) => definirDuracao({ s: e.value ?? 0 })} min={0} max={59} placeholder="s" inputClassName="w-full px-2 text-center" className="w-full" aria-label="Segundos" />
            </div>
          </Campo>
          <Numero rotulo="FC média" valor={a.fc_media} onChange={(v) => alterar({ fc_media: v })} sufixo=" bpm" max={250} />
          <Numero rotulo="FC máxima" valor={a.fc_max} onChange={(v) => alterar({ fc_max: v })} sufixo=" bpm" max={250} />
          <Numero rotulo="Esforço (RPE 0 a 10)" valor={a.rpe} onChange={(v) => alterar({ rpe: v })} max={10} decimais={1} />
          <Numero rotulo="Calorias" valor={a.kcal} onChange={(v) => alterar({ kcal: v })} sufixo=" kcal" max={20000} />
          <Numero rotulo="Ganho de altitude" valor={a.elevacao_m} onChange={(v) => alterar({ elevacao_m: v })} sufixo=" m" max={20000} />
          {!corrida ? (
            <>
              <Numero rotulo="Potência média" valor={a.potencia_media} onChange={(v) => alterar({ potencia_media: v })} sufixo=" W" max={3000} />
              <Numero rotulo="Potência normalizada" valor={a.potencia_normalizada} onChange={(v) => alterar({ potencia_normalizada: v })} sufixo=" W" max={3000} />
              <Numero rotulo="Cadência média" valor={a.cadencia_media} onChange={(v) => alterar({ cadencia_media: v })} sufixo=" rpm" max={250} />
              <Numero rotulo="TSS (do aparelho)" valor={a.tss} onChange={(v) => alterar({ tss: v })} max={2000} decimais={1} />
            </>
          ) : null}
        </div>
        {derivado ? <p className="text-sm text-gray-600">{corrida ? "Ritmo" : "Velocidade média"}: <strong>{derivado}</strong> (conta da distância e do tempo que você informou)</p> : null}

        <div className="rounded-xl border border-gray-200 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-900">Hidratação e alimentação durante o treino</p>
            <Button
              type="button"
              text
              size="small"
              icon="pi pi-plus"
              label="Item"
              onClick={() => alterar({ consumos: [...a.consumos, { horario: null, minuto: null, categoria: "agua", descricao: null, quantidade: null, unidade: "mL", observacao: null }] })}
            />
          </div>
          {a.consumos.length === 0 ? <p className="text-xs text-gray-500">Opcional. Ex.: água 500 mL aos 30 min, gel 1 unidade às 7h40.</p> : null}
          <ul className="space-y-2">
            {a.consumos.map((c, i) => (
              <li key={i} className="grid grid-cols-2 gap-1.5 rounded-lg bg-gray-50 p-2 sm:grid-cols-[8rem_1fr_6rem_6.5rem_auto]">
                <Dropdown value={c.categoria} options={CATEGORIAS_DE_CONSUMO.map((x) => ({ label: x.rotulo, value: x.valor }))} onChange={(e) => alterarConsumo(i, { categoria: e.value })} aria-label={`Tipo do item ${i + 1}`} className="w-full" />
                <InputText value={c.descricao ?? ""} maxLength={120} placeholder="Produto (opcional)" onChange={(e) => alterarConsumo(i, { descricao: e.target.value || null })} aria-label={`Produto do item ${i + 1}`} className="w-full" />
                <InputNumber value={c.quantidade} onValueChange={(e) => alterarConsumo(i, { quantidade: e.value ?? null })} min={0} max={100000} maxFractionDigits={1} locale="pt-BR" placeholder="Qtd." aria-label={`Quantidade do item ${i + 1}`} className="w-full" inputClassName="w-full" />
                <Dropdown value={c.unidade} options={[...UNIDADES]} onChange={(e) => alterarConsumo(i, { unidade: e.value })} aria-label={`Unidade do item ${i + 1}`} className="w-full" />
                <Button type="button" icon="pi pi-trash" text severity="danger" aria-label={`Remover item ${i + 1}`} onClick={() => alterar({ consumos: a.consumos.filter((_, j) => j !== i) })} />
                <div className="col-span-2 flex flex-wrap items-center gap-2 text-xs text-gray-600 sm:col-span-5">
                  <span>Quando:</span>
                  <InputText type="time" value={c.horario ?? ""} onChange={(e) => alterarConsumo(i, { horario: e.target.value || null, minuto: e.target.value ? null : c.minuto })} aria-label={`Horário do item ${i + 1}`} className="p-inputtext-sm w-28" />
                  <span>ou aos</span>
                  <InputNumber value={c.minuto} onValueChange={(e) => alterarConsumo(i, { minuto: e.value ?? null, horario: e.value !== null && e.value !== undefined ? null : c.horario })} min={0} max={2880} suffix=" min" aria-label={`Minuto de treino do item ${i + 1}`} inputClassName="p-inputtext-sm w-24" />
                  <span>de treino</span>
                </div>
              </li>
            ))}
          </ul>
          {a.consumos.length ? <p className="mt-1 text-xs text-gray-500">{a.consumos.map(rotuloDoConsumo).join(" · ")}</p> : null}
        </div>

        <Campo rotulo="Observações (opcional)">
          <InputTextarea value={a.observacao ?? ""} maxLength={2000} autoResize rows={2} placeholder="Percurso, clima, tênis, alimentação, como se sentiu" onChange={(e) => alterar({ observacao: e.target.value || null })} className="w-full" aria-label="Observações" />
        </Campo>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" text severity="danger" size="small" icon="pi pi-exclamation-triangle" label="Relatar desconforto" onClick={onRelatar} />
          {existente ? <Button type="button" text size="small" severity="secondary" icon="pi pi-trash" label="Apagar registro" onClick={() => onExcluir(existente)} /> : null}
          <span className="flex-1" />
          <Button type="button" label="Cancelar" outlined severity="secondary" onClick={onFechar} />
          <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={onSalvar} />
        </div>
      </div>
    </Dialog>
  );
}

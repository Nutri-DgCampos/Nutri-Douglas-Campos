"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";
import { formatarData } from "@/lib/nutricao/paciente";

export type OrigemDaImportacao = { tipo: "dieta" | "rotina" | "modelo"; id: string };

type DietaDeOrigem = {
  id: string;
  consulta_data: string;
  titulo: string | null;
  objetivo: string | null;
  refeicoes: number;
  versao: number | null;
  arquivada_em: string | null;
};

type Modelo = { id: string; nome: string; resumo: string | null; quantidade: number | null };

type Aba = "consultas" | "recordatorio" | "outros" | "modelos";

const ABAS: { valor: Aba; rotulo: string }[] = [
  { valor: "consultas", rotulo: "Consultas do paciente" },
  { valor: "recordatorio", rotulo: "Recordatório do paciente" },
  { valor: "outros", rotulo: "Outros pacientes" },
  { valor: "modelos", rotulo: "Modelos salvos" },
];

function ListaDeDietas({
  dietas,
  escolhida,
  onEscolher,
  vazio,
}: {
  dietas: DietaDeOrigem[] | null;
  escolhida: string | null;
  onEscolher: (id: string) => void;
  vazio: string;
}) {
  if (dietas === null) return <p className="text-sm text-gray-500">Carregando…</p>;
  if (dietas.length === 0) return <p className="text-sm text-gray-500">{vazio}</p>;
  return (
    <ul className="max-h-72 space-y-1 overflow-y-auto">
      {dietas.map((d) => (
        <li key={d.id}>
          <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${escolhida === d.id ? "border-primary-400 bg-primary-50" : "border-gray-200"}`}>
            <RadioButton checked={escolhida === d.id} onChange={() => onEscolher(d.id)} />
            <span className="min-w-0 text-sm">
              <span className="block font-semibold text-gray-900">{d.titulo?.trim() || "Sem título"}</span>
              <span className="block text-gray-600">
                Consulta de {formatarData(d.consulta_data)}
                {d.objetivo ? ` · ${d.objetivo}` : ""} · {d.refeicoes} refeição(ões) ·{" "}
                {d.versao ? `enviada (v${d.versao})` : "não enviada"}
                {d.arquivada_em ? " · arquivada" : ""}
              </span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}

// "Importar" (4 origens) e "Importar rotina" (dieta anterior do paciente,
// com os alimentos em cinza). Se a dieta aberta já tem conteúdo, pergunta se
// cria uma nova dieta ou substitui — nada é sobrescrito sem escolha.
export default function JanelaImportar({
  modo,
  dietaId,
  pacienteId,
  temConteudo,
  onFechar,
  onImportar,
}: {
  modo: "importar" | "rotina";
  dietaId: string;
  pacienteId: string;
  temConteudo: boolean;
  onFechar: () => void;
  onImportar: (origem: OrigemDaImportacao, aplicacao: "substituir" | "nova") => Promise<boolean>;
}) {
  const [aba, setAba] = useState<Aba>("consultas");
  const [doPaciente, setDoPaciente] = useState<DietaDeOrigem[] | null>(null);
  const [buscaPaciente, setBuscaPaciente] = useState("");
  const [pacientes, setPacientes] = useState<{ id: string; name: string }[]>([]);
  const [outroPaciente, setOutroPaciente] = useState<{ id: string; name: string } | null>(null);
  const [doOutro, setDoOutro] = useState<DietaDeOrigem[] | null>(null);
  const [buscaModelo, setBuscaModelo] = useState("");
  const [modelos, setModelos] = useState<Modelo[] | null>(null);
  const [escolhida, setEscolhida] = useState<OrigemDaImportacao | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [aplicacao, setAplicacao] = useState<"substituir" | "nova">("nova");
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    fetch(`/api/nutricao/importacao/dietas?paciente=${pacienteId}&exceto=${dietaId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { dietas: [] }))
      .then((dados) => setDoPaciente(dados.dietas ?? []))
      .catch(() => setDoPaciente([]));
  }, [pacienteId, dietaId]);

  useEffect(() => {
    if (modo !== "importar" || aba !== "modelos") return;
    const temporizador = setTimeout(() => {
      fetch(`/api/nutricao/modelos?tipo=dieta&q=${encodeURIComponent(buscaModelo)}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { modelos: [] }))
        .then((dados) => setModelos(dados.modelos ?? []))
        .catch(() => setModelos([]));
    }, 250);
    return () => clearTimeout(temporizador);
  }, [modo, aba, buscaModelo]);

  useEffect(() => {
    if (buscaPaciente.trim().length < 2) return;
    const temporizador = setTimeout(() => {
      fetch(`/api/nutricao/importacao/pacientes?q=${encodeURIComponent(buscaPaciente)}&exceto=${pacienteId}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { pacientes: [] }))
        .then((dados) => setPacientes(dados.pacientes ?? []))
        .catch(() => setPacientes([]));
    }, 300);
    return () => clearTimeout(temporizador);
  }, [buscaPaciente, pacienteId]);

  function escolherOutroPaciente(paciente: { id: string; name: string }) {
    setOutroPaciente(paciente);
    setDoOutro(null);
    setEscolhida(null);
    fetch(`/api/nutricao/importacao/dietas?paciente=${paciente.id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { dietas: [] }))
      .then((dados) => setDoOutro(dados.dietas ?? []))
      .catch(() => setDoOutro([]));
  }

  async function concluir(escolhaDeAplicacao: "substituir" | "nova") {
    if (!escolhida || importando) return;
    setImportando(true);
    const ok = await onImportar(escolhida, escolhaDeAplicacao);
    setImportando(false);
    if (ok) onFechar();
  }

  const titulo = modo === "rotina" ? "Importar rotina do paciente" : "Importar dieta";
  const tipoDieta = modo === "rotina" ? "rotina" : "dieta";

  return (
    <Dialog
      header={titulo}
      visible
      onHide={onFechar}
      className="w-[min(42rem,calc(100vw-1rem))]"
      footer={
        confirmando ? (
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setConfirmando(false)} disabled={importando} />
            <Button type="button" label="Importar" icon="pi pi-check" loading={importando} onClick={() => concluir(aplicacao)} />
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={onFechar} />
            <Button
              type="button"
              label="Importar"
              icon="pi pi-download"
              disabled={!escolhida}
              loading={importando}
              onClick={() => (temConteudo ? setConfirmando(true) : concluir("substituir"))}
            />
          </div>
        )
      }
    >
      {confirmando ? (
        <div>
          <p className="text-gray-800">A dieta aberta já tem conteúdo. O que fazer?</p>
          <label className="mt-3 flex items-start gap-2">
            <RadioButton checked={aplicacao === "nova"} onChange={() => setAplicacao("nova")} />
            <span>
              Criar uma nova dieta com o conteúdo importado
              <span className="block text-xs text-gray-500">Abre em outra aba; a dieta atual fica como está.</span>
            </span>
          </label>
          <label className="mt-2 flex items-start gap-2">
            <RadioButton checked={aplicacao === "substituir"} onChange={() => setAplicacao("substituir")} />
            <span>
              Substituir o conteúdo da dieta aberta
              <span className="block text-xs text-gray-500">
                Refeições, alimentos{modo === "importar" ? ", observações e hidratação" : ""} atuais são trocados. Pode voltar à
                última versão salva, se houver.
              </span>
            </span>
          </label>
        </div>
      ) : modo === "rotina" ? (
        <div>
          <p className="mb-3 text-sm text-gray-600">
            Traz refeições, horários, alimentos, quantidades e substituições de uma dieta anterior do paciente. Os alimentos chegam
            em cinza: ficam fora dos totais, do PDF e da área do paciente até você confirmar cada um. Observações não são trazidas.
          </p>
          <ListaDeDietas
            dietas={doPaciente}
            escolhida={escolhida?.id ?? null}
            onEscolher={(id) => setEscolhida({ tipo: "rotina", id })}
            vazio="Este paciente não tem outra dieta para usar como rotina."
          />
        </div>
      ) : (
        <div>
          <div role="tablist" className="mb-3 flex flex-wrap gap-1 border-b border-gray-200">
            {ABAS.map((item) => (
              <button
                key={item.valor}
                type="button"
                role="tab"
                aria-selected={aba === item.valor}
                onClick={() => {
                  setAba(item.valor);
                  setEscolhida(null);
                }}
                className={`rounded-t-md px-3 py-2 text-sm ${aba === item.valor ? "border-b-2 border-primary-700 font-semibold text-primary-800" : "text-gray-600"}`}
              >
                {item.rotulo}
              </button>
            ))}
          </div>

          {aba === "consultas" ? (
            <ListaDeDietas
              dietas={doPaciente}
              escolhida={escolhida?.id ?? null}
              onEscolher={(id) => setEscolhida({ tipo: tipoDieta, id })}
              vazio="Este paciente não tem outras dietas."
            />
          ) : null}

          {aba === "recordatorio" ? (
            <p className="text-sm text-gray-600">
              O recordatório alimentar do paciente chega com a Fase 5 (anamnese e recordatório). Quando estiver disponível, os
              alimentos informados pelo paciente poderão ser importados aqui, em cinza, até serem vinculados à base.
            </p>
          ) : null}

          {aba === "outros" ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Só a estrutura alimentar é copiada. O peso e os dados do paciente de origem não vêm; revise os textos das observações.
              </p>
              <InputText
                aria-label="Buscar paciente"
                placeholder="Nome do paciente"
                value={buscaPaciente}
                onChange={(e) => setBuscaPaciente(e.target.value)}
                className="w-full"
              />
              {!outroPaciente ? (
                <ul className="max-h-40 overflow-y-auto">
                  {buscaPaciente.trim().length >= 2 && pacientes.length === 0 ? (
                    <li className="text-sm text-gray-500">Nenhum paciente com dietas encontrado.</li>
                  ) : null}
                  {pacientes.map((p) => (
                    <li key={p.id}>
                      <button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-gray-100" onClick={() => escolherOutroPaciente(p)}>
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-gray-900">{outroPaciente.name}</span>
                    <Button type="button" label="Trocar paciente" text size="small" onClick={() => setOutroPaciente(null)} />
                  </div>
                  <ListaDeDietas
                    dietas={doOutro}
                    escolhida={escolhida?.id ?? null}
                    onEscolher={(id) => setEscolhida({ tipo: "dieta", id })}
                    vazio="Este paciente não tem dietas."
                  />
                </div>
              )}
            </div>
          ) : null}

          {aba === "modelos" ? (
            <div className="space-y-3">
              <InputText
                aria-label="Buscar modelo de dieta"
                placeholder="Buscar modelo de dieta"
                value={buscaModelo}
                onChange={(e) => setBuscaModelo(e.target.value)}
                className="w-full"
              />
              {modelos === null ? (
                <p className="text-sm text-gray-500">Carregando…</p>
              ) : modelos.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum modelo de dieta encontrado.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {modelos.map((m) => (
                    <li key={m.id}>
                      <label className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${escolhida?.id === m.id ? "border-primary-400 bg-primary-50" : "border-gray-200"}`}>
                        <RadioButton checked={escolhida?.id === m.id} onChange={() => setEscolhida({ tipo: "modelo", id: m.id })} />
                        <span className="text-sm">
                          <span className="block font-semibold text-gray-900">{m.nome}</span>
                          <span className="block text-gray-600">
                            {m.resumo ? `${m.resumo} · ` : ""}
                            {m.quantidade ?? 0} refeição(ões)
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

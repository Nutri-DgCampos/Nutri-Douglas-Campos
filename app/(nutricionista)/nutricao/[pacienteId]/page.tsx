"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import Selecao from "@/components/Selecao";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { hojeNoBrasil } from "@/lib/cronograma";
import {
  ORIGENS_DE_PESO,
  TIPOS_CONSULTA,
  formatarData,
  idadeEm,
  rotuloDoSexo,
  rotuloDoTipo,
} from "@/lib/nutricao/paciente";

type Paciente = {
  id: string;
  name: string;
  phone: string | null;
  objective: string | null;
  plan: string;
  important_note: string | null;
  birth_date: string | null;
  sex: string | null;
  height_cm: number | null;
  contact_email: string | null;
};

type Consulta = { id: string; data: string; tipo: string; status: string };
type Peso = { data: string; peso: number; origem: string; referencia_id: string };

// Painel geral do paciente no Módulo de Nutrição (abre a partir da ficha do
// paciente ou da tela Dietas). Não abre uma consulta diretamente.
export default function PainelDoPacientePage() {
  const { pacienteId } = useParams<{ pacienteId: string }>();
  const router = useRouter();

  const [paciente, setPaciente] = useState<Paciente | null | undefined>(undefined);
  const [consultas, setConsultas] = useState<Consulta[]>([]);
  const [pesos, setPesos] = useState<Peso[]>([]);
  const [todosOsPesos, setTodosOsPesos] = useState(false);

  const [novaAberta, setNovaAberta] = useState(false);
  const [dataNova, setDataNova] = useState(hojeNoBrasil());
  const [tipoNovo, setTipoNovo] = useState("primeira");
  const [criando, setCriando] = useState(false);
  const [emAndamento, setEmAndamento] = useState<{ id: string; data: string } | null>(null);

  const carregar = useCallback(async () => {
    const [dados, listaConsultas, listaPesos] = await Promise.all([
      api
        .from("patients")
        .select("id, name, phone, objective, plan, important_note, birth_date, sex, height_cm, contact_email")
        .eq("id", pacienteId)
        .maybeSingle(),
      api
        .from("consultas")
        .select("id, data, tipo, status")
        .eq("patient_id", pacienteId)
        .order("data", { ascending: false })
        .order("created_at", { ascending: false }),
      api
        .from("historico_peso")
        .select("data, peso, origem, referencia_id")
        .eq("patient_id", pacienteId)
        .order("data", { ascending: false }),
    ]);

    setPaciente((dados.data as Paciente | null) ?? null);
    setConsultas((listaConsultas.data ?? []) as Consulta[]);
    setPesos((listaPesos.data ?? []) as Peso[]);
  }, [pacienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovaConsulta() {
    setDataNova(hojeNoBrasil());
    setTipoNovo(consultas.length === 0 ? "primeira" : "retorno");
    setNovaAberta(true);
  }

  async function criarConsulta() {
    setCriando(true);

    try {
      const resposta = await fetch("/api/nutricao/consultas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pacienteId, data: dataNova, tipo: tipoNovo }),
      });
      const resultado = await resposta.json().catch(() => null);

      if (resposta.status === 409 && resultado?.consultaEmAndamento) {
        setNovaAberta(false);
        setEmAndamento(resultado.consultaEmAndamento);
        return;
      }

      if (!resposta.ok) {
        avisar(resultado?.erro ?? "Não foi possível criar a consulta.", "error");
        return;
      }

      router.push(`/nutricao/${pacienteId}/consultas/${resultado.id}`);
    } finally {
      setCriando(false);
    }
  }

  if (paciente === undefined) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton height="3rem" width="60%" />
          <Skeleton height="10rem" />
        </div>
      </main>
    );
  }

  if (paciente === null) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <BotaoVoltar rotulo="Voltar ao módulo" onClick={() => router.push("/nutricao")} />
          <h1 className="text-2xl font-bold text-gray-900">Paciente não encontrado</h1>
        </div>
      </main>
    );
  }

  const idade = idadeEm(paciente.birth_date);
  const pesoAtual = pesos[0] ?? null;
  const pesoInicial = pesos.find((peso) => peso.origem === "cadastro") ?? null;
  const pesosVisiveis = todosOsPesos ? pesos : pesos.slice(0, 6);
  const faltando = [
    !paciente.birth_date && "data de nascimento",
    !paciente.sex && "sexo",
    !paciente.height_cm && "altura",
  ].filter(Boolean) as string[];

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar ao módulo" onClick={() => router.push("/nutricao")} />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-primary-700">Módulo de Nutrição</p>
            <h1 className="text-3xl font-bold text-gray-900">{paciente.name}</h1>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              outlined
              icon="pi pi-user"
              label="Ficha do paciente"
              onClick={() => router.push(`/pacientes/${paciente.id}`)}
            />
            <Button type="button" icon="pi pi-plus" label="Nova consulta" onClick={abrirNovaConsulta} />
          </div>
        </div>

        {faltando.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <i className="pi pi-info-circle" aria-hidden />
            <span className="flex-1">
              Faltam {faltando.join(", ")} no cadastro. Eles são usados nos cálculos e nos documentos.
            </span>
            <Link href={`/pacientes/${paciente.id}/editar`} className="font-semibold underline">
              Completar cadastro
            </Link>
          </div>
        )}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Dado titulo="Idade" valor={idade === null ? null : `${idade} anos`} />
          <Dado titulo="Sexo" valor={rotuloDoSexo(paciente.sex)} />
          <Dado
            titulo="Altura"
            valor={paciente.height_cm ? `${Number(paciente.height_cm).toLocaleString("pt-BR")} cm` : null}
          />
          <Dado
            titulo="Peso atual"
            valor={pesoAtual ? `${Number(pesoAtual.peso).toLocaleString("pt-BR")} kg` : null}
            detalhe={pesoAtual ? formatarData(pesoAtual.data) : undefined}
          />
          <Dado titulo="Objetivo" valor={paciente.objective} />
          <Dado titulo="Plano" valor={paciente.plan} />
          <Dado
            titulo="Peso inicial"
            valor={pesoInicial ? `${Number(pesoInicial.peso).toLocaleString("pt-BR")} kg` : null}
          />
          <Dado titulo="E-mail de contato" valor={paciente.contact_email} quebrar />
        </section>

        <section className="cartao mt-4 p-5">
          <h2 className="font-bold text-gray-900">Lembrete importante (cadastro)</h2>
          <p className="mt-2 whitespace-pre-line text-gray-700">
            {paciente.important_note?.trim() || "Nenhum lembrete cadastrado."}
          </p>
        </section>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="cartao overflow-hidden">
            <h2 className="border-b border-gray-200 px-5 py-3 font-bold text-gray-900">Consultas</h2>

            {consultas.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">Nenhuma consulta registrada.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {consultas.map((consulta) => (
                  <li key={consulta.id}>
                    <Link
                      href={`/nutricao/${paciente.id}/consultas/${consulta.id}`}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-primary-50"
                    >
                      <i className="pi pi-folder-open text-lg text-primary-700" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-gray-900">{formatarData(consulta.data)}</span>
                        <span className="block text-sm text-gray-500">{rotuloDoTipo(consulta.tipo)}</span>
                      </span>
                      <Tag
                        value={consulta.status === "em_andamento" ? "Em andamento" : "Finalizada"}
                        severity={consulta.status === "em_andamento" ? "info" : "success"}
                        className="selo-status"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao overflow-hidden">
            <h2 className="border-b border-gray-200 px-5 py-3 font-bold text-gray-900">Histórico de peso</h2>

            {pesos.length === 0 ? (
              <p className="p-5 text-sm text-gray-500">Nenhum peso registrado.</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-gray-500">
                      <th className="px-5 py-2 font-semibold">Data</th>
                      <th className="px-2 py-2 text-right font-semibold">Peso</th>
                      <th className="px-5 py-2 font-semibold">Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pesosVisiveis.map((peso) => (
                      <tr key={`${peso.origem}-${peso.referencia_id}`} className="border-t border-gray-100">
                        <td className="px-5 py-2 text-gray-800">{formatarData(peso.data)}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-gray-900">
                          {Number(peso.peso).toLocaleString("pt-BR")} kg
                        </td>
                        <td className="px-5 py-2 text-gray-500">{ORIGENS_DE_PESO[peso.origem] ?? peso.origem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pesos.length > 6 && (
                  <Button
                    type="button"
                    text
                    size="small"
                    label={todosOsPesos ? "Mostrar menos" : `Ver todos (${pesos.length})`}
                    onClick={() => setTodosOsPesos(!todosOsPesos)}
                    className="m-2"
                  />
                )}
              </>
            )}
          </section>
        </div>
      </div>

      <Dialog
        header="Nova consulta"
        visible={novaAberta}
        onHide={() => !criando && setNovaAberta(false)}
        className="w-[26rem] max-w-[calc(100vw-2rem)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" severity="secondary" outlined onClick={() => setNovaAberta(false)} />
            <Button type="button" label="Criar consulta" icon="pi pi-check" loading={criando} onClick={criarConsulta} />
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="data-consulta" className="mb-2 block text-sm font-semibold text-gray-700">
              Data do atendimento
            </label>
            <InputText
              id="data-consulta"
              type="date"
              value={dataNova}
              onChange={(evento) => setDataNova(evento.target.value)}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-700">Tipo de consulta</label>
            <Selecao value={tipoNovo} onChange={(evento) => setTipoNovo(evento.target.value)} className="w-full">
              {TIPOS_CONSULTA.map((tipo) => (
                <option key={tipo.valor} value={tipo.valor}>
                  {tipo.rotulo}
                </option>
              ))}
            </Selecao>
          </div>
        </div>
      </Dialog>

      <Dialog
        header="Consulta em andamento"
        visible={Boolean(emAndamento)}
        onHide={() => setEmAndamento(null)}
        className="w-[28rem] max-w-[calc(100vw-2rem)]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" severity="secondary" outlined onClick={() => setEmAndamento(null)} />
            <Button
              type="button"
              label="Abrir consulta existente"
              icon="pi pi-folder-open"
              onClick={() => router.push(`/nutricao/${pacienteId}/consultas/${emAndamento?.id}`)}
            />
          </div>
        }
      >
        <p className="text-gray-700">
          Este paciente já possui uma consulta em andamento
          {emAndamento?.data ? ` (${formatarData(emAndamento.data)})` : ""}. Deseja continuar o atendimento existente?
        </p>
      </Dialog>
    </main>
  );
}

function Dado({
  titulo,
  valor,
  detalhe,
  quebrar,
}: {
  titulo: string;
  valor: string | null | undefined;
  detalhe?: string;
  quebrar?: boolean;
}) {
  return (
    <div className="cartao p-4">
      <p className="text-sm text-gray-500">{titulo}</p>
      <p
        className={`mt-1 font-semibold ${valor ? "text-gray-900" : "text-gray-400"} ${quebrar ? "break-all" : "truncate"}`}
      >
        {valor || "Não informado"}
      </p>
      {detalhe && <p className="text-xs text-gray-500">{detalhe}</p>}
    </div>
  );
}

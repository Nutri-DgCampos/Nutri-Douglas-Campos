"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { Button } from "primereact/button";
import { IconField } from "primereact/iconfield";
import { InputIcon } from "primereact/inputicon";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import {
  FAIXAS,
  SEM_REGISTRO,
  SITUACOES,
  diasSemAcesso,
  faixaDeAcesso,
  situacaoDe,
  textoDosDias,
  type Engajamento,
  type Situacao,
} from "@/lib/engajamento";

type Filtro = "todos" | Situacao | (typeof FAIXAS)[number]["faixa"] | "sem_registro";

export default function PacientesPage() {
    const [pacientes, setPacientes] = useState<any[]>([]);
const [busca, setBusca] = useState("");
const [engajamento, setEngajamento] = useState<Record<string, Engajamento>>({});
const [filtro, setFiltro] = useState<Filtro>("todos");
const [ordem, setOrdem] = useState<"recentes" | "sem_acesso">("recentes");

const [solicitacoes, setSolicitacoes] = useState<
  {
    id: string;
    name: string;
    phone: string;
    objective: string;
    status: string;
    created_at: string;
  }[]
>([]);

const [carregandoSolicitacoes, setCarregandoSolicitacoes] =
  useState(false);

const router = useRouter();

async function concluirSolicitacao(id: string) {
  const confirmou = await pedirConfirmacao(
    "Você já cadastrou este paciente? A solicitação será marcada como concluída."
  );

  if (!confirmou) return;

  try {
    const {
      data: { session },
    } = await api.auth.getSession();

    if (!session) {
      avisar("Sua sessão expirou. Entre novamente.");
      return;
    }

    const resposta = await fetch(
      "/api/solicitacoes-pacientes/concluir",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      }
    );

    const resultado = await resposta.json();

    if (!resposta.ok) {
      avisar(resultado.erro || "Não foi possível concluir a solicitação.");
      return;
    }

    setSolicitacoes((anteriores) =>
      anteriores.filter((solicitacao) => solicitacao.id !== id)
    );

    avisar("Solicitação concluída com sucesso!");
  } catch (error) {
    console.error("Erro ao concluir solicitação:", error);
    avisar("Erro de conexão. Tente novamente.");
  }
}

    useEffect(() => {
  async function carregarPacientes() {
    const {
  data: { user },
} = await api.auth.getUser();

if (!user) {
  router.push("/login");
  return;
}

const { data: pacienteLogado } = await api
  .from("patients")
  .select("id")
  .eq("auth_user_id", user.id)
  .maybeSingle();

if (pacienteLogado) {
  router.push("/area-paciente");
  return;
}
    const { data, error } = await api
      .from("patients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao carregar pacientes:", error);
      return;
    }

    setPacientes(data ?? []);

    // Acesso ao app (situação e dias sem acessar); falha aqui não impede a lista.
    fetch("/api/pacientes/engajamento", { cache: "no-store" })
      .then((resposta) => (resposta.ok ? resposta.json() : { pacientes: [] }))
      .then((dados) =>
        setEngajamento(
          Object.fromEntries((dados.pacientes as Engajamento[]).map((e) => [e.id, e]))
        )
      )
      .catch(() => {});

    setCarregandoSolicitacoes(true);

try {
  const {
    data: { session },
  } = await api.auth.getSession();

  if (!session) {
    console.error("Sessão não encontrada.");
  } else {
    const resposta = await fetch("/api/solicitacoes-pacientes", {
      method: "GET",
      cache: "no-store",
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      console.error(
        "Erro ao carregar solicitações:",
        resultado.erro
      );
    } else {
      setSolicitacoes(resultado.solicitacoes ?? []);
    }
  }
} catch (error) {
  console.error("Erro ao consultar solicitações:", error);
} finally {
  setCarregandoSolicitacoes(false);
}
  }

  carregarPacientes();
}, []);

  // Acesso ao app: só pacientes ativos ou pendentes entram nos indicadores.
  const acompanhados = pacientes.filter((p) => p.payment_status === "Ativo" || p.payment_status === "Pendente");

  function indicadoresDe(paciente: { id: string }) {
    const e = engajamento[paciente.id];
    if (!e) return null;
    const dias = e.tem_acesso ? diasSemAcesso(e.ultimo_acesso_em) : null;
    return { e, situacao: situacaoDe(e), dias, faixa: e.tem_acesso ? faixaDeAcesso(dias) : null };
  }

  function contar(teste: (i: NonNullable<ReturnType<typeof indicadoresDe>>) => boolean) {
    return acompanhados.filter((p) => {
      const i = indicadoresDe(p);
      return i ? teste(i) : false;
    }).length;
  }

  const pacientesFiltrados = pacientes
    .filter((paciente) => paciente.name?.toLowerCase().includes(busca.toLowerCase()))
    .filter((paciente) => {
      if (filtro === "todos") return true;
      if (!acompanhados.includes(paciente)) return false;
      const i = indicadoresDe(paciente);
      if (!i) return false;
      if (filtro in SITUACOES) return i.situacao === filtro;
      return i.faixa?.faixa === filtro;
    })
    .sort((a, b) => {
      if (ordem === "recentes") return 0;
      const da = indicadoresDe(a);
      const db = indicadoresDe(b);
      // Mais tempo sem acessar primeiro; nunca acessou antes de todos.
      const valor = (i: ReturnType<typeof indicadoresDe>) =>
        !i ? -2 : !i.e.tem_acesso ? -1 : i.dias === null ? Infinity : i.dias;
      return valor(db) - valor(da);
    });

  const chips: { valor: Filtro; rotulo: string; quantidade: number; ponto?: string }[] = [
    { valor: "todos", rotulo: "Todos", quantidade: pacientes.length },
    ...FAIXAS.map((f) => ({
      valor: f.faixa as Filtro,
      rotulo: `${f.rotulo} (${f.ate === Infinity ? "mais de 30 dias" : `até ${f.ate} dias`})`,
      quantidade: contar((i) => i.faixa?.faixa === f.faixa),
      ponto: f.ponto,
    })),
    {
      valor: "sem_registro",
      rotulo: "Nunca acessou",
      quantidade: contar((i) => i.faixa?.faixa === "sem_registro"),
      ponto: SEM_REGISTRO.ponto,
    },
    ...(Object.keys(SITUACOES) as Situacao[]).map((s) => ({
      valor: s as Filtro,
      rotulo: SITUACOES[s].rotulo,
      quantidade: contar((i) => i.situacao === s),
    })),
  ];

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <CabecalhoPagina
          titulo="Pacientes"
          descricao="Gerencie seus pacientes."
          acao={
            <Button
              type="button"
              label="Novo paciente"
              icon="pi pi-plus"
              onClick={() => router.push("/pacientes/novo")}
            />
          }
        />

        {(carregandoSolicitacoes || solicitacoes.length > 0) && (
          <section className="cartao mt-6 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-gray-900">
                Solicitações de novos pacientes
              </h2>

              {solicitacoes.length > 0 && (
                <Tag value={String(solicitacoes.length)} severity="warning" rounded />
              )}
            </div>

            <p className="mt-1 text-sm text-gray-600">
              Pessoas que solicitaram acompanhamento e ainda não foram
              cadastradas.
            </p>

            {carregandoSolicitacoes ? (
              <Skeleton height="4rem" borderRadius="12px" className="mt-4" />
            ) : (
              <ul className="mt-4 divide-y divide-gray-200">
                {solicitacoes.map((solicitacao) => (
                  <li
                    key={solicitacao.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900">
                        {solicitacao.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        Telefone: {solicitacao.phone}
                      </p>
                      <p className="text-sm text-gray-600">
                        Objetivo: {solicitacao.objective}
                      </p>
                    </div>

                    <Button
                      type="button"
                      label="Marcar como concluído"
                      icon="pi pi-check"
                      size="small"
                      outlined
                      onClick={() => concluirSolicitacao(solicitacao.id)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="cartao mt-6 p-4" aria-label="Acesso dos pacientes ao aplicativo">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold text-gray-900">Acesso ao aplicativo</h2>
            <span className="text-xs text-gray-500">Pacientes ativos e pendentes · toque para filtrar</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip.valor}
                type="button"
                aria-pressed={filtro === chip.valor}
                onClick={() => setFiltro(filtro === chip.valor ? "todos" : chip.valor)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${
                  filtro === chip.valor ? "border-primary-700 bg-primary-700 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {chip.ponto ? <span className={`h-2.5 w-2.5 rounded-full ${chip.ponto}`} aria-hidden /> : null}
                {chip.rotulo}
                <span className="font-semibold">{chip.quantidade}</span>
              </button>
            ))}
          </div>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
        <IconField iconPosition="left" className="min-w-0 flex-1">
          <InputIcon className="pi pi-search" />
          <InputText
            type="search"
            placeholder="Buscar paciente pelo nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full"
          />
        </IconField>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={ordem === "sem_acesso"}
              onChange={(e) => setOrdem(e.target.checked ? "sem_acesso" : "recentes")}
            />
            Mais tempo sem acessar primeiro
          </label>
        </div>

        <ul className="cartao mt-4 divide-y divide-gray-200">
          {pacientesFiltrados.map((paciente) => (
            <li key={paciente.id}>
              <button
                type="button"
                onClick={() => router.push(`/pacientes/${paciente.id}`)}
                className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 sm:gap-4"
              >
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 font-[family-name:var(--fonte-titulo)] font-bold text-primary-800"
                  aria-hidden
                >
                  {(paciente.name ?? "?")
                    .trim()
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((parte: string) => parte[0]?.toUpperCase())
                    .join("")}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-gray-900 sm:truncate">
                    {paciente.name}
                  </span>
                  <span className="block truncate text-sm text-gray-500">
                    {[paciente.objective, `Plano ${String(paciente.plan ?? "").toLowerCase()}`]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                  {(() => {
                    const i = indicadoresDe(paciente);
                    if (!i) return null;
                    return (
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${SITUACOES[i.situacao].classe}`} title={SITUACOES[i.situacao].descricao}>
                          {SITUACOES[i.situacao].rotulo}
                        </span>
                        {i.faixa ? (
                          <span
                            className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${i.faixa.classe}`}
                            title={i.e.ultimo_acesso_em ? `Último acesso: ${new Date(i.e.ultimo_acesso_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Sem registro de acesso"}
                          >
                            <span className={`h-2 w-2 rounded-full ${i.faixa.ponto}`} aria-hidden />
                            {textoDosDias(i.dias)}
                          </span>
                        ) : null}
                        {i.e.app_instalado_em ? (
                          <span className="flex items-center gap-1 text-gray-500" title="Já abriu pelo app instalado">
                            <i className="pi pi-mobile" aria-hidden /> App
                          </span>
                        ) : null}
                      </span>
                    );
                  })()}
                </span>

                <Tag
                  value={paciente.payment_status}
                  severity={
                    paciente.payment_status === "Ativo"
                      ? "success"
                      : paciente.payment_status === "Pendente"
                      ? "warning"
                      : "danger"
                  }
                  className="selo-status"
                />

                <i className="pi pi-chevron-right text-sm text-gray-400" aria-hidden />
              </button>
            </li>
          ))}

          {pacientesFiltrados.length === 0 && (
            <li className="p-6 text-center text-gray-500">
              {pacientes.length === 0
                ? "Nenhum paciente cadastrado ainda."
                : "Nenhum paciente encontrado com esse nome."}
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { RadioButton } from "primereact/radiobutton";
import { Skeleton } from "primereact/skeleton";
import { Tag } from "primereact/tag";
import BotaoVoltar from "@/components/BotaoVoltar";
import Selecao from "@/components/Selecao";
import BuscaAlimento, { type AlimentoEncontrado } from "@/components/nutricao/BuscaAlimento";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import {
  type Composicao,
  formatarNutriente,
  nutrienteDaPorcao,
  quantidadeDasMedidas,
  quantidadeEquivalente,
  textoDoResultado,
} from "@/lib/nutricao/calculo";

type Secao = "dados" | "composicao" | "medidas" | "substituicoes";
type Nutriente = { codigo: string; nome: string; unidade: string; grupo: string; ordem: number };
type Valor = { nutriente: string; valor: number | null; traco: boolean; fonte: string };
type Alimento = {
  id: string;
  nome: string;
  categoria_id: number | null;
  categoria: string | null;
  fonte: string;
  fonte_nome: string;
  codigo_origem: string | null;
  unidade_base: "g" | "ml";
  densidade_g_ml: number | null;
  arquivado: boolean;
};
type MedidaEditavel = { id?: string; nome_singular: string; nome_plural: string; quantidade: string; padrao: boolean };
type MedidaDoSubstituto = { id: string; nome_singular: string; nome_plural: string; quantidade: number; padrao: boolean };
type SubstituicaoEditavel = {
  substitutoId: string;
  nome: string;
  unidade: "g" | "ml";
  composicao: Composicao;
  medidas: MedidaDoSubstituto[];
  quantidadeReferencia: string;
  quantidadeSubstituto: string;
  medidaId: string | null;
  quantidadeMedidas: string;
  observacao: string;
};

const GRUPOS: Record<string, string> = {
  energia: "Energia",
  macronutrientes: "Macronutrientes",
  fibras: "Fibras",
  minerais: "Minerais",
  vitaminas: "Vitaminas",
  acidos_graxos: "Ácidos graxos",
  aminoacidos: "Aminoácidos",
  outros: "Outros",
};

// Grupos com muitos campos, raramente preenchidos: começam recolhidos.
const RECOLHIDOS = ["acidos_graxos", "aminoacidos"];

const MACROS = [
  { codigo: "kcal", rotulo: "kcal" },
  { codigo: "carboidratos", rotulo: "CHO" },
  { codigo: "proteinas", rotulo: "PTN" },
  { codigo: "lipidios", rotulo: "LIP" },
];

const numero = (texto: string) => {
  const valor = Number(texto.replace(",", "."));
  return texto.trim() !== "" && Number.isFinite(valor) ? valor : null;
};
const texto = (valor: number | null | undefined) => (valor == null ? "" : String(valor).replace(".", ","));

export default function AlimentoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const novo = id === "novo";

  const [catalogo, setCatalogo] = useState<Nutriente[]>([]);
  const [categorias, setCategorias] = useState<{ id: number; nome: string }[]>([]);
  const [alimento, setAlimento] = useState<Alimento | null | undefined>(novo ? null : undefined);
  const [valores, setValores] = useState<Record<string, Valor>>({});

  // Formulários
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [unidade, setUnidade] = useState<"g" | "ml">("g");
  const [densidade, setDensidade] = useState("");
  const [composicaoEditada, setComposicaoEditada] = useState<Record<string, string>>({});
  const [medidas, setMedidas] = useState<MedidaEditavel[]>([]);
  const [substituicoes, setSubstituicoes] = useState<SubstituicaoEditavel[]>([]);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Recarrega só as seções indicadas, para não descartar o que ainda não
  // foi salvo nas outras (ex.: salvar medidas não apaga substituições em edição).
  const carregar = useCallback(async (secoes: Secao[] = ["dados", "composicao", "medidas", "substituicoes"]) => {
    if (secoes.includes("dados")) {
      const [nutrientes, listaCategorias] = await Promise.all([
        api.from("nutrientes").select("codigo, nome, unidade, grupo, ordem").order("ordem", { ascending: true }),
        api.from("alimentos_categorias").select("id, nome").order("nome", { ascending: true }),
      ]);
      setCatalogo((nutrientes.data ?? []) as Nutriente[]);
      setCategorias((listaCategorias.data ?? []) as { id: number; nome: string }[]);
    }

    if (novo) return;

    const resposta = await fetch(`/api/nutricao/alimentos/${id}`, { cache: "no-store" });
    if (!resposta.ok) {
      setAlimento(null);
      return;
    }

    const dados = await resposta.json();
    const atual = dados.alimento as Alimento;
    setAlimento(atual);

    if (secoes.includes("dados")) {
      setNome(atual.nome);
      setCategoriaId(atual.categoria_id ? String(atual.categoria_id) : "");
      setUnidade(atual.unidade_base);
      setDensidade(texto(atual.densidade_g_ml));
    }

    if (secoes.includes("composicao") || secoes.includes("dados")) {
      setValores(Object.fromEntries((dados.valores as Valor[]).map((valor) => [valor.nutriente, valor])));
    }
    if (secoes.includes("composicao")) setComposicaoEditada({});

    if (secoes.includes("medidas")) setMedidas(
      (dados.medidas as (MedidaDoSubstituto & { ordem: number })[]).map((medida) => ({
        id: medida.id,
        nome_singular: medida.nome_singular,
        nome_plural: medida.nome_plural,
        quantidade: texto(medida.quantidade),
        padrao: medida.padrao,
      }))
    );

    if (secoes.includes("substituicoes")) setSubstituicoes(
      (dados.substituicoes as Record<string, unknown>[]).map((linha) => ({
        substitutoId: linha.substituto_id as string,
        nome: linha.substituto_nome as string,
        unidade: linha.substituto_unidade as "g" | "ml",
        composicao: (linha.substituto_composicao ?? {}) as Composicao,
        medidas: (linha.substituto_medidas ?? []) as MedidaDoSubstituto[],
        quantidadeReferencia: texto(linha.quantidade_referencia as number),
        quantidadeSubstituto: texto(linha.quantidade_substituto as number),
        medidaId: (linha.medida_caseira_id as string | null) ?? null,
        quantidadeMedidas: texto(linha.quantidade_medidas as number | null),
        observacao: (linha.observacao as string | null) ?? "",
      }))
    );
  }, [id, novo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const importado = Boolean(alimento && alimento.fonte !== "manual");
  const composicaoPrincipal: Composicao = useMemo(
    () => Object.fromEntries(Object.values(valores).map((valor) => [valor.nutriente, { valor: valor.valor, traco: valor.traco }])),
    [valores]
  );

  // ---------------------------------------------------------------- dados
  async function salvarDados() {
    const corpo: Record<string, unknown> = { densidade: densidade.trim() === "" ? null : numero(densidade) };

    if (densidade.trim() !== "" && corpo.densidade === null) {
      avisar("Densidade inválida.", "warn");
      return;
    }

    if (!importado) {
      corpo.nome = nome;
      corpo.categoriaId = categoriaId ? Number(categoriaId) : null;
      corpo.unidadeBase = unidade;
    }

    if (novo) {
      const nutrientes: Record<string, number> = {};
      for (const [codigo, valor] of Object.entries(composicaoEditada)) {
        const convertido = numero(valor);
        if (valor.trim() !== "" && convertido === null) {
          avisar("Há valores de composição inválidos.", "warn");
          return;
        }
        if (convertido !== null) nutrientes[codigo] = convertido;
      }
      corpo.nutrientes = nutrientes;
    }

    setSalvando("dados");
    const resposta = await fetch(novo ? "/api/nutricao/alimentos" : `/api/nutricao/alimentos/${id}`, {
      method: novo ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    const resultado = await resposta.json().catch(() => null);
    setSalvando(null);

    if (!resposta.ok) {
      avisar(resultado?.erro ?? "Não foi possível salvar.", "error");
      return;
    }

    avisar(novo ? "Alimento cadastrado." : "Dados salvos.", "success");
    if (novo) router.replace(`/nutricao/configuracoes/alimentos/${resultado.id}`);
    else carregar(["dados"]);
  }

  async function alternarArquivo() {
    if (!alimento) return;
    const arquivar = !alimento.arquivado;
    if (arquivar && !(await pedirConfirmacao("Arquivar este alimento? Ele deixa de aparecer nas buscas; dietas e modelos que já o usam não mudam."))) return;

    const resposta = await fetch(`/api/nutricao/alimentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivado: arquivar }),
    });

    if (!resposta.ok) {
      avisar("Não foi possível alterar.", "error");
      return;
    }

    avisar(arquivar ? "Alimento arquivado." : "Alimento reativado.", "success");
    carregar([]);
  }

  // ---------------------------------------------------------- composição
  const editavel = (codigo: string) => novo || !importado || !valores[codigo] || valores[codigo].fonte === "manual";

  async function salvarComposicao() {
    const nutrientes: Record<string, number | null> = {};

    for (const [codigo, valor] of Object.entries(composicaoEditada)) {
      if (!editavel(codigo)) continue;
      const convertido = numero(valor);
      if (valor.trim() !== "" && convertido === null) {
        avisar(`Valor inválido em ${catalogo.find((item) => item.codigo === codigo)?.nome ?? codigo}.`, "warn");
        return;
      }
      nutrientes[codigo] = convertido;
    }

    if (Object.keys(nutrientes).length === 0) {
      avisar("Nenhum valor alterado.", "info");
      return;
    }

    setSalvando("composicao");
    const resposta = await fetch(`/api/nutricao/alimentos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nutrientes }),
    });
    const resultado = await resposta.json().catch(() => null);
    setSalvando(null);

    if (!resposta.ok) {
      avisar(resultado?.erro ?? "Não foi possível salvar a composição.", "error");
      return;
    }

    avisar("Composição salva.", "success");
    carregar(["composicao"]);
  }

  // ------------------------------------------------------------- medidas
  function moverMedida(indice: number, direcao: -1 | 1) {
    setMedidas((atuais) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  async function removerMedida(indice: number) {
    const medida = medidas[indice];
    if (medida.id && !(await pedirConfirmacao(`Remover a medida "${medida.nome_singular}"?`))) return;
    setMedidas((atuais) => atuais.filter((_, posicao) => posicao !== indice));
  }

  async function salvarMedidas() {
    const lista = [];
    for (const medida of medidas) {
      const quantidade = numero(medida.quantidade);
      if (!medida.nome_singular.trim() || !medida.nome_plural.trim() || !quantidade || quantidade <= 0) {
        avisar("Preencha singular, plural e uma equivalência maior que zero em todas as medidas.", "warn");
        return;
      }
      lista.push({ id: medida.id, nome_singular: medida.nome_singular, nome_plural: medida.nome_plural, quantidade, padrao: medida.padrao });
    }

    setSalvando("medidas");
    const resposta = await fetch(`/api/nutricao/alimentos/${id}/medidas`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ medidas: lista }),
    });
    const resultado = await resposta.json().catch(() => null);
    setSalvando(null);

    if (!resposta.ok) {
      avisar(resultado?.erro ?? "Não foi possível salvar as medidas.", "error");
      return;
    }

    avisar("Medidas caseiras salvas.", "success");
    carregar(["medidas"]);
  }

  // -------------------------------------------------------- substituições
  async function adicionarSubstituto(encontrado: AlimentoEncontrado) {
    const resposta = await fetch(`/api/nutricao/alimentos/${encontrado.id}`, { cache: "no-store" });
    const dados = await resposta.json().catch(() => null);
    if (!dados) return;

    const composicao: Composicao = Object.fromEntries(
      (dados.valores as Valor[]).map((valor) => [valor.nutriente, { valor: valor.valor, traco: valor.traco }])
    );

    setSubstituicoes((atuais) => [
      ...atuais,
      {
        substitutoId: encontrado.id,
        nome: encontrado.nome,
        unidade: encontrado.unidade_base,
        composicao,
        medidas: dados.medidas as MedidaDoSubstituto[],
        quantidadeReferencia: "100",
        quantidadeSubstituto: "",
        medidaId: null,
        quantidadeMedidas: "",
        observacao: "",
      },
    ]);
  }

  function alterarSubstituicao(indice: number, mudancas: Partial<SubstituicaoEditavel>) {
    setSubstituicoes((atuais) =>
      atuais.map((item, posicao) => {
        if (posicao !== indice) return item;
        const atualizado = { ...item, ...mudancas };
        // Com medida caseira, a quantidade em g/mL vem da equivalência cadastrada.
        if (atualizado.medidaId) {
          const medida = atualizado.medidas.find((m) => m.id === atualizado.medidaId);
          const total = medida ? quantidadeDasMedidas(numero(atualizado.quantidadeMedidas) ?? 0, medida.quantidade) : null;
          atualizado.quantidadeSubstituto = total === null ? "" : texto(Math.round(total * 10) / 10);
        }
        return atualizado;
      })
    );
  }

  function moverSubstituicao(indice: number, direcao: -1 | 1) {
    setSubstituicoes((atuais) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atuais.length) return atuais;
      const copia = [...atuais];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  async function salvarSubstituicoes() {
    const lista = [];
    for (const item of substituicoes) {
      const referencia = numero(item.quantidadeReferencia);
      const quantidade = numero(item.quantidadeSubstituto);
      if (!referencia || referencia <= 0 || !quantidade || quantidade <= 0) {
        avisar(`Defina as quantidades de "${item.nome}".`, "warn");
        return;
      }
      lista.push({
        substitutoId: item.substitutoId,
        quantidadeReferencia: referencia,
        quantidadeSubstituto: quantidade,
        medidaId: item.medidaId,
        quantidadeMedidas: item.medidaId ? numero(item.quantidadeMedidas) : null,
        observacao: item.observacao,
      });
    }

    setSalvando("substituicoes");
    const resposta = await fetch(`/api/nutricao/alimentos/${id}/substituicoes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ substituicoes: lista }),
    });
    const resultado = await resposta.json().catch(() => null);
    setSalvando(null);

    if (!resposta.ok) {
      avisar(resultado?.erro ?? "Não foi possível salvar as substituições.", "error");
      return;
    }

    avisar("Substituições salvas.", "success");
    carregar(["substituicoes"]);
  }

  // ----------------------------------------------------------------- tela
  if (alimento === undefined) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-4">
          <Skeleton height="3rem" width="60%" />
          <Skeleton height="16rem" />
        </div>
      </main>
    );
  }

  if (alimento === null && !novo) {
    return (
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">
          <BotaoVoltar rotulo="Voltar aos alimentos" onClick={() => router.push("/nutricao/configuracoes/alimentos")} />
          <h1 className="text-2xl font-bold text-gray-900">Alimento não encontrado</h1>
        </div>
      </main>
    );
  }

  const unidadeTexto = (alimento?.unidade_base ?? unidade) === "ml" ? "mL" : "g";
  const grupos = Object.keys(GRUPOS).filter((grupo) => catalogo.some((item) => item.grupo === grupo));

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar aos alimentos" onClick={() => router.push("/nutricao/configuracoes/alimentos")} />

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Tag
                value={novo || !importado ? "Cadastro próprio" : `TACO nº ${alimento?.codigo_origem}`}
                severity={novo || !importado ? "success" : "info"}
                className="selo-status"
              />
              {alimento?.arquivado && <Tag value="Arquivado" severity="secondary" className="selo-status" />}
            </div>
            <h1 className="mt-2 text-3xl font-bold text-gray-900">{novo ? "Novo alimento" : alimento?.nome}</h1>
            {importado && <p className="mt-1 text-sm text-gray-500">{alimento?.fonte_nome}</p>}
          </div>
          {!novo && (
            <Button
              type="button"
              outlined
              severity={alimento?.arquivado ? undefined : "secondary"}
              icon={alimento?.arquivado ? "pi pi-replay" : "pi pi-inbox"}
              label={alimento?.arquivado ? "Reativar" : "Arquivar"}
              onClick={alternarArquivo}
            />
          )}
        </div>

        {/* Dados gerais */}
        <section className="cartao p-5">
          <h2 className="font-bold text-gray-900">Dados gerais</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="nome-alimento" className="mb-2 block text-sm font-semibold text-gray-700">Nome</label>
              <InputText
                id="nome-alimento"
                value={nome}
                disabled={importado}
                maxLength={200}
                onChange={(evento) => setNome(evento.target.value)}
                className="w-full"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">Categoria</label>
              <Selecao value={categoriaId} disabled={importado} onChange={(evento) => setCategoriaId(evento.target.value)} className="w-full">
                <option value="">Sem categoria</option>
                {categorias.map((item) => (
                  <option key={item.id} value={String(item.id)}>{item.nome}</option>
                ))}
              </Selecao>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-gray-700">Composição por</label>
                <Selecao value={unidade} disabled={importado} onChange={(evento) => setUnidade(evento.target.value as "g" | "ml")} className="w-full">
                  <option value="g">100 g</option>
                  <option value="ml">100 mL</option>
                </Selecao>
              </div>
              <div>
                <label htmlFor="densidade" className="mb-2 block text-sm font-semibold text-gray-700">Densidade (g/mL)</label>
                <InputText
                  id="densidade"
                  inputMode="decimal"
                  value={densidade}
                  placeholder="Opcional"
                  onChange={(evento) => setDensidade(evento.target.value)}
                  className="w-full"
                />
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            A densidade só é usada para converter mL em g (ou o contrário). Sem ela, o sistema não presume 1 mL = 1 g.
            {importado && " Nome, categoria e unidade vêm da TACO e não podem ser alterados."}
          </p>
          {!novo && (
            <div className="mt-4 flex justify-end">
              <Button type="button" icon="pi pi-check" label="Salvar dados" loading={salvando === "dados"} onClick={salvarDados} />
            </div>
          )}
        </section>

        {/* Composição */}
        <section className="cartao mt-4 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3">
            <h2 className="font-bold text-gray-900">Composição por 100 {unidadeTexto}</h2>
            <span className="text-xs text-gray-500">“Tr” = traço · “—” = dado não disponível</span>
          </div>
          {importado && (
            <p className="border-b border-gray-200 bg-gray-50 px-5 py-2 text-xs text-gray-600">
              Valores da TACO não podem ser alterados. Os campos em branco podem ser completados por você e ficam identificados como cadastro próprio.
            </p>
          )}
          <div className="grid gap-x-8 p-5 md:grid-cols-2">
            {grupos.map((grupo) => (
              <details
                key={grupo}
                open={!RECOLHIDOS.includes(grupo)}
                className="group mb-4 break-inside-avoid"
              >
                <summary className="mb-1 flex cursor-pointer list-none items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary-700">
                  <i className="pi pi-chevron-right text-[10px] transition-transform group-open:rotate-90" aria-hidden />
                  {GRUPOS[grupo]}
                </summary>
                <table className="w-full text-sm">
                  <tbody>
                    {catalogo
                      .filter((item) => item.grupo === grupo)
                      .map((item) => {
                        const valor = valores[item.codigo];
                        const podeEditar = editavel(item.codigo);
                        const exibido = valor
                          ? textoDoResultado(item.codigo, valor.traco ? { situacao: "traco" } : { situacao: "valor", valor: valor.valor ?? 0 })
                          : "—";

                        return (
                          <tr key={item.codigo} className="border-t border-gray-100">
                            <td className="py-1 pr-2 text-gray-700">{item.nome}</td>
                            <td className="w-32 py-1 text-right">
                              {podeEditar ? (
                                <InputText
                                  aria-label={item.nome}
                                  inputMode="decimal"
                                  value={composicaoEditada[item.codigo] ?? texto(valor?.valor)}
                                  placeholder="—"
                                  onChange={(evento) => setComposicaoEditada((atuais) => ({ ...atuais, [item.codigo]: evento.target.value }))}
                                  className="h-8 w-full px-2 text-right"
                                />
                              ) : (
                                <span className={`font-semibold tabular-nums ${valor?.traco ? "text-gray-500" : "text-gray-900"}`}>{exibido}</span>
                              )}
                            </td>
                            <td className="w-12 py-1 pl-2 text-xs text-gray-500">{item.unidade}</td>
                            <td className="w-16 py-1 text-right text-[10px] uppercase text-gray-400">
                              {valor ? (valor.fonte === "manual" ? "próprio" : valor.fonte) : ""}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
          <div className="flex justify-end border-t border-gray-200 px-5 py-3">
            {novo ? (
              <Button type="button" icon="pi pi-check" label="Cadastrar alimento" loading={salvando === "dados"} onClick={salvarDados} />
            ) : (
              <Button type="button" icon="pi pi-check" label="Salvar composição" loading={salvando === "composicao"} onClick={salvarComposicao} />
            )}
          </div>
        </section>

        {!novo && alimento && (
          <>
            {/* Medidas caseiras */}
            <section className="cartao mt-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-gray-900">Medidas caseiras</h2>
                <Button
                  type="button"
                  size="small"
                  outlined
                  icon="pi pi-plus"
                  label="Adicionar medida"
                  onClick={() => setMedidas((atuais) => [...atuais, { nome_singular: "", nome_plural: "", quantidade: "", padrao: atuais.length === 0 }])}
                />
              </div>
              {medidas.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Nenhuma medida cadastrada. Sem medida, o alimento é prescrito em {unidadeTexto}.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_4rem_6.5rem] gap-2 px-1 text-xs font-semibold uppercase text-gray-500 md:grid">
                    <span>Singular</span><span>Plural</span><span>Equivale a ({unidadeTexto})</span><span>Padrão</span><span />
                  </div>
                  {medidas.map((medida, indice) => (
                    <div key={medida.id ?? `nova-${indice}`} className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_4rem_6.5rem] md:border-0 md:p-0">
                      <InputText
                        aria-label="Nome no singular"
                        placeholder="colher de sopa"
                        value={medida.nome_singular}
                        onChange={(evento) => setMedidas((atuais) => atuais.map((m, p) => (p === indice ? { ...m, nome_singular: evento.target.value } : m)))}
                      />
                      <InputText
                        aria-label="Nome no plural"
                        placeholder="colheres de sopa"
                        value={medida.nome_plural}
                        onChange={(evento) => setMedidas((atuais) => atuais.map((m, p) => (p === indice ? { ...m, nome_plural: evento.target.value } : m)))}
                      />
                      <InputText
                        aria-label={`Equivalência em ${unidadeTexto}`}
                        inputMode="decimal"
                        placeholder="25"
                        value={medida.quantidade}
                        onChange={(evento) => setMedidas((atuais) => atuais.map((m, p) => (p === indice ? { ...m, quantidade: evento.target.value } : m)))}
                        className="text-right"
                      />
                      <label className="flex items-center justify-center gap-2 text-sm text-gray-600">
                        <RadioButton
                          inputId={`padrao-${indice}`}
                          checked={medida.padrao}
                          onChange={() => setMedidas((atuais) => atuais.map((m, p) => ({ ...m, padrao: p === indice })))}
                        />
                        <span className="md:sr-only">Padrão</span>
                      </label>
                      <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
                        <Button type="button" text size="small" icon="pi pi-arrow-up" aria-label="Subir" disabled={indice === 0} onClick={() => moverMedida(indice, -1)} />
                        <Button type="button" text size="small" icon="pi pi-arrow-down" aria-label="Descer" disabled={indice === medidas.length - 1} onClick={() => moverMedida(indice, 1)} />
                        <Button type="button" text size="small" severity="danger" icon="pi pi-minus-circle" aria-label="Remover medida" onClick={() => removerMedida(indice)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button type="button" icon="pi pi-check" label="Salvar medidas" loading={salvando === "medidas"} onClick={salvarMedidas} />
              </div>
            </section>

            {/* Substituições */}
            <section className="cartao mt-4 p-5">
              <h2 className="font-bold text-gray-900">Substituições alimentares</h2>
              <p className="mt-1 text-sm text-gray-500">
                As quantidades são definidas por você. A comparação serve para conferência; estar na lista não significa equivalência exata.
              </p>

              <div className="mt-4">
                <BuscaAlimento
                  inputId="buscar-substituto"
                  placeholder="Adicionar substituto: buscar alimento"
                  excluir={[alimento.id, ...substituicoes.map((item) => item.substitutoId)]}
                  onSelecionar={adicionarSubstituto}
                />
              </div>

              {substituicoes.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Nenhuma substituição cadastrada.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {substituicoes.map((item, indice) => {
                    const referencia = numero(item.quantidadeReferencia) ?? 0;
                    const quantidade = numero(item.quantidadeSubstituto) ?? 0;
                    const unidadeSub = item.unidade === "ml" ? "mL" : "g";

                    return (
                      <li key={item.substitutoId} className="rounded-xl border border-gray-200 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-semibold text-gray-900">{item.nome}</p>
                          <div className="flex gap-1">
                            <Button type="button" text size="small" icon="pi pi-arrow-up" aria-label="Subir" disabled={indice === 0} onClick={() => moverSubstituicao(indice, -1)} />
                            <Button type="button" text size="small" icon="pi pi-arrow-down" aria-label="Descer" disabled={indice === substituicoes.length - 1} onClick={() => moverSubstituicao(indice, 1)} />
                            <Button
                              type="button"
                              text
                              size="small"
                              severity="danger"
                              icon="pi pi-minus-circle"
                              aria-label={`Remover ${item.nome}`}
                              onClick={() => setSubstituicoes((atuais) => atuais.filter((_, p) => p !== indice))}
                            />
                          </div>
                        </div>

                        <div className="mt-2 grid gap-3 md:grid-cols-4">
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">
                              {alimento.nome.split(",")[0]} ({unidadeTexto})
                            </label>
                            <InputText
                              inputMode="decimal"
                              value={item.quantidadeReferencia}
                              onChange={(evento) => alterarSubstituicao(indice, { quantidadeReferencia: evento.target.value })}
                              className="w-full text-right"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Medida do substituto</label>
                            <Selecao
                              value={item.medidaId ?? "em-unidade"}
                              onChange={(evento) =>
                                alterarSubstituicao(indice, {
                                  medidaId: evento.target.value === "em-unidade" ? null : evento.target.value,
                                })
                              }
                              className="w-full"
                            >
                              <option value="em-unidade">Em {unidadeSub}</option>
                              {item.medidas.map((medida) => (
                                <option key={medida.id} value={medida.id}>
                                  {medida.nome_singular} ({texto(medida.quantidade)} {unidadeSub})
                                </option>
                              ))}
                            </Selecao>
                          </div>
                          {item.medidaId && (
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-gray-600">Nº de medidas</label>
                              <InputText
                                inputMode="decimal"
                                value={item.quantidadeMedidas}
                                onChange={(evento) => alterarSubstituicao(indice, { quantidadeMedidas: evento.target.value })}
                                className="w-full text-right"
                              />
                            </div>
                          )}
                          <div>
                            <label className="mb-1 block text-xs font-semibold text-gray-600">Substituto ({unidadeSub})</label>
                            <div className="flex gap-1">
                              <InputText
                                inputMode="decimal"
                                value={item.quantidadeSubstituto}
                                disabled={Boolean(item.medidaId)}
                                onChange={(evento) => alterarSubstituicao(indice, { quantidadeSubstituto: evento.target.value })}
                                className="w-full text-right"
                              />
                              <Button
                                type="button"
                                outlined
                                size="small"
                                icon="pi pi-bolt"
                                tooltip="Sugerir quantidade com a mesma energia (1 g abaixo de 20 g; 10 g a partir de 20 g)"
                                aria-label="Sugerir quantidade equivalente em energia"
                                onClick={() => {
                                  const sugerida = quantidadeEquivalente(composicaoPrincipal, referencia, item.composicao);
                                  if (sugerida === null) {
                                    avisar("Falta a energia de um dos alimentos para sugerir.", "warn");
                                    return;
                                  }
                                  alterarSubstituicao(indice, { medidaId: null, quantidadeSubstituto: texto(sugerida) });
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        <table className="mt-3 w-full text-xs">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="py-1 text-left font-semibold" />
                              {MACROS.map((macro) => (
                                <th key={macro.codigo} className="py-1 text-right font-semibold">{macro.rotulo}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t border-gray-100">
                              <td className="py-1 text-gray-600">Referência ({texto(referencia)} {unidadeTexto})</td>
                              {MACROS.map((macro) => (
                                <td key={macro.codigo} className="py-1 text-right tabular-nums">
                                  {textoDoResultado(macro.codigo, nutrienteDaPorcao(composicaoPrincipal, macro.codigo, referencia))}
                                </td>
                              ))}
                            </tr>
                            <tr className="border-t border-gray-100">
                              <td className="py-1 text-gray-600">Substituto ({texto(quantidade)} {unidadeSub})</td>
                              {MACROS.map((macro) => (
                                <td key={macro.codigo} className="py-1 text-right tabular-nums">
                                  {textoDoResultado(macro.codigo, nutrienteDaPorcao(item.composicao, macro.codigo, quantidade))}
                                </td>
                              ))}
                            </tr>
                            <tr className="border-t border-gray-100 font-semibold">
                              <td className="py-1 text-gray-700">Diferença</td>
                              {MACROS.map((macro) => {
                                const a = nutrienteDaPorcao(composicaoPrincipal, macro.codigo, referencia);
                                const b = nutrienteDaPorcao(item.composicao, macro.codigo, quantidade);
                                if (a.situacao !== "valor" || b.situacao !== "valor") {
                                  return <td key={macro.codigo} className="py-1 text-right text-gray-400">—</td>;
                                }
                                const diferenca = b.valor - a.valor;
                                return (
                                  <td key={macro.codigo} className="py-1 text-right tabular-nums">
                                    {diferenca > 0 ? "+" : ""}{formatarNutriente(macro.codigo, diferenca)}
                                  </td>
                                );
                              })}
                            </tr>
                          </tbody>
                        </table>

                        <InputText
                          aria-label="Observação da substituição"
                          placeholder="Observação (opcional)"
                          value={item.observacao}
                          maxLength={300}
                          onChange={(evento) => alterarSubstituicao(indice, { observacao: evento.target.value })}
                          className="mt-3 w-full"
                        />
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-4 flex justify-end">
                <Button type="button" icon="pi pi-check" label="Salvar substituições" loading={salvando === "substituicoes"} onClick={salvarSubstituicoes} />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

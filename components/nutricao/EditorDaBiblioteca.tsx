"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Estado = "salvo" | "pendente" | "salvando" | "erro" | "conflito";
const ESTADOS: Record<Estado, string> = {
  salvo: "Salvo",
  pendente: "Alterações não salvas",
  salvando: "Salvando…",
  erro: "Erro ao salvar",
  conflito: "Alterado em outra janela: recarregue",
};

// Editor de um item de biblioteca (nome + conteúdo), com salvamento
// automático. O conteúdo é desenhado por quem usa (render prop).
export default function EditorDaBiblioteca<T>({
  tipo,
  campo,
  id,
  titulo,
  rotuloNome,
  voltarPara,
  rotuloVoltar,
  aviso,
  children,
}: {
  tipo: string;
  campo: string;
  id: string;
  titulo: string;
  rotuloNome: string;
  voltarPara: string;
  rotuloVoltar: string;
  aviso?: ReactNode;
  children: (conteudo: T, alterar: (mudanca: (c: T) => void) => void) => ReactNode;
}) {
  const router = useRouter();
  const api = `/api/nutricao/biblioteca/${tipo}/${id}`;
  const [carregado, setCarregado] = useState(false);
  const [nome, setNome] = useState("");
  const [conteudo, setConteudo] = useState<T | null>(null);
  const [usos, setUsos] = useState(0);
  const [estado, setEstado] = useState<Estado>("salvo");
  const dados = useRef<{ nome: string; conteudo: T | null }>({ nome: "", conteudo: null });
  const revisao = useRef(0);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(api, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((resultado) => {
        if (!resultado) {
          avisar("Registro não encontrado.", "error");
          router.push(voltarPara);
          return;
        }
        const m = resultado.modelo;
        dados.current = { nome: m.nome, conteudo: m[campo] };
        revisao.current = m.revisao;
        setNome(m.nome);
        setConteudo(m[campo]);
        setUsos(m.usos);
        setCarregado(true);
      });
  }, [api, campo, router, voltarPara]);

  const gravar = useCallback(async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    setEstado("salvando");
    const resposta = await fetch(api, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: dados.current.nome, [campo]: dados.current.conteudo, revisao: revisao.current }),
    }).catch(() => null);
    if (!resposta?.ok) {
      const resultado = await resposta?.json().catch(() => null);
      setEstado(resposta?.status === 409 ? "conflito" : "erro");
      if (resultado?.erro) avisar(resultado.erro, "error");
      return false;
    }
    revisao.current = (await resposta.json()).revisao;
    setEstado("salvo");
    return true;
  }, [api, campo]);

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

  const alterar = useCallback((mudanca: (c: T) => void) => {
    const copia = structuredClone(dados.current.conteudo) as T;
    mudanca(copia);
    dados.current = { ...dados.current, conteudo: copia };
    setConteudo(copia);
    agendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function voltar() {
    if (estado !== "salvo" && !(await gravar())) {
      const sair = await pedirConfirmacao("Não foi possível salvar as últimas alterações. Sair mesmo assim e perdê-las?", {
        aceitar: "Sair sem salvar",
        rejeitar: "Ficar e tentar de novo",
        titulo: "Alterações não salvas",
      });
      if (!sair) return;
    }
    router.push(voltarPara);
  }

  if (!carregado || conteudo === null) return <Skeleton height="20rem" />;

  return (
    <div>
      <BotaoVoltar rotulo={rotuloVoltar} onClick={voltar} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
        <span className={`text-sm ${estado === "erro" || estado === "conflito" ? "text-red-700" : "text-gray-500"}`} role="status">
          {ESTADOS[estado]}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        {usos ? `Usado ${usos} vez(es). ` : ""}Alterações valem para os próximos usos; o que já foi feito com ele não muda.
      </p>
      {aviso}

      <label className="mt-4 block">
        <span className="mb-1 block font-semibold text-gray-900">{rotuloNome}</span>
        <InputText
          aria-label={rotuloNome}
          value={nome}
          onChange={(e) => {
            dados.current = { ...dados.current, nome: e.target.value };
            setNome(e.target.value);
            agendar();
          }}
          className="w-full"
          maxLength={200}
        />
      </label>

      <div className="mt-4">{children(conteudo, alterar)}</div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" label="Voltar" outlined onClick={voltar} />
        <Button type="button" icon="pi pi-save" label="Salvar" onClick={() => void gravar().then((ok) => ok && avisar("Salvo.", "success"))} />
      </div>
    </div>
  );
}

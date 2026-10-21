"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import { Skeleton } from "primereact/skeleton";
import BotaoVoltar from "@/components/BotaoVoltar";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { abrirDocumento } from "@/lib/visualizador";

type Configuracao = {
  nome_profissional: string | null;
  registro_profissional: string | null;
  frase: string | null;
  cor_linhas: string;
  logo_path: string | null;
  assinatura_path: string | null;
  marca_dagua_path: string | null;
};

type CampoImagem = "logo_path" | "assinatura_path" | "marca_dagua_path";

const IMAGENS: { campo: CampoImagem; titulo: string; ajuda: string }[] = [
  { campo: "logo_path", titulo: "Logotipo", ajuda: "Topo dos PDFs, à esquerda. PNG com fundo transparente fica melhor." },
  {
    campo: "assinatura_path",
    titulo: "Assinatura",
    ajuda: "Imagem de identificação visual; não é assinatura digital certificada.",
  },
  { campo: "marca_dagua_path", titulo: "Marca-d'água", ajuda: "Ao fundo das páginas, bem clara, sem atrapalhar a leitura." },
];

const TIPOS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

// Identidade visual dos documentos em PDF. Vale para os documentos gerados
// a partir de agora; PDFs já emitidos não mudam.
export default function IdentidadeVisualPage() {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const campoEscolhido = useRef<CampoImagem>("logo_path");

  const [configuracao, setConfiguracao] = useState<Configuracao | null>(null);
  const [previas, setPrevias] = useState<Partial<Record<CampoImagem, string>>>({});
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState<CampoImagem | null>(null);

  const carregarPrevias = useCallback(async (dados: Configuracao) => {
    const novas: Partial<Record<CampoImagem, string>> = {};

    for (const { campo } of IMAGENS) {
      const caminho = dados[campo];
      if (!caminho) continue;
      const { data } = await api.storage.from("identidade").createSignedUrl(caminho, 600);
      if (data?.signedUrl) novas[campo] = data.signedUrl;
    }

    setPrevias(novas);
  }, []);

  useEffect(() => {
    api
      .from("configuracoes_documentos")
      .select("nome_profissional, registro_profissional, frase, cor_linhas, logo_path, assinatura_path, marca_dagua_path")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("Erro ao carregar configurações:", error);
        const dados = data as Configuracao | null;
        setConfiguracao(dados);
        if (dados) carregarPrevias(dados);
      });
  }, [carregarPrevias]);

  async function gravar(valores: Partial<Configuracao>) {
    const { error } = await api
      .from("configuracoes_documentos")
      .update({ ...valores, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (error) {
      console.error("Erro ao salvar configurações:", error);
      avisar("Não foi possível salvar.", "error");
      return false;
    }

    return true;
  }

  async function salvarTextos() {
    if (!configuracao) return;

    if (!/^#[0-9a-fA-F]{6}$/.test(configuracao.cor_linhas)) {
      avisar("Escolha uma cor válida para as linhas.", "warn");
      return;
    }

    setSalvando(true);
    const ok = await gravar({
      nome_profissional: configuracao.nome_profissional?.trim() || null,
      registro_profissional: configuracao.registro_profissional?.trim() || null,
      frase: configuracao.frase?.trim() || null,
      cor_linhas: configuracao.cor_linhas,
    });
    setSalvando(false);

    if (ok) avisar("Identidade visual salva.", "success");
  }

  function escolherImagem(campo: CampoImagem) {
    campoEscolhido.current = campo;
    entrada.current?.click();
  }

  async function enviarImagem(arquivo: File) {
    if (!configuracao) return;

    const campo = campoEscolhido.current;
    const extensao = TIPOS[arquivo.type];

    if (!extensao) {
      avisar("Envie a imagem em PNG ou JPG.", "warn");
      return;
    }

    if (arquivo.size > 5 * 1024 * 1024) {
      avisar("A imagem deve ter no máximo 5 MB.", "warn");
      return;
    }

    setEnviando(campo);

    try {
      const caminho = `${campo.replace("_path", "")}-${crypto.randomUUID()}.${extensao}`;
      const { error } = await api.storage.from("identidade").upload(caminho, arquivo, { contentType: arquivo.type });
      if (error) throw new Error(error.message);

      const anterior = configuracao[campo];

      if (!(await gravar({ [campo]: caminho }))) {
        await api.storage.from("identidade").remove([caminho]);
        return;
      }

      if (anterior) await api.storage.from("identidade").remove([anterior]);

      const atualizada = { ...configuracao, [campo]: caminho };
      setConfiguracao(atualizada);
      await carregarPrevias(atualizada);
      avisar("Imagem salva.", "success");
    } catch (erro) {
      console.error("Erro ao enviar imagem:", erro);
      avisar("Não foi possível enviar a imagem.", "error");
    } finally {
      setEnviando(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function removerImagem(campo: CampoImagem) {
    if (!configuracao?.[campo]) return;
    if (!(await pedirConfirmacao("Remover esta imagem dos próximos PDFs?"))) return;

    const anterior = configuracao[campo] as string;
    if (!(await gravar({ [campo]: null }))) return;

    await api.storage.from("identidade").remove([anterior]);
    const atualizada = { ...configuracao, [campo]: null };
    setConfiguracao(atualizada);
    await carregarPrevias(atualizada);
  }

  return (
    <main className="min-w-0 flex-1 p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <BotaoVoltar rotulo="Voltar às configurações" onClick={() => router.push("/nutricao/configuracoes")} />
        <CabecalhoPagina
          titulo="Identidade visual"
          descricao="Aplicada aos PDFs gerados a partir de agora. Documentos já emitidos não mudam."
          acao={
            <Button
              type="button"
              outlined
              icon="pi pi-file-pdf"
              label="Ver PDF de exemplo"
              onClick={() => abrirDocumento("/api/nutricao/pdf/exemplo")}
            />
          }
        />

        {configuracao === null ? (
          <Skeleton height="20rem" className="mt-6" borderRadius="16px" />
        ) : (
          <>
            <section className="cartao mt-6 grid gap-5 p-5 md:grid-cols-2">
              <Texto
                id="nome-profissional"
                titulo="Nome profissional (rodapé)"
                valor={configuracao.nome_profissional}
                alterar={(valor) => setConfiguracao({ ...configuracao, nome_profissional: valor })}
              />
              <Texto
                id="registro-profissional"
                titulo="Registro profissional (rodapé)"
                valor={configuracao.registro_profissional}
                placeholder="Ex.: CRN-3 76014/P"
                alterar={(valor) => setConfiguracao({ ...configuracao, registro_profissional: valor })}
              />
              <Texto
                id="frase"
                titulo="Frase do cabeçalho"
                valor={configuracao.frase}
                alterar={(valor) => setConfiguracao({ ...configuracao, frase: valor })}
              />
              <div>
                <label htmlFor="cor-linhas" className="mb-2 block text-sm font-semibold text-gray-700">
                  Cor das linhas
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="cor-linhas"
                    type="color"
                    value={configuracao.cor_linhas}
                    onChange={(evento) => setConfiguracao({ ...configuracao, cor_linhas: evento.target.value })}
                    className="h-11 w-16 cursor-pointer rounded-lg border border-gray-300 bg-white"
                  />
                  <span className="font-mono text-sm text-gray-600">{configuracao.cor_linhas}</span>
                </div>
              </div>
              <div className="flex justify-end md:col-span-2">
                <Button type="button" icon="pi pi-check" label="Salvar" loading={salvando} onClick={salvarTextos} />
              </div>
            </section>

            <input
              ref={entrada}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              onChange={(evento) => {
                const arquivo = evento.target.files?.[0];
                if (arquivo) enviarImagem(arquivo);
              }}
            />

            <section className="mt-4 grid gap-3 md:grid-cols-3">
              {IMAGENS.map(({ campo, titulo, ajuda }) => (
                <div key={campo} className="cartao flex flex-col p-4">
                  <h2 className="font-bold text-gray-900">{titulo}</h2>
                  <p className="mt-1 text-xs text-gray-500">{ajuda}</p>

                  <div className="mt-3 flex h-36 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 p-2">
                    {previas[campo] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previas[campo]} alt={titulo} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-sm text-gray-400">Nenhuma imagem</span>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      size="small"
                      icon="pi pi-upload"
                      label={configuracao[campo] ? "Trocar" : "Enviar"}
                      loading={enviando === campo}
                      disabled={enviando !== null}
                      onClick={() => escolherImagem(campo)}
                      className="flex-1"
                    />
                    {configuracao[campo] && (
                      <Button
                        type="button"
                        size="small"
                        icon="pi pi-trash"
                        severity="danger"
                        outlined
                        aria-label={`Remover ${titulo.toLowerCase()}`}
                        onClick={() => removerImagem(campo)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Texto({
  id,
  titulo,
  valor,
  placeholder,
  alterar,
}: {
  id: string;
  titulo: string;
  valor: string | null;
  placeholder?: string;
  alterar: (valor: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-gray-700">
        {titulo}
      </label>
      <InputText
        id={id}
        value={valor ?? ""}
        placeholder={placeholder}
        maxLength={160}
        onChange={(evento) => alterar(evento.target.value)}
        className="w-full"
      />
    </div>
  );
}

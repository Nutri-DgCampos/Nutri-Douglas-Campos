"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Checkbox } from "primereact/checkbox";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { LARGURAS, novoBloco, partesComNegrito, type BlocoOrientacao, type ConteudoOrientacao } from "@/lib/nutricao/orientacao";

const TIPOS_DE_IMAGEM: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg" };

function ImagemSalva({ caminho, largura }: { caminho: string; largura: number }) {
  const [endereco, setEndereco] = useState<string | null>(null);
  useEffect(() => {
    api.storage
      .from("orientacoes")
      .createSignedUrl(caminho, 600)
      .then(({ data }) => setEndereco(data?.signedUrl ?? null));
  }, [caminho]);
  if (!endereco) return <div className="h-24 w-full animate-pulse rounded bg-gray-100" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={endereco} alt="" className="mx-auto block rounded" style={{ width: `${largura}%` }} />;
}

function mover<T>(lista: T[], indice: number, direcao: -1 | 1) {
  const destino = indice + direcao;
  if (destino < 0 || destino >= lista.length) return;
  const [item] = lista.splice(indice, 1);
  lista.splice(destino, 0, item);
}

const ROTULOS: Record<BlocoOrientacao["tipo"], string> = { titulo: "Título", paragrafo: "Parágrafo", lista: "Lista", imagem: "Imagem" };

// Conteúdo da orientação em blocos: títulos, parágrafos, listas e imagens,
// mais a assinatura no fim. "pasta": onde as imagens novas são guardadas.
export default function EditorDeBlocos({
  conteudo,
  onAlterar,
  pasta,
  modelo = false,
}: {
  conteudo: ConteudoOrientacao;
  onAlterar: (mudanca: (c: ConteudoOrientacao) => void) => void;
  pasta: string;
  modelo?: boolean;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);

  async function inserirImagem(arquivo: File) {
    const extensao = TIPOS_DE_IMAGEM[arquivo.type];
    if (!extensao) return avisar("Use imagem PNG ou JPG.", "warn");
    if (arquivo.size > 5 * 1024 * 1024) return avisar("A imagem deve ter no máximo 5 MB.", "warn");
    setEnviando(true);
    const caminho = `${pasta}/${crypto.randomUUID()}.${extensao}`;
    const { error } = await api.storage.from("orientacoes").upload(caminho, arquivo, { contentType: arquivo.type });
    setEnviando(false);
    if (error) return avisar("Não foi possível enviar a imagem.", "error");
    onAlterar((c) => void c.blocos.push(novoBloco("imagem", caminho)));
  }

  return (
    <div className="space-y-3">
      {modelo ? (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <Checkbox inputId="automatica" checked={Boolean(conteudo.automatica)} onChange={(e) => onAlterar((c) => void (c.automatica = Boolean(e.checked)))} />
          <span>
            Incluir automaticamente esta orientação em todas as consultas
            <span className="block text-xs text-gray-500">Cada nova consulta já começa com uma cópia, que pode ser ajustada ou excluída.</span>
          </span>
        </label>
      ) : null}

      {conteudo.blocos.map((b, i) => (
        <div key={b.id} className="rounded-xl border border-gray-200 bg-white p-3" aria-label={`${ROTULOS[b.tipo]} ${i + 1}`}>
          <div className="mb-2 flex items-center gap-1">
            <span className="flex-1 text-xs font-semibold uppercase text-gray-400">{ROTULOS[b.tipo]}</span>
            <Button type="button" icon="pi pi-angle-up" text size="small" aria-label={`Subir bloco ${i + 1}`} disabled={i === 0} onClick={() => onAlterar((c) => mover(c.blocos, i, -1))} />
            <Button
              type="button"
              icon="pi pi-angle-down"
              text
              size="small"
              aria-label={`Descer bloco ${i + 1}`}
              disabled={i === conteudo.blocos.length - 1}
              onClick={() => onAlterar((c) => mover(c.blocos, i, 1))}
            />
            <Button type="button" icon="pi pi-trash" text size="small" severity="danger" aria-label={`Remover bloco ${i + 1}`} onClick={() => onAlterar((c) => void c.blocos.splice(i, 1))} />
          </div>
          {b.tipo === "titulo" ? (
            <InputText
              aria-label={`Texto do título ${i + 1}`}
              value={b.texto}
              onChange={(e) => onAlterar((c) => void ((c.blocos[i] as { texto: string }).texto = e.target.value))}
              className="w-full font-semibold"
            />
          ) : b.tipo === "paragrafo" ? (
            <>
              <InputTextarea
                aria-label={`Texto do parágrafo ${i + 1}`}
                value={b.texto}
                rows={3}
                autoResize
                onChange={(e) => onAlterar((c) => void ((c.blocos[i] as { texto: string }).texto = e.target.value))}
                className="w-full"
              />
              {b.texto.includes("**") ? (
                <p className="mt-1 text-sm text-gray-700">
                  {partesComNegrito(b.texto).map((p, n) => (p.negrito ? <strong key={n}>{p.texto}</strong> : <span key={n}>{p.texto}</span>))}
                </p>
              ) : null}
            </>
          ) : b.tipo === "lista" ? (
            <InputTextarea
              aria-label={`Itens da lista ${i + 1}`}
              value={b.itens.join("\n")}
              rows={3}
              autoResize
              placeholder="Um item por linha"
              onChange={(e) => onAlterar((c) => void ((c.blocos[i] as { itens: string[] }).itens = e.target.value.split("\n")))}
              className="w-full"
            />
          ) : (
            <div className="space-y-2">
              <ImagemSalva caminho={b.caminho} largura={b.largura} />
              <div className="flex flex-wrap items-center gap-2">
                <Dropdown
                  aria-label={`Largura da imagem ${i + 1}`}
                  value={b.largura}
                  options={LARGURAS.map((l) => ({ label: `${l}% da largura`, value: l }))}
                  onChange={(e) => onAlterar((c) => void ((c.blocos[i] as { largura: number }).largura = e.value))}
                  className="w-44"
                />
                <InputText
                  aria-label={`Legenda da imagem ${i + 1}`}
                  value={b.legenda}
                  placeholder="Legenda (opcional)"
                  onChange={(e) => onAlterar((c) => void ((c.blocos[i] as { legenda: string }).legenda = e.target.value))}
                  className="min-w-0 flex-1"
                />
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" icon="pi pi-plus" label="Título" size="small" outlined onClick={() => onAlterar((c) => void c.blocos.push(novoBloco("titulo")))} />
        <Button type="button" icon="pi pi-plus" label="Parágrafo" size="small" outlined onClick={() => onAlterar((c) => void c.blocos.push(novoBloco("paragrafo")))} />
        <Button type="button" icon="pi pi-plus" label="Lista" size="small" outlined onClick={() => onAlterar((c) => void c.blocos.push(novoBloco("lista")))} />
        <Button type="button" icon="pi pi-image" label="Imagem" size="small" outlined loading={enviando} onClick={() => entrada.current?.click()} />
        <input
          ref={entrada}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          aria-label="Arquivo de imagem"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void inserirImagem(arquivo);
            e.target.value = "";
          }}
        />
      </div>
      <p className="text-xs text-gray-500">
        Negrito: escreva entre dois asteriscos, como **beba água**.
        {modelo ? " No modelo, {paciente} e {data_consulta} são trocados pelo nome e pela data da consulta ao usar." : ""}
      </p>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <Checkbox inputId="assinatura" checked={conteudo.assinatura} onChange={(e) => onAlterar((c) => void (c.assinatura = Boolean(e.checked)))} />
        <span>
          Incluir a assinatura profissional no fim
          <span className="block text-xs text-gray-500">Imagem da assinatura cadastrada em Identidade visual (não é assinatura digital certificada).</span>
        </span>
      </label>
    </div>
  );
}

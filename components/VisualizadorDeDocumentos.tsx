"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { fecharDocumento, useDocumentoAberto, type Documento } from "@/lib/visualizador";

type Carregado =
  | { tipo: "carregando" }
  | { tipo: "pdf"; blob: Blob; nome: string }
  | { tipo: "imagem"; blob: Blob; endereco: string; nome: string }
  | { tipo: "erro"; mensagem: string };

const ZOOM_MINIMO = 1;
const ZOOM_MAXIMO = 3;

function nomeDaResposta(resposta: Response, documento: Documento, tipo: string) {
  if (documento.nome) return documento.nome;
  const disposicao = resposta.headers.get("Content-Disposition") ?? "";
  const utf8 = disposicao.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const simples = disposicao.match(/filename="?([^";]+)"?/i);
  if (simples) return simples[1];
  return tipo.includes("pdf") ? "documento.pdf" : "arquivo";
}

// Desenha as páginas do PDF com o pdf.js (o navegador do celular, em geral,
// não mostra PDF dentro da página).
function PaginasDoPdf({ blob, zoom }: { blob: Blob; zoom: number }) {
  const area = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState(false);
  const [desenhando, setDesenhando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    let destruir: (() => void) | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const tarefa = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false });
        destruir = () => void tarefa.destroy();
        const pdf = await tarefa.promise;
        const destino = area.current;
        if (cancelado || !destino) return;

        destino.replaceChildren();
        setDesenhando(true);
        const largura = destino.clientWidth * zoom;
        const densidade = Math.min(window.devicePixelRatio || 1, 2);

        for (let numero = 1; numero <= pdf.numPages; numero++) {
          const pagina = await pdf.getPage(numero);
          if (cancelado) return;
          const base = pagina.getViewport({ scale: 1 });
          const escala = (largura / base.width) * densidade;
          const viewport = pagina.getViewport({ scale: escala });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${largura}px`;
          canvas.className = "mx-auto mb-3 block bg-white shadow";
          canvas.setAttribute("aria-label", `Página ${numero} de ${pdf.numPages}`);
          // Entra na tela já desenhada (sem folha em branco piscando).
          await pagina.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
          if (cancelado) return;
          destino.appendChild(canvas);
          if (numero === 1) setDesenhando(false);
        }
      } catch (e) {
        if (!cancelado) {
          console.error("Erro ao mostrar o PDF:", e);
          setErro(true);
        }
      }
    })();

    return () => {
      cancelado = true;
      destruir?.();
    };
  }, [blob, zoom]);

  if (erro) return <p className="p-6 text-center text-white">Não foi possível mostrar o PDF. Use o botão Baixar.</p>;
  return (
    <>
      {desenhando ? (
        <p className="p-6 text-center text-white">
          <i className="pi pi-spin pi-spinner mr-2" aria-hidden />
          Abrindo…
        </p>
      ) : null}
      <div ref={area} className="w-full" data-paginas-do-pdf />
    </>
  );
}

function Conteudo({ documento }: { documento: Documento }) {
  const [carregado, setCarregado] = useState<Carregado>({ tipo: "carregando" });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelado = false;
    let endereco: string | null = null;
    fetch(documento.url, { cache: "no-store" })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(String(resposta.status));
        const blob = await resposta.blob();
        const tipo = blob.type || resposta.headers.get("Content-Type") || "";
        const nome = nomeDaResposta(resposta, documento, tipo);
        if (cancelado) return;
        if (tipo.includes("pdf") || nome.toLowerCase().endsWith(".pdf")) {
          setCarregado({ tipo: "pdf", blob, nome: nome.toLowerCase().endsWith(".pdf") ? nome : `${nome}.pdf` });
        }
        else if (tipo.startsWith("image/")) {
          endereco = URL.createObjectURL(blob);
          setCarregado({ tipo: "imagem", blob, endereco, nome });
        } else setCarregado({ tipo: "erro", mensagem: "Este arquivo não pode ser mostrado aqui. Use o botão Baixar." });
      })
      .catch(() => {
        if (!cancelado) setCarregado({ tipo: "erro", mensagem: "Não foi possível abrir o arquivo. Tente novamente." });
      });
    return () => {
      cancelado = true;
      if (endereco) URL.revokeObjectURL(endereco);
    };
  }, [documento]);

  function baixar() {
    if (carregado.tipo !== "pdf" && carregado.tipo !== "imagem") {
      window.location.href = documento.url;
      return;
    }
    const endereco = URL.createObjectURL(carregado.blob);
    const link = document.createElement("a");
    link.href = endereco;
    link.download = carregado.nome;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(endereco), 30000);
  }

  const nome = carregado.tipo === "pdf" || carregado.tipo === "imagem" ? carregado.nome : documento.nome ?? "";

  return (
    <div
      className="fixed inset-0 z-[2000] flex flex-col bg-gray-800"
      role="dialog"
      aria-modal="true"
      aria-label={nome ? `Documento: ${nome}` : "Documento"}
    >
      <header className="flex items-center gap-2 bg-primary-900 px-2 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] text-white">
        <Button type="button" icon="pi pi-arrow-left" label="Voltar" text className="!text-white" onClick={() => history.back()} />
        <span className="min-w-0 flex-1 truncate text-sm" title={nome} data-nome-do-documento>{nome}</span>
        {carregado.tipo === "pdf" ? (
          <>
            <Button
              type="button"
              icon="pi pi-search-minus"
              text
              rounded
              className="!text-white"
              aria-label="Diminuir"
              disabled={zoom <= ZOOM_MINIMO}
              onClick={() => setZoom((z) => Math.max(ZOOM_MINIMO, z - 0.5))}
            />
            <Button
              type="button"
              icon="pi pi-search-plus"
              text
              rounded
              className="!text-white"
              aria-label="Aumentar"
              disabled={zoom >= ZOOM_MAXIMO}
              onClick={() => setZoom((z) => Math.min(ZOOM_MAXIMO, z + 0.5))}
            />
          </>
        ) : null}
        <Button type="button" icon="pi pi-download" label="Baixar" aria-label="Baixar" outlined className="!border-white !text-white max-sm:[&_.p-button-label]:hidden max-sm:[&_.p-button-icon]:mr-0" onClick={baixar} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-4xl">
          {carregado.tipo === "carregando" ? (
            <p className="p-6 text-center text-white">
              <i className="pi pi-spin pi-spinner mr-2" aria-hidden />
              Abrindo…
            </p>
          ) : carregado.tipo === "erro" ? (
            <p className="p-6 text-center text-white">{carregado.mensagem}</p>
          ) : carregado.tipo === "imagem" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={carregado.endereco} alt={carregado.nome} className="mx-auto block max-w-full bg-white" />
          ) : (
            <PaginasDoPdf blob={carregado.blob} zoom={zoom} />
          )}
        </div>
      </div>
    </div>
  );
}

// Montado uma vez no layout raiz. O "Voltar" do aparelho também fecha o
// documento: ao abrir, entra uma posição no histórico.
export default function VisualizadorDeDocumentos() {
  const documento = useDocumentoAberto();

  useEffect(() => {
    if (!documento) return;
    history.pushState({ ...history.state, visualizador: true }, "");
    const aoVoltar = () => fecharDocumento();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") history.back();
    };
    window.addEventListener("popstate", aoVoltar);
    window.addEventListener("keydown", aoTeclar);
    const rolagem = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("popstate", aoVoltar);
      window.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagem;
    };
  }, [documento]);

  if (!documento) return null;
  return <Conteudo key={documento.url} documento={documento} />;
}

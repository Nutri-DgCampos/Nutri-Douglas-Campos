import type { ReactNode } from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Identidade } from "./identidade";

// Modelo base dos PDFs do Módulo de Nutrição (A4 vertical), conforme o
// modelo de referência: logotipo à esquerda, frase à direita, linhas na cor
// configurada, marca-d'água ao fundo e rodapé com a identificação
// profissional e o número da página. Cabeçalho e rodapé se repetem em
// todas as páginas.

const estilos = StyleSheet.create({
  pagina: {
    paddingTop: 108,
    paddingBottom: 64,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1f2937",
  },
  cabecalho: {
    position: "absolute",
    top: 24,
    left: 40,
    right: 40,
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1.2,
    borderBottomWidth: 1.2,
    paddingVertical: 6,
  },
  logo: { maxHeight: 58, maxWidth: 140, objectFit: "contain" },
  frase: { fontSize: 10, color: "#374151", maxWidth: 300, textAlign: "right" },
  rodape: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    alignItems: "center",
  },
  rodapeTexto: { fontSize: 9, color: "#374151" },
  numero: { fontSize: 8, color: "#6b7280", marginTop: 2 },
  marcaDagua: {
    position: "absolute",
    top: 250,
    left: 120,
    width: 355,
    height: 355,
    opacity: 0.07,
    objectFit: "contain",
  },
});

export function DocumentoPadrao({
  identidade,
  titulo,
  children,
  cabecalhoExtra,
  alturaCabecalhoExtra = 0,
}: {
  identidade: Identidade;
  titulo: string;
  children: ReactNode;
  // Conteúdo repetido em todas as páginas logo abaixo do cabeçalho (ex.:
  // título do documento e identificação do paciente).
  cabecalhoExtra?: ReactNode;
  alturaCabecalhoExtra?: number;
}) {
  const identificacao = [identidade.nomeProfissional, identidade.registroProfissional]
    .filter(Boolean)
    .join(" ");

  return (
    <Document title={titulo} author={identidade.nomeProfissional ?? undefined} language="pt-BR">
      <Page
        size="A4"
        orientation="portrait"
        style={[estilos.pagina, { paddingTop: estilos.pagina.paddingTop + alturaCabecalhoExtra }]}
      >
        {identidade.marcaDagua && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <Image fixed style={estilos.marcaDagua} src={identidade.marcaDagua} />
        )}

        <View fixed style={[estilos.cabecalho, { borderColor: identidade.corLinhas }]}>
          {identidade.logo ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={estilos.logo} src={identidade.logo} />
          ) : (
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12 }}>
              {identidade.nomeProfissional ?? ""}
            </Text>
          )}
          {identidade.frase ? <Text style={estilos.frase}>{identidade.frase}</Text> : <View />}
        </View>

        {cabecalhoExtra ? (
          <View fixed style={{ position: "absolute", top: 100, left: 40, right: 40 }}>
            {cabecalhoExtra}
          </View>
        ) : null}

        {children}

        <View fixed style={estilos.rodape}>
          {identificacao ? (
            <Text style={estilos.rodapeTexto}>
              ------------------------------ {identificacao} ------------------------------
            </Text>
          ) : null}
          <Text
            style={estilos.numero}
            render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

// Bloco de assinatura no fim do documento, só na última página e alinhado à
// direita (decisão do responsável, 20/10/2026). É imagem de identificação
// visual, não assinatura digital certificada. Sem imagem cadastrada, não aparece.
export function Assinatura({ identidade }: { identidade: Identidade }) {
  if (!identidade.assinatura) return null;

  return (
    <View wrap={false} style={{ marginTop: 28, alignItems: "flex-end" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={identidade.assinatura} style={{ width: 230, maxHeight: 110, objectFit: "contain" }} />
    </View>
  );
}

export async function gerarPdf(documento: Parameters<typeof renderToBuffer>[0]) {
  return renderToBuffer(documento);
}

// Nome sugerido para o arquivo: "Tipo - Nome do paciente - dd-mm-aaaa.pdf".
export function nomeDoArquivo(tipo: string, paciente: string, dataISO: string) {
  const [ano, mes, dia] = dataISO.split("-");
  const limpo = (texto: string) => texto.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return `${limpo(tipo)} - ${limpo(paciente)} - ${dia}-${mes}-${ano}.pdf`;
}

// Cabeçalho do arquivo HTTP com o nome em UTF-8.
export function disposicao(nome: string, baixar = false) {
  const ascii = nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "");
  return `${baixar ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

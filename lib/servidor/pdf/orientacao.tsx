import fs from "node:fs";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { partesComNegrito, type ConteudoOrientacao } from "@/lib/nutricao/orientacao";
import { formatarData } from "@/lib/nutricao/paciente";
import { resolverCaminho } from "../arquivos";
import { Assinatura, DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF da orientação: blocos na ordem da tela, com imagens e assinatura.

const COR = "#9a3412";
const LARGURA = 515;

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: COR, paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4, flexDirection: "row", justifyContent: "space-between" },
  negrito: { fontFamily: "Helvetica-Bold" },
  subtitulo: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 12, marginBottom: 4, color: COR },
  paragrafo: { lineHeight: 1.4, marginTop: 6 },
  item: { flexDirection: "row", marginTop: 3 },
});

function TextoComNegrito({ texto }: { texto: string }) {
  return (
    <>
      {partesComNegrito(texto).map((p, i) => (
        <Text key={i} style={p.negrito ? estilos.negrito : undefined}>
          {p.texto}
        </Text>
      ))}
    </>
  );
}

function imagem(caminho: string) {
  const destino = resolverCaminho("orientacoes", caminho);
  if (!destino || !fs.existsSync(destino)) return null;
  const extensao = caminho.split(".").pop()?.toLowerCase();
  // react-pdf lê PNG e JPG.
  if (extensao !== "png" && extensao !== "jpg" && extensao !== "jpeg") return null;
  return { data: fs.readFileSync(destino), format: extensao === "png" ? ("png" as const) : ("jpg" as const) };
}

export async function gerarPdfDaOrientacao(
  dados: { paciente: string; data: string; titulo: string; conteudo: ConteudoOrientacao },
  identidade: Identidade
) {
  return gerarPdf(
    <DocumentoPadrao
      identidade={identidade}
      titulo={`${dados.titulo} — ${dados.paciente}`}
      alturaCabecalhoExtra={46}
      cabecalhoExtra={
        <View>
          <Text style={estilos.titulo}>{dados.titulo}</Text>
          <View style={[estilos.identificacao, { borderColor: identidade.corLinhas }]}>
            <Text style={estilos.negrito}>Nome: {dados.paciente}</Text>
            <Text style={estilos.negrito}>Data: {formatarData(dados.data)}</Text>
          </View>
        </View>
      }
    >
      {dados.conteudo.blocos.map((b) => {
        if (b.tipo === "titulo") return b.texto.trim() ? <Text key={b.id} style={estilos.subtitulo}>{b.texto}</Text> : null;
        if (b.tipo === "paragrafo")
          return b.texto.trim() ? (
            <Text key={b.id} style={estilos.paragrafo}>
              <TextoComNegrito texto={b.texto} />
            </Text>
          ) : null;
        if (b.tipo === "lista")
          return (
            <View key={b.id} style={{ marginTop: 4 }}>
              {b.itens
                .filter((i) => i.trim())
                .map((item, n) => (
                  <View key={n} style={estilos.item} wrap={false}>
                    <Text style={{ width: 12 }}>•</Text>
                    <Text style={{ flex: 1, lineHeight: 1.35 }}>
                      <TextoComNegrito texto={item} />
                    </Text>
                  </View>
                ))}
            </View>
          );
        const arquivo = imagem(b.caminho);
        if (!arquivo) return null;
        return (
          <View key={b.id} style={{ marginTop: 8, alignItems: "center" }} wrap={false}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={arquivo} style={{ width: (LARGURA * b.largura) / 100, objectFit: "contain" }} />
            {b.legenda.trim() ? <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>{b.legenda}</Text> : null}
          </View>
        );
      })}
      {dados.conteudo.assinatura ? <Assinatura identidade={identidade} /> : null}
    </DocumentoPadrao>
  );
}

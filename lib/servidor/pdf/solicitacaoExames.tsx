import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { examesPreenchidos, type ExameDaLista } from "@/lib/nutricao/exames";
import { formatarData } from "@/lib/nutricao/paciente";
import { Assinatura, DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF da solicitação de exames: paciente, data de emissão, exames,
// observações e identificação profissional.

const COR = "#9a3412";

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: COR, paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4, flexDirection: "row", justifyContent: "space-between" },
  negrito: { fontFamily: "Helvetica-Bold" },
  item: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderColor: "#e5e7eb" },
  marcador: { width: 14 },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 14, marginBottom: 5, color: COR },
});

export async function gerarPdfDaSolicitacao(
  dados: { paciente: string; data: string; titulo: string; exames: ExameDaLista[]; observacoes: string; rascunho: boolean },
  identidade: Identidade
) {
  const exames = examesPreenchidos(dados.exames);
  return gerarPdf(
    <DocumentoPadrao
      identidade={identidade}
      titulo={`Solicitação de exames — ${dados.paciente}`}
      alturaCabecalhoExtra={46}
      cabecalhoExtra={
        <View>
          <Text style={estilos.titulo}>Solicitação de exames</Text>
          <View style={[estilos.identificacao, { borderColor: identidade.corLinhas }]}>
            <Text style={estilos.negrito}>Nome: {dados.paciente}</Text>
            <Text style={estilos.negrito}>Data: {formatarData(dados.data)}</Text>
          </View>
        </View>
      }
    >
      {dados.rascunho ? <Text style={{ fontSize: 8.5, color: "#92400e", marginTop: 4 }}>Prévia: solicitação ainda não emitida.</Text> : null}
      <Text style={estilos.secao}>Solicito os seguintes exames:</Text>
      {exames.map((e, n) => (
        <View key={e.id} style={estilos.item} wrap={false}>
          <Text style={estilos.marcador}>{n + 1}.</Text>
          <Text style={{ flex: 1 }}>{e.nome}</Text>
        </View>
      ))}
      {dados.observacoes.trim() ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Observações</Text>
          <Text style={{ lineHeight: 1.35 }}>{dados.observacoes.trim()}</Text>
        </View>
      ) : null}
      <Assinatura identidade={identidade} />
    </DocumentoPadrao>
  );
}

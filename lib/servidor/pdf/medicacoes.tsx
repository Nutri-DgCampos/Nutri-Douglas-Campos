import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  AVISO_DO_DOCUMENTO,
  calcularSemana,
  comUnidade,
  formatar,
  textoDaConcentracao,
  textoDaSemana,
  type DadosDaMedicacao,
} from "@/lib/nutricao/medicacao";
import { formatarData } from "@/lib/nutricao/paciente";
import { gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF do resumo de medicações. Por decisão do cliente (ND-193/194), só este
// PDF não leva logotipo, marca-d'água nem assinatura: identificação em texto
// e o aviso informativo obrigatório.

const estilos = StyleSheet.create({
  pagina: { paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: "#1f2937" },
  titulo: { fontFamily: "Helvetica-Bold", fontSize: 13, textAlign: "center", marginBottom: 8 },
  id: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#9ca3af", paddingVertical: 4, marginBottom: 10 },
  negrito: { fontFamily: "Helvetica-Bold" },
  cabecalho: { flexDirection: "row", backgroundColor: "#f3f4f6", borderBottomWidth: 0.5, borderColor: "#d1d5db", paddingVertical: 3 },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 4 },
  c1: { width: "30%", paddingHorizontal: 3 },
  c2: { width: "30%", paddingHorizontal: 3 },
  c3: { width: "20%", paddingHorizontal: 3, textAlign: "right" },
  c4: { width: "20%", paddingHorizontal: 3, textAlign: "right" },
  pequeno: { fontSize: 8, color: "#6b7280" },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 14, marginBottom: 4 },
  aviso: { marginTop: 16, padding: 6, borderWidth: 0.75, borderColor: "#9ca3af", fontSize: 8.5, lineHeight: 1.35 },
  rodape: { position: "absolute", bottom: 22, left: 40, right: 40, textAlign: "center", fontSize: 8, color: "#6b7280" },
});

export async function gerarPdfDeMedicacoes(
  dados: { paciente: string; dataConsulta: string; emissao: string; medicacoes: DadosDaMedicacao[]; anotacoes: string },
  identidade: Identidade
) {
  const profissional = [identidade.nomeProfissional, identidade.registroProfissional].filter(Boolean).join(" — ");
  return gerarPdf(
    <Document title={`Medicações — ${dados.paciente}`} author={identidade.nomeProfissional ?? undefined} language="pt-BR">
      <Page size="A4" style={estilos.pagina}>
        <Text style={estilos.titulo}>Resumo semanal de medicações</Text>
        <View style={estilos.id}>
          <View>
            <Text>
              <Text style={estilos.negrito}>Paciente: </Text>
              {dados.paciente}
            </Text>
            <Text>
              <Text style={estilos.negrito}>Consulta: </Text>
              {formatarData(dados.dataConsulta)}
            </Text>
          </View>
          <View>
            <Text>
              <Text style={estilos.negrito}>Emitido em: </Text>
              {formatarData(dados.emissao)}
            </Text>
            {profissional ? <Text>{profissional}</Text> : null}
          </View>
        </View>

        <View style={estilos.cabecalho} fixed>
          <Text style={[estilos.c1, estilos.negrito]}>Medicamento</Text>
          <Text style={[estilos.c2, estilos.negrito]}>Uso na semana</Text>
          <Text style={[estilos.c3, estilos.negrito]}>Total semanal</Text>
          <Text style={[estilos.c4, estilos.negrito]}>Princípio ativo</Text>
        </View>
        {dados.medicacoes.length === 0 ? <Text style={{ marginTop: 6 }}>Nenhuma medicação em uso registrada.</Text> : null}
        {dados.medicacoes.map((m, i) => {
          const c = calcularSemana(m);
          return (
            <View key={i} style={estilos.linha} wrap={false}>
              <View style={estilos.c1}>
                <Text style={estilos.negrito}>{m.nome || "Medicamento"}</Text>
                {m.principioAtivo ? <Text style={estilos.pequeno}>{m.principioAtivo}</Text> : null}
                {textoDaConcentracao(m) ? <Text style={estilos.pequeno}>{textoDaConcentracao(m)}</Text> : null}
                {m.apresentacao ? <Text style={estilos.pequeno}>{m.apresentacao}</Text> : null}
              </View>
              <View style={estilos.c2}>
                <Text>{textoDaSemana(m) || "—"}</Text>
                {m.frequenciaTexto ? <Text style={estilos.pequeno}>{m.frequenciaTexto}</Text> : null}
                {m.observacoes ? <Text style={estilos.pequeno}>{m.observacoes}</Text> : null}
              </View>
              <Text style={estilos.c3}>{c.fisicoSemanal !== null ? comUnidade(c.fisicoSemanal, c.unidadeFisica) : "Dados insuficientes"}</Text>
              <Text style={estilos.c4}>{c.ativoSemanal !== null ? `${formatar(c.ativoSemanal)} ${c.unidadeAtivo}` : "—"}</Text>
            </View>
          );
        })}

        {dados.anotacoes.trim() ? (
          <View wrap={false}>
            <Text style={estilos.secao}>Anotações sobre medicações</Text>
            <Text style={{ lineHeight: 1.35 }}>{dados.anotacoes.trim()}</Text>
          </View>
        ) : null}

        <Text style={estilos.aviso} wrap={false}>
          {AVISO_DO_DOCUMENTO}
        </Text>
        <Text style={estilos.rodape} fixed render={({ pageNumber, totalPages }) => `${profissional}${profissional ? " · " : ""}${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  );
}

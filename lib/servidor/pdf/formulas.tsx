import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { calcularDispensacao, formatar, textoDaDosagem, type Formula } from "@/lib/nutricao/formula";
import { formatarData } from "@/lib/nutricao/paciente";
import { Assinatura, DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF de fórmulas no modelo "Manipulados" (FIG-183): ingredientes com linha
// pontilhada até a dosagem, excipiente, dose, posologia, quantidade total e
// orientações. Individual (uma fórmula) ou consolidado (as escolhidas).

const COR = "#9a3412";

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: COR, paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4, flexDirection: "row", justifyContent: "space-between" },
  negrito: { fontFamily: "Helvetica-Bold" },
  formula: { marginTop: 14 },
  nome: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginBottom: 4 },
  ingrediente: { flexDirection: "row", alignItems: "flex-end", marginTop: 4, fontSize: 10.5 },
  pontos: { flex: 1, borderBottomWidth: 1, borderStyle: "dotted", borderColor: "#6b7280", marginHorizontal: 4, marginBottom: 3 },
  linha: { marginTop: 8, fontSize: 10.5 },
  pequeno: { fontSize: 8.5, color: "#4b5563", marginTop: 3 },
});

function BlocoDaFormula({ f, mostrarNome }: { f: Formula; mostrarNome: boolean }) {
  const d = calcularDispensacao(f);
  const componentes = f.componentes.filter((c) => c.nome.trim());
  return (
    <View style={estilos.formula} wrap={false}>
      {mostrarNome && f.nome.trim() ? <Text style={estilos.nome}>{f.nome}</Text> : null}
      {componentes.map((c) => (
        <View key={c.id} style={estilos.ingrediente}>
          <Text>{c.nome}</Text>
          <View style={estilos.pontos} />
          <Text>
            {textoDaDosagem(c) || "—"}
            {c.base === "dose" && textoDaDosagem(c) ? " por dose" : ""}
          </Text>
        </View>
      ))}
      <Text style={estilos.linha}>Excipiente qsp: {f.excipiente}</Text>
      {f.apresentacao.trim() ? <Text style={estilos.linha}>Apresentação: {f.apresentacao}</Text> : null}
      {f.dose.trim() ? <Text style={estilos.linha}>{f.dose}</Text> : null}
      <Text style={estilos.linha}>Posologia: {f.posologia}</Text>
      {d.totalDeUnidades !== null ? (
        <Text style={estilos.linha}>
          Quantidade total: {formatar(d.totalDeUnidades)} {f.apresentacao.trim() || "unidades"} ({f.dispensacao.dias} dias)
        </Text>
      ) : null}
      {f.orientacoesFarmacia.trim() ? <Text style={estilos.linha}>Orientações para a farmácia: {f.orientacoesFarmacia}</Text> : null}
      {f.orientacoesPaciente.trim() ? <Text style={estilos.linha}>Orientações: {f.orientacoesPaciente}</Text> : null}
      {f.observacao.trim() ? <Text style={estilos.linha}>Observação: {f.observacao}</Text> : null}
    </View>
  );
}

export async function gerarPdfDeFormulas(
  dados: { paciente: string; dataConsulta: string; formulas: Formula[]; titulo?: string },
  identidade: Identidade
) {
  const individual = dados.formulas.length === 1;
  const titulo = dados.titulo ?? "Manipulados";
  return gerarPdf(
    <DocumentoPadrao
      identidade={identidade}
      titulo={`${titulo} — ${dados.paciente}`}
      alturaCabecalhoExtra={46}
      cabecalhoExtra={
        <View>
          <Text style={estilos.titulo}>{titulo}</Text>
          <View style={[estilos.identificacao, { borderColor: identidade.corLinhas }]}>
            <Text style={estilos.negrito}>Nome: {dados.paciente}</Text>
            <Text style={estilos.negrito}>Data da consulta: {formatarData(dados.dataConsulta)}</Text>
          </View>
        </View>
      }
    >
      {dados.formulas.map((f, i) => (
        <BlocoDaFormula key={i} f={f} mostrarNome={!individual || titulo === "Manipulados"} />
      ))}
      <Assinatura identidade={identidade} />
    </DocumentoPadrao>
  );
}

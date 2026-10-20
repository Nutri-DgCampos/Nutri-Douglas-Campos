import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF de conferência da identidade visual: reproduz o modelo do Plano
// Alimentar com dados fictícios. Não pertence a nenhum paciente.

const estilos = StyleSheet.create({
  titulo: {
    textAlign: "center",
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: "#9a3412",
    paddingVertical: 4,
  },
  identificacao: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 4,
    marginBottom: 12,
  },
  negrito: { fontFamily: "Helvetica-Bold" },
  objetivo: { textAlign: "center", fontFamily: "Helvetica-Bold", color: "#9a3412", marginBottom: 8 },
  refeicao: { fontFamily: "Helvetica-Bold", marginTop: 12, marginBottom: 4 },
  linha: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4 },
  alimento: { width: "50%" },
  quantidade: { width: "50%" },
  aviso: { marginTop: 18, fontSize: 8, color: "#6b7280", textAlign: "center" },
});

const REFEICOES = [
  {
    nome: "CAFÉ DA MANHÃ (07:00)",
    itens: [
      ["Pão, trigo, forma, integral", "2 fatias (50g)"],
      ["Ovo, de galinha, inteiro, cozido", "2 unidades (100g)"],
      ["Mamão, Papaia, cru", "1 fatia média (140g)"],
    ],
  },
  {
    nome: "ALMOÇO (12:30)",
    itens: [
      ["Arroz, tipo 1, cozido", "2 colheres de servir cheias (100g)"],
      ["Feijão, carioca, cozido", "1 concha média (70g)"],
      ["Frango, peito, sem pele, grelhado", "1 filé médio (120g)"],
      ["Salada de folhas", "à vontade"],
    ],
  },
];

export async function gerarPdfExemplo(identidade: Identidade) {
  return gerarPdf(
    <DocumentoPadrao identidade={identidade} titulo="Plano Alimentar — exemplo">
      <Text style={estilos.titulo}>Plano Alimentar</Text>

      <View style={[estilos.identificacao, { borderColor: identidade.corLinhas }]}>
        <View>
          <Text>
            <Text style={estilos.negrito}>Nome: </Text>Paciente Exemplo
          </Text>
          <Text>
            <Text style={estilos.negrito}>Idade: </Text>32 anos
          </Text>
        </View>
        <View>
          <Text>
            <Text style={estilos.negrito}>Data da consulta: </Text>20/10/2026
          </Text>
          <Text>
            <Text style={estilos.negrito}>Peso: </Text>56,4 kg{"   "}
            <Text style={estilos.negrito}>Altura: </Text>155,0 cm
          </Text>
        </View>
      </View>

      <Text style={estilos.objetivo}>Definição</Text>

      {REFEICOES.map((refeicao) => (
        <View key={refeicao.nome} wrap={false}>
          <Text style={estilos.refeicao}>{refeicao.nome}</Text>
          {refeicao.itens.map(([alimento, quantidade], indice) => (
            <View
              key={alimento}
              style={[estilos.linha, { backgroundColor: indice % 2 === 1 ? "#d1d5db" : "#ffffff" }]}
            >
              <Text style={estilos.alimento}>{alimento}</Text>
              <Text style={estilos.quantidade}>{quantidade}</Text>
            </View>
          ))}
        </View>
      ))}

      <Text style={estilos.aviso}>
        Documento de exemplo para conferência do logotipo, da frase, das cores e do rodapé.
      </Text>
    </DocumentoPadrao>
  );
}

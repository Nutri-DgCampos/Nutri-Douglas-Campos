import { StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  formatarNumero,
  hidratacaoDiaria,
  nomeNaPrescricao,
  textoDaQuantidade,
  totaisDaDieta,
  totaisDosItens,
  type Composicoes,
  type DocumentoDieta,
  type Totais,
} from "@/lib/nutricao/dieta";
import { formatarNutriente } from "@/lib/nutricao/calculo";
import { formatarData } from "@/lib/nutricao/paciente";
import { Assinatura, DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF da dieta (Plano Alimentar), conforme o modelo de referência do
// roteiro (FIG-184 a 186): identificação do paciente repetida em todas as
// páginas, refeições com nome e horário, alimentos à esquerda e quantidade à
// direita em faixas alternadas, opções identificadas, observações gerais,
// hidratação e, por último, as trocas equivalentes.
//
// Modelo "simples": só a prescrição. "Detalhado": acrescenta kcal e macros
// de cada refeição e o total da dieta (opções de referência).

export type ModeloPdf = "simples" | "detalhado";

export type DadosDoPdf = {
  documento: DocumentoDieta;
  composicoes: Composicoes;
  paciente: { nome: string; idade: number | null; alturaCm: number | null };
  dataConsulta: string; // AAAA-MM-DD
  modelo: ModeloPdf;
};

const COR_TITULO = "#9a3412";
const FAIXA = "#d9d9d9";

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: COR_TITULO, paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4 },
  linhaIdentificacao: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  negrito: { fontFamily: "Helvetica-Bold" },
  nomeDieta: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 4 },
  objetivo: { textAlign: "center", fontFamily: "Helvetica-Bold", color: COR_TITULO, marginTop: 6, marginBottom: 4 },
  refeicao: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 14, marginBottom: 4 },
  opcao: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: "#374151", marginTop: 6, marginBottom: 3 },
  avisoOpcoes: { fontSize: 8.5, color: "#4b5563", marginBottom: 2 },
  linha: { flexDirection: "row", paddingVertical: 4.5, paddingHorizontal: 4 },
  alimento: { width: "50%", paddingRight: 8 },
  quantidade: { width: "50%" },
  observacaoRefeicao: { marginTop: 4, paddingHorizontal: 4, fontSize: 9, color: "#374151", fontFamily: "Helvetica-Oblique" },
  nutricional: { marginTop: 3, paddingHorizontal: 4, fontSize: 8.5, color: "#4b5563" },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 20, marginBottom: 6 },
  paragrafo: { marginBottom: 8, lineHeight: 1.35 },
  troca: { marginBottom: 5, lineHeight: 1.35 },
  tabelaTotal: { marginTop: 6, borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4 },
});

const MACROS = [
  ["kcal", "Kcal", ""],
  ["carboidratos", "CHO", " g"],
  ["proteinas", "PTN", " g"],
  ["lipidios", "LIP", " g"],
] as const;

function textoNutricional(totais: Totais) {
  return MACROS.map(([codigo, rotulo, unidade]) => {
    const total = totais[codigo];
    if (!total || total.valor === null) return `${rotulo} —`;
    return `${rotulo} ${formatarNutriente(codigo, total.valor)}${unidade}${total.completo ? "" : "*"}`;
  }).join("   ·   ");
}

function Identificacao({ dados, corLinhas }: { dados: DadosDoPdf; corLinhas: string }) {
  const { paciente, documento } = dados;
  const peso = documento.pesoReferencia.valor;

  return (
    <View>
      <Text style={estilos.titulo}>Plano Alimentar</Text>
      <View style={[estilos.identificacao, { borderColor: corLinhas }]}>
        <View style={estilos.linhaIdentificacao}>
          <Text style={estilos.negrito}>Nome: {paciente.nome}</Text>
          <Text style={estilos.negrito}>Data da consulta: {formatarData(dados.dataConsulta)}</Text>
        </View>
        <View style={estilos.linhaIdentificacao}>
          <Text style={estilos.negrito}>{paciente.idade !== null ? `Idade: ${paciente.idade} anos` : " "}</Text>
          <Text style={estilos.negrito}>
            {[
              peso ? `Peso: ${formatarNumero(peso, 2)} kg` : null,
              paciente.alturaCm ? `Altura: ${formatarNumero(paciente.alturaCm, 1)} cm` : null,
            ]
              .filter(Boolean)
              .join("      ") || " "}
          </Text>
        </View>
      </View>
    </View>
  );
}

function LinhaDeAlimento({ nome, quantidade, faixa }: { nome: string; quantidade: string; faixa: boolean }) {
  return (
    <View wrap={false} style={[estilos.linha, faixa ? { backgroundColor: FAIXA } : {}]}>
      <Text style={estilos.alimento}>{nome}</Text>
      <Text style={estilos.quantidade}>{quantidade}</Text>
    </View>
  );
}

export function DocumentoDaDieta({ dados, identidade }: { dados: DadosDoPdf; identidade: Identidade }) {
  const { documento, composicoes, modelo } = dados;
  const detalhado = modelo === "detalhado";
  const nutrientes = MACROS.map(([codigo]) => codigo);

  const observacoes = documento.observacoes.filter((observacao) => observacao.texto.trim());
  const agua = hidratacaoDiaria(documento.hidratacao.mlPorKg, documento.pesoReferencia.valor);

  // Trocas equivalentes, agrupadas por refeição e alimento de referência.
  const trocas = documento.refeicoes.flatMap((refeicao) =>
    refeicao.opcoes.flatMap((opcao) =>
      opcao.itens
        .filter((item) => item.alimentoId && item.substituicoes.some((s) => s.quantidade))
        .map((item) => ({
          refeicao: refeicao.nome,
          texto: [
            `${nomeNaPrescricao(item)} ${textoDaQuantidade(item)}`,
            ...item.substituicoes
              .filter((s) => s.quantidade)
              .map((s) => `${s.nome} ${textoDaQuantidade({ ...s, quantidade: s.quantidade })}`),
          ].join(" = "),
        }))
    )
  );

  return (
    <DocumentoPadrao
      identidade={identidade}
      titulo={`Plano Alimentar — ${dados.paciente.nome}`}
      cabecalhoExtra={<Identificacao dados={dados} corLinhas={identidade.corLinhas} />}
      alturaCabecalhoExtra={64}
    >
      {documento.titulo.trim() ? <Text style={estilos.nomeDieta}>{documento.titulo.trim()}</Text> : null}
      {documento.objetivo.trim() ? <Text style={estilos.objetivo}>{documento.objetivo.trim()}</Text> : null}

      {documento.refeicoes.map((refeicao) => {
        const varias = refeicao.opcoes.length > 1;
        const cabecalho = `${refeicao.nome.trim().toUpperCase()}${refeicao.horario ? ` (${refeicao.horario})` : ""}`;

        return (
          <View key={refeicao.id}>
            <Text style={estilos.refeicao} minPresenceAhead={60}>
              {cabecalho}
            </Text>
            {varias ? <Text style={estilos.avisoOpcoes}>Escolha uma das opções abaixo.</Text> : null}

            {refeicao.opcoes.map((opcao, numero) => (
              <View key={opcao.id}>
                {varias ? (
                  <Text style={estilos.opcao} minPresenceAhead={30}>
                    {`Opção ${numero + 1}`}
                  </Text>
                ) : null}
                {opcao.itens
                  .filter((item) => item.alimentoId)
                  .map((item, indice) => (
                    <LinhaDeAlimento
                      key={item.id}
                      nome={nomeNaPrescricao(item)}
                      quantidade={textoDaQuantidade(item)}
                      faixa={indice % 2 === 1}
                    />
                  ))}
                {detalhado ? (
                  <Text style={estilos.nutricional}>
                    {textoNutricional(totaisDosItens(opcao.itens, composicoes, nutrientes))}
                  </Text>
                ) : null}
              </View>
            ))}

            {refeicao.observacao?.trim() ? <Text style={estilos.observacaoRefeicao}>{refeicao.observacao.trim()}</Text> : null}
          </View>
        );
      })}

      {detalhado ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Total da dieta</Text>
          <View style={[estilos.tabelaTotal, { borderColor: identidade.corLinhas }]}>
            <Text>{textoNutricional(totaisDaDieta(documento, composicoes, nutrientes))}</Text>
          </View>
          <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 3 }}>
            Soma da opção de referência de cada refeição. * Total parcial: algum alimento não tem o dado na base.
          </Text>
        </View>
      ) : null}

      {observacoes.length > 0 ? (
        <View>
          <Text style={estilos.secao} minPresenceAhead={40}>
            Observações Gerais:
          </Text>
          {observacoes.map((observacao, numero) => (
            <Text key={observacao.id} style={estilos.paragrafo}>
              {`${numero + 1}- ${observacao.titulo.trim() ? `${observacao.titulo.trim()}: ` : ""}${observacao.texto.trim()}`}
            </Text>
          ))}
        </View>
      ) : null}

      {agua !== null || documento.hidratacao.observacoes.trim() ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Hidratação:</Text>
          {agua !== null ? (
            <Text style={estilos.paragrafo}>
              {`${formatarNumero(agua, 0)} mL/dia (${formatarNumero(agua / 1000, 2)} L/dia)`}
            </Text>
          ) : null}
          {documento.hidratacao.observacoes.trim() ? (
            <Text style={estilos.paragrafo}>{documento.hidratacao.observacoes.trim()}</Text>
          ) : null}
        </View>
      ) : null}

      {trocas.length > 0 ? (
        <View>
          <Text style={estilos.secao} minPresenceAhead={40}>
            Trocas equivalentes:
          </Text>
          {trocas.map((troca, indice) => (
            <Text key={indice} style={estilos.troca}>
              {`*${troca.refeicao.trim() ? `${troca.refeicao.trim()}: ` : ""}${troca.texto}`}
            </Text>
          ))}
        </View>
      ) : null}

      <Assinatura identidade={identidade} />
    </DocumentoPadrao>
  );
}

export async function gerarPdfDaDieta(dados: DadosDoPdf, identidade: Identidade) {
  return gerarPdf(<DocumentoDaDieta dados={dados} identidade={identidade} />);
}

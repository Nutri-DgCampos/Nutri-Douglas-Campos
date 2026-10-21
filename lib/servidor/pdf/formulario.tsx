import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { textoDaResposta, type Pergunta, type Recordatorio, type Respostas } from "@/lib/nutricao/anamnese";
import { formatarData } from "@/lib/nutricao/paciente";
import { DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF da ficha de anamnese ou do recordatório alimentar (quando solicitado).
// Só as respostas: observações profissionais e lembrete não entram.

const COR = "#9a3412";

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: COR, paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4 },
  linhaId: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  negrito: { fontFamily: "Helvetica-Bold" },
  pergunta: { marginTop: 9 },
  textoPergunta: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  resposta: { lineHeight: 1.35 },
  vazio: { color: "#9ca3af" },
  refeicao: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 12, marginBottom: 4, color: COR },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d1d5db", paddingVertical: 3 },
  pequeno: { fontSize: 8, color: "#6b7280" },
});

type Cabecalho = { paciente: string; consulta: string | null; titulo: string; situacao: string };

function Identificacao({ c, identidade }: { c: Cabecalho; identidade: Identidade }) {
  return (
    <View>
      <Text style={estilos.titulo}>{c.titulo}</Text>
      <View style={[estilos.identificacao, { borderColor: identidade.corLinhas }]}>
        <View style={estilos.linhaId}>
          <Text style={estilos.negrito}>Nome: {c.paciente}</Text>
          <Text style={estilos.negrito}>{c.consulta ? `Consulta: ${formatarData(c.consulta)}` : ""}</Text>
        </View>
        <View style={estilos.linhaId}>
          <Text>{c.situacao}</Text>
        </View>
      </View>
    </View>
  );
}

export async function gerarPdfDaAnamnese(
  dados: Cabecalho & { perguntas: Pergunta[]; respostas: Respostas },
  identidade: Identidade
) {
  return gerarPdf(
    <DocumentoPadrao
      identidade={identidade}
      titulo={`${dados.titulo} — ${dados.paciente}`}
      alturaCabecalhoExtra={58}
      cabecalhoExtra={<Identificacao c={dados} identidade={identidade} />}
    >
      {dados.perguntas.map((p, n) => {
        const resposta = textoDaResposta(p, dados.respostas[p.id]);
        return (
          <View key={p.id} style={estilos.pergunta} wrap={false}>
            {p.texto.trim() ? (
              <Text style={estilos.textoPergunta}>
                {n + 1}. {p.texto}
              </Text>
            ) : null}
            <Text style={[estilos.resposta, resposta ? {} : estilos.vazio]}>{resposta || "Sem resposta"}</Text>
          </View>
        );
      })}
    </DocumentoPadrao>
  );
}

export async function gerarPdfDoRecordatorio(dados: Cabecalho & { conteudo: Recordatorio }, identidade: Identidade) {
  const refeicoes = dados.conteudo.refeicoes.filter((r) => r.itens.some((i) => i.alimento.trim()) || r.observacao.trim());
  return gerarPdf(
    <DocumentoPadrao
      identidade={identidade}
      titulo={`Recordatório alimentar — ${dados.paciente}`}
      alturaCabecalhoExtra={58}
      cabecalhoExtra={<Identificacao c={dados} identidade={identidade} />}
    >
      {refeicoes.length === 0 ? <Text style={[estilos.vazio, { marginTop: 10 }]}>Nenhum alimento informado.</Text> : null}
      {refeicoes.map((r) => (
        <View key={r.id} wrap={false}>
          <Text style={estilos.refeicao}>
            {(r.nome.trim() || "Refeição").toUpperCase()}
            {r.horario ? ` (${r.horario})` : ""}
          </Text>
          {r.itens
            .filter((i) => i.alimento.trim())
            .map((i) => (
              <View key={i.id} style={estilos.linha}>
                <Text style={{ flex: 1, paddingHorizontal: 3 }}>{i.alimento}</Text>
                <Text style={{ flex: 1, paddingHorizontal: 3 }}>{i.quantidade || "—"}</Text>
              </View>
            ))}
          {r.observacao.trim() ? <Text style={[estilos.pequeno, { marginTop: 3 }]}>Observação: {r.observacao.trim()}</Text> : null}
        </View>
      ))}
      {dados.conteudo.observacoes.trim() ? (
        <View wrap={false}>
          <Text style={estilos.refeicao}>PREFERÊNCIAS E HÁBITOS ALIMENTARES</Text>
          <Text style={estilos.resposta}>{dados.conteudo.observacoes.trim()}</Text>
        </View>
      ) : null}
    </DocumentoPadrao>
  );
}

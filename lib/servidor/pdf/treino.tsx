import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { DIAS, textoDasRepeticoes, type PlanoDeTreino } from "@/lib/treino";
import { seriesDaSessao } from "@/lib/treinoEditor";
import { DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF do treino de musculação (T4a): identificação do aluno, versão e data,
// uma tabela por sessão (exercício, séries, repetições, carga, descanso).
//
// "PDF": o que o aluno vê. "PDF detalhado": acrescenta os detalhes do editor
// (cadência, RPE, RIR, aquecimento, técnica, músculos), a Opção mesmo quando
// oculta ao aluno e o total de séries por sessão. As notas privadas do
// profissional nunca saem no PDF.

export type DadosDoPdfDoTreino = {
  aluno: { nome: string; idade: number | null };
  titulo: string;
  objetivo: string;
  plano: PlanoDeTreino;
  // null = rascunho (não enviado).
  versao: number | null;
  data: string; // ISO
  detalhado: boolean;
};

const FAIXA = "#eef2ee";

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: "#14532d", paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4 },
  linhaIdentificacao: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  negrito: { fontFamily: "Helvetica-Bold" },
  programa: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 4 },
  objetivo: { color: "#374151", marginTop: 2 },
  sessao: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 14, marginBottom: 4 },
  orientacao: { fontSize: 9, color: "#374151", fontFamily: "Helvetica-Oblique", marginBottom: 4 },
  cabecalhoTabela: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#9ca3af", paddingVertical: 3, paddingHorizontal: 4, fontFamily: "Helvetica-Bold", fontSize: 9 },
  linha: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 4 },
  exercicio: { width: "40%", paddingRight: 6 },
  coluna: { width: "15%", textAlign: "center" },
  nota: { fontSize: 8.5, color: "#4b5563", marginTop: 1.5 },
  total: { fontSize: 8.5, color: "#4b5563", marginTop: 3, paddingHorizontal: 4 },
  aviso: { fontSize: 8, color: "#6b7280", marginTop: 16 },
});

const num = (v: number | null | undefined, sufixo = "") => (v === null || v === undefined ? "—" : `${v.toLocaleString("pt-BR")}${sufixo}`);
const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

function Identificacao({ dados, corLinhas }: { dados: DadosDoPdfDoTreino; corLinhas: string }) {
  return (
    <View>
      <Text style={estilos.titulo}>Treino de musculação{dados.detalhado ? " — detalhado" : ""}</Text>
      <View style={[estilos.identificacao, { borderColor: corLinhas }]}>
        <View style={estilos.linhaIdentificacao}>
          <Text style={estilos.negrito}>Aluno: {dados.aluno.nome}</Text>
          <Text style={estilos.negrito}>{dados.versao === null ? `Rascunho de ${dataBr(dados.data)}` : `Versão ${dados.versao} · enviada em ${dataBr(dados.data)}`}</Text>
        </View>
        <View style={estilos.linhaIdentificacao}>
          <Text style={estilos.negrito}>{dados.aluno.idade !== null ? `Idade: ${dados.aluno.idade} anos` : " "}</Text>
          <Text> </Text>
        </View>
      </View>
    </View>
  );
}

export function DocumentoDoTreino({ dados, identidade }: { dados: DadosDoPdfDoTreino; identidade: Identidade }) {
  const ordem = DIAS.map((d) => d.chave as string);
  const sessoes = [...dados.plano.dias].sort((a, b) => ordem.indexOf(a.dia) - ordem.indexOf(b.dia));

  return (
    <DocumentoPadrao
      identidade={identidade}
      titulo={`Treino — ${dados.aluno.nome}`}
      cabecalhoExtra={<Identificacao dados={dados} corLinhas={identidade.corLinhas} />}
      alturaCabecalhoExtra={58}
    >
      {dados.titulo.trim() ? <Text style={estilos.programa}>{dados.titulo.trim()}</Text> : null}
      {dados.objetivo.trim() ? <Text style={estilos.objetivo}>Objetivo: {dados.objetivo.trim()}</Text> : null}

      {sessoes.map((sessao) => (
        <View key={sessao.dia}>
          <Text style={estilos.sessao} minPresenceAhead={60}>
            {`${DIAS.find((d) => d.chave === sessao.dia)?.nome ?? sessao.dia} — ${sessao.titulo}`}
          </Text>
          {sessao.observacao ? <Text style={estilos.orientacao}>{sessao.observacao}</Text> : null}
          <View style={estilos.cabecalhoTabela}>
            <Text style={estilos.exercicio}>Exercício</Text>
            <Text style={estilos.coluna}>Séries</Text>
            <Text style={estilos.coluna}>Repetições</Text>
            <Text style={estilos.coluna}>Carga</Text>
            <Text style={estilos.coluna}>Descanso</Text>
          </View>
          {sessao.exercicios.map((e, i) => {
            const alternativa = e.alternativa && (dados.detalhado || e.alternativa.visivel) ? e.alternativa : null;
            const a = dados.detalhado ? e.avancado : null;
            const detalhes = a
              ? [
                  a.tecnica,
                  a.cadencia ? `cadência ${a.cadencia}` : null,
                  a.rpe !== null ? `RPE ${num(a.rpe)}` : null,
                  a.rir !== null ? `RIR ${num(a.rir)}` : null,
                  a.aquecimento ? `aquecimento: ${a.aquecimento}` : null,
                  a.secundarios.length ? `secundários: ${a.secundarios.join(", ")}` : null,
                ].filter(Boolean)
              : [];
            return (
              <View key={i} wrap={false} style={[estilos.linha, i % 2 === 1 ? { backgroundColor: FAIXA } : {}]}>
                <View style={estilos.exercicio}>
                  <Text>{e.nome}</Text>
                  {dados.detalhado ? <Text style={estilos.nota}>{e.grupo}</Text> : null}
                  {e.observacao ? <Text style={estilos.nota}>{e.observacao}</Text> : null}
                  {alternativa ? (
                    <Text style={estilos.nota}>
                      {`Opção: ${alternativa.nome}${alternativa.observacao ? ` (${alternativa.observacao})` : ""}${dados.detalhado && !alternativa.visivel ? " · oculta ao aluno" : ""}`}
                    </Text>
                  ) : null}
                  {detalhes.length ? <Text style={estilos.nota}>{detalhes.join(" · ")}</Text> : null}
                </View>
                <Text style={estilos.coluna}>{num(e.series)}</Text>
                <Text style={estilos.coluna}>{textoDasRepeticoes(e)}</Text>
                <Text style={estilos.coluna}>{num(e.carga_kg, " kg")}</Text>
                <Text style={estilos.coluna}>{num(e.descanso_segundos, " s")}</Text>
              </View>
            );
          })}
          {dados.detalhado ? <Text style={estilos.total}>{`Total: ${seriesDaSessao(sessao)} séries`}</Text> : null}
        </View>
      ))}

      <Text style={estilos.aviso}>
        Em caso de dor forte ou repentina, dor no peito, falta de ar, tontura ou desmaio, interrompa o treino e procure atendimento médico.
      </Text>
    </DocumentoPadrao>
  );
}

export async function gerarPdfDoTreino(dados: DadosDoPdfDoTreino, identidade: Identidade) {
  return gerarPdf(<DocumentoDoTreino dados={dados} identidade={identidade} />);
}

import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { DIAS } from "@/lib/treino";
import { ordenarSessoesDaSemana, textoDosMinutos, totaisDaSemana, type ModalidadeEndurance, type PlanoEndurance } from "@/lib/treinoEndurance";
import { DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF da planilha de corrida ou ciclismo (T4c): uma tabela por semana do
// ciclo, com os totais calculados das linhas. "PDF detalhado" acrescenta os
// blocos de cada sessão, terreno, percurso, RPE alvo e a Opção mesmo oculta.
// Notas privadas do profissional nunca saem no PDF.

export type DadosDoPdfEndurance = {
  modalidade: ModalidadeEndurance;
  aluno: { nome: string; idade: number | null };
  titulo: string;
  objetivo: string;
  plano: PlanoEndurance;
  versao: number | null;
  data: string;
  detalhado: boolean;
};

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: "#14532d", paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4, flexDirection: "row", justifyContent: "space-between" },
  negrito: { fontFamily: "Helvetica-Bold" },
  programa: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 4 },
  texto: { color: "#374151", marginTop: 2 },
  semana: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 14, marginBottom: 4 },
  cabecalho: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#9ca3af", paddingVertical: 3, fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  linha: { flexDirection: "row", paddingVertical: 3.5, fontSize: 8.5 },
  nota: { fontSize: 8, color: "#4b5563", marginTop: 1 },
  total: { fontSize: 8.5, color: "#374151", marginTop: 3 },
  aviso: { fontSize: 8, color: "#6b7280", marginTop: 16 },
});

const dataBr = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const num = (v: number | null, sufixo = "") => (v === null ? "—" : `${v.toLocaleString("pt-BR")}${sufixo}`);

function somarDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/");
}

const DESDE_DOMINGO: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

export function DocumentoEndurance({ dados, identidade }: { dados: DadosDoPdfEndurance; identidade: Identidade }) {
  const ciclismo = dados.modalidade === "ciclismo";
  const colunas = ciclismo
    ? [["Dia", "11%"], ["Tipo / descrição", "33%"], ["Km", "8%"], ["Tempo", "9%"], ["Zona", "13%"], ["Meta", "14%"], ["TSS", "6%"], ["Alt. (m)", "6%"]]
    : [["Dia", "11%"], ["Tipo / descrição", "37%"], ["Km", "8%"], ["Tempo", "9%"], ["Zona", "13%"], ["Ritmo", "11%"], ["FC", "11%"]];
  const larg = (i: number) => ({ width: colunas[i][1], paddingRight: 4 });

  return (
    <DocumentoPadrao
      identidade={identidade}
      titulo={`${ciclismo ? "Ciclismo" : "Corrida"} — ${dados.aluno.nome}`}
      cabecalhoExtra={
        <View>
          <Text style={estilos.titulo}>{ciclismo ? "Planilha de ciclismo" : "Planilha de corrida"}{dados.detalhado ? " — detalhada" : ""}</Text>
          <View style={[estilos.identificacao, { borderColor: identidade.corLinhas }]}>
            <Text style={estilos.negrito}>Aluno: {dados.aluno.nome}{dados.aluno.idade !== null ? ` (${dados.aluno.idade} anos)` : ""}</Text>
            <Text style={estilos.negrito}>{dados.versao === null ? `Rascunho de ${dataBr(dados.data)}` : `Versão ${dados.versao} · enviada em ${dataBr(dados.data)}`}</Text>
          </View>
        </View>
      }
      alturaCabecalhoExtra={46}
    >
      {dados.titulo.trim() ? <Text style={estilos.programa}>{dados.titulo.trim()}</Text> : null}
      <Text style={estilos.texto}>
        {[dados.objetivo.trim() ? `Objetivo: ${dados.objetivo.trim()}` : null, dados.plano.ciclo.fase ? `Fase: ${dados.plano.ciclo.fase}` : null, `${dados.plano.semanas.length} ${dados.plano.semanas.length === 1 ? "semana" : "semanas"}`]
          .filter(Boolean)
          .join(" · ")}
      </Text>

      {dados.plano.semanas.map((semana, w) => {
        const inicio = dados.plano.ciclo.inicio ? (() => {
          const d = new Date(`${dados.plano.ciclo.inicio}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() + w * 7);
          return d.toISOString().slice(0, 10);
        })() : null;
        const t = totaisDaSemana(semana);
        return (
          <View key={w}>
            <Text style={estilos.semana} minPresenceAhead={60}>
              {`Semana ${w + 1}${inicio ? ` (${somarDias(inicio, 0)} a ${somarDias(inicio, 6)})` : ""}`}
            </Text>
            <View style={estilos.cabecalho}>
              {colunas.map(([rotulo], i) => (
                <Text key={rotulo} style={larg(i)}>
                  {rotulo}
                </Text>
              ))}
            </View>
            {semana.sessoes.length === 0 ? <Text style={estilos.nota}>Semana sem sessões (descanso).</Text> : null}
            {ordenarSessoesDaSemana(semana.sessoes).map(({ s }, i) => {
              const alternativa = s.alternativa && (dados.detalhado || s.alternativa.visivel) ? s.alternativa : null;
              return (
                <View key={i} wrap={false} style={[estilos.linha, i % 2 ? { backgroundColor: "#eef2ee" } : {}]}>
                  <Text style={larg(0)}>{`${DIAS.find((d) => d.chave === s.dia)?.rotulo ?? s.dia}${inicio ? ` ${somarDias(inicio, DESDE_DOMINGO[s.dia])}` : ""}`}</Text>
                  <View style={larg(1)}>
                    <Text style={estilos.negrito}>{s.tipo}</Text>
                    <Text>{s.descricao}</Text>
                    {s.observacao ? <Text style={estilos.nota}>{s.observacao}</Text> : null}
                    {alternativa ? <Text style={estilos.nota}>{`Opção: ${alternativa.descricao}${dados.detalhado && !alternativa.visivel ? " (oculta ao aluno)" : ""}`}</Text> : null}
                    {dados.detalhado && s.blocos.length ? (
                      <Text style={estilos.nota}>
                        {s.blocos
                          .map((b) => [b.repeticoes ? `${b.repeticoes}×` : null, b.descricao, b.duracao_min !== null ? `${num(b.duracao_min)} min` : null, b.distancia_km !== null ? `${num(b.distancia_km)} km` : null, b.intensidade].filter(Boolean).join(" "))
                          .join(" → ")}
                      </Text>
                    ) : null}
                    {dados.detalhado && (s.terreno || s.percurso || s.rpe_alvo !== null) ? (
                      <Text style={estilos.nota}>{[s.terreno, s.percurso, s.rpe_alvo !== null ? `RPE alvo ${num(s.rpe_alvo)}` : null].filter(Boolean).join(" · ")}</Text>
                    ) : null}
                  </View>
                  <Text style={larg(2)}>{num(s.distancia_km)}</Text>
                  <Text style={larg(3)}>{textoDosMinutos(s.duracao_min)}</Text>
                  <Text style={larg(4)}>{s.zona ?? "—"}</Text>
                  {ciclismo ? (
                    <>
                      <Text style={larg(5)}>{[s.fc_alvo ? `FC ${s.fc_alvo}` : null, s.potencia_alvo].filter(Boolean).join(" · ") || "—"}</Text>
                      <Text style={larg(6)}>{num(s.tss)}</Text>
                      <Text style={larg(7)}>{num(s.altimetria_m)}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={larg(5)}>{s.ritmo_alvo ?? "—"}</Text>
                      <Text style={larg(6)}>{s.fc_alvo ?? "—"}</Text>
                    </>
                  )}
                </View>
              );
            })}
            <Text style={estilos.total}>
              {[
                `Total: ${t.distancia_km !== null ? `${num(t.distancia_km)} km` : "distância não informada"}`,
                t.duracao_min !== null ? textoDosMinutos(t.duracao_min) : null,
                ciclismo ? `TSS ${t.tss !== null ? `${num(t.tss)}${t.tssParcial ? " (parcial)" : ""}` : "não disponível"}` : null,
                t.altimetria_m !== null ? `${num(t.altimetria_m)} m de altimetria` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        );
      })}

      <Text style={estilos.aviso}>
        Em caso de dor forte ou repentina, dor no peito, falta de ar, tontura ou desmaio, interrompa o treino e procure atendimento médico.
      </Text>
    </DocumentoPadrao>
  );
}

export async function gerarPdfEndurance(dados: DadosDoPdfEndurance, identidade: Identidade) {
  return gerarPdf(<DocumentoEndurance dados={dados} identidade={identidade} />);
}

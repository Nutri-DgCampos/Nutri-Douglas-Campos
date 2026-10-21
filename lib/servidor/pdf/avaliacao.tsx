import fs from "node:fs";
import path from "node:path";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  AVATARES,
  CAMPOS_BIOIMPEDANCIA,
  CATEGORIAS_DRI,
  CLASSES_GORDURA,
  DOBRAS,
  METODOS_GET,
  PERIMETRIA,
  PROTOCOLOS_DOBRAS,
  PROTOCOLOS_TMB,
  dobrasDoProtocolo,
  evolucaoDaRegiao,
  faixaDoNaf,
  type CampoBio,
  type Regiao,
  type Sexo,
} from "@/lib/nutricao/avaliacao";
import type { AvaliacaoDoc, ResultadoAvaliacao } from "@/lib/nutricao/avaliacaoDocumento";
import { formatarData } from "@/lib/nutricao/paciente";
import { Assinatura, DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF da avaliação física. O layout é próprio para leitura e impressão (o
// roteiro permite diferir da tela), com os mesmos dados e resultados.

export type PontoPdf = {
  data: string;
  peso: number | null;
  percentualGordura: number | null;
  massaGorda: number | null;
  massaLivre: number | null;
  metodo: string | null;
  perimetria: AvaliacaoDoc["perimetria"];
};

export type DadosDoPdfAvaliacao = {
  paciente: { nome: string; idade: number | null; sexo: Sexo | null };
  data: string;
  preliminar: boolean;
  documento: AvaliacaoDoc;
  resultados: ResultadoAvaliacao;
  historico: PontoPdf[]; // em ordem cronológica, terminando nesta avaliação
};

const COR = "#9a3412";
const n = (v: number | null | undefined, casas = 1) =>
  v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

const estilos = StyleSheet.create({
  titulo: { textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 12, color: COR, paddingVertical: 4 },
  identificacao: { borderTopWidth: 1, borderBottomWidth: 1, paddingVertical: 4, paddingHorizontal: 4 },
  linhaId: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  negrito: { fontFamily: "Helvetica-Bold" },
  secao: { fontFamily: "Helvetica-Bold", fontSize: 10.5, marginTop: 14, marginBottom: 5, color: COR },
  tabela: { borderTopWidth: 0.5, borderColor: "#d1d5db" },
  linha: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#d1d5db", paddingVertical: 3 },
  celula: { flex: 1, paddingHorizontal: 3 },
  celulaNome: { flex: 2, paddingHorizontal: 3 },
  pequeno: { fontSize: 8, color: "#6b7280" },
  destaque: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  aviso: { fontSize: 8.5, color: "#92400e", marginTop: 3 },
});

function Linha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.celulaNome}>{rotulo}</Text>
      <Text style={[estilos.celula, cor ? { color: cor } : {}]}>{valor}</Text>
    </View>
  );
}

function Avatares({ sexo, indice }: { sexo: Sexo; indice: number }) {
  // Conteúdo da imagem (não o caminho): no Windows, "C:\..." seria lido como endereço.
  const arquivo = {
    data: fs.readFileSync(
      sexo === "feminino"
        ? path.join(process.cwd(), "public", "nutricao", "avatares", "percentual-gordura-feminino.png")
        : path.join(process.cwd(), "public", "nutricao", "avatares", "percentual-gordura-masculino.png")
    ),
    format: "png" as const,
  };
  // Imagem de 2171 × 724 com 13 avatares igualmente espaçados.
  const largura = 515;
  const altura = (largura * 724) / 2171;
  const passo = (163.8 / 2171) * largura;
  const centro = (104 / 2171) * largura + indice * passo;
  return (
    <View style={{ width: largura, height: altura, position: "relative", marginTop: 4 }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={arquivo} style={{ width: largura, height: altura }} />
      <View
        style={{
          position: "absolute",
          left: centro - passo / 2 + 2,
          top: altura * 0.12,
          width: passo - 4,
          height: altura * 0.83,
          borderWidth: 2,
          borderColor: "#dc2626",
          borderRadius: 18,
        }}
      />
    </View>
  );
}

export function DocumentoDaAvaliacao({ dados, identidade }: { dados: DadosDoPdfAvaliacao; identidade: Identidade }) {
  const { documento: doc, resultados: r, paciente } = dados;
  const anteriores = dados.historico.slice(0, -1).reverse();
  const ultimos = dados.historico.slice(-6);

  const protocoloDobras = doc.dobras.protocolo && paciente.sexo ? PROTOCOLOS_DOBRAS[doc.dobras.protocolo].porSexo[paciente.sexo] : null;
  const sitios = doc.dobras.protocolo && paciente.sexo ? dobrasDoProtocolo(doc.dobras.protocolo, paciente.sexo, doc.dobras.versaoSlaughter) : [];
  const regioesMedidas = (Object.keys(PERIMETRIA) as Regiao[]).filter((k) => doc.perimetria[k]);
  const camposBio = (Object.keys(CAMPOS_BIOIMPEDANCIA) as CampoBio[]).filter((k) => doc.bioimpedancia.valores[k] !== null && doc.bioimpedancia.valores[k] !== undefined);
  const unidadeBio = (k: CampoBio) =>
    k === "agua_corporal"
      ? doc.bioimpedancia.aguaUnidade
      : k === "gordura_visceral"
        ? doc.bioimpedancia.gorduraVisceralEscala
        : k === "massa_visceral"
          ? doc.bioimpedancia.massaVisceralUnidade
          : CAMPOS_BIOIMPEDANCIA[k].unidade;

  const metodo =
    r.metodoComposicao === "dobras"
      ? `Dobras cutâneas — ${protocoloDobras?.nome ?? ""}`
      : r.metodoComposicao === "bioimpedancia"
        ? "Bioimpedância"
        : null;

  return (
    <DocumentoPadrao
      identidade={identidade}
      titulo={`Avaliação física — ${paciente.nome}`}
      alturaCabecalhoExtra={64}
      cabecalhoExtra={
        <View>
          <Text style={estilos.titulo}>Avaliação Física</Text>
          <View style={[estilos.identificacao, { borderColor: identidade.corLinhas }]}>
            <View style={estilos.linhaId}>
              <Text style={estilos.negrito}>Nome: {paciente.nome}</Text>
              <Text style={estilos.negrito}>Data da avaliação: {formatarData(dados.data)}</Text>
            </View>
            <View style={estilos.linhaId}>
              <Text style={estilos.negrito}>
                {[paciente.idade !== null ? `Idade: ${paciente.idade} anos` : null, paciente.sexo === "feminino" ? "Feminino" : paciente.sexo === "masculino" ? "Masculino" : null]
                  .filter(Boolean)
                  .join("   ")}
              </Text>
              <Text style={estilos.negrito}>
                Peso: {n(doc.peso, 2)} kg      Altura: {n(doc.alturaCm, 1)} cm
              </Text>
            </View>
          </View>
        </View>
      }
    >
      {dados.preliminar ? <Text style={estilos.aviso}>Resultados preliminares: avaliação ainda não finalizada.</Text> : null}

      <Text style={estilos.secao}>Composição corporal</Text>
      {r.percentualGordura === null ? (
        <Text>Percentual de gordura não disponível nesta avaliação.</Text>
      ) : (
        <View wrap={false}>
          <View style={{ flexDirection: "row", gap: 16 }}>
            <View>
              <Text style={estilos.pequeno}>Percentual de gordura</Text>
              <Text style={estilos.destaque}>{n(r.percentualGordura)}%</Text>
            </View>
            <View>
              <Text style={estilos.pequeno}>Massa de gordura</Text>
              <Text style={estilos.destaque}>{n(r.massaGorda)} kg</Text>
            </View>
            <View>
              <Text style={estilos.pequeno}>Massa livre de gordura</Text>
              <Text style={estilos.destaque}>{n(r.massaLivre)} kg</Text>
            </View>
            <View>
              <Text style={estilos.pequeno}>IMC</Text>
              <Text style={estilos.destaque}>{n(r.imc)}</Text>
            </View>
          </View>
          <Text style={[estilos.pequeno, { marginTop: 3 }]}>Método: {metodo}</Text>
          <Text style={{ marginTop: 4 }}>
            {r.referencia
              ? `Faixa de referência (Gallagher et al., 2000; ${r.referencia.faixaEtaria}): ${r.referencia.adequadoDe}% a menos de ${r.referencia.adequadoAte}%${r.classe ? ` — ${CLASSES_GORDURA[r.classe]}` : ""}.`
              : "Faixa de referência: não disponível para a idade do paciente."}
          </Text>
          {r.avatar && paciente.sexo ? (
            <>
              <Avatares sexo={paciente.sexo} indice={r.avatar.indice} />
              <Text style={estilos.pequeno}>
                Representação ilustrativa: avatar de {AVATARES[paciente.sexo][r.avatar.indice]}%, o mais próximo de {n(r.percentualGordura)}%
                {r.avatar.foraDaEscala ? " (resultado fora da escala ilustrativa)" : ""}. Pessoas com o mesmo percentual podem ter aparências diferentes.
              </Text>
            </>
          ) : null}
        </View>
      )}

      {protocoloDobras && sitios.some((s) => doc.dobras.valores[s]) ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Dobras cutâneas (mm) — {protocoloDobras.nome}</Text>
          <View style={estilos.tabela}>
            {sitios.map((s) => (
              <Linha key={s} rotulo={DOBRAS[s]} valor={n(doc.dobras.valores[s])} />
            ))}
            <Linha rotulo="Soma das dobras" valor={n(r.dobras.soma)} />
          </View>
          {r.dobras.avisos.map((a) => (
            <Text key={a} style={estilos.aviso}>
              {a}
            </Text>
          ))}
        </View>
      ) : null}

      {regioesMedidas.length ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Perimetria (cm)</Text>
          <View style={estilos.tabela}>
            <View style={[estilos.linha, { backgroundColor: "#f3f4f6" }]}>
              <Text style={[estilos.celulaNome, estilos.negrito]}>Região</Text>
              <Text style={[estilos.celula, estilos.negrito]}>Atual</Text>
              <Text style={[estilos.celula, estilos.negrito]}>Anterior</Text>
              <Text style={[estilos.celula, estilos.negrito]}>Variação</Text>
            </View>
            {regioesMedidas.map((k) => {
              const valoresAnteriores = anteriores.map((p) => p.perimetria[k]);
              const ev = evolucaoDaRegiao(doc.perimetria[k], valoresAnteriores);
              const anterior = valoresAnteriores.find((v) => v);
              return (
                <View key={k} style={estilos.linha}>
                  <Text style={estilos.celulaNome}>{PERIMETRIA[k]}</Text>
                  <Text style={estilos.celula}>{n(doc.perimetria[k])}</Text>
                  <Text style={estilos.celula}>{n(anterior ?? null)}</Text>
                  <Text style={[estilos.celula, { color: ev.evolucao === "diminuiu" ? "#15803d" : ev.evolucao === "aumentou" ? "#b91c1c" : "#6b7280" }]}>
                    {ev.diferenca === null ? "—" : `${ev.diferenca > 0 ? "+" : ""}${n(ev.diferenca)}`}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={estilos.pequeno}>Verde: diminuiu. Vermelho: aumentou. A cor indica só a variação, não melhora ou piora.</Text>
        </View>
      ) : null}

      {camposBio.length ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Bioimpedância</Text>
          <View style={estilos.tabela}>
            {camposBio.map((k) => (
              <Linha key={k} rotulo={CAMPOS_BIOIMPEDANCIA[k].nome} valor={`${n(doc.bioimpedancia.valores[k])} ${unidadeBio(k)}`.trim()} />
            ))}
          </View>
        </View>
      ) : null}

      {r.tmb.valor !== null || r.get.valor !== null ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Gasto energético (estimativas)</Text>
          <View style={estilos.tabela}>
            {r.tmb.valor !== null ? (
              <Linha
                rotulo={`TMB — ${r.tmb.manual ? `informada pelo profissional${doc.tmb.manual.metodo ? ` (${doc.tmb.manual.metodo})` : ""}` : PROTOCOLOS_TMB[r.tmb.protocolo as keyof typeof PROTOCOLOS_TMB]?.nome}`}
                valor={`${n(r.tmb.valor, 0)} kcal/dia`}
              />
            ) : null}
            {r.get.valor !== null && r.get.metodo ? (
              <Linha
                rotulo={`GET — ${METODOS_GET[r.get.metodo].nome}${
                  r.get.metodo === "dri_2023" && doc.gasto.categoria
                    ? `, ${CATEGORIAS_DRI[doc.gasto.categoria].nome.toLowerCase()}`
                    : doc.gasto.naf
                      ? `, NAF ${n(doc.gasto.naf, 2)} (${faixaDoNaf(doc.gasto.naf)?.nome.toLowerCase() ?? ""})`
                      : ""
                }`}
                valor={`${n(r.get.valor, 0)} kcal/dia`}
              />
            ) : null}
            {r.mets.atividades.map((x) => (
              <Linha
                key={x.id}
                rotulo={`${x.atividade.modalidade}: ${x.atividade.nome} (MET ${n(x.valor.met)})`}
                valor={`${n(x.porSessao, 0)} kcal/sessão · ${n(x.semanal, 0)} kcal/semana`}
              />
            ))}
            {r.getMaisMets !== null ? <Linha rotulo="GET + METs (média diária, gasto líquido)" valor={`${n(r.getMaisMets, 0)} kcal/dia`} /> : null}
          </View>
        </View>
      ) : null}

      {ultimos.length > 1 ? (
        <View wrap={false}>
          <Text style={estilos.secao}>Evolução (últimas avaliações)</Text>
          <View style={estilos.tabela}>
            <View style={[estilos.linha, { backgroundColor: "#f3f4f6" }]}>
              <Text style={[estilos.celulaNome, estilos.negrito]}>Data</Text>
              <Text style={[estilos.celula, estilos.negrito]}>Peso</Text>
              <Text style={[estilos.celula, estilos.negrito]}>% gordura</Text>
              <Text style={[estilos.celula, estilos.negrito]}>Massa gorda</Text>
              <Text style={[estilos.celula, estilos.negrito]}>Massa livre</Text>
            </View>
            {ultimos.map((p) => (
              <View key={p.data + (p.peso ?? "")} style={estilos.linha}>
                <Text style={estilos.celulaNome}>
                  {formatarData(p.data)}
                  {p.metodo ? ` (${p.metodo === "dobras" ? "dobras" : "bioimpedância"})` : ""}
                </Text>
                <Text style={estilos.celula}>{n(p.peso)} kg</Text>
                <Text style={estilos.celula}>{p.percentualGordura === null ? "—" : `${n(p.percentualGordura)}%`}</Text>
                <Text style={estilos.celula}>{p.massaGorda === null ? "—" : `${n(p.massaGorda)} kg`}</Text>
                <Text style={estilos.celula}>{p.massaLivre === null ? "—" : `${n(p.massaLivre)} kg`}</Text>
              </View>
            ))}
          </View>
          {new Set(ultimos.map((p) => p.metodo).filter(Boolean)).size > 1 ? (
            <Text style={estilos.aviso}>Há avaliações por métodos diferentes: os valores não são diretamente equivalentes.</Text>
          ) : null}
        </View>
      ) : null}

      {doc.observacoes.trim() ? (
        <View>
          <Text style={estilos.secao}>Observações</Text>
          <Text style={{ lineHeight: 1.35 }}>{doc.observacoes.trim()}</Text>
        </View>
      ) : null}

      <Assinatura identidade={identidade} />
    </DocumentoPadrao>
  );
}

export async function gerarPdfDaAvaliacao(dados: DadosDoPdfAvaliacao, identidade: Identidade) {
  return gerarPdf(<DocumentoDaAvaliacao dados={dados} identidade={identidade} />);
}

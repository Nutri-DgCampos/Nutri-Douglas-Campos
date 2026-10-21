import fs from "node:fs";
import path from "node:path";
import { Image, Line, Polygon, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import {
  AVATARES,
  CAMPOS_BIOIMPEDANCIA,
  CATEGORIAS_DRI,
  CLASSES_GORDURA,
  CORES_EVOLUCAO,
  DOBRAS,
  METODOS_GET,
  PERIMETRIA,
  PROTOCOLOS_DOBRAS,
  PROTOCOLOS_TMB,
  RECORTE_SILHUETA,
  SETAS_PERIMETRIA,
  dobrasDoProtocolo,
  evolucaoDaRegiao,
  faixaDoNaf,
  type CampoBio,
  type Evolucao,
  type Regiao,
  type Sexo,
} from "@/lib/nutricao/avaliacao";
import type { AvaliacaoDoc, ResultadoAvaliacao } from "@/lib/nutricao/avaliacaoDocumento";
import { formatarData } from "@/lib/nutricao/paciente";
import { Assinatura, DocumentoPadrao, gerarPdf } from "./documento";
import type { Identidade } from "./identidade";

// PDF da avaliação física: o mesmo conteúdo e a mesma ordem da tela de
// resultados (composição, perimetria com o avatar, avatares de % de gordura,
// gráficos e histórico), mais gasto energético, observações e assinatura.

export type PontoPdf = {
  id?: string;
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
  cartao: { borderWidth: 0.75, borderColor: "#e5e7eb", borderRadius: 6, padding: 8 },
  tituloCartao: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 6, color: "#111827" },
  rotulo: { fontSize: 6.5, color: "#6b7280" },
  valor: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  referencia: { backgroundColor: "#f3f4f6", borderRadius: 4, padding: 5, marginTop: 6 },
  linhaCompacta: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#e5e7eb", paddingVertical: 2 },
});

const TEXTO_EVOLUCAO: Record<Evolucao, string> = { diminuiu: "diminuiu", aumentou: "aumentou", igual: "igual", sem_comparacao: "sem comparação" };
const LARGURA = 515; // largura útil da página A4

// Conteúdo da imagem (não o caminho): no Windows, "C:\..." seria lido como endereço.
function imagemDoAvatar(arquivo: string) {
  return { data: fs.readFileSync(path.join(process.cwd(), "public", "nutricao", "avatares", arquivo)), format: "png" as const };
}

const dataCurta = (data: string) => formatarData(data).replace(/\/20(\d\d)$/, "/$1");

function Linha({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.celulaNome}>{rotulo}</Text>
      <Text style={[estilos.celula, cor ? { color: cor } : {}]}>{valor}</Text>
    </View>
  );
}

function Avatares({ sexo, indice, largura = LARGURA }: { sexo: Sexo; indice: number; largura?: number }) {
  const arquivo = imagemDoAvatar(sexo === "feminino" ? "percentual-gordura-feminino.png" : "percentual-gordura-masculino.png");
  // Imagem de 2171 × 724 com 13 avatares igualmente espaçados.
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

// Figura de frente com as setas da perimetria (mesmas posições e cores da tela).
function AvatarPerimetria({ sexo, evolucoes, largura }: { sexo: Sexo; evolucoes: Record<Regiao, Evolucao>; largura: number }) {
  const [x0, y0, w0, h0] = RECORTE_SILHUETA;
  const escala = largura / w0;
  const altura = h0 * escala;
  const arquivo = imagemDoAvatar(sexo === "feminino" ? "silhueta-feminina.png" : "silhueta-masculina.png");
  const ponta = 22;
  return (
    <View style={{ width: largura, height: altura, position: "relative", overflow: "hidden" }}>
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image src={arquivo} style={{ position: "absolute", left: -x0 * escala, top: -y0 * escala, width: 1024 * escala, height: 1536 * escala }} />
      <Svg viewBox={RECORTE_SILHUETA.join(" ")} style={{ position: "absolute", left: 0, top: 0, width: largura, height: altura }}>
        {(Object.keys(SETAS_PERIMETRIA) as Regiao[]).flatMap((regiao) => {
          const [y, x1, x2] = SETAS_PERIMETRIA[regiao];
          const cor = CORES_EVOLUCAO[evolucoes[regiao]];
          return [
            <Line key={`${regiao}-l`} x1={x1 + ponta * 0.6} y1={y} x2={x2 - ponta * 0.6} y2={y} stroke={cor} strokeWidth={9} />,
            <Polygon key={`${regiao}-a`} points={`${x1},${y} ${x1 + ponta},${y - ponta * 0.6} ${x1 + ponta},${y + ponta * 0.6}`} fill={cor} />,
            <Polygon key={`${regiao}-b`} points={`${x2},${y} ${x2 - ponta},${y - ponta * 0.6} ${x2 - ponta},${y + ponta * 0.6}`} fill={cor} />,
          ];
        })}
      </Svg>
      {(Object.keys(SETAS_PERIMETRIA) as Regiao[]).map((regiao) => {
        const [y, x1, x2, numero] = SETAS_PERIMETRIA[regiao];
        const d = 11;
        return (
          <View
            key={regiao}
            style={{
              position: "absolute",
              left: ((x1 + x2) / 2 - x0) * escala - d / 2,
              top: (y - y0) * escala - d / 2,
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: CORES_EVOLUCAO[evolucoes[regiao]],
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontSize: 6.5, fontFamily: "Helvetica-Bold" }}>{numero}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Numero({ numero, cor }: { numero: number; cor: string }) {
  return (
    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: cor, justifyContent: "center", alignItems: "center", marginRight: 3 }}>
      <Text style={{ color: "white", fontSize: 6, fontFamily: "Helvetica-Bold" }}>{numero}</Text>
    </View>
  );
}

// Gráfico de colunas (últimas 12 avaliações); sem resultado aparece "—", nunca zero.
function GraficoColunas({
  titulo,
  unidade,
  cor,
  pontos,
  largura,
}: {
  titulo: string;
  unidade: string;
  cor: string;
  pontos: { chave: string; data: string; valor: number | null; metodo?: string | null }[];
  largura: number;
}) {
  const validos = pontos.map((p) => p.valor).filter((v): v is number => v !== null);
  const maximo = Math.max(...validos, 1);
  const alturaMaxima = 62;
  // Largura de cada coluna conforme a quantidade (até 12 avaliações).
  const vaga = Math.min(30, (largura - 16) / Math.max(pontos.length, 1));
  const datasCurtas = vaga < 24;
  const metodos = new Set(pontos.map((p) => p.metodo).filter(Boolean));
  return (
    <View style={[estilos.cartao, { width: largura }]} wrap={false}>
      <Text style={estilos.tituloCartao}>
        {titulo} ({unidade})
      </Text>
      {validos.length === 0 ? (
        <Text style={estilos.pequeno}>Sem resultados.</Text>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: alturaMaxima + 32 }}>
          {pontos.map((p) => (
            <View key={p.chave} style={{ width: vaga, alignItems: "center", justifyContent: "flex-end" }}>
              <Text style={{ fontSize: 6, fontFamily: "Helvetica-Bold", marginBottom: 1 }}>{p.valor === null ? "—" : n(p.valor)}</Text>
              <View
                style={{
                  width: 12,
                  height: p.valor === null ? 1.5 : Math.max((p.valor / maximo) * alturaMaxima, 2),
                  backgroundColor: p.valor === null ? "#e5e7eb" : cor,
                }}
              />
              <Text style={{ fontSize: 5, color: "#6b7280", marginTop: 1.5 }}>{datasCurtas ? formatarData(p.data).slice(0, 5) : dataCurta(p.data)}</Text>
              <Text style={{ fontSize: 4, color: "#9ca3af", height: 6 }}>{p.metodo ? (p.metodo === "dobras" ? "DOBRAS" : "BIOIMP.") : ""}</Text>
            </View>
          ))}
        </View>
      )}
      {metodos.size > 1 ? <Text style={[estilos.aviso, { fontSize: 6.5 }]}>Métodos diferentes entre avaliações: não são diretamente equivalentes.</Text> : null}
    </View>
  );
}

export function DocumentoDaAvaliacao({ dados, identidade }: { dados: DadosDoPdfAvaliacao; identidade: Identidade }) {
  const { documento: doc, resultados: r, paciente } = dados;
  const anteriores = dados.historico.slice(0, -1).reverse();
  const historico = dados.historico.slice(-12);

  const protocoloDobras = doc.dobras.protocolo && paciente.sexo ? PROTOCOLOS_DOBRAS[doc.dobras.protocolo].porSexo[paciente.sexo] : null;
  const sitios = doc.dobras.protocolo && paciente.sexo ? dobrasDoProtocolo(doc.dobras.protocolo, paciente.sexo, doc.dobras.versaoSlaughter) : [];
  const regioes = Object.keys(PERIMETRIA) as Regiao[];
  const evolucoes = Object.fromEntries(
    regioes.map((k) => [k, evolucaoDaRegiao(doc.perimetria[k], anteriores.map((p) => p.perimetria?.[k]))])
  ) as Record<Regiao, ReturnType<typeof evolucaoDaRegiao>>;
  const temPerimetria = historico.some((p) => regioes.some((k) => p.perimetria?.[k]));
  const camposBio = (Object.keys(CAMPOS_BIOIMPEDANCIA) as CampoBio[]).filter((k) => doc.bioimpedancia.valores[k] !== null && doc.bioimpedancia.valores[k] !== undefined);
  const unidadeBio = (k: CampoBio) =>
    k === "agua_corporal"
      ? doc.bioimpedancia.aguaUnidade
      : k === "gordura_visceral"
        ? doc.bioimpedancia.gorduraVisceralEscala
        : k === "massa_visceral"
          ? doc.bioimpedancia.massaVisceralUnidade
          : CAMPOS_BIOIMPEDANCIA[k].unidade;

  const origem =
    r.metodoComposicao === "dobras"
      ? `dobras cutâneas — ${protocoloDobras?.nome ?? ""}`
      : r.metodoComposicao === "bioimpedancia"
        ? "exame de bioimpedância"
        : "sem resultado de composição";

  const coluna = (LARGURA - 10) / 2;
  const chave = (p: PontoPdf, i: number) => p.id ?? `${p.data}-${i}`;

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
      {dados.preliminar ? <Text style={[estilos.aviso, { marginBottom: 4 }]}>Resultados preliminares: avaliação ainda não finalizada.</Text> : null}

      {/* Composição corporal e perimetria, lado a lado, como na tela. */}
      <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }} wrap={false}>
        <View style={[estilos.cartao, { width: coluna }]}>
          <Text style={estilos.tituloCartao}>Composição corporal</Text>
          <View style={{ flexDirection: "row" }}>
            {[
              ["Percentual de gordura", r.percentualGordura === null ? "—" : `${n(r.percentualGordura)}%`],
              ["Massa de gordura", r.massaGorda === null ? "—" : `${n(r.massaGorda)} kg`],
              ["Massa livre de gordura", r.massaLivre === null ? "—" : `${n(r.massaLivre)} kg`],
              ["IMC", n(r.imc)],
            ].map(([rotulo, valor]) => (
              <View key={rotulo} style={{ width: "25%", paddingRight: 2 }}>
                <Text style={estilos.rotulo}>{rotulo}</Text>
                <Text style={estilos.valor}>{valor}</Text>
              </View>
            ))}
          </View>
          <Text style={[estilos.pequeno, { marginTop: 4 }]}>Origem: {origem}</Text>
          <View style={estilos.referencia}>
            <Text style={[estilos.negrito, { fontSize: 8 }]}>Faixa de Referência de Gordura Corporal</Text>
            {r.referencia ? (
              <Text style={{ fontSize: 8, marginTop: 2 }}>
                {r.referencia.faixaEtaria}: adequada de {r.referencia.adequadoDe}% a menos de {r.referencia.adequadoAte}%.
                {r.classe ? <Text style={estilos.negrito}> {CLASSES_GORDURA[r.classe]}.</Text> : null}
              </Text>
            ) : (
              <Text style={{ fontSize: 8, marginTop: 2 }}>Referência não disponível para esta idade.</Text>
            )}
            <Text style={[estilos.pequeno, { fontSize: 6.5, marginTop: 1 }]}>
              Gallagher et al., 2000. Indicação informativa: não substitui a interpretação do nutricionista.
            </Text>
          </View>

          {protocoloDobras && sitios.length ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[estilos.negrito, { fontSize: 8.5, marginBottom: 3 }]}>Dobras cutâneas (mm) — {protocoloDobras.nome}</Text>
              {sitios.map((s) => (
                <View key={s} style={estilos.linhaCompacta}>
                  <Text style={{ flex: 1, fontSize: 8, color: "#4b5563" }}>{DOBRAS[s]}</Text>
                  <Text style={{ fontSize: 8 }}>{n(doc.dobras.valores[s])}</Text>
                </View>
              ))}
              <View style={estilos.linhaCompacta}>
                <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold" }}>Soma das dobras</Text>
                <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold" }}>{n(r.dobras.soma)}</Text>
              </View>
              {r.dobras.avisos.map((a) => (
                <Text key={a} style={[estilos.aviso, { fontSize: 7 }]}>
                  {a}
                </Text>
              ))}
            </View>
          ) : null}

          {camposBio.length ? (
            <View style={{ marginTop: 8 }}>
              <Text style={[estilos.negrito, { fontSize: 8.5, marginBottom: 3 }]}>Bioimpedância</Text>
              {camposBio.map((k) => (
                <View key={k} style={estilos.linhaCompacta}>
                  <Text style={{ flex: 1, fontSize: 8, color: "#4b5563" }}>{CAMPOS_BIOIMPEDANCIA[k].nome}</Text>
                  <Text style={{ fontSize: 8 }}>{`${n(doc.bioimpedancia.valores[k], 2)} ${unidadeBio(k)}`.trim()}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={[estilos.cartao, { width: coluna }]}>
          <Text style={estilos.tituloCartao}>Perimetria</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {paciente.sexo ? (
              <AvatarPerimetria
                sexo={paciente.sexo}
                largura={100}
                evolucoes={Object.fromEntries(regioes.map((k) => [k, evolucoes[k].evolucao])) as Record<Regiao, Evolucao>}
              />
            ) : null}
            <View style={{ flex: 1 }}>
              {regioes.map((k) => {
                const ev = evolucoes[k];
                const cor = CORES_EVOLUCAO[ev.evolucao];
                return (
                  <View key={k} style={[estilos.linhaCompacta, { alignItems: "center", paddingVertical: 3.5 }]}>
                    <Numero numero={SETAS_PERIMETRIA[k][3]} cor={cor} />
                    <Text style={{ flex: 1, fontSize: 7, color: "#4b5563" }}>{PERIMETRIA[k]}</Text>
                    <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", width: 32, textAlign: "right" }}>
                      {doc.perimetria[k] ? `${n(doc.perimetria[k])} cm` : "—"}
                    </Text>
                    <Text style={{ fontSize: 6, color: cor, width: 40, textAlign: "right", paddingLeft: 3 }}>
                      {ev.diferenca === null ? TEXTO_EVOLUCAO[ev.evolucao] : `${ev.diferenca > 0 ? "+" : ""}${n(ev.diferenca)} cm`}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
          <Text style={[estilos.pequeno, { fontSize: 6.5, marginTop: 4 }]}>
            Setas: verde diminuiu, vermelho aumentou, cinza igual ou sem medida anterior. A cor indica só a variação, não melhora ou piora.
          </Text>
        </View>
      </View>

      {/* Avatares de percentual de gordura. */}
      <View style={[estilos.cartao, { marginTop: 10 }]} wrap={false}>
        <Text style={estilos.tituloCartao}>Percentual de gordura — referência visual</Text>
        {r.avatar && paciente.sexo && r.percentualGordura !== null ? (
          <>
            <Avatares sexo={paciente.sexo} indice={r.avatar.indice} largura={LARGURA - 18} />
            <Text style={[estilos.pequeno, { fontSize: 7 }]}>
              Representação ilustrativa: destaque no avatar de {AVATARES[paciente.sexo][r.avatar.indice]}%, o mais próximo de {n(r.percentualGordura)}%
              {r.avatar.foraDaEscala ? " (resultado fora da escala ilustrativa)" : ""}. Pessoas com o mesmo percentual podem ter aparências diferentes.
            </Text>
          </>
        ) : (
          <Text style={estilos.pequeno}>Resultado de percentual de gordura indisponível.</Text>
        )}
      </View>

      {/* Gráficos: as 12 avaliações mais recentes até esta data. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
        <GraficoColunas titulo="Comparativo de peso total" unidade="kg" cor="#2563eb" largura={coluna} pontos={historico.map((p, i) => ({ chave: chave(p, i), data: p.data, valor: p.peso }))} />
        <GraficoColunas
          titulo="Comparativo de massa livre de gordura"
          unidade="kg"
          cor="#92400e"
          largura={coluna}
          pontos={historico.map((p, i) => ({ chave: chave(p, i), data: p.data, valor: p.massaLivre, metodo: p.metodo }))}
        />
        <GraficoColunas
          titulo="Comparativo de massa de gordura"
          unidade="kg"
          cor="#15803d"
          largura={coluna}
          pontos={historico.map((p, i) => ({ chave: chave(p, i), data: p.data, valor: p.massaGorda, metodo: p.metodo }))}
        />
        <GraficoColunas
          titulo="Comparativo de percentual de gordura"
          unidade="%"
          cor="#dc2626"
          largura={coluna}
          pontos={historico.map((p, i) => ({ chave: chave(p, i), data: p.data, valor: p.percentualGordura, metodo: p.metodo }))}
        />
      </View>

      {/* Histórico de perimetria por data. */}
      {temPerimetria ? (
        <View style={[estilos.cartao, { marginTop: 10 }]} wrap={false}>
          <Text style={estilos.tituloCartao}>Histórico de perimetria (cm)</Text>
          <View style={{ flexDirection: "row", backgroundColor: "#06372b" }}>
            <Text style={{ width: 100, padding: 3, fontSize: 7, color: "white", fontFamily: "Helvetica-Bold" }}>Região</Text>
            {historico.map((p, i) => (
              <Text key={chave(p, i)} style={{ width: 44, padding: 3, fontSize: 6.5, color: "white", fontFamily: "Helvetica-Bold", textAlign: "right" }}>
                {historico.length > 6 ? dataCurta(p.data) : formatarData(p.data)}
              </Text>
            ))}
          </View>
          {regioes.map((k, linha) => (
            <View key={k} style={{ flexDirection: "row", backgroundColor: linha % 2 ? "#f9fafb" : "white" }}>
              <Text style={{ width: 100, padding: 3, fontSize: 7, color: "#374151" }}>{PERIMETRIA[k]}</Text>
              {historico.map((p, i) => (
                <Text key={chave(p, i)} style={{ width: 44, padding: 3, fontSize: 7, textAlign: "right" }}>
                  {p.perimetria?.[k] ? n(p.perimetria[k]) : "—"}
                </Text>
              ))}
            </View>
          ))}
          <Text style={[estilos.pequeno, { fontSize: 6.5, marginTop: 3 }]}>Até as 12 avaliações mais recentes até esta data.</Text>
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

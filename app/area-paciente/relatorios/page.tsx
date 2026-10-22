"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { Button } from "primereact/button";
import { Tag } from "primereact/tag";
import AnelDeAdesao from "@/components/AnelDeAdesao";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { pontosDoRelatorio } from "@/lib/relatorios/pontos";

export default function RelatoriosPacientePage() {

    const [pacienteId, setPacienteId] = useState<string | null>(null);
    const [nomePaciente, setNomePaciente] = useState<string>("");
    const [pesoInicial, setPesoInicial] = useState<number | null>(null);
    const [relatorios, setRelatorios] = useState<any[]>([]);
    const [historicoPesos, setHistoricoPesos] = useState<any[]>([]);
    const [historicoAlcool, setHistoricoAlcool] = useState<any[]>([]);

    function baixarRelatorio(relatorioId: string, dataRelatorio: string) {
        const dataFormatada = dataRelatorio
  ? dataRelatorio.slice(0, 10).split("-").reverse().join("-")
  : "sem-data";

const nomeArquivo = `${nomePaciente} - ${dataFormatada}`;
  const relatorio = document.getElementById(`relatorio-${relatorioId}`);

  if (!relatorio) {
    avisar("Não foi possível localizar o relatório.");
    return;
  }

  const conteudo = relatorio.innerHTML;

  const janelaImpressao = window.open("", "_blank");

  if (!janelaImpressao) {
    avisar("Não foi possível abrir a janela de impressão.");
    return;
  }

  janelaImpressao.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${nomeArquivo}</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            margin: 40px;
            line-height: 1.5;
          }

          button {
            display: none !important;
          }
        </style>
      </head>

      <body>
        ${conteudo}
      </body>
    </html>
  `);

  janelaImpressao.document.close();

janelaImpressao.document.title = nomeArquivo;

setTimeout(() => {
  janelaImpressao.focus();
  janelaImpressao.print();
}, 500);
}

useEffect(() => {
  async function carregarPaciente() {
    const {
      data: { user },
    } = await api.auth.getUser();

    if (!user) return;

    const { data, error } = await api
      .from("patients")
      .select("id, name, initial_weight")
      .eq("auth_user_id", user.id)
      .single();

    if (error) {
      console.error("Erro ao identificar paciente:", error);
      return;
    }

    setPacienteId(data.id);
    setNomePaciente(data.name);
    setPesoInicial(data.initial_weight);
    const { data: relatoriosEnviados, error: erroRelatorios } = await api
  .from("patient_reports")
  .select("*")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .order("created_at", { ascending: false })
.limit(4);

if (erroRelatorios) {
  console.error("Erro ao carregar relatórios:", erroRelatorios);
  return;
}

setRelatorios(relatoriosEnviados ?? []);

const idsDevolutivas = (relatoriosEnviados ?? [])
  .filter(
    (relatorio) =>
      typeof relatorio.feedback_text === "string" &&
      relatorio.feedback_text.trim().length > 0
  )
  .map((relatorio) => relatorio.id);

if (idsDevolutivas.length > 0) {
  const { error: erroVisualizacao } = await api
    .from("patient_update_views")
    .upsert(
      idsDevolutivas.map((id) => ({
        patient_id: data.id,
        update_type: "devolutiva",
        reference_id: id,
      })),
      {
        onConflict: "patient_id,update_type,reference_id",
        ignoreDuplicates: true,
      }
    );

  if (erroVisualizacao) {
    console.error(
      "Erro ao registrar visualização das devolutivas:",
      erroVisualizacao
    );
  }
}
const { data: pesosAnteriores, error: erroPesos } = await api
  .from("patient_reports")
  .select("id, weight, created_at, cycle_id")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .not("weight", "is", null)
  .order("created_at", { ascending: true });

if (erroPesos) {
  console.error("Erro ao carregar histórico de pesos:", erroPesos);
} else {
  setHistoricoPesos(pesosAnteriores ?? []);
}

const { data: alcoolAnterior, error: erroAlcool } = await api
  .from("patient_reports")
  .select("id, alcohol_use, created_at")
  .eq("patient_id", data.id)
  .eq("status", "enviado")
  .not("alcohol_use", "is", null)
  .order("created_at", { ascending: true });

if (erroAlcool) {
  console.error("Erro ao carregar histórico de álcool:", erroAlcool);
} else {
  setHistoricoAlcool(alcoolAnterior ?? []);
}

console.log("RELATÓRIOS ENVIADOS:", relatoriosEnviados);

    console.log("PACIENTE DOS RELATÓRIOS:", data.id);
  }

  carregarPaciente();
}, []);

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina
          titulo="Relatórios"
          descricao="Seus resultados e as devolutivas do nutricionista."
        />

        <div className="mt-6 space-y-4">
  {relatorios.map((relatorio) => {
    const indiceAlcool = historicoAlcool.findIndex(
  (item) => item.id === relatorio.id
);

const tendenciasAlcool =
  indiceAlcool >= 0
    ? historicoAlcool
        .slice(0, indiceAlcool + 1)
        .map((item) => (item.alcohol_use === "nao" ? "↓" : "↑"))
        .slice(-3)
    : [];

    const historicoPesosDoCiclo = relatorio.cycle_id
  ? historicoPesos.filter(
      (item) => item.cycle_id === relatorio.cycle_id
    )
  : historicoPesos.filter(
      (item) => item.cycle_id == null
    );

const indiceHistorico = historicoPesosDoCiclo.findIndex(
  (item) => item.id === relatorio.id
);


const pesoAnterior =
  indiceHistorico > 0
    ? historicoPesosDoCiclo[indiceHistorico - 1]?.weight
    : pesoInicial;

    const diferencaPeso =
  relatorio.weight != null && pesoAnterior != null
    ? Number(relatorio.weight) - Number(pesoAnterior)
    : null;

    const tendenciaPeso =
  diferencaPeso == null
    ? null
    : diferencaPeso > 0
    ? "↑"
    : diferencaPeso < 0
    ? "↓"
    : "→";

    const pesosAteEsteRelatorio =
  indiceHistorico >= 0
    ? [
        pesoInicial,
        ...historicoPesosDoCiclo
          .slice(0, indiceHistorico + 1)
          .map((item) => item.weight),
      ]
    : [];

const tendenciasPeso = pesosAteEsteRelatorio
  .slice(1)
  .map((peso, index) => {
    const anterior = pesosAteEsteRelatorio[index];

    if (peso == null || anterior == null) return null;

    const diferenca = Number(peso) - Number(anterior);

    if (diferenca > 0) return "↑";
    if (diferenca < 0) return "↓";
    return "→";
  })
  .filter(Boolean)
  .slice(-3);

    // Regra única; pontos removidos pelo nutricionista neste relatório não aparecem.
    const { positivos: pontosPositivos, atencao } = pontosDoRelatorio(relatorio);
    const pontosAtencao = atencao.map((ponto) => ponto.texto);

  const classificacao =
    relatorio.adherence_score >= 80
      ? "Ótima adesão"
      : relatorio.adherence_score >= 60
      ? "Boa adesão"
      : relatorio.adherence_score >= 40
      ? "Baixa adesão"
      : "Adesão muito baixa";

  return (
    <section key={relatorio.id} className="cartao p-5">
      <div className="flex items-center gap-4" aria-hidden>
        <AnelDeAdesao
          valor={relatorio.adherence_score ?? null}
          tamanho={84}
          rotulo="de 100"
        />

        <div className="min-w-0">
          <p className="font-[family-name:var(--fonte-titulo)] text-xl font-bold text-gray-900">
            Relatório {relatorio.cycle_report_number ?? "-"}
          </p>

          <Tag
            value={classificacao}
            severity={
              relatorio.adherence_score >= 80
                ? "success"
                : relatorio.adherence_score >= 60
                ? "warning"
                : "danger"
            }
            className="mt-1"
          />
        </div>
      </div>

      {/* Conteúdo usado também para gerar o PDF: título e score em texto. */}
      <div id={`relatorio-${relatorio.id}`}>
        <h2 className="sr-only">
          Relatório {relatorio.cycle_report_number ?? "-"}
        </h2>

        <p className="sr-only">
          Score: {relatorio.adherence_score} / 100 ({classificacao})
        </p>

        {(diferencaPeso !== null || tendenciasAlcool.length > 0) && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {diferencaPeso !== null && (
              <div className="rounded-xl bg-gray-50 p-3">
                <dt className="text-gray-500">Variação de peso</dt>
                <dd className="mt-0.5 font-semibold text-gray-900">
                  {tendenciasPeso.map((tendencia, index) => (
                    <span
                      key={index}
                      className={
                        tendencia === "↑"
                          ? "text-red-600"
                          : tendencia === "↓"
                          ? "text-green-600"
                          : "text-gray-500"
                      }
                    >
                      {tendencia}{" "}
                    </span>
                  ))}
                  {diferencaPeso > 0 ? "+" : ""}
                  {diferencaPeso.toFixed(1).replace(".", ",")} kg
                </dd>
              </div>
            )}

            {tendenciasAlcool.length > 0 && (
              <div className="rounded-xl bg-gray-50 p-3">
                <dt className="text-gray-500">Consumo de álcool</dt>
                <dd className="mt-0.5 font-semibold">
                  {tendenciasAlcool.map((tendencia, index) => (
                    <span
                      key={index}
                      className={
                        tendencia === "↓" ? "text-green-600" : "text-red-600"
                      }
                    >
                      {tendencia}{" "}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        )}

        {pontosPositivos.length > 0 && (
          <div className="mt-5">
            <p className="font-semibold text-primary-700">Pontos positivos</p>

            <ul className="mt-2 space-y-2 text-sm text-gray-700">
              {pontosPositivos.map((ponto, index) => (
                <li key={index} className="flex gap-2">
                  <i
                    className="pi pi-check-circle mt-0.5 text-primary-600"
                    aria-hidden
                  />
                  <span>{ponto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {pontosAtencao.length > 0 && (
          <div className="mt-5">
            <p className="font-semibold text-atencao-700">Pontos de atenção</p>

            <ul className="mt-2 space-y-2 text-sm text-gray-700">
              {pontosAtencao.map((ponto, index) => (
                <li key={index} className="flex gap-2">
                  <i
                    className="pi pi-exclamation-circle mt-0.5 text-atencao-600"
                    aria-hidden
                  />
                  <span>{ponto}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {relatorio.feedback_text && (
          <div className="mt-5 rounded-xl bg-primary-50 p-4">
            <p className="font-semibold text-primary-800">
              Devolutiva do nutricionista
            </p>

            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
              {relatorio.feedback_text}
            </p>
          </div>
        )}
      </div>

      <Button
        type="button"
        label="Baixar relatório em PDF"
        icon="pi pi-download"
        outlined
        className="mt-5 w-full"
        onClick={() =>
          baixarRelatorio(
            relatorio.id,
            relatorio.report_date ?? relatorio.created_at
          )
        }
      />
    </section>
  );
})}
          {relatorios.length === 0 && (
            <div className="cartao p-6 text-center">
              <i className="pi pi-chart-bar text-3xl text-gray-400" aria-hidden />
              <p className="mt-3 font-semibold text-gray-900">
                Nenhuma devolutiva por enquanto.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Depois que o nutricionista responder ao seu relatório, a
                devolutiva aparece aqui.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "primereact/button";
import { InputText } from "primereact/inputtext";
import Selecao from "@/components/Selecao";
import { InputTextarea } from "primereact/inputtextarea";
import BotaoVoltar from "@/components/BotaoVoltar";
import AcessoDoPaciente from "@/components/AcessoDoPaciente";
import ConfirmarPlano, { type PreviaDoPlano } from "@/components/ConfirmarPlano";
import { avisar } from "@/lib/avisos";
import { normalizarFrequencia } from "@/lib/cronograma";
import CamposComplementares, {
  DADOS_VAZIOS,
  dadosDoBanco,
  dadosParaBanco,
} from "@/components/CamposComplementares";

export default function EditarPaciente() {
  const params = useParams();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [objective, setObjective] = useState("");
  const [plan, setPlan] = useState("Semanal");
  // Plano gravado e frequência do ciclo ativo (SPEC Plano Ativo): a troca
  // passa pela rota /api/pacientes/[id]/plano, que grava os dois juntos.
  const [planoSalvo, setPlanoSalvo] = useState<string | null>(null);
  const [frequenciaDoCiclo, setFrequenciaDoCiclo] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PreviaDoPlano | null>(null);
  const [reaplicando, setReaplicando] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState("Ativo");
  const [importantNote, setImportantNote] = useState("");
  const [initialWeight, setInitialWeight] = useState("");
  const [trainingWeeklyGoal, setTrainingWeeklyGoal] = useState("0");
  const [cardioWeeklyGoal, setCardioWeeklyGoal] = useState("0");
  const [individualGoal, setIndividualGoal] = useState("");
  const [complementares, setComplementares] = useState(DADOS_VAZIOS);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const id = params.id as string;

  useEffect(() => {
    async function carregarPaciente() {
      const { data, error } = await api
        .from("patients")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        console.error(error);
        setErro("Não foi possível carregar o paciente.");
        setCarregando(false);
        return;
      }

      setName(data.name ?? "");
      setPhone(data.phone ?? "");
      setObjective(data.objective ?? "");
      setPlan(data.plan ?? "Semanal");
      setPlanoSalvo(data.plan ?? null);

      const { data: ciclo } = await api
        .from("diet_cycles")
        .select("followup_frequency")
        .eq("patient_id", id)
        .eq("status", "ativo")
        .maybeSingle();
      setFrequenciaDoCiclo(ciclo?.followup_frequency ?? null);
      setPaymentStatus(data.payment_status ?? "Ativo");
      setImportantNote(data.important_note ?? "");
      setInitialWeight(
  data.initial_weight == null ? "" : String(data.initial_weight)
);

setTrainingWeeklyGoal(
  data.training_weekly_goal == null ? "0" : String(data.training_weekly_goal)
);

setCardioWeeklyGoal(
  data.cardio_weekly_goal == null ? "0" : String(data.cardio_weekly_goal)
);

setIndividualGoal(
  data.individual_goal ??
    "Planejar e organizar as refeições do dia seguinte com antecedência."
);

      setComplementares(dadosDoBanco(data));
      setCarregando(false);
    }

    carregarPaciente();
  }, [id]);

  async function buscarPrevia(plano: string) {
    const r = await fetch(`/api/pacientes/${id}/plano?plano=${encodeURIComponent(plano)}`, { cache: "no-store" }).catch(() => null);
    const dados = await r?.json().catch(() => null);
    if (!r?.ok) {
      setErro(dados?.erro ?? "Não foi possível conferir o plano. Tente de novo.");
      return null;
    }
    return dados as PreviaDoPlano;
  }

  // Grava o plano no cadastro e no ciclo ativo e libera o relatório devido.
  // Sucesso só depois da gravação (RF-11).
  async function aplicarPlano(plano: string) {
    const r = await fetch(`/api/pacientes/${id}/plano`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plano }),
    }).catch(() => null);
    const dados = await r?.json().catch(() => null);
    if (!r?.ok) {
      setErro(dados?.erro ?? "Não foi possível salvar o plano. Nada foi alterado no plano.");
      return false;
    }
    if (dados.liberado && dados.semAparelho) {
      avisar(`Plano salvo e relatório ${dados.liberado.numero} liberado. O paciente não ativou os avisos no celular: avise-o por outro meio.`, "warn");
    } else if (dados.liberado) {
      avisar(`Plano salvo. Relatório ${dados.liberado.numero} liberado e aviso enviado ao paciente.`, "success");
    } else {
      avisar("Plano salvo.", "success");
    }
    setPlanoSalvo(plano);
    setFrequenciaDoCiclo((atual) => (atual ? plano : atual));
    return true;
  }

  async function salvarPaciente(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErro("");

    const convertidos = dadosParaBanco(complementares);

    if ("erro" in convertidos) {
      setErro(convertidos.erro);
      return;
    }

    // Plano trocado com ciclo ativo: confirmação antes de gravar qualquer coisa.
    if (plan !== planoSalvo && !previa) {
      const p = await buscarPrevia(plan);
      if (!p) return;
      if (p.ciclo) {
        setReaplicando(false);
        setPrevia(p);
        return;
      }
    }

    await gravar(convertidos.valores);
  }

  async function gravar(valores: Record<string, unknown>) {
    setSalvando(true);

    const { error } = await api
      .from("patients")
      .update({
        name,
        phone,
        objective,
        payment_status: paymentStatus,
        important_note: importantNote,
        initial_weight:
  initialWeight === "" ? null : Number(initialWeight),
  training_weekly_goal: Number(trainingWeeklyGoal),
  cardio_weekly_goal: Number(cardioWeeklyGoal),
  individual_goal: individualGoal.trim() === "" ? null : individualGoal.trim(),
        ...valores,
      })
      .eq("id", id);

    if (error) {
      console.error(error);
      setErro("Não foi possível salvar as alterações.");
      setSalvando(false);
      setPrevia(null);
      return;
    }

    if (plan !== planoSalvo && !(await aplicarPlano(plan))) {
      setSalvando(false);
      setPrevia(null);
      return;
    }

    router.push(`/pacientes/${id}`);
    router.refresh();
  }
  if (carregando) {
    return (
      <div>

        <main className="min-w-0 flex-1 p-4 lg:p-8">
          <p>Carregando paciente...</p>
        </main>
      </div>
    );
  }

  return (
    <div>

      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-5xl">

          <BotaoVoltar rotulo="Voltar para o paciente" onClick={() => router.push(`/pacientes/${id}`)} />

          <div className="mb-8">
<h1 className="text-3xl font-bold text-gray-900">
              Editar paciente
            </h1>

            <p className="mt-2 text-gray-600">
              Atualize as informações do paciente.
            </p>
          </div>

<AcessoDoPaciente pacienteId={id} nome={name} />

          <form
            onSubmit={salvarPaciente}
            className="cartao p-5 lg:p-8"
          >
            <div className="grid gap-6 md:grid-cols-2">

              <Campo
                titulo="Nome completo"
                valor={name}
                alterar={setName}
              />

              <Campo
                titulo="Telefone"
                valor={phone}
                alterar={setPhone}
              />

              <CamposComplementares valor={complementares} onChange={setComplementares} />

              <Campo
  titulo="Peso inicial (kg)"
  valor={initialWeight}
  alterar={setInitialWeight}
/>

<Campo
  titulo="Treinos por semana"
  valor={trainingWeeklyGoal}
  alterar={setTrainingWeeklyGoal}
/>

<Campo
  titulo="Aeróbicos por semana"
  valor={cardioWeeklyGoal}
  alterar={setCardioWeeklyGoal}
/>

<Campo
  titulo="Meta individual"
  valor={individualGoal}
  alterar={setIndividualGoal}
/>

              <Campo
                titulo="Objetivo"
                valor={objective}
                alterar={setObjective}
              />

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Plano contratado
                </label>

                <Selecao
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                  className="w-full"
                >
                  <option value="Semanal">Semanal</option>
                  <option value="Quinzenal">Quinzenal</option>
                  <option value="Mensal">Mensal</option>
                </Selecao>

                {frequenciaDoCiclo && planoSalvo && plan === planoSalvo &&
                normalizarFrequencia(frequenciaDoCiclo) !== normalizarFrequencia(planoSalvo) ? (
                  <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p>
                      O acompanhamento atual está como {frequenciaDoCiclo}, diferente do cadastro ({planoSalvo}).
                    </p>
                    <Button
                      type="button"
                      size="small"
                      outlined
                      className="mt-2"
                      icon="pi pi-sync"
                      label="Reaplicar o plano ao acompanhamento atual"
                      onClick={async () => {
                        setErro("");
                        const p = await buscarPrevia(planoSalvo);
                        if (p) {
                          setReaplicando(true);
                          setPrevia(p);
                        }
                      }}
                    />
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Status do pagamento
                </label>

                <Selecao
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="w-full"
                >
                  <option value="Ativo">Ativo</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Cancelado">Cancelado</option>
                </Selecao>
              </div>

            </div>

            <div className="mt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Lembrete importante
              </label>

              <InputTextarea autoResize
                value={importantNote}
                onChange={(e) => setImportantNote(e.target.value)}
                rows={4}
                className="w-full"
              />
            </div>

            {erro && (
              <p className="mt-4 text-sm font-medium text-red-600">
                {erro}
              </p>
            )}

            <div className="mt-8 flex justify-end gap-3 border-t border-gray-200 pt-6">

              <Button severity="secondary" outlined
                type="button"
                onClick={() => router.push(`/pacientes/${id}`)}
               
              >
                Cancelar
              </Button>

              <Button
                type="submit"
                disabled={salvando}
               
              >
                {salvando ? "Salvando..." : "Salvar alterações"}
              </Button>

            </div>
          </form>

          <ConfirmarPlano
            previa={previa}
            reaplicar={reaplicando}
            salvando={salvando}
            onCancelar={() => setPrevia(null)}
            onConfirmar={async () => {
              if (reaplicando) {
                setSalvando(true);
                await aplicarPlano(planoSalvo ?? plan);
                setSalvando(false);
                setPrevia(null);
                return;
              }
              const convertidos = dadosParaBanco(complementares);
              if ("erro" in convertidos) {
                setErro(convertidos.erro);
                setPrevia(null);
                return;
              }
              await gravar(convertidos.valores);
            }}
          />

        </div>
      </main>
    </div>
  );
}

function Campo({
  titulo,
  valor,
  alterar,
}: {
  titulo: string;
  valor: string;
  alterar: (valor: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {titulo}
      </label>

      <InputText
        type="text"
        value={valor}
        onChange={(e) => alterar(e.target.value)}
        className="w-full"
      />
    </div>
  );
}
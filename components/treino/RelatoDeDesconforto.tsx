"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import {
  CONDUTAS,
  ORIENTACAO_DESCONFORTO,
  REGIOES_DO_CORPO,
  validarDesconforto,
  type ChaveDia,
  type CondutaNoDesconforto,
  type RelatoDeDesconforto as Relato,
} from "@/lib/treino";

const OUTRO_EXERCICIO = "__outro__";
const OUTRA_REGIAO = "__outra__";

// Relato de desconforto do aluno (aberto pelo modal do dia, sem sair dele).
// Região, intensidade de 0 a 10, exercício, se continuou ou parou e um
// comentário. O profissional recebe um alerta na hora.
export default function RelatoDeDesconforto({
  visivel,
  dia,
  exercicios,
  onFechar,
  onEnviar,
}: {
  visivel: boolean;
  dia: ChaveDia | null;
  exercicios: string[];
  onFechar: () => void;
  onEnviar: (relato: Relato) => Promise<string | null>;
}) {
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [regiao, setRegiao] = useState<string | null>(null);
  const [outraRegiao, setOutraRegiao] = useState("");
  const [intensidade, setIntensidade] = useState<number | null>(null);
  const [exercicio, setExercicio] = useState<string | null>(null);
  const [conduta, setConduta] = useState<CondutaNoDesconforto | null>(null);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  function limpar() {
    setChave(crypto.randomUUID());
    setRegiao(null);
    setOutraRegiao("");
    setIntensidade(null);
    setExercicio(null);
    setConduta(null);
    setComentario("");
    setErro(null);
    setEnviado(false);
  }

  function fechar() {
    if (enviando) return;
    limpar();
    onFechar();
  }

  async function enviar() {
    const resultado = validarDesconforto({
      chaveCliente: chave,
      dia,
      exercicio: exercicio === OUTRO_EXERCICIO ? null : exercicio,
      regiao: regiao === OUTRA_REGIAO ? outraRegiao : regiao,
      intensidade,
      conduta,
      comentario,
    });
    if ("erro" in resultado) {
      setErro(resultado.erro);
      return;
    }
    setErro(null);
    setEnviando(true);
    // A mesma chave é reenviada se houver nova tentativa: não duplica.
    const falha = await onEnviar(resultado.relato);
    setEnviando(false);
    if (falha) {
      setErro(falha);
      return;
    }
    setEnviado(true);
  }

  return (
    <Dialog
      header="Relatar desconforto"
      visible={visivel}
      onHide={fechar}
      className="w-[34rem] max-w-[calc(100vw-2rem)]"
      footer={
        enviado ? (
          <div className="flex justify-end">
            <Button type="button" label="Fechar" onClick={fechar} />
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" severity="secondary" outlined disabled={enviando} onClick={fechar} />
            <Button type="button" label="Enviar relato" icon="pi pi-send" severity="danger" loading={enviando} onClick={enviar} />
          </div>
        )
      }
    >
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900" role="note">
        {ORIENTACAO_DESCONFORTO.map((linha) => (
          <p key={linha}>{linha}</p>
        ))}
      </div>

      {enviado ? (
        <p className="mt-4 flex items-start gap-2 font-semibold text-primary-800" role="status">
          <i className="pi pi-check-circle mt-0.5" aria-hidden />
          Relato registrado e enviado ao seu profissional.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700">Onde é o desconforto?</span>
            <Dropdown
              value={regiao}
              options={[...REGIOES_DO_CORPO.map((r) => ({ label: r, value: r })), { label: "Outra região", value: OUTRA_REGIAO }]}
              onChange={(e) => setRegiao(e.value)}
              placeholder="Escolha a região"
              aria-label="Região do desconforto"
              className="w-full"
            />
          </label>
          {regiao === OUTRA_REGIAO ? (
            <InputText
              value={outraRegiao}
              maxLength={80}
              onChange={(e) => setOutraRegiao(e.target.value)}
              placeholder="Qual região?"
              aria-label="Outra região"
              className="w-full"
            />
          ) : null}

          <div>
            <span className="mb-1 block text-sm font-semibold text-gray-700">Intensidade (0 = nenhum, 10 = máximo)</span>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Intensidade do desconforto">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={intensidade === n}
                  aria-label={`Intensidade ${n}`}
                  onClick={() => setIntensidade(n)}
                  className={`h-9 w-9 rounded-full border text-sm font-bold ${
                    intensidade === n ? "border-red-700 bg-red-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-red-400"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {exercicios.length ? (
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Em qual exercício? (opcional)</span>
              <Dropdown
                value={exercicio}
                options={[...exercicios.map((e) => ({ label: e, value: e })), { label: "Outro / fora do treino", value: OUTRO_EXERCICIO }]}
                onChange={(e) => setExercicio(e.value)}
                showClear
                placeholder="Escolha o exercício"
                aria-label="Exercício do desconforto"
                className="w-full"
              />
            </label>
          ) : null}

          <div>
            <span className="mb-1 block text-sm font-semibold text-gray-700">Como você percebeu?</span>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Percepção do desconforto">
              {CONDUTAS.map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  role="radio"
                  aria-checked={conduta === c.valor}
                  onClick={() => setConduta(c.valor)}
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                    conduta === c.valor ? "border-primary-700 bg-primary-700 text-white" : "border-gray-300 bg-white text-gray-700 hover:border-primary-400"
                  }`}
                >
                  {c.rotulo}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-700">Comentário (opcional)</span>
            <InputTextarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              maxLength={1000}
              autoResize
              rows={2}
              aria-label="Comentário do desconforto"
              placeholder="Como começou, o que você sentiu"
              className="w-full"
            />
          </label>

          {erro ? (
            <p className="text-sm font-semibold text-red-700" role="alert">
              {erro}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

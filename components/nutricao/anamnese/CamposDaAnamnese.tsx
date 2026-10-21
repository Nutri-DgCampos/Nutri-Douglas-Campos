"use client";

import { Checkbox } from "primereact/checkbox";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { RadioButton } from "primereact/radiobutton";
import { respostaPreenchida, textoDaResposta, type Pergunta, type Resposta, type Respostas } from "@/lib/nutricao/anamnese";

// Perguntas da ficha de anamnese com os campos de resposta (mesma tela para
// o nutricionista e para o paciente). "originais": o que o paciente enviou,
// mostrado quando o nutricionista alterou a resposta depois.
export default function CamposDaAnamnese({
  perguntas,
  respostas,
  onChange,
  somenteLeitura = false,
  faltando = [],
  originais,
}: {
  perguntas: Pergunta[];
  respostas: Respostas;
  onChange: (perguntaId: string, resposta: Resposta | undefined) => void;
  somenteLeitura?: boolean;
  faltando?: string[];
  originais?: Respostas | null;
}) {
  return (
    <ol className="space-y-4">
      {perguntas.map((p, n) => {
        const r = respostas[p.id];
        const destacar = faltando.includes(p.id);
        const original = originais ? textoDaResposta(p, originais[p.id]) : null;
        const atual = textoDaResposta(p, r);
        const idCampo = `pergunta-${p.id}`;
        return (
          <li
            key={p.id}
            className={`rounded-xl border p-3 ${destacar ? "border-red-400 bg-red-50" : "border-gray-200 bg-white"}`}
            data-pergunta={p.id}
          >
            {p.texto.trim() ? (
              <label htmlFor={idCampo} className="mb-2 block font-semibold text-gray-900">
                <span className="mr-1 text-gray-400">{n + 1}.</span>
                {p.texto}
                {p.obrigatoria ? <span className="ml-1 text-red-600" aria-label="obrigatória">*</span> : null}
              </label>
            ) : null}

            {p.tipo === "multipla" ? (
              <fieldset className="space-y-1.5" aria-label={p.texto || `Pergunta ${n + 1}`}>
                {p.variasRespostas ? <p className="text-xs text-gray-500">Pode marcar mais de uma.</p> : null}
                {p.opcoes.map((o) => {
                  const marcadas = Array.isArray(r) ? r : [];
                  const marcada = marcadas.includes(o.id);
                  const idOpcao = `opcao-${p.id}-${o.id}`;
                  return (
                    <div key={o.id} className="flex items-center gap-2">
                      {p.variasRespostas ? (
                        <Checkbox
                          inputId={idOpcao}
                          checked={marcada}
                          disabled={somenteLeitura}
                          onChange={(e) => {
                            const nova = e.checked ? [...marcadas, o.id] : marcadas.filter((x) => x !== o.id);
                            onChange(p.id, nova.length ? nova : undefined);
                          }}
                        />
                      ) : (
                        <RadioButton
                          inputId={idOpcao}
                          name={`pergunta-${p.id}`}
                          checked={marcada}
                          disabled={somenteLeitura}
                          onChange={() => onChange(p.id, [o.id])}
                        />
                      )}
                      <label htmlFor={idOpcao} className="text-gray-800">
                        {o.texto}
                      </label>
                    </div>
                  );
                })}
                {!p.variasRespostas && respostaPreenchida(r) && !somenteLeitura && !p.obrigatoria ? (
                  <button type="button" className="text-xs text-gray-500 underline" onClick={() => onChange(p.id, undefined)}>
                    Limpar resposta
                  </button>
                ) : null}
              </fieldset>
            ) : p.tipo === "curto" ? (
              <InputText
                id={idCampo}
                value={typeof r === "string" ? r : ""}
                disabled={somenteLeitura}
                onChange={(e) => onChange(p.id, e.target.value || undefined)}
                className="w-full"
                maxLength={5000}
              />
            ) : (
              <InputTextarea
                id={idCampo}
                aria-label={p.texto || "Texto livre"}
                value={typeof r === "string" ? r : ""}
                disabled={somenteLeitura}
                onChange={(e) => onChange(p.id, e.target.value || undefined)}
                rows={p.tipo === "texto_livre" ? 10 : 3}
                autoResize
                className="w-full"
                maxLength={5000}
              />
            )}

            {destacar ? <p className="mt-1 text-sm text-red-700">Resposta obrigatória.</p> : null}
            {original !== null && original !== atual ? (
              <p className="mt-1 text-xs text-gray-500">
                Resposta original do paciente: <span className="font-semibold">{original || "(em branco)"}</span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

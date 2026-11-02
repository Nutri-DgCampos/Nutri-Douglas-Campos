"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Perfil = "frente" | "lado" | "costas";
type Sexo = "masculino" | "feminino" | null;

const POSICOES: { chave: Perfil; rotulo: string }[] = [
  { chave: "frente", rotulo: "Frente" },
  { chave: "lado", rotulo: "Lateral" },
  { chave: "costas", rotulo: "Costas" },
];

const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAXIMO = 10 * 1024 * 1024;

// Cores dos cartões conforme o sexo do cadastro, tiradas dos modelos 07 e 08
// (resposta I7 do cliente). Sem sexo, o verde do aplicativo.
const CORES: Record<"masculino" | "feminino" | "neutro", { titulo: string; selo: string; arrastando: string }> = {
  masculino: { titulo: "bg-[#10427a]", selo: "bg-[#f4f7fc] text-[#10427a]", arrastando: "border-[#10427a] bg-[#f4f7fc]" },
  feminino: { titulo: "bg-[#8c0c50]", selo: "bg-[#faf5f8] text-[#8c0c50]", arrastando: "border-[#8c0c50] bg-[#faf5f8]" },
  neutro: { titulo: "bg-primary-800", selo: "bg-primary-50 text-primary-800", arrastando: "border-primary-700 bg-primary-50" },
};

// Avatares de referência das três posições, conforme o sexo do cadastro
// (recortados dos modelos aprovados, em public/nutricao/avatares/fotos-corporais).
// Sem sexo no cadastro, nenhum avatar é presumido: só a indicação da posição.
const ARQUIVO_DA_POSICAO: Record<Perfil, string> = { frente: "frente", lado: "lateral", costas: "costas" };
const DESCRICAO_DA_POSICAO: Record<Perfil, string> = { frente: "de frente", lado: "de lado", costas: "de costas" };

function Avatar({ sexo, perfil }: { sexo: Sexo; perfil: Perfil }) {
  if (!sexo) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400" aria-hidden>
        <i className="pi pi-user text-5xl" />
        <span className="text-xs">Posição: {DESCRICAO_DA_POSICAO[perfil]}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/nutricao/avatares/fotos-corporais/${sexo}-${ARQUIVO_DA_POSICAO[perfil]}.png`}
      alt={`Avatar ${sexo}, ${DESCRICAO_DA_POSICAO[perfil]}`}
      className="mx-auto h-full w-full object-contain"
    />
  );
}

// Seção "Fotos Corporais" do link de anamnese e recordatório: 1, 2 ou 3 fotos
// (todas opcionais). Vão para o Comparativo de fotos do nutricionista, na
// data de hoje. Uma posição já enviada hoje não é substituída: o paciente
// exclui e envia de novo.
export default function FotosCorporais({ base }: { base: string }) {
  const [dados, setDados] = useState<{ sexo: Sexo; fotos: { id: string; perfil: Perfil }[] } | null>(null);
  const [enviando, setEnviando] = useState<Perfil | null>(null);
  const [arrastando, setArrastando] = useState<Perfil | null>(null);
  const entradas = useRef<Partial<Record<Perfil, HTMLInputElement | null>>>({});

  const buscar = useCallback(() => fetch(`${base}/fotos`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)), [base]);
  const carregar = useCallback(async () => setDados(await buscar()), [buscar]);

  useEffect(() => {
    buscar()
      .then(setDados)
      .catch(() => setDados(null));
  }, [buscar]);

  async function enviar(perfil: Perfil, arquivo: File | undefined) {
    if (!arquivo) return;
    if (!TIPOS.includes(arquivo.type)) {
      avisar("Envie a foto em JPG, PNG ou WEBP.", "warn");
      return;
    }
    if (arquivo.size > MAXIMO) {
      avisar("A foto deve ter no máximo 10 MB.", "warn");
      return;
    }
    setEnviando(perfil);
    const r = await fetch(`${base}/fotos?perfil=${perfil}`, { method: "POST", headers: { "Content-Type": arquivo.type }, body: arquivo }).catch(() => null);
    setEnviando(null);
    if (!r?.ok) {
      avisar((await r?.json().catch(() => null))?.erro ?? "Não foi possível enviar a foto. Confira a conexão e tente de novo.", "error");
      return;
    }
    avisar("Foto enviada ao nutricionista.", "success");
    await carregar();
  }

  async function excluir(id: string, rotulo: string) {
    if (!(await pedirConfirmacao(`Excluir a foto de ${rotulo} enviada hoje?`))) return;
    const r = await fetch(`${base}/fotos?id=${id}`, { method: "DELETE" });
    if (!r.ok) {
      avisar("Não foi possível excluir a foto.", "error");
      return;
    }
    avisar("Foto excluída.", "success");
    await carregar();
  }

  if (!dados) return null;
  const cores = CORES[dados.sexo ?? "neutro"];

  return (
    <section className="cartao mt-6 p-5" aria-label="Fotos Corporais">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <i className="pi pi-camera text-lg" aria-hidden />
        </span>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Fotos Corporais</h2>
          <p className="text-sm text-gray-600">Envie suas fotos para acompanhamento da evolução. Você pode enviar uma, duas ou três fotos.</p>
        </div>
      </div>

      <p className={`mt-3 inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${cores.selo}`}>
        {dados.sexo ? (
          <span className="text-lg leading-none" aria-hidden>
            {dados.sexo === "masculino" ? "♂" : "♀"}
          </span>
        ) : (
          <i className="pi pi-info-circle" aria-hidden />
        )}
        {dados.sexo ? (
          <span>
            Paciente: <strong>{dados.sexo === "masculino" ? "Masculino" : "Feminino"}</strong>
          </span>
        ) : (
          <span>Sexo não informado no cadastro. As figuras mostram só a posição; se quiser, avise o nutricionista.</span>
        )}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {POSICOES.map(({ chave, rotulo }) => {
          const foto = dados.fotos.find((f) => f.perfil === chave);
          return (
            <div key={chave} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <p className={`${cores.titulo} py-2 text-center font-bold text-white`}>{rotulo}</p>
              <div className="aspect-[3/4] bg-gray-50 p-2">
                {foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`${base}/fotos/${foto.id}`} alt={`Sua foto de ${rotulo}`} className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <Avatar sexo={dados.sexo} perfil={chave} />
                )}
              </div>
              <div className="p-2">
                {foto ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-primary-700">
                      <i className="pi pi-check-circle mr-1" aria-hidden />
                      Enviada hoje
                    </span>
                    <Button type="button" text size="small" severity="danger" icon="pi pi-trash" label="Excluir" onClick={() => excluir(foto.id, rotulo)} />
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => {
                      e.preventDefault();
                      setArrastando(chave);
                    }}
                    onDragLeave={() => setArrastando(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setArrastando(null);
                      enviar(chave, e.dataTransfer.files?.[0]);
                    }}
                    className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-2 py-3 text-center text-sm ${
                      arrastando === chave ? cores.arrastando : "border-gray-300 hover:border-gray-500"
                    }`}
                  >
                    <i className={`pi ${enviando === chave ? "pi-spin pi-spinner" : "pi-cloud-upload"} text-xl text-primary-700`} aria-hidden />
                    <span className="font-semibold text-gray-800">{enviando === chave ? "Enviando..." : "Clique ou arraste a foto aqui"}</span>
                    <span className="text-xs text-gray-500">JPG, PNG ou WEBP (máx. 10 MB)</span>
                    <input
                      ref={(el) => {
                        entradas.current[chave] = el;
                      }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={`Foto de ${rotulo}`}
                      className="sr-only"
                      disabled={enviando !== null}
                      onChange={(e) => {
                        enviar(chave, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-sm text-primary-900">
        <i className="pi pi-info-circle mt-0.5" aria-hidden />
        <span>
          <strong>Dica:</strong> faça as fotos em um local iluminado, com roupa adequada e sempre na mesma posição, para facilitar a
          comparação da evolução.
        </span>
      </p>
    </section>
  );
}

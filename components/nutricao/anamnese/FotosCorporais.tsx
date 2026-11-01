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

// Silhuetas já usadas na avaliação física (frente à esquerda, costas à
// direita da mesma imagem). Não existe avatar lateral: a posição Lateral
// mostra só um ícone. Sem sexo no cadastro, nenhuma silhueta é presumida.
function Avatar({ sexo, perfil }: { sexo: Sexo; perfil: Perfil }) {
  if (!sexo || perfil === "lado") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400" aria-hidden>
        <i className="pi pi-user text-5xl" />
        <span className="text-xs">{perfil === "lado" ? "De lado, braços relaxados" : "Posição de referência"}</span>
      </div>
    );
  }
  // Cada metade da imagem (1024 × 1536) tem proporção 1:3; a figura inteira
  // cabe na altura do cartão.
  return (
    <div className="flex h-full justify-center">
      <div
        role="img"
        aria-label={`Silhueta ${sexo}, ${perfil === "frente" ? "de frente" : "de costas"}`}
        className="aspect-[1/3] h-full rounded-lg bg-no-repeat"
        style={{
          backgroundImage: `url(/nutricao/avatares/silhueta-${sexo === "masculino" ? "masculina" : "feminina"}.png)`,
          backgroundSize: "200% 100%",
          backgroundPosition: perfil === "frente" ? "0% 0%" : "100% 0%",
        }}
      />
    </div>
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

      <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-1.5 text-sm text-primary-800">
        <i className={`pi ${dados.sexo ? "pi-user" : "pi-info-circle"}`} aria-hidden />
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
              <p className="bg-primary-800 py-2 text-center font-bold text-white">{rotulo}</p>
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
                      arrastando === chave ? "border-primary-700 bg-primary-50" : "border-gray-300 hover:border-primary-500"
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

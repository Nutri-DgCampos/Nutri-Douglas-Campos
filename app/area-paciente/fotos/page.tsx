"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { Skeleton } from "primereact/skeleton";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";
import { hojeNoBrasil } from "@/lib/cronograma";
import { type FotoEvolucao, type Perfil, PERFIS, enderecosParaExibir, formatarData } from "@/lib/fotos";
import { reduzirFoto } from "@/lib/imagem";

// Fotos de evolução: o paciente anexa frente, lado e costas; cada envio fica
// guardado com a data para o nutricionista comparar.
export default function FotosPacientePage() {
  const entrada = useRef<HTMLInputElement>(null);
  const perfilEscolhido = useRef<Perfil>("frente");

  const [pacienteId, setPacienteId] = useState<string | null>(null);
  const [fotos, setFotos] = useState<FotoEvolucao[] | null>(null);
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState<Perfil | null>(null);
  const [ampliada, setAmpliada] = useState<FotoEvolucao | null>(null);

  const hoje = hojeNoBrasil();

  const carregar = useCallback(async () => {
    const { data, error } = await api
      .from("fotos_evolucao")
      .select("id, perfil, data, storage_path")
      .order("data", { ascending: false });

    if (error) console.error("Erro ao carregar fotos:", error);

    const lista = (data ?? []) as FotoEvolucao[];
    setFotos(lista);
    setEnderecos(await enderecosParaExibir(lista));
  }, []);

  useEffect(() => {
    api.auth.getUser().then(async ({ data: { user } }) => {
      const { data } = await api.from("patients").select("id").eq("auth_user_id", user?.id ?? "").maybeSingle();
      setPacienteId(data?.id ?? null);
    });

    carregar();
  }, [carregar]);

  const porData = useMemo(() => {
    const grupos = new Map<string, Partial<Record<Perfil, FotoEvolucao>>>();

    for (const foto of fotos ?? []) {
      grupos.set(foto.data, { ...grupos.get(foto.data), [foto.perfil]: foto });
    }

    return [...grupos.entries()];
  }, [fotos]);

  const deHoje = porData.find(([data]) => data === hoje)?.[1] ?? {};

  function escolher(perfil: Perfil) {
    perfilEscolhido.current = perfil;
    entrada.current?.click();
  }

  async function enviar(arquivo: File) {
    const perfil = perfilEscolhido.current;

    if (!arquivo.type.startsWith("image/")) {
      avisar("Escolha uma foto.", "warn");
      return;
    }

    if (!pacienteId) {
      avisar("Não foi possível identificar seu cadastro.", "error");
      return;
    }

    setEnviando(perfil);

    try {
      const foto = await reduzirFoto(arquivo);
      const caminho = `${pacienteId}/${hoje}-${perfil}-${crypto.randomUUID()}.jpg`;

      const { error } = await api.storage.from("fotos").upload(caminho, foto, { contentType: "image/jpeg" });
      if (error) throw new Error(error.message);

      const resposta = await fetch("/api/fotos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil, caminho }),
      });

      if (!resposta.ok) throw new Error("Não foi possível registrar a foto.");

      avisar("Foto salva!", "success");
      await carregar();
    } catch (erro) {
      console.error("Erro ao enviar foto:", erro);
      avisar("Não foi possível enviar a foto. Tente novamente.", "error");
    } finally {
      setEnviando(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function remover(foto: FotoEvolucao) {
    if (!(await pedirConfirmacao("Remover esta foto?"))) return;

    const resposta = await fetch(`/api/fotos?id=${foto.id}`, { method: "DELETE" });

    if (!resposta.ok) {
      avisar("Não foi possível remover a foto.", "error");
      return;
    }

    await carregar();
  }

  return (
    <main className="px-4 pb-6 pt-[calc(1.25rem+env(safe-area-inset-top))] sm:px-6">
      <div className="mx-auto max-w-md">
        <CabecalhoPagina
          titulo="Fotos"
          descricao="Registre sua evolução de frente, de lado e de costas. Use a mesma roupa, local e iluminação."
        />

        <input
          ref={entrada}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) enviar(arquivo);
          }}
        />

        <section className="cartao mt-6 p-4">
          <h2 className="font-bold text-gray-900">Fotos de hoje · {formatarData(hoje)}</h2>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {PERFIS.map(({ chave, rotulo }) => {
              const foto = deHoje[chave];
              const endereco = foto ? enderecos[foto.storage_path] : null;

              return (
                <div key={chave} className="min-w-0">
                  <p className="mb-1 text-center text-sm font-semibold text-gray-700">{rotulo}</p>

                  <button
                    type="button"
                    onClick={() => (foto ? setAmpliada(foto) : escolher(chave))}
                    className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-gray-300 bg-gray-50"
                    aria-label={foto ? `Ver foto de ${rotulo.toLowerCase()}` : `Anexar foto de ${rotulo.toLowerCase()}`}
                  >
                    {enviando === chave ? (
                      <i className="pi pi-spin pi-spinner text-xl text-primary-700" aria-hidden />
                    ) : endereco ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={endereco} alt={`Foto de ${rotulo.toLowerCase()}`} className="h-full w-full object-cover" />
                    ) : (
                      <i className="pi pi-camera text-2xl text-gray-400" aria-hidden />
                    )}
                  </button>

                  <div className="mt-1 flex justify-center">
                    <Button
                      type="button"
                      size="small"
                      text
                      label={foto ? "Trocar" : "Anexar"}
                      disabled={enviando !== null}
                      onClick={() => escolher(chave)}
                      className={foto ? "px-2" : "w-full justify-center"}
                    />
                    {foto ? (
                      // Foto anexada por engano: o paciente remove direto daqui.
                      <Button
                        type="button"
                        size="small"
                        text
                        severity="danger"
                        icon="pi pi-trash"
                        aria-label={`Remover foto de ${rotulo.toLowerCase()}`}
                        disabled={enviando !== null}
                        onClick={() => remover(foto)}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <h2 className="font-bold text-gray-900">Histórico</h2>

          {fotos === null ? (
            <Skeleton height="10rem" borderRadius="16px" className="mt-3" />
          ) : porData.filter(([data]) => data !== hoje).length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">As fotos dos dias anteriores aparecem aqui.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {porData
                .filter(([data]) => data !== hoje)
                .map(([data, doDia]) => (
                  <li key={data} className="cartao p-3">
                    <p className="mb-2 text-sm font-semibold text-gray-700">{formatarData(data)}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {PERFIS.map(({ chave, rotulo }) => {
                        const foto = doDia[chave];
                        const endereco = foto ? enderecos[foto.storage_path] : null;

                        return foto && endereco ? (
                          <div key={chave} className="relative">
                            <button
                              type="button"
                              onClick={() => setAmpliada(foto)}
                              className="aspect-[3/4] w-full overflow-hidden rounded-lg bg-gray-100"
                              aria-label={`Ver foto de ${rotulo.toLowerCase()} de ${formatarData(data)}`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={endereco} alt="" className="h-full w-full object-cover" />
                            </button>
                            <button
                              type="button"
                              onClick={() => remover(foto)}
                              className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 shadow"
                              aria-label={`Remover foto de ${rotulo.toLowerCase()} de ${formatarData(data)}`}
                            >
                              <i className="pi pi-trash text-xs" aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <div key={chave} className="flex aspect-[3/4] items-center justify-center rounded-lg bg-gray-50 text-xs text-gray-400">
                            {rotulo}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <Dialog
        header={ampliada ? `${PERFIS.find((p) => p.chave === ampliada.perfil)?.rotulo} · ${formatarData(ampliada.data)}` : ""}
        visible={Boolean(ampliada)}
        onHide={() => setAmpliada(null)}
        className="w-[30rem] max-w-[calc(100vw-2rem)]"
        footer={
          ampliada ? (
            <Button
              type="button"
              label="Remover foto"
              icon="pi pi-trash"
              severity="danger"
              text
              onClick={async () => {
                const foto = ampliada;
                setAmpliada(null);
                await remover(foto);
              }}
            />
          ) : undefined
        }
      >
        {ampliada && enderecos[ampliada.storage_path] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={enderecos[ampliada.storage_path]} alt="" className="w-full rounded-lg" />
        )}
      </Dialog>
    </main>
  );
}

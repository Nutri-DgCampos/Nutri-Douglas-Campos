"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "primereact/button";
import { SelectButton } from "primereact/selectbutton";
import SobreposicaoDeFotos from "@/components/SobreposicaoDeFotos";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";
import { type FotoEvolucao, type Perfil, PERFIS, enderecosParaExibir, formatarData } from "@/lib/fotos";

const MAXIMO_DATAS = 3;

// Comparativo das fotos de evolução: um perfil, até três datas lado a lado.
// Datas favoritas ficam marcadas e entram na seleção inicial. Arrastar uma
// foto sobre outra (ou "Sobrepor", no celular) abre a sobreposição.
export default function ComparativoFotos({ pacienteId }: { pacienteId: string }) {
  const [fotos, setFotos] = useState<FotoEvolucao[] | null>(null);
  const [enderecos, setEnderecos] = useState<Record<string, string>>({});
  const [favoritas, setFavoritas] = useState<Set<string>>(new Set());
  const [perfil, setPerfil] = useState<Perfil>("frente");
  // Datas escolhidas pelo nutricionista em cada perfil (enquanto não escolhe, vale a seleção inicial).
  const [escolhas, setEscolhas] = useState<Partial<Record<Perfil, string[]>>>({});
  // Número do ciclo de dieta de cada foto (só para exibir).
  const [ciclos, setCiclos] = useState<Record<string, number>>({});
  const [sobrepor, setSobrepor] = useState<{ base: FotoEvolucao; topo: FotoEvolucao } | null>(null);
  const arrastada = useRef<FotoEvolucao | null>(null);

  useEffect(() => {
    Promise.all([
      api
        .from("fotos_evolucao")
        .select("id, perfil, data, storage_path, ciclo_id")
        .eq("patient_id", pacienteId)
        .order("data", { ascending: true }),
      api.from("fotos_datas_favoritas").select("data").eq("patient_id", pacienteId),
      api.from("diet_cycles").select("id, cycle_number").eq("patient_id", pacienteId),
    ]).then(async ([resultadoFotos, resultadoFavoritas, resultadoCiclos]) => {
      const lista = (resultadoFotos.data ?? []) as FotoEvolucao[];
      const numeros = Object.fromEntries(((resultadoCiclos.data ?? []) as { id: string; cycle_number: number }[]).map((c) => [c.id, c.cycle_number]));
      setCiclos(Object.fromEntries(lista.filter((f) => f.ciclo_id && numeros[f.ciclo_id]).map((f) => [f.id, numeros[f.ciclo_id as string]])));

      setFavoritas(new Set((resultadoFavoritas.data ?? []).map((item: { data: string }) => item.data)));
      setFotos(lista);
      setEnderecos(await enderecosParaExibir(lista));
    });
  }, [pacienteId]);

  const doPerfil = useMemo(
    () => (fotos ?? []).filter((foto) => foto.perfil === perfil),
    [fotos, perfil]
  );

  const datas = useMemo(() => doPerfil.map((foto) => foto.data), [doPerfil]);

  // Seleção inicial: favoritas mais recentes e, completando, as datas mais recentes.
  const selecaoInicial = useMemo(() => {
    const recentes = [...datas].reverse();

    return [
      ...recentes.filter((data) => favoritas.has(data)),
      ...recentes.filter((data) => !favoritas.has(data)),
    ].slice(0, MAXIMO_DATAS);
  }, [datas, favoritas]);

  const selecionadas = escolhas[perfil] ?? selecaoInicial;

  function alternarData(data: string) {
    if (!selecionadas.includes(data) && selecionadas.length >= MAXIMO_DATAS) {
      avisar(`Escolha até ${MAXIMO_DATAS} datas para comparar.`, "warn");
      return;
    }

    setEscolhas((atuais) => ({
      ...atuais,
      [perfil]: selecionadas.includes(data)
        ? selecionadas.filter((item) => item !== data)
        : [...selecionadas, data],
    }));
  }

  async function alternarFavorita(data: string) {
    const favorita = favoritas.has(data);

    const { error } = favorita
      ? await api.from("fotos_datas_favoritas").delete().eq("patient_id", pacienteId).eq("data", data)
      : await api.from("fotos_datas_favoritas").insert({ patient_id: pacienteId, data });

    if (error) {
      console.error("Erro ao marcar data favorita:", error);
      avisar("Não foi possível atualizar a data favorita.", "error");
      return;
    }

    setFavoritas((atuais) => {
      const novas = new Set(atuais);
      if (favorita) novas.delete(data);
      else novas.add(data);
      return novas;
    });
  }

  const comparadas = doPerfil
    .filter((foto) => selecionadas.includes(foto.data))
    .sort((a, b) => a.data.localeCompare(b.data));

  const rotuloDaFoto = (foto: FotoEvolucao) => `${formatarData(foto.data)}${ciclos[foto.id] ? ` · ciclo ${ciclos[foto.id]}` : ""}`;

  return (
    <section className="mt-6 cartao p-5 lg:p-6">
      <h2 className="text-xl font-bold text-gray-900">Comparativo de fotos</h2>
      <p className="mt-1 text-sm text-gray-500">
        Escolha o perfil e até {MAXIMO_DATAS} datas. Marque com a estrela as datas de referência.
      </p>

      {fotos === null ? (
        <p className="mt-6 text-sm text-gray-500">Carregando fotos...</p>
      ) : fotos.length === 0 ? (
        <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          O paciente ainda não enviou fotos.
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-gray-700">Perfil</p>
                <SelectButton
                  value={perfil}
                  onChange={(evento) => evento.value && setPerfil(evento.value)}
                  options={PERFIS.map(({ chave, rotulo }) => ({ label: rotulo, value: chave }))}
                  allowEmpty={false}
                  className="flex"
                  pt={{ button: { className: "flex-1 justify-center" } }}
                />
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold text-gray-700">
                  Datas ({selecionadas.length}/{MAXIMO_DATAS})
                </p>

                {datas.length === 0 ? (
                  <p className="text-sm text-gray-500">Nenhuma foto deste perfil.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2 lg:flex-col">
                    {[...datas].reverse().map((data) => {
                      const ativa = selecionadas.includes(data);
                      const favorita = favoritas.has(data);

                      return (
                        <li key={data} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => alternarData(data)}
                            aria-pressed={ativa}
                            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors lg:flex-1 lg:text-left ${
                              ativa
                                ? "border-primary-700 bg-primary-700 text-white"
                                : "border-gray-300 bg-white text-gray-700 hover:border-primary-700"
                            }`}
                          >
                            {formatarData(data)}
                            {(() => {
                              const foto = doPerfil.find((f) => f.data === data);
                              return foto && ciclos[foto.id] ? <span className="ml-1 text-xs font-normal opacity-80">· ciclo {ciclos[foto.id]}</span> : null;
                            })()}
                          </button>
                          <button
                            type="button"
                            onClick={() => alternarFavorita(data)}
                            aria-label={favorita ? `Desmarcar ${formatarData(data)} como favorita` : `Favoritar ${formatarData(data)}`}
                            aria-pressed={favorita}
                            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-100"
                          >
                            <i className={`pi ${favorita ? "pi-star-fill text-amber-500" : "pi-star text-gray-400"}`} aria-hidden />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div>
              {comparadas.length === 0 ? (
                <div className="flex h-full min-h-48 items-center justify-center rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
                  Selecione as datas para comparar.
                </div>
              ) : (
                <>
                {comparadas.length >= 2 ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500">
                    <span className="hidden md:inline">Arraste uma foto sobre a outra para sobrepor.</span>
                    {comparadas.length === 2 ? (
                      <Button
                        type="button"
                        outlined
                        size="small"
                        icon="pi pi-clone"
                        label="Sobrepor as duas fotos"
                        onClick={() => setSobrepor({ base: comparadas[0], topo: comparadas[1] })}
                      />
                    ) : (
                      <span className="md:hidden">Para sobrepor no celular, deixe duas datas selecionadas.</span>
                    )}
                  </div>
                ) : null}
                <div className={`grid gap-3 ${comparadas.length === 1 ? "grid-cols-1 sm:max-w-xs" : comparadas.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                  {comparadas.map((foto) => (
                    <figure
                      key={foto.id}
                      className="min-w-0"
                      draggable={comparadas.length >= 2}
                      onDragStart={() => (arrastada.current = foto)}
                      onDragOver={(e) => {
                        if (arrastada.current && arrastada.current.id !== foto.id) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const topo = arrastada.current;
                        arrastada.current = null;
                        if (topo && topo.id !== foto.id) setSobrepor({ base: foto, topo });
                      }}
                    >
                      <figcaption className="mb-2 flex items-center justify-center gap-1 text-sm font-semibold text-gray-800">
                        {favoritas.has(foto.data) && <i className="pi pi-star-fill text-xs text-amber-500" aria-hidden />}
                        {rotuloDaFoto(foto)}
                      </figcaption>
                      <a href={enderecos[foto.storage_path]} target="_blank" rel="noopener noreferrer" className="block aspect-[3/4] overflow-hidden rounded-xl bg-gray-100">
                        {enderecos[foto.storage_path] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={enderecos[foto.storage_path]}
                            alt={`${PERFIS.find((p) => p.chave === foto.perfil)?.rotulo} em ${formatarData(foto.data)}`}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                        )}
                      </a>
                    </figure>
                  ))}
                </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {sobrepor && enderecos[sobrepor.base.storage_path] && enderecos[sobrepor.topo.storage_path] ? (
        <SobreposicaoDeFotos
          base={{ src: enderecos[sobrepor.base.storage_path], rotulo: rotuloDaFoto(sobrepor.base) }}
          topo={{ src: enderecos[sobrepor.topo.storage_path], rotulo: rotuloDaFoto(sobrepor.topo) }}
          onFechar={() => setSobrepor(null)}
        />
      ) : null}
    </section>
  );
}

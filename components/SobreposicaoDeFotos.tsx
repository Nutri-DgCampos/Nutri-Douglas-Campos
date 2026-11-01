"use client";

import { useRef, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { SelectButton } from "primereact/selectbutton";
import { Slider } from "primereact/slider";

type Foto = { src: string; rotulo: string };
type Ajuste = { x: number; y: number; escala: number };
type Camada = "topo" | "base";

const INICIAL: Ajuste = { x: 0, y: 0, escala: 1 };

// Sobreposição de duas fotos da mesma posição (datas e ciclos diferentes),
// só para comparar visualmente as silhuetas. Transparência, mover cada foto
// (arrastando, com mouse ou dedo, ou pelas setas), zoom e alinhamento.
// Nada é gravado: fechar descarta os ajustes, e as fotos originais não mudam.
export default function SobreposicaoDeFotos({ base, topo, onFechar }: { base: Foto; topo: Foto; onFechar: () => void }) {
  const [ordem, setOrdem] = useState<{ base: Foto; topo: Foto }>({ base, topo });
  const [opacidade, setOpacidade] = useState(50);
  const [ajustes, setAjustes] = useState<Record<Camada, Ajuste>>({ topo: INICIAL, base: INICIAL });
  const [ativa, setAtiva] = useState<Camada>("topo");
  const arraste = useRef<{ x: number; y: number; inicio: Ajuste } | null>(null);

  const mover = (dx: number, dy: number) =>
    setAjustes((a) => ({ ...a, [ativa]: { ...a[ativa], x: a[ativa].x + dx, y: a[ativa].y + dy } }));

  const estilo = (camada: Camada) => {
    const a = ajustes[camada];
    return { transform: `translate(${a.x}px, ${a.y}px) scale(${a.escala})` };
  };

  return (
    <Dialog
      header="Sobrepor fotos"
      visible
      onHide={onFechar}
      maximizable
      className="w-[56rem] max-w-[calc(100vw-1rem)]"
      contentClassName="pb-4"
    >
      <p className="mb-3 text-xs text-gray-500">
        Comparação apenas visual: pose, lente, luz e distância variam entre as fotos, então isto não mede gordura nem
        alteração corporal. Os ajustes não são salvos e as fotos originais não mudam.
      </p>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
        <div
          className="relative aspect-[3/4] touch-none select-none overflow-hidden rounded-xl bg-gray-900"
          aria-label="Área de sobreposição: arraste para mover a foto selecionada"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            arraste.current = { x: e.clientX, y: e.clientY, inicio: ajustes[ativa] };
          }}
          onPointerMove={(e) => {
            const a = arraste.current;
            if (!a) return;
            setAjustes((atual) => ({ ...atual, [ativa]: { ...a.inicio, x: a.inicio.x + e.clientX - a.x, y: a.inicio.y + e.clientY - a.y } }));
          }}
          onPointerUp={() => (arraste.current = null)}
          onPointerCancel={() => (arraste.current = null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ordem.base.src} alt={`Foto de baixo: ${ordem.base.rotulo}`} draggable={false} className="absolute inset-0 h-full w-full object-contain" style={estilo("base")} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ordem.topo.src}
            alt={`Foto de cima: ${ordem.topo.rotulo}`}
            draggable={false}
            className="absolute inset-0 h-full w-full object-contain"
            style={{ ...estilo("topo"), opacity: opacidade / 100 }}
          />
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Cima: {ordem.topo.rotulo}</span>
          <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Baixo: {ordem.base.rotulo}</span>
        </div>

        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Transparência da foto de cima: {opacidade}%</p>
            <Slider value={opacidade} onChange={(e) => setOpacidade(e.value as number)} min={0} max={100} aria-label="Transparência" />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Ajustar</p>
            <SelectButton
              value={ativa}
              onChange={(e) => e.value && setAtiva(e.value)}
              options={[
                { label: "Foto de cima", value: "topo" },
                { label: "Foto de baixo", value: "base" },
              ]}
              allowEmpty={false}
              className="flex"
              pt={{ button: { className: "flex-1 justify-center text-sm" } }}
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Zoom: {Math.round(ajustes[ativa].escala * 100)}%</p>
            <Slider
              value={Math.round(ajustes[ativa].escala * 100)}
              onChange={(e) => setAjustes((a) => ({ ...a, [ativa]: { ...a[ativa], escala: (e.value as number) / 100 } }))}
              min={50}
              max={200}
              aria-label="Zoom"
            />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Alinhamento fino</p>
            <div className="grid w-32 grid-cols-3 gap-1">
              <span />
              <Button type="button" outlined size="small" icon="pi pi-arrow-up" aria-label="Mover para cima" onClick={() => mover(0, -2)} />
              <span />
              <Button type="button" outlined size="small" icon="pi pi-arrow-left" aria-label="Mover para a esquerda" onClick={() => mover(-2, 0)} />
              <span />
              <Button type="button" outlined size="small" icon="pi pi-arrow-right" aria-label="Mover para a direita" onClick={() => mover(2, 0)} />
              <span />
              <Button type="button" outlined size="small" icon="pi pi-arrow-down" aria-label="Mover para baixo" onClick={() => mover(0, 2)} />
              <span />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              outlined
              size="small"
              icon="pi pi-sort-alt"
              label="Trocar a ordem"
              onClick={() => {
                setOrdem((o) => ({ base: o.topo, topo: o.base }));
                setAjustes((a) => ({ topo: a.base, base: a.topo }));
              }}
            />
            <Button
              type="button"
              outlined
              size="small"
              severity="secondary"
              icon="pi pi-replay"
              label="Reiniciar"
              onClick={() => {
                setAjustes({ topo: INICIAL, base: INICIAL });
                setOpacidade(50);
              }}
            />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

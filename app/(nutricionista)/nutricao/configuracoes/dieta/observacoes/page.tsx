"use client";

import { useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import ListaDeModelos from "@/components/nutricao/modelos/ListaDeModelos";
import { avisar } from "@/lib/avisos";

type Edicao = { id: string | null; titulo: string; texto: string; revisao: number; usos: number };

// Modelos de observação da dieta: título e texto. Ao usar numa dieta, o
// texto é copiado e pode ser ajustado só naquela dieta.
export default function ModelosDeObservacaoPage() {
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [versao, setVersao] = useState(0);

  async function abrir(id: string) {
    const resposta = await fetch(`/api/nutricao/modelos/${id}`, { cache: "no-store" });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok) return avisar(dados?.erro ?? "Não foi possível abrir a observação.", "error");
    setEdicao({
      id,
      titulo: dados.modelo.conteudo.titulo,
      texto: dados.modelo.conteudo.texto,
      revisao: dados.modelo.revisao,
      usos: dados.modelo.usos,
    });
  }

  async function salvar() {
    if (!edicao || salvando) return;
    if (!edicao.titulo.trim() || !edicao.texto.trim()) return avisar("Preencha o título e o texto.", "warn");
    setSalvando(true);
    try {
      const corpo = { tipo: "observacao", nome: edicao.titulo, conteudo: { titulo: edicao.titulo, texto: edicao.texto }, revisao: edicao.revisao };
      const resposta = await fetch(edicao.id ? `/api/nutricao/modelos/${edicao.id}` : "/api/nutricao/modelos", {
        method: edicao.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const resultado = await resposta.json().catch(() => null);
      if (!resposta.ok) return avisar(resultado?.erro ?? "Não foi possível salvar a observação.", "error");
      avisar("Observação salva.", "success");
      setEdicao(null);
      setVersao((v) => v + 1);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <ListaDeModelos
        tipo="observacao"
        titulo="Observações da dieta"
        descricao="Orientações reutilizáveis. Na dieta, busque pelo título em “Observações da dieta”."
        rotuloNovo="Nova observação"
        detalhe={(m) => m.resumo ?? ""}
        onNovo={() => setEdicao({ id: null, titulo: "", texto: "", revisao: 0, usos: 0 })}
        onEditar={abrir}
        recarregar={versao}
      />

      <Dialog
        header={edicao?.id ? "Editar observação" : "Nova observação"}
        visible={Boolean(edicao)}
        onHide={() => setEdicao(null)}
        className="w-[min(40rem,calc(100vw-1rem))]"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" label="Cancelar" text onClick={() => setEdicao(null)} />
            <Button type="button" label="Salvar" icon="pi pi-check" loading={salvando} onClick={salvar} />
          </div>
        }
      >
        {edicao ? (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Título</span>
              <InputText
                autoFocus
                value={edicao.titulo}
                onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })}
                placeholder="Ex.: Hidratação"
                className="w-full"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-gray-700">Texto</span>
              <InputTextarea
                value={edicao.texto}
                onChange={(e) => setEdicao({ ...edicao, texto: e.target.value })}
                rows={8}
                autoResize
                className="w-full"
              />
            </label>
            {edicao.usos ? (
              <p className="text-xs text-gray-500">Usada em {edicao.usos} dieta(s). A alteração vale só para os próximos usos.</p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

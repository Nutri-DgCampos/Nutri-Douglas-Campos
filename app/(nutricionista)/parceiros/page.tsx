"use client";

import { useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import { InputTextarea } from "primereact/inputtextarea";
import { Message } from "primereact/message";
import { Skeleton } from "primereact/skeleton";
import CabecalhoPagina from "@/components/CabecalhoPagina";
import { api } from "@/lib/api";
import { avisar, pedirConfirmacao } from "@/lib/avisos";

type Parceiro = {
  id: string;
  nome: string;
  contato: string | null;
  descricao: string | null;
};

const VAZIO = { nome: "", contato: "", descricao: "" };

// Parceiros cadastrados aqui aparecem para os pacientes em "Parceiros".
export default function ParceirosPage() {
  const [parceiros, setParceiros] = useState<Parceiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [campos, setCampos] = useState(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    const { data, error } = await api
      .from("parceiros")
      .select("id, nome, contato, descricao")
      .order("nome", { ascending: true });

    if (error) {
      console.error("Erro ao carregar parceiros:", error);
      avisar("Não foi possível carregar os parceiros.", "error");
    } else {
      setParceiros(data ?? []);
    }

    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrir(parceiro?: Parceiro) {
    setErro("");
    setEditandoId(parceiro?.id ?? null);
    setCampos(
      parceiro
        ? {
            nome: parceiro.nome,
            contato: parceiro.contato ?? "",
            descricao: parceiro.descricao ?? "",
          }
        : VAZIO
    );
    setFormularioAberto(true);
  }

  async function salvar() {
    if (campos.nome.trim() === "") {
      setErro("Informe o nome do parceiro.");
      return;
    }

    setSalvando(true);

    const valores = {
      nome: campos.nome.trim(),
      contato: campos.contato.trim() || null,
      descricao: campos.descricao.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = editandoId
      ? await api.from("parceiros").update(valores).eq("id", editandoId)
      : await api.from("parceiros").insert(valores);

    setSalvando(false);

    if (error) {
      console.error("Erro ao salvar parceiro:", error);
      setErro("Não foi possível salvar o parceiro.");
      return;
    }

    setFormularioAberto(false);
    avisar(editandoId ? "Parceiro atualizado." : "Parceiro cadastrado.", "success");
    carregar();
  }

  async function excluir(parceiro: Parceiro) {
    const confirmado = await pedirConfirmacao(
      `Excluir o parceiro "${parceiro.nome}"? Ele deixa de aparecer para os pacientes.`
    );

    if (!confirmado) return;

    const { error } = await api.from("parceiros").delete().eq("id", parceiro.id);

    if (error) {
      console.error("Erro ao excluir parceiro:", error);
      avisar("Não foi possível excluir o parceiro.", "error");
      return;
    }

    avisar("Parceiro excluído.", "success");
    carregar();
  }

  return (
    <main className="p-4 lg:p-8">
      <div className="mx-auto max-w-5xl">
        <CabecalhoPagina
          titulo="Parceiros"
          descricao="Benefícios e contatos que aparecem para os seus pacientes."
          acao={
            <Button
              type="button"
              label="Novo parceiro"
              icon="pi pi-plus"
              onClick={() => abrir()}
            />
          }
        />

        {carregando ? (
          <div className="mt-6 space-y-3">
            <Skeleton height="5rem" borderRadius="16px" />
            <Skeleton height="5rem" borderRadius="16px" />
          </div>
        ) : parceiros.length === 0 ? (
          <div className="cartao mt-6 p-6 text-center">
            <i className="pi pi-briefcase text-3xl text-gray-400" aria-hidden />
            <p className="mt-3 font-semibold text-gray-900">
              Nenhum parceiro cadastrado.
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Cadastre o primeiro para ele aparecer na área do paciente.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {parceiros.map((parceiro) => (
              <li key={parceiro.id} className="cartao p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-gray-900">{parceiro.nome}</h2>
                    {parceiro.contato && (
                      <p className="mt-1 text-sm font-medium text-gray-700">
                        {parceiro.contato}
                      </p>
                    )}
                    {parceiro.descricao && (
                      <p className="mt-2 whitespace-pre-line text-sm text-gray-600">
                        {parceiro.descricao}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      icon="pi pi-pencil"
                      label="Editar"
                      size="small"
                      outlined
                      onClick={() => abrir(parceiro)}
                    />
                    <Button
                      type="button"
                      icon="pi pi-trash"
                      size="small"
                      severity="danger"
                      text
                      aria-label={`Excluir ${parceiro.nome}`}
                      onClick={() => excluir(parceiro)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        header={editandoId ? "Editar parceiro" : "Novo parceiro"}
        visible={formularioAberto}
        onHide={() => !salvando && setFormularioAberto(false)}
        className="w-[34rem]"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              label="Cancelar"
              severity="secondary"
              outlined
              disabled={salvando}
              onClick={() => setFormularioAberto(false)}
            />
            <Button
              type="button"
              label="Salvar"
              icon="pi pi-check"
              loading={salvando}
              onClick={salvar}
            />
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="parceiro-nome" className="mb-2 block text-sm font-semibold text-gray-700">
              Nome do parceiro
            </label>
            <InputText
              id="parceiro-nome"
              value={campos.nome}
              onChange={(e) => setCampos({ ...campos, nome: e.target.value })}
              placeholder="Ex.: Farmácia Bio Vida"
              maxLength={150}
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="parceiro-contato" className="mb-2 block text-sm font-semibold text-gray-700">
              Contato
            </label>
            <InputText
              id="parceiro-contato"
              value={campos.contato}
              onChange={(e) => setCampos({ ...campos, contato: e.target.value })}
              placeholder="Ex.: (14) 3333-4444 ou @instagram"
              maxLength={200}
              className="w-full"
            />
          </div>

          <div>
            <label htmlFor="parceiro-descricao" className="mb-2 block text-sm font-semibold text-gray-700">
              Descrição
            </label>
            <InputTextarea
              id="parceiro-descricao"
              value={campos.descricao}
              onChange={(e) => setCampos({ ...campos, descricao: e.target.value })}
              placeholder="Ex.: 10% de desconto em manipulados para pacientes."
              rows={4}
              autoResize
              maxLength={1000}
              className="w-full"
            />
          </div>

          {erro && <Message severity="error" text={erro} className="w-full justify-start" />}
        </div>
      </Dialog>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { api } from "@/lib/api";
import { avisar } from "@/lib/avisos";

type ExameEnviado = { id: string; file_name: string; uploaded_at: string };

const TIPOS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

// Envio do exame de sangue pelo paciente. A análise fica só com o nutricionista.
export default function EnvioExame({ pacienteId }: { pacienteId: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [exames, setExames] = useState<ExameEnviado[]>([]);
  const [enviando, setEnviando] = useState(false);

  async function carregar() {
    const resposta = await fetch("/api/exames", { cache: "no-store" });
    const dados = await resposta.json().catch(() => null);
    setExames(dados?.exames ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function enviar(arquivo: File) {
    const extensao = TIPOS[arquivo.type];

    if (!extensao) {
      avisar("Envie o exame em PDF, JPG ou PNG.", "warn");
      return;
    }

    if (arquivo.size > 20 * 1024 * 1024) {
      avisar("O arquivo deve ter no máximo 20 MB.", "warn");
      return;
    }

    setEnviando(true);

    try {
      const caminho = `${pacienteId}/${crypto.randomUUID()}.${extensao}`;

      const { error: erroEnvio } = await api.storage
        .from("exames")
        .upload(caminho, arquivo, { contentType: arquivo.type });

      if (erroEnvio) {
        throw new Error(erroEnvio.message);
      }

      const resposta = await fetch("/api/exames", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caminho, nome: arquivo.name }),
      });

      if (!resposta.ok) {
        throw new Error("Não foi possível registrar o exame.");
      }

      avisar("Exame enviado ao nutricionista com sucesso!", "success");
      carregar();
    } catch (erro) {
      console.error("Erro ao enviar exame:", erro);
      avisar("Não foi possível enviar o exame. Tente novamente.", "error");
    } finally {
      setEnviando(false);

      if (entrada.current) {
        entrada.current.value = "";
      }
    }
  }

  return (
    <section className="cartao mt-4 p-4">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <i className="pi pi-heart text-lg" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-gray-900">Exame de sangue</h2>
          <p className="text-sm text-gray-500">
            Anexe seu exame para o nutricionista avaliar.
          </p>
        </div>
      </div>

      <input
        ref={entrada}
        id="arquivo-exame"
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="sr-only"
        onChange={(evento) => {
          const arquivo = evento.target.files?.[0];
          if (arquivo) enviar(arquivo);
        }}
      />

      <Button
        type="button"
        icon="pi pi-upload"
        label={enviando ? "Enviando exame..." : "Anexar exame"}
        loading={enviando}
        outlined
        className="mt-4 w-full"
        onClick={() => entrada.current?.click()}
      />

      {exames.length > 0 && (
        <ul className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
          {exames.map((exame) => (
            <li key={exame.id} className="flex items-center gap-3 py-3 text-sm">
              <i className="pi pi-check-circle text-primary-600" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-gray-800">{exame.file_name}</span>
              <span className="shrink-0 text-gray-500">
                {new Date(exame.uploaded_at).toLocaleDateString("pt-BR")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
